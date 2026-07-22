/**
 * WorkOrderSyncIndicator - 工單同步狀態指示器
 * 顯示：Realtime 連線狀態、最後同步時間、本地/雲端筆數比對
 */
import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Cloud, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isRealtimeConnected } from '@/lib/realtimeSync';
import { getCloudWorkOrderCount, getConnectionStatus } from '@/lib/dataService';
import { getWorkOrders } from '@/lib/store';
import { useDataConnection } from '@/contexts/DataContext';

interface SyncState {
  realtimeConnected: boolean;
  localCount: number;
  cloudCount: number | null;
  cloudError: string | null;
  lastCheckTime: number | null;
  checking: boolean;
  synced: boolean; // local === cloud
}

export function WorkOrderSyncIndicator() {
  const { lastSyncTime } = useDataConnection();
  const [state, setState] = useState<SyncState>({
    realtimeConnected: isRealtimeConnected(),
    localCount: getWorkOrders().length,
    cloudCount: null,
    cloudError: null,
    lastCheckTime: null,
    checking: false,
    synced: false,
  });

  const checkSync = useCallback(async () => {
    setState(prev => ({ ...prev, checking: true }));
    const localCount = getWorkOrders().length;
    const realtimeConnected = isRealtimeConnected();
    const { count, error } = await getCloudWorkOrderCount();

    setState({
      realtimeConnected,
      localCount,
      cloudCount: count,
      cloudError: error,
      lastCheckTime: Date.now(),
      checking: false,
      synced: count !== null && count === localCount,
    });
  }, []);

  // Auto-check on mount and when lastSyncTime changes
  useEffect(() => {
    checkSync();
  }, [checkSync, lastSyncTime]);

  // Periodically refresh realtime status
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => ({
        ...prev,
        realtimeConnected: isRealtimeConnected(),
        localCount: getWorkOrders().length,
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const connStatus = getConnectionStatus();
  const formatTime = (ts: number | null) => {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs">
      {/* Realtime 連線狀態 */}
      <div className="flex items-center gap-1.5">
        {state.realtimeConnected ? (
          <>
            <Wifi className="h-3.5 w-3.5 text-green-400" />
            <span className="text-green-400">即時連線</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3.5 w-3.5 text-red-400" />
            <span className="text-red-400">離線</span>
          </>
        )}
      </div>

      {/* 分隔線 */}
      <div className="h-4 w-px bg-zinc-600" />

      {/* 本地/雲端筆數比對 */}
      <div className="flex items-center gap-1.5">
        <HardDrive className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-zinc-300">本地: {state.localCount}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Cloud className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-zinc-300">
          雲端: {state.cloudCount !== null ? state.cloudCount : (state.cloudError ? '?' : '...')}
        </span>
      </div>

      {/* 同步狀態 */}
      {state.cloudCount !== null && (
        <div className="flex items-center gap-1">
          {state.synced ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              <span className="text-green-400">已同步</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-amber-400">
                差異 {Math.abs(state.localCount - (state.cloudCount ?? 0))} 筆
              </span>
            </>
          )}
        </div>
      )}

      {/* 待同步數 */}
      {connStatus.pendingSyncCount > 0 && (
        <>
          <div className="h-4 w-px bg-zinc-600" />
          <span className="text-amber-300">待同步: {connStatus.pendingSyncCount}</span>
        </>
      )}

      {/* 分隔線 */}
      <div className="h-4 w-px bg-zinc-600" />

      {/* 最後同步時間 */}
      <span className="text-zinc-500">
        最後驗證: {formatTime(state.lastCheckTime)}
      </span>

      {/* 手動刷新按鈕 */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-200"
        onClick={checkSync}
        disabled={state.checking}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${state.checking ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
}