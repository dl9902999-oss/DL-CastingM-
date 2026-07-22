import { useEffect, useRef } from 'react';
import { useDataConnection, SyncResult } from '@/contexts/DataContext';
import { useToast } from '@/hooks/use-toast';

/**
 * 全域同步狀態通知組件
 * 當連線狀態變化時自動顯示 toast 通知用戶
 * 當資料成功同步時顯示同步成功提示
 */
export default function SyncStatusNotifier() {
  const { isOnline, isLoading, connectionReason, pendingSyncCount, lastSyncResult } = useDataConnection();
  const { toast } = useToast();
  const prevOnline = useRef<boolean | null>(null);
  const hasNotifiedOffline = useRef(false);
  const prevSyncResult = useRef<SyncResult | null>(null);
  const prevPendingCount = useRef<number>(0);

  // Notify on connection state changes
  useEffect(() => {
    // Skip during initial loading
    if (isLoading) return;

    // First time connection check completed
    if (prevOnline.current === null) {
      prevOnline.current = isOnline;
      if (isOnline === false) {
        hasNotifiedOffline.current = true;
        const reasonText = getReasonText(connectionReason);
        toast({
          title: '⚠️ 離線模式',
          description: `${reasonText}資料將暫存於本機，連線恢復後自動同步。`,
          variant: 'destructive',
          duration: 6000,
        });
      } else if (isOnline === true && pendingSyncCount === 0) {
        toast({
          title: '✅ 已連接雲端資料庫',
          description: '資料即時同步中',
          duration: 3000,
        });
      }
      return;
    }

    // Connection state changed
    if (prevOnline.current !== isOnline) {
      if (isOnline === true && prevOnline.current === false) {
        // Recovered from offline
        hasNotifiedOffline.current = false;
        toast({
          title: '✅ 連線已恢復',
          description: pendingSyncCount > 0
            ? `正在同步 ${pendingSyncCount} 筆本地資料至雲端...`
            : '已重新連接雲端資料庫，資料同步中...',
          duration: 4000,
        });
      } else if (isOnline === false && prevOnline.current === true) {
        // Went offline
        hasNotifiedOffline.current = true;
        const reasonText = getReasonText(connectionReason);
        toast({
          title: '⚠️ 連線中斷',
          description: `${reasonText}系統已切換至離線模式，資料暫存於本機。`,
          variant: 'destructive',
          duration: 6000,
        });
      }
      prevOnline.current = isOnline;
    }
  }, [isOnline, isLoading, connectionReason, pendingSyncCount, toast]);

  // Notify on successful sync completion
  useEffect(() => {
    if (!lastSyncResult) return;
    // Only notify if this is a new sync result
    if (prevSyncResult.current && prevSyncResult.current.timestamp === lastSyncResult.timestamp) return;
    prevSyncResult.current = lastSyncResult;

    if (lastSyncResult.success > 0) {
      const description = lastSyncResult.failed > 0
        ? `成功同步 ${lastSyncResult.success} 筆資料，${lastSyncResult.failed} 筆失敗將稍後重試`
        : `${lastSyncResult.success} 筆本地資料已成功同步至雲端`;
      toast({
        title: '🔄 資料同步完成',
        description,
        duration: 4000,
      });
    } else if (lastSyncResult.failed > 0) {
      toast({
        title: '⚠️ 同步部分失敗',
        description: `${lastSyncResult.failed} 筆資料同步失敗，系統將自動重試`,
        variant: 'destructive',
        duration: 5000,
      });
    }
  }, [lastSyncResult, toast]);

  // Notify when pending count changes (new items queued while offline)
  useEffect(() => {
    if (isOnline === false && pendingSyncCount > prevPendingCount.current && prevPendingCount.current > 0) {
      // Don't spam - only notify every 5 items
      if (pendingSyncCount % 5 === 0) {
        toast({
          title: '📋 離線資料已暫存',
          description: `目前有 ${pendingSyncCount} 筆資料等待同步`,
          duration: 3000,
        });
      }
    }
    prevPendingCount.current = pendingSyncCount;
  }, [pendingSyncCount, isOnline, toast]);

  return null; // This component renders nothing, only manages notifications
}

function getReasonText(reason: string): string {
  switch (reason) {
    case 'no_connection':
      return '無法連接雲端資料庫。';
    case 'rls_blocked':
      return '資料庫權限不足（RLS 政策限制）。';
    case 'error':
      return '連線發生錯誤。';
    default:
      return '';
  }
}