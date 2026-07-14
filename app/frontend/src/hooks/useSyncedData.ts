import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataConnection } from '@/contexts/DataContext';

/**
 * Hook that re-reads data from a getter function whenever
 * a real-time sync event occurs (lastSyncTime changes).
 * 
 * Usage:
 *   const [customers, reload] = useSyncedData(getCustomers);
 * 
 * The data will automatically refresh when another device makes changes.
 * Call reload() to manually refresh.
 */
export function useSyncedData<T>(getter: () => T): [T, () => void] {
  const { lastSyncTime } = useDataConnection();
  const [data, setData] = useState<T>(() => getter());
  const getterRef = useRef(getter);
  getterRef.current = getter;

  useEffect(() => {
    setData(getterRef.current());
  }, [lastSyncTime]);

  const reload = useCallback(() => {
    setData(getterRef.current());
  }, []);

  return [data, reload];
}

/**
 * Hook that returns lastSyncTime from DataContext.
 * Use as a dependency in useEffect/useMemo to trigger re-reads
 * when data changes from another device.
 * 
 * Usage:
 *   const syncTrigger = useSyncTrigger();
 *   useEffect(() => { setOrders(getWorkOrders()); }, [syncTrigger]);
 */
export function useSyncTrigger(): number {
  const { lastSyncTime } = useDataConnection();
  return lastSyncTime;
}