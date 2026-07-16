import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { isSupabaseConnected, attemptReconnect, getConnectionStatus } from '../lib/dataService';
import { startRealtimeSync, stopRealtimeSync, fullSyncFromSupabase, onDataChange } from '../lib/realtimeSync';

interface DataContextType {
  isOnline: boolean | null; // null = checking, true = Supabase, false = localStorage
  isLoading: boolean;
  lastSyncTime: number; // timestamp of last data change, use to trigger re-renders
  connectionReason: string; // reason for offline mode
  refreshData: () => Promise<void>; // manually trigger a data refresh
}

const DataContext = createContext<DataContextType>({
  isOnline: null,
  isLoading: true,
  lastSyncTime: 0,
  connectionReason: 'none',
  refreshData: async () => {},
});

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(Date.now());
  const [connectionReason, setConnectionReason] = useState('none');
  const initialSyncDone = useRef(false);
  const refreshInProgress = useRef(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    isSupabaseConnected().then(async (connected) => {
      setIsOnline(connected);
      setIsLoading(false);
      setConnectionReason(getConnectionStatus().reason);

      if (connected) {
        // Perform initial full sync from Supabase to ensure localStorage is up-to-date
        if (!initialSyncDone.current) {
          initialSyncDone.current = true;
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
      stopRealtimeSync();
    };
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

      if (connected) {
        await fullSyncFromSupabase();
        // Re-start realtime sync if it was stopped
        startRealtimeSync();
      }
      // Always trigger re-render for UI update
      setLastSyncTime(Date.now());
    } finally {
      refreshInProgress.current = false;
    }
  }, []);

  return (
    <DataContext.Provider value={{ isOnline, isLoading, lastSyncTime, connectionReason, refreshData }}>
      {children}
    </DataContext.Provider>
  );
}

export function useDataConnection() {
  return useContext(DataContext);
}