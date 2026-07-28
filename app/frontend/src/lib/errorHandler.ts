/**
 * 統一錯誤處理工具
 * 為所有頁面的 CRUD 操作提供一致的錯誤分類與用戶提示
 */

export interface ErrorHandlerOptions {
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
  action: string; // e.g. '新增', '更新', '刪除'
  entity: string; // e.g. '熔解紀錄', '品質檢驗', '模具'
}

/**
 * 分類錯誤並顯示適當的 toast 通知
 * @returns 用戶可讀的錯誤訊息
 */
export function handleCrudError(err: unknown, options: ErrorHandlerOptions): string {
  const { toast, action, entity } = options;
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${entity}] ${action} failed:`, err);

  if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security') || msg.includes('42501')) {
    toast({ title: `資料庫權限不足，${entity}${action}失敗`, description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
    return 'rls';
  }

  if (msg.includes('timeout')) {
    toast({ title: `連線逾時，${entity}已儲存至本地`, description: '連線恢復後將自動同步', variant: 'destructive' });
    return 'timeout';
  }

  if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    toast({ title: `網路連線異常，${entity}已儲存至本地`, description: '請確認網路狀態，恢復後將自動同步', variant: 'destructive' });
    return 'network';
  }

  if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('already exists')) {
    toast({ title: `${entity}編號重複，請檢查後重試`, variant: 'destructive' });
    return 'duplicate';
  }

  if (msg.includes('not found') || msg.includes('404') || msg.includes('No rows')) {
    toast({ title: `找不到此${entity}，可能已被其他裝置刪除`, variant: 'destructive' });
    return 'not_found';
  }

  if (msg.includes('foreign') || msg.includes('constraint') || msg.includes('referenced') || msg.includes('violates')) {
    toast({ title: `此${entity}有關聯資料，無法${action}`, description: '請先處理相關資料後再試', variant: 'destructive' });
    return 'constraint';
  }

  // Generic fallback
  toast({ title: `${entity}${action}失敗，請稍後再試`, description: msg.length > 100 ? msg.slice(0, 100) + '...' : msg, variant: 'destructive' });
  return 'unknown';
}

/**
 * 包裝 async CRUD 操作，自動處理錯誤
 * @returns 操作結果，失敗時返回 null
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  options: ErrorHandlerOptions
): Promise<T | null> {
  try {
    return await operation();
  } catch (err) {
    handleCrudError(err, options);
    return null;
  }
}