import { useEffect, useRef } from 'react';
import { useDataConnection } from '@/contexts/DataContext';
import { useToast } from '@/hooks/use-toast';

/**
 * 全域同步狀態通知組件
 * 當連線狀態變化時自動顯示 toast 通知用戶
 */
export default function SyncStatusNotifier() {
  const { isOnline, isLoading, connectionReason } = useDataConnection();
  const { toast } = useToast();
  const prevOnline = useRef<boolean | null>(null);
  const hasNotifiedOffline = useRef(false);

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
          description: '已重新連接雲端資料庫，資料同步中...',
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
  }, [isOnline, isLoading, connectionReason, toast]);

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