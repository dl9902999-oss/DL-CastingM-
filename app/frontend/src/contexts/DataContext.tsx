import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { isSupabaseConnected, attemptReconnect, getConnectionStatus, syncPendingToSupabase, getPendingSyncCount, getSyncHistory, getSyncStats, clearSyncHistory, type SyncLogEntry, type SyncLogStatus } from '../lib/dataService';
import { startRealtimeSync, cleanupRealtimeSync, fullSyncFromSupabase, onDataChange } from '../lib/realtimeSync';
import { forceFullUpload } from '../lib/store';

export type { SyncLogEntry, SyncLogStatus };

interface DataContextType {
  isOnline: boolean | null; // null = checking, true = Supabase, false = localStorage
  isLoading: boolean;
  lastSyncTime: number; // timestamp of last data change, use to trigger re-renders
  connectionReason: string; // reason for offline mode
  pendingSyncCount: number; // number of pending local items awaiting sync
  lastSyncResult: SyncResult | null; // result of last sync attempt
  syncHistory: SyncLogEntry[]; // full sync history log
  syncStats: ReturnType<typeof getSyncStats>; // aggregated sync stats
  refreshData: () => Promise<void>; // manually trigger a data refresh
  clearHistory: () => void; // clear sync history
}

export interface SyncResult {
  success: number;
  failed: number;
  timestamp: number;
}

const DataContext = createContext<DataContextType>({
  isOnline: null,
  isLoading: true,
  lastSyncTime: 0,
  syncHistory: [],
  syncStats: { totalSyncs: 0, successfulSyncs: 0, failedSyncs: 0, lastSyncTime: null, lastSyncStatus: null, totalItemsSynced: 0 },
  clearHistory: () => {},
  connectionReason: 'none',
  pendingSyncCount: 0,
  lastSyncResult: null,
  refreshData: async () => {},
});

// Auto-sync interval when online (check every 30 seconds for pending data)
const AUTO_SYNC_INTERVAL = 30_000;
// Network recovery check interval
const RECOVERY_CHECK_INTERVAL = 15_000;

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(Date.now());
  const [connectionReason, setConnectionReason] = useState('none');
  const [pendingSyncCount, setPendingSyncCount] = useState(getPendingSyncCount());
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const initialSyncDone = useRef(false);
  const refreshInProgress = useRef(false);
  const autoSyncTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recoveryTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasOffline = useRef(false);

  const [syncHistory, setSyncHistory] = useState<SyncLogEntry[]>(getSyncHistory());
  const [syncStats, setSyncStatsState] = useState(getSyncStats());

  // Refresh sync history state from localStorage
  const refreshSyncHistory = useCallback(() => {
    setSyncHistory(getSyncHistory());
    setSyncStatsState(getSyncStats());
  }, []);

  // Clear sync history
  const clearHistory = useCallback(() => {
    clearSyncHistory();
    refreshSyncHistory();
  }, [refreshSyncHistory]);

  // Perform pending sync upload when connection is available
  const performPendingSync = useCallback(async (trigger: 'auto_recovery' | 'manual_refresh' | 'periodic' | 'initial' = 'auto_recovery') => {
    const count = getPendingSyncCount();
    if (count === 0) return;

    try {
      const result = await syncPendingToSupabase(trigger);
      setPendingSyncCount(getPendingSyncCount());
      if (result.success > 0) {
        setLastSyncResult({
          success: result.success,
          failed: result.failed,
          timestamp: Date.now(),
        });
      }
      // Refresh sync history after each sync attempt
      refreshSyncHistory();
    } catch (e) {
      console.warn('[DataContext] Pending sync failed:', e);
    }
  }, [refreshSyncHistory]);

  // Auto-recovery: periodically check if network is back when offline
  useEffect(() => {
    if (isOnline === false && !isLoading) {
      wasOffline.current = true;
      // Start recovery check
      if (!recoveryTimer.current) {
        recoveryTimer.current = setInterval(async () => {
          const connected = await attemptReconnect();
          if (connected) {
            setIsOnline(true);
            setConnectionReason('none');
            setPendingSyncCount(getPendingSyncCount());
          }
        }, RECOVERY_CHECK_INTERVAL);
      }
    } else if (isOnline === true) {
      // Stop recovery timer
      if (recoveryTimer.current) {
        clearInterval(recoveryTimer.current);
        recoveryTimer.current = null;
      }
    }

    return () => {
      if (recoveryTimer.current) {
        clearInterval(recoveryTimer.current);
        recoveryTimer.current = null;
      }
    };
  }, [isOnline, isLoading]);

  // When transitioning from offline to online, perform full upload FIRST, then pull fresh data
  useEffect(() => {
    if (isOnline === true && wasOffline.current) {
      wasOffline.current = false;
      // Sequential: upload first, then download to avoid race condition
      (async () => {
        try {
          // Step 1: Upload pending sync queue
          await performPendingSync('auto_recovery');
          // Step 2: Full upload to ensure all localStorage data is synced to cloud
          await forceFullUpload();
          // Step 3: Wait a moment for server to commit writes
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Step 4: NOW pull fresh data from Supabase (safe because upload is done)
          await fullSyncFromSupabase();
          setLastSyncTime(Date.now());
        } catch (e) {
          console.warn('[DataContext] Recovery sync error:', e);
        }
        // Re-start realtime sync
        startRealtimeSync();
      })();
    }
  }, [isOnline, performPendingSync]);

  // Auto-sync timer: periodically upload pending data when online
  useEffect(() => {
    if (isOnline === true) {
      autoSyncTimer.current = setInterval(() => {
        const count = getPendingSyncCount();
        setPendingSyncCount(count);
        if (count > 0) {
          performPendingSync('periodic');
        }
      }, AUTO_SYNC_INTERVAL);
    } else {
      if (autoSyncTimer.current) {
        clearInterval(autoSyncTimer.current);
        autoSyncTimer.current = null;
      }
    }

    return () => {
      if (autoSyncTimer.current) {
        clearInterval(autoSyncTimer.current);
        autoSyncTimer.current = null;
      }
    };
  }, [isOnline, performPendingSync]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    isSupabaseConnected().then(async (connected) => {
      setIsOnline(connected);
      setIsLoading(false);
      setConnectionReason(getConnectionStatus().reason);
      setPendingSyncCount(getPendingSyncCount());

      if (!connected) {
        wasOffline.current = true;
      }

      if (connected) {
        // Perform initial sync - upload pending first to avoid data loss
        if (!initialSyncDone.current) {
          initialSyncDone.current = true;

          // Step 1: If there are pending items from a previous offline session, upload them FIRST
          const pending = getPendingSyncCount();
          if (pending > 0) {
            await performPendingSync('initial');
            // Also force full upload to ensure all local data reaches cloud
            await forceFullUpload();
            // Wait for server to commit
            await new Promise(resolve => setTimeout(resolve, 800));
          }

          // Step 2: NOW pull fresh data from Supabase (safe because local data is already uploaded)
          await fullSyncFromSupabase();
          setLastSyncTime(Date.now());
        }

        // Start real-time subscription
        startRealtimeSync();

        // Listen for changes and update lastSyncTime to trigger re-renders
        unsubscribe = onDataChange((_table) => {
          setLastSyncTime(Date.now());
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
      cleanupRealtimeSync();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshData = useCallback(async () => {
    // Debounce: prevent multiple simultaneous refreshes
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;

    try {
      // Try to reconnect (handles recovery from _writeFailed state)
      const connected = await attemptReconnect();
      setIsOnline(connected);
      setConnectionReason(getConnectionStatus().reason);
      setPendingSyncCount(getPendingSyncCount());

      if (connected) {
        // Upload pending local data first
        await performPendingSync('manual_refresh');
        // Force full upload to ensure all local data reaches cloud
        await forceFullUpload();
        // Wait for server to commit before pulling
        await new Promise(resolve => setTimeout(resolve, 500));
        // Then pull fresh data (safe because upload is done)
        await fullSyncFromSupabase();
        // Re-start realtime sync if it was stopped
        startRealtimeSync();
      }
      // Always trigger re-render for UI update
      setLastSyncTime(Date.now());
      refreshSyncHistory();
    } finally {
      refreshInProgress.current = false;
    }
  }, [performPendingSync, refreshSyncHistory]);

  return (
    <DataContext.Provider value={{ isOnline, isLoading, lastSyncTime, connectionReason, pendingSyncCount, lastSyncResult, syncHistory, syncStats, refreshData, clearHistory }}>
      {children}
    </DataContext.Provider>
  );
}

export function useDataConnection() {
  return useContext(DataContext);
}