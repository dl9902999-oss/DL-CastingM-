/**
 * GlobalSyncIndicator - 全域同步狀態指示器
 * 顯示：Realtime 連線狀態、待同步數量、最後同步時間
 * 用於所有頁面頂部，提供一致的同步狀態資訊
 */
import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isRealtimeConnected } from '@/lib/realtimeSync';
import { getConnectionStatus } from '@/lib/dataService';
import { useDataConnection } from '@/contexts/DataContext';

interface SyncState {
  realtimeConnected: boolean;
  pendingSyncCount: number;
  connected: boolean | null;
  writeFailed: boolean;
  reason: string;
  lastCheckTime: number | null;
  checking: boolean;
}

export function GlobalSyncIndicator() {
  const { lastSyncTime, isOnline, refreshData } = useDataConnection();
  const [state, setState] = useState<SyncState>(() => {
    const connStatus = getConnectionStatus();
    return {
      realtimeConnected: isRealtimeConnected(),
      pendingSyncCount: connStatus.pendingSyncCount,
      connected: connStatus.connected,
      writeFailed: connStatus.writeFailed,
      reason: connStatus.reason,
      lastCheckTime: null,
      checking: false,
    };
  });

  const checkSync = useCallback(async () => {
    setState(prev => ({ ...prev, checking: true }));
    try {
      await refreshData();
    } finally {
      const connStatus = getConnectionStatus();
      setState({
        realtimeConnected: isRealtimeConnected(),
        pendingSyncCount: connStatus.pendingSyncCount,
        connected: connStatus.connected,
        writeFailed: connStatus.writeFailed,
        reason: connStatus.reason,
        lastCheckTime: Date.now(),
        checking: false,
      });
    }
  }, [refreshData]);

  // Update state when lastSyncTime changes
  useEffect(() => {
    const connStatus = getConnectionStatus();
    setState(prev => ({
      ...prev,
      realtimeConnected: isRealtimeConnected(),
      pendingSyncCount: connStatus.pendingSyncCount,
      connected: connStatus.connected,
      writeFailed: connStatus.writeFailed,
      reason: connStatus.reason,
      lastCheckTime: Date.now(),
    }));
  }, [lastSyncTime]);

  // Periodically refresh status
  useEffect(() => {
    const interval = setInterval(() => {
      const connStatus = getConnectionStatus();
      setState(prev => ({
        ...prev,
        realtimeConnected: isRealtimeConnected(),
        pendingSyncCount: connStatus.pendingSyncCount,
        connected: connStatus.connected,
        writeFailed: connStatus.writeFailed,
        reason: connStatus.reason,
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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

      {/* 雲端連線狀態 */}
      <div className="flex items-center gap-1.5">
        <Cloud className="h-3.5 w-3.5 text-zinc-400" />
        <span className={isOnline ? 'text-green-400' : 'text-zinc-400'}>
          {isOnline ? '雲端已連接' : state.reason === 'rls_blocked' ? '權限受限' : '未連接'}
        </span>
      </div>

      {/* 同步狀態 */}
      {state.pendingSyncCount === 0 && isOnline ? (
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
          <span className="text-green-400">已同步</span>
        </div>
      ) : state.pendingSyncCount > 0 ? (
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-amber-400">待同步: {state.pendingSyncCount} 筆</span>
        </div>
      ) : null}

      {/* 寫入失敗警告 */}
      {state.writeFailed && (
        <>
          <div className="h-4 w-px bg-zinc-600" />
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-red-400">寫入失敗</span>
          </div>
        </>
      )}

      {/* 分隔線 */}
      <div className="h-4 w-px bg-zinc-600" />

      {/* 最後同步時間 */}
      <span className="text-zinc-500">
        最後同步: {formatTime(state.lastCheckTime || (lastSyncTime ? lastSyncTime : null))}
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