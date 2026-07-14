import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { isSupabaseConnected } from '../lib/dataService';
import { startRealtimeSync, stopRealtimeSync, fullSyncFromSupabase, onDataChange } from '../lib/realtimeSync';

interface DataContextType {
  isOnline: boolean | null; // null = checking, true = Supabase, false = localStorage
  isLoading: boolean;
  lastSyncTime: number; // timestamp of last data change, use to trigger re-renders
  refreshData: () => void; // manually trigger a data refresh
}

const DataContext = createContext<DataContextType>({
  isOnline: null,
  isLoading: true,
  lastSyncTime: 0,
  refreshData: () => {},
});

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(Date.now());
  const initialSyncDone = useRef(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    isSupabaseConnected().then(async (connected) => {
      setIsOnline(connected);
      setIsLoading(false);

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
    if (isOnline) {
      await fullSyncFromSupabase();
      setLastSyncTime(Date.now());
    } else {
      // Just trigger re-render for localStorage mode
      setLastSyncTime(Date.now());
    }
  }, [isOnline]);

  return (
    <DataContext.Provider value={{ isOnline, isLoading, lastSyncTime, refreshData }}>
      {children}
    </DataContext.Provider>
  );
}

export function useDataConnection() {
  return useContext(DataContext);
}