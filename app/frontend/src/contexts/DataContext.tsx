import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSupabaseConnected, getConnectionStatus } from '../lib/dataService';

interface DataContextType {
  isOnline: boolean | null; // null = checking, true = Supabase, false = localStorage
  isLoading: boolean;
}

const DataContext = createContext<DataContextType>({ isOnline: null, isLoading: true });

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    isSupabaseConnected().then(connected => {
      setIsOnline(connected);
      setIsLoading(false);
    });
  }, []);

  return (
    <DataContext.Provider value={{ isOnline, isLoading }}>
      {children}
    </DataContext.Provider>
  );
}

export function useDataConnection() {
  return useContext(DataContext);
}