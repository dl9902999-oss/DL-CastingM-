/**
 * 資料服務層 - 統一 API
 * 自動偵測 Supabase 連接狀態：
 * - 連接成功：使用 Supabase 即時資料
 * - 連接失敗：降級到 localStorage（離線模式）
 */

import * as localStore from './store';
import * as sbStore from './supabaseStore';
import { Customer, WorkOrder, MoldingBatch, MeltingRecord, MeltRecord, MeltMaterial, MeltChemistry, QualityInspection, DefectRecord, CAPARecord, WarehouseEntry, ShipmentOrder, UserProfile, Pattern, PatternVersion, PatternHistory, PatternMaintenance, PatternLoan } from './types';
import { markRecentWrite } from './realtimeSync';

// Connection state
let _isConnected: boolean | null = null;
let _connectionChecked = false;
let _checkPromise: Promise<boolean> | null = null;
let _lastCheckTime = 0;
// Track if write operations failed due to RLS - forces fallback for reads too
let _writeFailed = false;
// Track the reason for offline mode
let _offlineReason: 'none' | 'no_connection' | 'rls_blocked' | 'error' = 'none';

// Auto-retry connection check after 60 seconds if previously failed
const CONNECTION_RETRY_INTERVAL = 60_000;

export async function isSupabaseConnected(): Promise<boolean> {
  // If write previously failed, allow automatic retry after a short interval.
  // Key insight: we MUST allow retries quickly because the failure might have been
  // transient (e.g., a single RLS SELECT failure that doesn't affect INSERT).
  // The protection against localStorage overwrite is handled in withReadFallback, not here.
  if (_writeFailed) {
    const elapsed = Date.now() - _lastCheckTime;
    // Retry after 5 seconds to quickly recover from transient failures
    const WRITE_RETRY_INTERVAL = 5_000;
    if (elapsed > WRITE_RETRY_INTERVAL) {
      console.log('[DataService] Auto-retrying Supabase connection after write failure...');
      _writeFailed = false;
      _connectionChecked = false;
      _checkPromise = null;
      _offlineReason = 'none';
    } else {
      return false;
    }
  }

  // If previously checked and failed, allow retry after interval
  if (_connectionChecked && !_isConnected) {
    const elapsed = Date.now() - _lastCheckTime;
    if (elapsed > CONNECTION_RETRY_INTERVAL) {
      _connectionChecked = false;
      _checkPromise = null;
    }
  }

  if (_connectionChecked) return _isConnected!;
  if (_checkPromise) return _checkPromise;
  const CONNECTION_CHECK_TIMEOUT = 8_000; // 8 seconds for connection check
  _checkPromise = Promise.race([
    sbStore.checkSupabaseConnection(),
    new Promise<boolean>((_, reject) =>
      setTimeout(() => reject(new Error('connection check timeout')), CONNECTION_CHECK_TIMEOUT)
    ),
  ]).then(connected => {
    _isConnected = connected;
    _connectionChecked = true;
    _lastCheckTime = Date.now();
    if (!connected) {
      _offlineReason = 'no_connection';
    } else {
      _offlineReason = 'none';
    }
    console.log(`[DataService] Supabase ${connected ? '已連接 ✓' : '未連接，使用離線模式'}`);
    return connected;
  }).catch(() => {
    _isConnected = false;
    _connectionChecked = true;
    _lastCheckTime = Date.now();
    _offlineReason = 'error';
    return false;
  });
  return _checkPromise;
}

// Force re-check connection (e.g., after user fixes RLS or reconnects)
export function resetConnectionState(): void {
  _isConnected = null;
  _connectionChecked = false;
  _checkPromise = null;
  _writeFailed = false;
  _offlineReason = 'none';
}

/**
 * Mark write as failed. Called internally by withRLSFallback when a direct
 * write operation fails (RLS, network, or other Supabase error).
 * Background sync failures no longer call this to avoid blocking new direct writes.
 */
export function markWriteFailed(reason: 'rls_blocked' | 'error' = 'error'): void {
  _writeFailed = true;
  _offlineReason = reason;
  _lastCheckTime = Date.now();
}

export function getConnectionStatus(): { connected: boolean | null; writeFailed: boolean; reason: string; pendingSyncCount: number } {
  return {
    connected: _writeFailed ? false : _isConnected,
    writeFailed: _writeFailed,
    reason: _offlineReason,
    pendingSyncCount: getPendingSyncCount(),
  };
}

// ============================================================
// Pending Sync Queue - tracks locally-created data awaiting upload
// ============================================================
const PENDING_SYNC_KEY = 'foundry_pending_sync';

interface PendingSyncEntry {
  id: string;
  table: string;
  action: 'create' | 'update' | 'delete';
  timestamp: number;
  data?: Record<string, unknown>;
  retryCount?: number;
}

function getPendingSyncQueue(): PendingSyncEntry[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingSyncQueue(queue: PendingSyncEntry[]): void {
  localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
}

export function addPendingSync(table: string, action: 'create' | 'update' | 'delete', data?: Record<string, unknown>): void {
  const queue = getPendingSyncQueue();
  queue.push({
    id: crypto.randomUUID(),
    table,
    action,
    timestamp: Date.now(),
    data,
  });
  savePendingSyncQueue(queue);
}

export function getPendingSyncCount(): number {
  return getPendingSyncQueue().length;
}

export function clearPendingSyncQueue(): void {
  localStorage.removeItem(PENDING_SYNC_KEY);
}

// ============================================================
// Sync History Log - records every sync attempt and its result
// ============================================================
const SYNC_LOG_KEY = 'foundry_sync_log';
const MAX_SYNC_LOG_ENTRIES = 100; // Keep last 100 entries

export type SyncLogStatus = 'success' | 'partial' | 'failed' | 'skipped';

export interface SyncLogEntry {
  id: string;
  timestamp: number;
  status: SyncLogStatus;
  trigger: 'auto_recovery' | 'manual_refresh' | 'periodic' | 'initial';
  totalItems: number;
  successCount: number;
  failedCount: number;
  duration: number; // ms
  tables: string[];
  errorMessage?: string;
}

function getSyncLog(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSyncLog(log: SyncLogEntry[]): void {
  // Keep only the latest entries
  const trimmed = log.slice(-MAX_SYNC_LOG_ENTRIES);
  localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(trimmed));
}

function addSyncLogEntry(entry: SyncLogEntry): void {
  const log = getSyncLog();
  log.push(entry);
  saveSyncLog(log);
}

export function getSyncHistory(): SyncLogEntry[] {
  return getSyncLog().sort((a, b) => b.timestamp - a.timestamp);
}

export function clearSyncHistory(): void {
  localStorage.removeItem(SYNC_LOG_KEY);
}

export function getSyncStats(): {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  lastSyncTime: number | null;
  lastSyncStatus: SyncLogStatus | null;
  totalItemsSynced: number;
} {
  const log = getSyncLog();
  const lastEntry = log.length > 0 ? log[log.length - 1] : null;
  return {
    totalSyncs: log.length,
    successfulSyncs: log.filter(e => e.status === 'success').length,
    failedSyncs: log.filter(e => e.status === 'failed').length,
    lastSyncTime: lastEntry?.timestamp ?? null,
    lastSyncStatus: lastEntry?.status ?? null,
    totalItemsSynced: log.reduce((sum, e) => sum + e.successCount, 0),
  };
}

/**
 * Upload all pending local data to Supabase.
 * Returns { success: number; failed: number } indicating sync results.
 * Automatically records the sync attempt in the sync history log.
 */
export async function syncPendingToSupabase(
  trigger: SyncLogEntry['trigger'] = 'auto_recovery'
): Promise<{ success: number; failed: number }> {
  const queue = getPendingSyncQueue();
  if (queue.length === 0) {
    // Record a skipped sync (nothing to sync)
    addSyncLogEntry({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: 'skipped',
      trigger,
      totalItems: 0,
      successCount: 0,
      failedCount: 0,
      duration: 0,
      tables: [],
    });
    return { success: 0, failed: 0 };
  }

  const startTime = Date.now();
  let success = 0;
  let failed = 0;
  const remainingQueue: PendingSyncEntry[] = [];
  let errorMessage: string | undefined;
  const tablesInvolved = new Set<string>();

  // Group by table for batch upsert
  const tableGroups: Record<string, PendingSyncEntry[]> = {};
  for (const entry of queue) {
    if (!tableGroups[entry.table]) tableGroups[entry.table] = [];
    tableGroups[entry.table].push(entry);
    tablesInvolved.add(entry.table);
  }

  for (const [table, entries] of Object.entries(tableGroups)) {
    try {
      const items = entries
        .filter(e => e.action !== 'delete' && e.data)
        .map(e => e.data as Record<string, unknown>);

      if (items.length > 0) {
        await sbStore.sbUpsertBatch(table, items);
        success += items.length;
      }

      // Handle deletes
      const deletes = entries.filter(e => e.action === 'delete' && e.data?.id);
      for (const del of deletes) {
        try {
          const { error } = await sbStore.supabaseClient().from(table).delete().eq('id', del.data!.id);
          if (error) {
            remainingQueue.push(del);
            failed++;
            errorMessage = error.message;
          } else {
            success++;
          }
        } catch (e) {
          remainingQueue.push(del);
          failed++;
          errorMessage = e instanceof Error ? e.message : String(e);
        }
      }
    } catch (e) {
      // If batch fails, keep all entries in queue for retry
      remainingQueue.push(...entries);
      failed += entries.length;
      errorMessage = e instanceof Error ? e.message : String(e);
    }
  }

  // Drop items that have been retried too many times (stale/corrupt data)
  const MAX_RETRIES = 5;
  const finalQueue = remainingQueue.filter(entry => {
    const retries = (entry.retryCount || 0) + 1;
    entry.retryCount = retries;
    if (retries > MAX_RETRIES) {
      console.warn(`[DataService] Dropping pending sync item after ${MAX_RETRIES} retries:`, entry.table, entry.action);
      return false;
    }
    return true;
  });
  savePendingSyncQueue(finalQueue);

  // IMPORTANT: Pending sync failures should NOT set _writeFailed.
  // Pending items may fail due to stale/corrupt data format, not because
  // new direct INSERT operations would fail. Only withRLSFallback should
  // set _writeFailed when a fresh direct write actually fails.
  if (failed === 0 && success > 0) {
    // All pending items synced successfully - clear write failed state if it was set
    _writeFailed = false;
    _offlineReason = 'none';
  }

  // Determine overall status
  const duration = Date.now() - startTime;
  let status: SyncLogStatus;
  if (failed === 0 && success > 0) status = 'success';
  else if (success > 0 && failed > 0) status = 'partial';
  else if (success === 0 && failed > 0) status = 'failed';
  else status = 'skipped';

  // Record in sync history
  addSyncLogEntry({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    status,
    trigger,
    totalItems: queue.length,
    successCount: success,
    failedCount: failed,
    duration,
    tables: Array.from(tablesInvolved),
    errorMessage,
  });

  return { success, failed };
}

/**
 * Verify that a work order exists in Supabase cloud after write.
 * Returns verification result with cloud data comparison.
 */
export async function verifySyncToCloud(orderId: string): Promise<{
  verified: boolean;
  cloudExists: boolean;
  localExists: boolean;
  message: string;
}> {
  try {
    const { data, error } = await sbStore.supabaseClient().from('work_orders').select('id, order_no, updated_at').eq('id', orderId).single();
    const localOrders = localStore.getWorkOrders();
    const localExists = localOrders.some(o => o.id === orderId);

    if (error || !data) {
      return { verified: false, cloudExists: false, localExists, message: '雲端尚未收到資料，將自動重試同步' };
    }
    return { verified: true, cloudExists: true, localExists, message: '資料已確認同步至雲端' };
  } catch {
    return { verified: false, cloudExists: false, localExists: true, message: '驗證連線失敗，資料可能尚在同步中' };
  }
}

/**
 * Get cloud work order count for comparison with local data.
 * Used for cross-device sync verification.
 */
export async function getCloudWorkOrderCount(): Promise<{ count: number | null; error: string | null }> {
  try {
    const { count, error } = await sbStore.supabaseClient().from('work_orders').select('*', { count: 'exact', head: true });
    if (error) return { count: null, error: error.message };
    return { count: count ?? 0, error: null };
  } catch (e) {
    return { count: null, error: e instanceof Error ? e.message : '查詢失敗' };
  }
}

/**
 * Attempt to recover from _writeFailed state by re-checking connection.
 * Call this when user explicitly requests a refresh.
 */
export async function attemptReconnect(): Promise<boolean> {
  // Reset state and re-check
  _writeFailed = false;
  _isConnected = null;
  _connectionChecked = false;
  _checkPromise = null;
  _offlineReason = 'none';
  const connected = await isSupabaseConnected();
  if (!connected) return false;

  // Note: We don't test write permission here because:
  // 1. _writeFailed is set only by withRLSFallback on actual direct write failures
  // 2. The caller (refreshData) re-checks getConnectionStatus() after sync attempts
  // This avoids false negatives from schema constraints on test data.
  return true;
}

// ============================================================
// Helper: wrap write operations with RLS fallback
// ============================================================
// Timeout helper: rejects after specified ms
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[${label}] timeout after ${ms}ms`)), ms)
    ),
  ]);
}

const OPERATION_TIMEOUT = 15_000; // 15 seconds (allows for customer lookup + INSERT)

interface PendingSyncMeta {
  table: string;
  action: 'create' | 'update' | 'delete';
}

// Map table names to localStorage keys
const LOCAL_STORAGE_KEY_MAP: Record<string, string> = {
  customers: 'foundry_customers',
  work_orders: 'foundry_work_orders',
  molding_batches: 'foundry_molding_batches',
  melting_records: 'foundry_melting_records',
  quality_inspections: 'foundry_quality_inspections',
  defect_records: 'foundry_defect_records',
  capa_records: 'foundry_capa_records',
  warehouse_entries: 'foundry_warehouse_entries',
  shipment_orders: 'foundry_shipment_orders',
  melt_records: 'foundry_melt_records',
  melt_materials: 'foundry_melt_materials',
  melt_chemistry: 'foundry_melt_chemistry',
  melt_pourings: 'foundry_melt_pourings',
  melt_preset_recipes: 'foundry_melt_preset_recipes',
  melt_material_specs: 'foundry_melt_material_specs',
  raw_material_receipts: 'foundry_raw_material_receipts',
  patterns: 'foundry_patterns',
  pattern_versions: 'foundry_pattern_versions',
  pattern_history: 'foundry_pattern_history',
  pattern_maintenance: 'foundry_pattern_maintenance',
  pattern_loans: 'foundry_pattern_loans',
  users: 'foundry_users',
};

/**
 * After a successful Supabase write, sync the result back to localStorage.
 * This ensures that if subsequent reads fall back to localStorage (due to
 * network issues, RLS, or timing), the local copy is up-to-date.
 */
function syncResultToLocalStorage<T>(table: string, action: string, result: T): void {
  const storageKey = LOCAL_STORAGE_KEY_MAP[table];
  if (!storageKey) {
    console.warn(`[DataService] syncResultToLocalStorage: unknown table "${table}"`);
    return;
  }

  const raw = localStorage.getItem(storageKey);
  let items: Record<string, unknown>[] = [];
  try {
    items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) items = [];
  } catch {
    items = [];
  }

  if (action === 'create') {
    // Add the new item to the local array
    if (result && typeof result === 'object' && 'id' in (result as Record<string, unknown>)) {
      const newItem = result as Record<string, unknown>;
      // Avoid duplicates
      const existingIdx = items.findIndex(i => i.id === newItem.id);
      if (existingIdx >= 0) {
        items[existingIdx] = newItem;
      } else {
        items.push(newItem);
      }
      localStorage.setItem(storageKey, JSON.stringify(items));
    }
  } else if (action === 'update') {
    // Update the existing item in the local array
    if (result && typeof result === 'object' && 'id' in (result as Record<string, unknown>)) {
      const updatedItem = result as Record<string, unknown>;
      const idx = items.findIndex(i => i.id === updatedItem.id);
      if (idx >= 0) {
        items[idx] = updatedItem;
      } else {
        // Item not found locally, add it
        items.push(updatedItem);
      }
      localStorage.setItem(storageKey, JSON.stringify(items));
    }
  } else if (action === 'delete') {
    // For delete, result might be void/boolean. We need the ID from the operation context.
    // Since we don't have the ID directly here, we handle delete differently:
    // The delete operation already removed from Supabase; localStorage will be synced
    // on next fullSyncFromSupabase. This is acceptable because delete won't cause
    // "data disappearing" - the item is intentionally removed.
    // However, if result contains an id, remove it from local.
    if (result && typeof result === 'object' && 'id' in (result as Record<string, unknown>)) {
      const deletedId = (result as Record<string, unknown>).id;
      const filtered = items.filter(i => i.id !== deletedId);
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    }
  }
}

async function withRLSFallback<T>(
  sbOperation: () => Promise<T>,
  localFallback: () => T,
  operationName: string,
  syncMeta?: PendingSyncMeta
): Promise<T> {
  const connected = await isSupabaseConnected();
  if (!connected) {
    const result = localFallback();
    if (syncMeta) {
      const data = result && typeof result === 'object' ? (result as Record<string, unknown>) : undefined;
      addPendingSync(syncMeta.table, syncMeta.action, data);
    }
    return result;
  }

  try {
    const result = await withTimeout(sbOperation(), OPERATION_TIMEOUT, operationName);
    // IMPORTANT: Sync the Supabase result back to localStorage to keep local copy up-to-date.
    // This prevents data loss if subsequent reads fall back to localStorage.
    if (syncMeta) {
      // Mark this table as having a recent write - protects against
      // refreshLocalFromSupabase clearing local data due to RLS blocking SELECT
      markRecentWrite(syncMeta.table);
      try {
        if (syncMeta.action === 'delete') {
          // For delete, also execute localFallback to remove from localStorage
          localFallback();
        } else {
          syncResultToLocalStorage(syncMeta.table, syncMeta.action, result);
        }
      } catch (e) {
        console.warn(`[DataService] ${operationName}: failed to sync result to localStorage:`, e);
      }
    }
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    
    // 1. RLS / Permission errors → switch to offline mode and queue for later sync
    const isRLSError = (
      msg.includes('row-level security') ||
      msg.includes('42501') ||
      (msg.includes('policy') && !msg.includes('violates')) ||
      (msg.includes('permission') && !msg.includes('violates'))
    );
    if (isRLSError) {
      console.warn(`[DataService] ${operationName}: RLS blocked, switching to offline mode`);
      _writeFailed = true;
      _offlineReason = 'rls_blocked';
      _lastCheckTime = Date.now();
      const result = localFallback();
      if (syncMeta) {
        const data = result && typeof result === 'object' ? (result as Record<string, unknown>) : undefined;
        addPendingSync(syncMeta.table, syncMeta.action, data);
      }
      return result;
    }

    // 2. Constraint violations (UNIQUE, FK, NOT NULL, CHECK) → business logic error.
    //    Do NOT enter offline mode. Throw back to caller for proper UI handling.
    const isConstraintError = (
      msg.includes('duplicate') ||
      msg.includes('unique') ||
      msg.includes('violates') ||
      msg.includes('23505') || // unique_violation
      msg.includes('23503') || // foreign_key_violation
      msg.includes('23502') || // not_null_violation
      msg.includes('23514')    // check_violation
    );
    if (isConstraintError) {
      console.warn(`[DataService] ${operationName}: Constraint violation (not RLS):`, msg);
      throw err; // Let the UI handle this with appropriate error message
    }

    // 3. Timeout or network error → switch to offline mode
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch') || msg.includes('ECONNREFUSED')) {
      console.warn(`[DataService] ${operationName}: Network/timeout error, switching to offline mode`);
      _writeFailed = true;
      _offlineReason = 'error';
      _lastCheckTime = Date.now();
      const result = localFallback();
      if (syncMeta) {
        const data = result && typeof result === 'object' ? (result as Record<string, unknown>) : undefined;
        addPendingSync(syncMeta.table, syncMeta.action, data);
      }
      return result;
    }

    // 4. Any other Supabase error (schema mismatch, etc.) → offline mode + queue
    console.warn(`[DataService] ${operationName}: Supabase error, switching to offline mode:`, msg);
    _writeFailed = true;
    _offlineReason = 'error';
    _lastCheckTime = Date.now();
    const result = localFallback();
    if (syncMeta) {
      const data = result && typeof result === 'object' ? (result as Record<string, unknown>) : undefined;
      addPendingSync(syncMeta.table, syncMeta.action, data);
    }
    return result;
  }
}

async function withReadFallback<T>(
  sbOperation: () => Promise<T>,
  localFallback: () => T,
  operationName: string
): Promise<T> {
  const connected = await isSupabaseConnected();
  if (!connected) return localFallback();

  // If there are pending sync items for this table, prefer localStorage
  // to avoid Supabase returning stale data that doesn't include pending creates.
  const pendingQueue = getPendingSyncQueue();
  if (pendingQueue.length > 0) {
    const localResult = localFallback();
    if (Array.isArray(localResult) && localResult.length > 0) {
      console.warn(
        `[DataService] ${operationName}: ${pendingQueue.length} pending sync items exist. ` +
        `Using localStorage to prevent data loss until sync completes.`
      );
      return localResult;
    }
  }

  try {
    const result = await withTimeout(sbOperation(), OPERATION_TIMEOUT, operationName);
    // Safety check: if Supabase returned an empty array but localStorage has data,
    // this is likely an RLS issue (SELECT blocked returns empty, not error).
    // In this case, prefer localStorage to prevent data disappearing.
    if (Array.isArray(result) && result.length === 0) {
      const localResult = localFallback();
      if (Array.isArray(localResult) && localResult.length > 0) {
        console.warn(
          `[DataService] ${operationName}: Supabase returned empty but localStorage has ${localResult.length} items. ` +
          `Using localStorage to prevent data loss (possible RLS SELECT issue).`
        );
        return localResult;
      }
    }
    // Safety: if Supabase returned fewer items than localStorage, MERGE the results.
    // This handles the case where RLS partially blocks SELECT (returns some rows but not all),
    // or replication lag causes newly written items to be missing from the cloud result.
    // Strategy: use Supabase data as base, then append any local-only items not in cloud.
    if (Array.isArray(result) && result.length > 0) {
      const localResult = localFallback();
      if (Array.isArray(localResult) && localResult.length > result.length) {
        // Find local items missing from cloud result and merge them
        const cloudIds = new Set((result as Array<Record<string, unknown>>).map(r => r.id));
        const missingLocal = (localResult as Array<Record<string, unknown>>).filter(
          item => item.id && !cloudIds.has(item.id)
        );
        if (missingLocal.length > 0) {
          console.warn(
            `[DataService] ${operationName}: Supabase returned ${result.length} items but localStorage has ${localResult.length}. ` +
            `Merging ${missingLocal.length} local-only items to prevent data loss.`
          );
          return [...missingLocal, ...result] as T;
        }
      }
    }
    return result;
  } catch (err) {
    console.warn(`[DataService] ${operationName} failed, falling back to localStorage:`, err);
    return localFallback();
  }
}

// ============================================================
// Users / Auth
// ============================================================
export async function dsLogin(employeeId: string, password: string): Promise<UserProfile | null> {
  const connected = await isSupabaseConnected();
  if (connected) {
    try {
      const sbUser = await sbStore.sbLogin(employeeId, password);
      if (sbUser) return sbUser;
      // Supabase returned null - could be RLS blocking SELECT or user not in cloud.
      // Fall through to localStorage login as backup.
      const localUser = localStore.login(employeeId, password);
      if (localUser) return localUser;
      // Neither found - genuinely wrong credentials
      return null;
    } catch {
      return localStore.login(employeeId, password);
    }
  }
  return localStore.login(employeeId, password);
}

export async function dsGetAllUsers(): Promise<UserProfile[]> {
  return withReadFallback(
    () => sbStore.sbGetAllUsers(),
    () => localStore.getAllUsers(),
    'dsGetAllUsers'
  );
}

export async function dsCreateUser(userData: Omit<UserProfile, 'id'>): Promise<UserProfile> {
  return withRLSFallback(
    () => sbStore.sbCreateUser(userData),
    () => localStore.createUser(userData),
    'dsCreateUser',
    { table: 'users', action: 'create' }
  );
}

export async function dsUpdateUser(id: string, updates: Partial<Omit<UserProfile, 'id'>>): Promise<UserProfile | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateUser(id, updates),
    () => localStore.updateUser(id, updates),
    'dsUpdateUser',
    { table: 'users', action: 'update' }
  );
}

export async function dsDeleteUser(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteUser(id),
    () => localStore.deleteUser(id),
    'dsDeleteUser',
    { table: 'users', action: 'delete' }
  );
}

// ============================================================
// Customers
// ============================================================
export async function dsGetCustomers(): Promise<Customer[]> {
  return withReadFallback(
    () => sbStore.sbGetCustomers(),
    () => localStore.getCustomers(),
    'dsGetCustomers'
  );
}

export async function dsCreateCustomer(data: Omit<Customer, 'id' | 'customer_no' | 'created_at' | 'updated_at'>): Promise<Customer> {
  return withRLSFallback(
    () => sbStore.sbCreateCustomer(data),
    () => localStore.createCustomer(data),
    'dsCreateCustomer',
    { table: 'customers', action: 'create' }
  );
}

export async function dsUpdateCustomer(id: string, data: Partial<Customer>): Promise<Customer | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateCustomer(id, data),
    () => localStore.updateCustomer(id, data),
    'dsUpdateCustomer',
    { table: 'customers', action: 'update' }
  );
}

export async function dsDeleteCustomer(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeleteCustomer(id); },
    () => { localStore.deleteCustomer(id); },
    'dsDeleteCustomer',
    { table: 'customers', action: 'delete' }
  );
}

// ============================================================
// Work Orders
// ============================================================
export async function dsGetWorkOrders(): Promise<WorkOrder[]> {
  return withReadFallback(
    () => sbStore.sbGetWorkOrders(),
    () => localStore.getWorkOrders(),
    'dsGetWorkOrders'
  );
}

export async function dsCreateWorkOrder(data: Omit<WorkOrder, 'id' | 'order_no' | 'status' | 'created_at' | 'updated_at'>): Promise<WorkOrder> {
  return withRLSFallback(
    () => sbStore.sbCreateWorkOrder(data),
    () => localStore.createWorkOrder(data),
    'dsCreateWorkOrder',
    { table: 'work_orders', action: 'create' }
  );
}

export async function dsUpdateWorkOrder(id: string, data: Partial<WorkOrder>): Promise<WorkOrder | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateWorkOrder(id, data),
    () => localStore.updateWorkOrder(id, data),
    'dsUpdateWorkOrder',
    { table: 'work_orders', action: 'update' }
  );
}

export async function dsDeleteWorkOrder(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeleteWorkOrder(id); },
    () => { localStore.deleteWorkOrder(id); },
    'dsDeleteWorkOrder',
    { table: 'work_orders', action: 'delete' }
  );
}

// ============================================================
// Molding Batches
// ============================================================
export async function dsGetMoldingBatches(): Promise<MoldingBatch[]> {
  return withReadFallback(
    () => sbStore.sbGetMoldingBatches(),
    () => localStore.getMoldingBatches(),
    'dsGetMoldingBatches'
  );
}

export async function dsCreateMoldingBatch(data: { work_order_id: string; order_no: string; customer: string; product_name: string; material: string; quantity_planned: number; estimated_pouring_weight: number; remarks: string; molding_photos: string[]; closing_photos?: string[] }): Promise<MoldingBatch> {
  return withRLSFallback(
    () => sbStore.sbCreateMoldingBatch(data),
    () => localStore.createMoldingBatch(data),
    'dsCreateMoldingBatch',
    { table: 'molding_batches', action: 'create' }
  );
}

export async function dsUpdateMoldingBatch(id: string, data: Partial<MoldingBatch>): Promise<MoldingBatch | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMoldingBatch(id, data),
    () => localStore.updateMoldingBatch(id, data),
    'dsUpdateMoldingBatch',
    { table: 'molding_batches', action: 'update' }
  );
}

export async function dsDeleteMoldingBatch(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeleteMoldingBatch(id); },
    () => { localStore.deleteMoldingBatch(id); },
    'dsDeleteMoldingBatch',
    { table: 'molding_batches', action: 'delete' }
  );
}

// ============================================================
// Melting Records (Legacy)
// ============================================================
export async function dsGetMeltingRecords(): Promise<MeltingRecord[]> {
  return withReadFallback(
    () => sbStore.sbGetMeltingRecords(),
    () => localStore.getMeltingRecords(),
    'dsGetMeltingRecords'
  );
}

export async function dsCreateMeltingRecord(data: { batch_id: string; batch_no: string; furnace_no: string; melting_weight: number; pouring_weights: number[] }): Promise<MeltingRecord> {
  return withRLSFallback(
    () => sbStore.sbCreateMeltingRecord(data),
    () => localStore.createMeltingRecord(data),
    'dsCreateMeltingRecord',
    { table: 'melting_records', action: 'create' }
  );
}

export async function dsUpdateMeltingRecord(id: string, data: { furnace_no?: string; pouring_weights?: number[]; melting_weight?: number }): Promise<MeltingRecord | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltingRecord(id, data),
    () => localStore.updateMeltingRecord(id, data),
    'dsUpdateMeltingRecord',
    { table: 'melting_records', action: 'update' }
  );
}

export async function dsDeleteMeltingRecord(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltingRecord(id),
    () => localStore.deleteMeltingRecord(id),
    'dsDeleteMeltingRecord',
    { table: 'melting_records', action: 'delete' }
  );
}

// ============================================================
// Melt Records (New full)
// ============================================================
export async function dsGetMeltRecords(): Promise<MeltRecord[]> {
  return withReadFallback(
    () => sbStore.sbGetMeltRecords(),
    () => localStore.getMeltRecords(),
    'dsGetMeltRecords'
  );
}

export async function dsCreateMeltRecord(data: Omit<MeltRecord, 'id' | 'melt_no' | 'melt_minutes' | 'total_charge_weight' | 'specific_energy' | 'created_at' | 'updated_at'> & { melt_no?: string }): Promise<MeltRecord> {
  return withRLSFallback(
    () => sbStore.sbCreateMeltRecord(data),
    () => localStore.createMeltRecord(data),
    'dsCreateMeltRecord',
    { table: 'melt_records', action: 'create' }
  );
}

export async function dsUpdateMeltRecord(id: string, data: Partial<Omit<MeltRecord, 'id' | 'created_at'>>): Promise<MeltRecord | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltRecord(id, data),
    () => localStore.updateMeltRecord(id, data),
    'dsUpdateMeltRecord',
    { table: 'melt_records', action: 'update' }
  );
}

export async function dsDeleteMeltRecord(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltRecord(id),
    () => localStore.deleteMeltRecord(id),
    'dsDeleteMeltRecord',
    { table: 'melt_records', action: 'delete' }
  );
}

export async function dsRecalcMeltRecord(meltId: string): Promise<MeltRecord | null> {
  return withRLSFallback(
    () => sbStore.sbRecalcMeltRecord(meltId),
    () => localStore.recalcMeltRecord(meltId),
    'dsRecalcMeltRecord',
    { table: 'melt_records', action: 'update' }
  );
}

// ============================================================
// Melt Materials
// ============================================================
export async function dsGetMeltMaterials(meltId?: string): Promise<MeltMaterial[]> {
  return withReadFallback(
    () => sbStore.sbGetMeltMaterials(meltId),
    () => localStore.getMeltMaterials(meltId),
    'dsGetMeltMaterials'
  );
}

export async function dsCreateMeltMaterial(data: Omit<MeltMaterial, 'id' | 'subtotal'>): Promise<MeltMaterial> {
  return withRLSFallback(
    () => sbStore.sbCreateMeltMaterial(data),
    () => localStore.createMeltMaterial(data),
    'dsCreateMeltMaterial',
    { table: 'melt_materials', action: 'create' }
  );
}

export async function dsUpdateMeltMaterial(id: string, data: Partial<Omit<MeltMaterial, 'id' | 'subtotal'>>): Promise<MeltMaterial | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltMaterial(id, data),
    () => localStore.updateMeltMaterial(id, data),
    'dsUpdateMeltMaterial',
    { table: 'melt_materials', action: 'update' }
  );
}

export async function dsDeleteMeltMaterial(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltMaterial(id),
    () => localStore.deleteMeltMaterial(id),
    'dsDeleteMeltMaterial',
    { table: 'melt_materials', action: 'delete' }
  );
}

// ============================================================
// Melt Chemistry
// ============================================================
export async function dsGetMeltChemistry(meltId?: string): Promise<MeltChemistry[]> {
  return withReadFallback(
    () => sbStore.sbGetMeltChemistry(meltId),
    () => localStore.getMeltChemistry(meltId),
    'dsGetMeltChemistry'
  );
}

export async function dsCreateMeltChemistry(data: Omit<MeltChemistry, 'id'>): Promise<MeltChemistry> {
  return withRLSFallback(
    () => sbStore.sbCreateMeltChemistry(data),
    () => localStore.createMeltChemistry(data),
    'dsCreateMeltChemistry',
    { table: 'melt_chemistry', action: 'create' }
  );
}

export async function dsUpdateMeltChemistry(id: string, data: Partial<Omit<MeltChemistry, 'id'>>): Promise<MeltChemistry | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltChemistry(id, data),
    () => localStore.updateMeltChemistry(id, data),
    'dsUpdateMeltChemistry',
    { table: 'melt_chemistry', action: 'update' }
  );
}

export async function dsDeleteMeltChemistry(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltChemistry(id),
    () => localStore.deleteMeltChemistry(id),
    'dsDeleteMeltChemistry',
    { table: 'melt_chemistry', action: 'delete' }
  );
}

// ============================================================
// Melt Pourings
// ============================================================
export async function dsGetMeltPourings(meltId?: string): Promise<sbStore.MeltPouring[]> {
  return withReadFallback(
    () => sbStore.sbGetMeltPourings(meltId),
    () => {
      const key = 'foundry_melt_pourings';
      const raw = localStorage.getItem(key);
      const all: sbStore.MeltPouring[] = raw ? JSON.parse(raw) : [];
      return meltId ? all.filter(p => p.melt_id === meltId) : all;
    },
    'dsGetMeltPourings'
  );
}

export async function dsCreateMeltPouring(data: Omit<sbStore.MeltPouring, 'id' | 'created_at'>): Promise<sbStore.MeltPouring> {
  return withRLSFallback(
    () => sbStore.sbCreateMeltPouring(data),
    () => {
      const key = 'foundry_melt_pourings';
      const raw = localStorage.getItem(key);
      const all: sbStore.MeltPouring[] = raw ? JSON.parse(raw) : [];
      const entry: sbStore.MeltPouring = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      all.push(entry);
      localStorage.setItem(key, JSON.stringify(all));
      return entry;
    },
    'dsCreateMeltPouring',
    { table: 'melt_pourings', action: 'create' }
  );
}

export async function dsUpdateMeltPouring(id: string, updates: Partial<sbStore.MeltPouring>): Promise<sbStore.MeltPouring | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltPouring(id, updates),
    () => {
      const key = 'foundry_melt_pourings';
      const raw = localStorage.getItem(key);
      const all: sbStore.MeltPouring[] = raw ? JSON.parse(raw) : [];
      const idx = all.findIndex(p => p.id === id);
      if (idx < 0) return null;
      all[idx] = { ...all[idx], ...updates };
      localStorage.setItem(key, JSON.stringify(all));
      return all[idx];
    },
    'dsUpdateMeltPouring',
    { table: 'melt_pourings', action: 'update' }
  );
}

export async function dsDeleteMeltPouring(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltPouring(id),
    () => {
      const key = 'foundry_melt_pourings';
      const raw = localStorage.getItem(key);
      const all: sbStore.MeltPouring[] = raw ? JSON.parse(raw) : [];
      const filtered = all.filter(p => p.id !== id);
      localStorage.setItem(key, JSON.stringify(filtered));
      return filtered.length < all.length;
    },
    'dsDeleteMeltPouring',
    { table: 'melt_pourings', action: 'delete' }
  );
}

// ============================================================
// Melt Preset Recipes
// ============================================================
const PRESET_RECIPE_KEY = 'foundry_melt_preset_recipes';
const LEGACY_PRESET_RECIPE_KEY = 'melt_preset_recipes';
const PRESET_RECIPE_MIGRATED_FLAG = 'foundry_melt_preset_recipes_migrated';

/** 讀取本地預設配比快取，並自動遷移舊版 localStorage key。 */
function readLocalPresetRecipes(): sbStore.MeltPresetRecipe[] {
  const raw = localStorage.getItem(PRESET_RECIPE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const legacy = localStorage.getItem(LEGACY_PRESET_RECIPE_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        const migrated: sbStore.MeltPresetRecipe[] = parsed.map((r: Record<string, unknown>) => ({
          id: (r.id as string) || crypto.randomUUID(),
          name: (r.name as string) || '',
          materials: (r.materials as sbStore.MeltPresetRecipe['materials']) || [],
          created_at: (r.created_at as string) || new Date().toISOString(),
          updated_at: (r.updated_at as string) || new Date().toISOString(),
        }));
        localStorage.setItem(PRESET_RECIPE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch { /* ignore */ }
  }
  return [];
}

/**
 * 將舊版僅存在本機的預設配比一次性上傳至雲端，
 * 讓先前在單一裝置建立的配比也能跨裝置看到。
 * 上傳失敗時不設定完成旗標，下次讀取會再嘗試。
 */
async function migrateLocalPresetRecipesToCloud(
  cloudRecipes: sbStore.MeltPresetRecipe[]
): Promise<sbStore.MeltPresetRecipe[]> {
  if (localStorage.getItem(PRESET_RECIPE_MIGRATED_FLAG) === '1') return cloudRecipes;

  const localRecipes = readLocalPresetRecipes();
  const missing = localRecipes.filter(
    local => !cloudRecipes.some(cloud => cloud.name.trim() === local.name.trim())
  );

  if (missing.length === 0) {
    localStorage.setItem(PRESET_RECIPE_MIGRATED_FLAG, '1');
    return cloudRecipes;
  }

  const created: sbStore.MeltPresetRecipe[] = [];
  for (const recipe of missing) {
    try {
      created.push(await sbStore.sbCreateMeltPresetRecipe({
        name: recipe.name,
        materials: recipe.materials || [],
      }));
    } catch (err) {
      console.warn('[DataService] migrate preset recipe to cloud failed:', err);
      return [...cloudRecipes, ...created];
    }
  }

  localStorage.setItem(PRESET_RECIPE_MIGRATED_FLAG, '1');
  console.info(`[DataService] migrated ${created.length} local preset recipes to cloud`);
  return [...cloudRecipes, ...created];
}

/**
 * 取得所有預設投料配比。優先讀取 Supabase 以確保跨裝置一致，
 * 讀取成功後回寫本地快取；連線失敗時退回本地暫存。
 */
export async function dsGetMeltPresetRecipes(): Promise<sbStore.MeltPresetRecipe[]> {
  try {
    const cloudRecipes = await sbStore.sbGetMeltPresetRecipes();
    const merged = await migrateLocalPresetRecipesToCloud(cloudRecipes);
    localStorage.setItem(PRESET_RECIPE_KEY, JSON.stringify(merged));
    return merged;
  } catch (err) {
    console.warn('[DataService] dsGetMeltPresetRecipes fallback to local cache:', err);
    return readLocalPresetRecipes();
  }
}

export async function dsCreateMeltPresetRecipe(data: { name: string; materials: sbStore.MeltPresetRecipe['materials'] }): Promise<sbStore.MeltPresetRecipe> {
  return withRLSFallback(
    () => sbStore.sbCreateMeltPresetRecipe(data),
    () => {
      const key = 'foundry_melt_preset_recipes';
      const raw = localStorage.getItem(key);
      const all: sbStore.MeltPresetRecipe[] = raw ? JSON.parse(raw) : [];
      const entry: sbStore.MeltPresetRecipe = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      all.push(entry);
      localStorage.setItem(key, JSON.stringify(all));
      return entry;
    },
    'dsCreateMeltPresetRecipe',
    { table: 'melt_preset_recipes', action: 'create' }
  );
}

export async function dsUpdateMeltPresetRecipe(id: string, updates: Partial<{ name: string; materials: sbStore.MeltPresetRecipe['materials'] }>): Promise<sbStore.MeltPresetRecipe | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltPresetRecipe(id, updates),
    () => {
      const key = 'foundry_melt_preset_recipes';
      const raw = localStorage.getItem(key);
      const all: sbStore.MeltPresetRecipe[] = raw ? JSON.parse(raw) : [];
      const idx = all.findIndex(r => r.id === id);
      if (idx < 0) return null;
      all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(all));
      return all[idx];
    },
    'dsUpdateMeltPresetRecipe',
    { table: 'melt_preset_recipes', action: 'update' }
  );
}

export async function dsDeleteMeltPresetRecipe(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltPresetRecipe(id),
    () => {
      const key = 'foundry_melt_preset_recipes';
      const raw = localStorage.getItem(key);
      const all: sbStore.MeltPresetRecipe[] = raw ? JSON.parse(raw) : [];
      const filtered = all.filter(r => r.id !== id);
      localStorage.setItem(key, JSON.stringify(filtered));
      return filtered.length < all.length;
    },
    'dsDeleteMeltPresetRecipe',
    { table: 'melt_preset_recipes', action: 'delete' }
  );
}

// ============================================================
// Melt Material Specs (材質規範)
// 舊版本材質規範僅存放於 localStorage key `melt_material_specs`，
// 這裡統一改用 `foundry_melt_material_specs` 並在讀取時自動遷移舊資料。
// ============================================================
const MATERIAL_SPEC_KEY = 'foundry_melt_material_specs';
const LEGACY_MATERIAL_SPEC_KEY = 'melt_material_specs';

function readLocalMaterialSpecs(): sbStore.MeltMaterialSpec[] {
  const raw = localStorage.getItem(MATERIAL_SPEC_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  // 遷移舊 key 資料
  const legacy = localStorage.getItem(LEGACY_MATERIAL_SPEC_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        const migrated: sbStore.MeltMaterialSpec[] = parsed.map((s: Record<string, unknown>) => ({
          id: (s.id as string) || crypto.randomUUID(),
          name: (s.name as string) || '',
          ranges: (s.ranges as Record<string, number>) || {},
          remark: (s.remark as string) || '',
          created_at: (s.created_at as string) || new Date().toISOString(),
          updated_at: (s.updated_at as string) || new Date().toISOString(),
        }));
        localStorage.setItem(MATERIAL_SPEC_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch { /* ignore */ }
  }
  return [];
}

function writeLocalMaterialSpecs(specs: sbStore.MeltMaterialSpec[]): void {
  localStorage.setItem(MATERIAL_SPEC_KEY, JSON.stringify(specs));
}

const MATERIAL_SPEC_MIGRATED_FLAG = 'foundry_melt_material_specs_migrated';

/**
 * 將舊版僅存在本機的材質規範一次性上傳至雲端，
 * 讓先前在單一裝置建立的規範也能跨裝置看到。
 * 上傳失敗時不設定完成旗標，下次讀取會再嘗試。
 */
async function migrateLocalMaterialSpecsToCloud(
  cloudSpecs: sbStore.MeltMaterialSpec[]
): Promise<sbStore.MeltMaterialSpec[]> {
  if (localStorage.getItem(MATERIAL_SPEC_MIGRATED_FLAG) === '1') return cloudSpecs;

  const localSpecs = readLocalMaterialSpecs();
  const missing = localSpecs.filter(
    local => !cloudSpecs.some(cloud => cloud.name.trim() === local.name.trim())
  );

  if (missing.length === 0) {
    localStorage.setItem(MATERIAL_SPEC_MIGRATED_FLAG, '1');
    return cloudSpecs;
  }

  const created: sbStore.MeltMaterialSpec[] = [];
  for (const spec of missing) {
    try {
      created.push(await sbStore.sbCreateMeltMaterialSpec({
        name: spec.name,
        ranges: spec.ranges || {},
        remark: spec.remark || '',
      }));
    } catch (err) {
      console.warn('[DataService] migrate material spec to cloud failed:', err);
      return [...cloudSpecs, ...created];
    }
  }

  localStorage.setItem(MATERIAL_SPEC_MIGRATED_FLAG, '1');
  console.info(`[DataService] migrated ${created.length} local material specs to cloud`);
  return [...cloudSpecs, ...created];
}

/**
 * 取得所有材質規範。優先讀取 Supabase 以確保跨裝置一致，
 * 讀取成功後回寫本地快取；連線失敗時退回本地暫存。
 */
export async function dsGetMeltMaterialSpecs(): Promise<sbStore.MeltMaterialSpec[]> {
  try {
    const cloudSpecs = await sbStore.sbGetMeltMaterialSpecs();
    const merged = await migrateLocalMaterialSpecsToCloud(cloudSpecs);
    writeLocalMaterialSpecs(merged);
    return merged;
  } catch (err) {
    console.warn('[DataService] dsGetMeltMaterialSpecs fallback to local cache:', err);
    return readLocalMaterialSpecs();
  }
}

export async function dsCreateMeltMaterialSpec(
  data: { name: string; ranges: Record<string, number>; remark: string }
): Promise<sbStore.MeltMaterialSpec> {
  return withRLSFallback(
    () => sbStore.sbCreateMeltMaterialSpec(data),
    () => {
      const all = readLocalMaterialSpecs();
      const entry: sbStore.MeltMaterialSpec = {
        ...data,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      all.push(entry);
      writeLocalMaterialSpecs(all);
      return entry;
    },
    'dsCreateMeltMaterialSpec',
    { table: 'melt_material_specs', action: 'create' }
  );
}

export async function dsUpdateMeltMaterialSpec(
  id: string,
  updates: Partial<{ name: string; ranges: Record<string, number>; remark: string }>
): Promise<sbStore.MeltMaterialSpec | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltMaterialSpec(id, updates),
    () => {
      const all = readLocalMaterialSpecs();
      const idx = all.findIndex(s => s.id === id);
      if (idx < 0) return null;
      all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
      writeLocalMaterialSpecs(all);
      return all[idx];
    },
    'dsUpdateMeltMaterialSpec',
    { table: 'melt_material_specs', action: 'update' }
  );
}

export async function dsDeleteMeltMaterialSpec(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltMaterialSpec(id),
    () => {
      const all = readLocalMaterialSpecs();
      const filtered = all.filter(s => s.id !== id);
      writeLocalMaterialSpecs(filtered);
      return filtered.length < all.length;
    },
    'dsDeleteMeltMaterialSpec',
    { table: 'melt_material_specs', action: 'delete' }
  );
}

// ============================================================
// Raw Material Receipts (原料入庫)
// 雲端優先讀取以支援跨裝置同步；離線或權限受限時退回本地暫存並排入待同步佇列。
// ============================================================
const RAW_RECEIPT_KEY = 'foundry_raw_material_receipts';

function readLocalRawReceipts(): sbStore.RawMaterialReceipt[] {
  const raw = localStorage.getItem(RAW_RECEIPT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalRawReceipts(list: sbStore.RawMaterialReceipt[]): void {
  localStorage.setItem(RAW_RECEIPT_KEY, JSON.stringify(list));
}

/** 離線時本地產生入庫單號，規則與雲端一致：RM-yyyymmdd-流水序號 */
function buildLocalReceiptNo(dateStr: string, existing: sbStore.RawMaterialReceipt[]): string {
  const compact = (dateStr || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const prefix = `RM-${compact}-`;
  const used = existing
    .filter(r => r.receipt_no.startsWith(prefix))
    .map(r => parseInt(r.receipt_no.slice(prefix.length), 10))
    .filter(n => !Number.isNaN(n));
  const next = used.length > 0 ? Math.max(...used) + 1 : 1;
  return `${prefix}${next.toString().padStart(3, '0')}`;
}

export async function dsGetRawMaterialReceipts(): Promise<sbStore.RawMaterialReceipt[]> {
  try {
    const cloud = await sbStore.sbGetRawMaterialReceipts();
    const local = readLocalRawReceipts();
    // 雲端筆數少於本地時保留本地獨有紀錄，避免尚未同步的資料在畫面上消失
    if (cloud.length < local.length) {
      const cloudIds = new Set(cloud.map(r => r.id));
      const merged = [...cloud, ...local.filter(r => !cloudIds.has(r.id))];
      writeLocalRawReceipts(merged);
      return merged;
    }
    writeLocalRawReceipts(cloud);
    return cloud;
  } catch (err) {
    console.warn('[DataService] dsGetRawMaterialReceipts fallback to local cache:', err);
    return readLocalRawReceipts();
  }
}

export async function dsCreateRawMaterialReceipt(
  data: sbStore.RawMaterialReceiptInput
): Promise<sbStore.RawMaterialReceipt> {
  return withRLSFallback(
    () => sbStore.sbCreateRawMaterialReceipt(data),
    () => {
      const all = readLocalRawReceipts();
      const entry: sbStore.RawMaterialReceipt = {
        ...data,
        id: crypto.randomUUID(),
        receipt_no: buildLocalReceiptNo(data.receipt_date, all),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      all.push(entry);
      writeLocalRawReceipts(all);
      return entry;
    },
    'dsCreateRawMaterialReceipt',
    { table: 'raw_material_receipts', action: 'create' }
  );
}

export async function dsUpdateRawMaterialReceipt(
  id: string,
  updates: Partial<sbStore.RawMaterialReceiptInput>
): Promise<sbStore.RawMaterialReceipt | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateRawMaterialReceipt(id, updates),
    () => {
      const all = readLocalRawReceipts();
      const idx = all.findIndex(r => r.id === id);
      if (idx < 0) return null;
      all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
      writeLocalRawReceipts(all);
      return all[idx];
    },
    'dsUpdateRawMaterialReceipt',
    { table: 'raw_material_receipts', action: 'update' }
  );
}

export async function dsDeleteRawMaterialReceipt(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteRawMaterialReceipt(id),
    () => {
      const all = readLocalRawReceipts();
      const filtered = all.filter(r => r.id !== id);
      writeLocalRawReceipts(filtered);
      return filtered.length < all.length;
    },
    'dsDeleteRawMaterialReceipt',
    { table: 'raw_material_receipts', action: 'delete' }
  );
}

// ============================================================
// Quality Inspections
// ============================================================
export async function dsGetQualityInspections(): Promise<QualityInspection[]> {
  return withReadFallback(
    () => sbStore.sbGetQualityInspections(),
    () => localStore.getQualityInspections(),
    'dsGetQualityInspections'
  );
}

export async function dsCreateQualityInspection(data: Omit<QualityInspection, 'id' | 'inspection_no' | 'created_at'>): Promise<QualityInspection> {
  return withRLSFallback(
    () => sbStore.sbCreateQualityInspection(data),
    () => localStore.createQualityInspection(data),
    'dsCreateQualityInspection',
    { table: 'quality_inspections', action: 'create' }
  );
}

export async function dsUpdateQualityInspection(id: string, data: Partial<QualityInspection>): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbUpdateQualityInspection(id, data); },
    () => { localStore.updateQualityInspection(id, data); },
    'dsUpdateQualityInspection',
    { table: 'quality_inspections', action: 'update' }
  );
}

export async function dsDeleteQualityInspection(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeleteQualityInspection(id); },
    () => { localStore.deleteQualityInspection(id); },
    'dsDeleteQualityInspection',
    { table: 'quality_inspections', action: 'delete' }
  );
}

// ============================================================
// Defect Records
// ============================================================
export async function dsGetDefectRecords(): Promise<DefectRecord[]> {
  return withReadFallback(
    () => sbStore.sbGetDefectRecords(),
    () => localStore.getDefectRecords(),
    'dsGetDefectRecords'
  );
}

export async function dsCreateDefectRecord(data: Omit<DefectRecord, 'id' | 'created_at'>): Promise<DefectRecord> {
  return withRLSFallback(
    () => sbStore.sbCreateDefectRecord(data),
    () => localStore.createDefectRecord(data),
    'dsCreateDefectRecord',
    { table: 'defect_records', action: 'create' }
  );
}

// ============================================================
// CAPA Records
// ============================================================
export async function dsGetCAPARecords(): Promise<CAPARecord[]> {
  return withReadFallback(
    () => sbStore.sbGetCAPARecords(),
    () => localStore.getCAPARecords(),
    'dsGetCAPARecords'
  );
}

export async function dsCreateCAPARecord(data: Omit<CAPARecord, 'id' | 'capa_no' | 'created_at'>): Promise<CAPARecord> {
  return withRLSFallback(
    () => sbStore.sbCreateCAPARecord(data),
    () => localStore.createCAPARecord(data),
    'dsCreateCAPARecord',
    { table: 'capa_records', action: 'create' }
  );
}

export async function dsUpdateCAPARecord(id: string, data: Partial<CAPARecord>): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbUpdateCAPARecord(id, data); },
    () => { localStore.updateCAPARecord(id, data); },
    'dsUpdateCAPARecord',
    { table: 'capa_records', action: 'update' }
  );
}

// ============================================================
// Warehouse Entries
// ============================================================
export async function dsGetWarehouseEntries(): Promise<WarehouseEntry[]> {
  return withReadFallback(
    () => sbStore.sbGetWarehouseEntries(),
    () => localStore.getWarehouseEntries(),
    'dsGetWarehouseEntries'
  );
}

export async function dsCreateWarehouseEntry(data: { batch_id: string; batch_no: string; location: string; quantity: number }): Promise<WarehouseEntry> {
  return withRLSFallback(
    () => sbStore.sbCreateWarehouseEntry(data),
    () => localStore.createWarehouseEntry(data),
    'dsCreateWarehouseEntry',
    { table: 'warehouse_entries', action: 'create' }
  );
}

export async function dsUpdateWarehouseEntry(id: string, data: Partial<WarehouseEntry>): Promise<WarehouseEntry | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateWarehouseEntry(id, data),
    () => localStore.updateWarehouseEntry(id, data),
    'dsUpdateWarehouseEntry',
    { table: 'warehouse_entries', action: 'update' }
  );
}

export async function dsDeleteWarehouseEntry(id: string): Promise<void> {
  return withRLSFallback(
    () => sbStore.sbDeleteWarehouseEntry(id),
    () => localStore.deleteWarehouseEntry(id),
    'dsDeleteWarehouseEntry',
    { table: 'warehouse_entries', action: 'delete' }
  );
}

// ============================================================
// Shipment Orders
// ============================================================
export async function dsGetShipmentOrders(): Promise<ShipmentOrder[]> {
  return withReadFallback(
    () => sbStore.sbGetShipmentOrders(),
    () => localStore.getShipmentOrders(),
    'dsGetShipmentOrders'
  );
}

export async function dsCreateShipmentOrder(data: { work_order_id: string; order_no: string; customer: string; quantity: number; ship_date: string }): Promise<ShipmentOrder> {
  return withRLSFallback(
    () => sbStore.sbCreateShipmentOrder(data),
    () => localStore.createShipmentOrder(data),
    'dsCreateShipmentOrder',
    { table: 'shipment_orders', action: 'create' }
  );
}

export async function dsUpdateShipmentOrder(id: string, data: Partial<ShipmentOrder>): Promise<ShipmentOrder | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateShipmentOrder(id, data),
    () => localStore.updateShipmentOrder(id, data),
    'dsUpdateShipmentOrder',
    { table: 'shipment_orders', action: 'update' }
  );
}

export async function dsDeleteShipmentOrder(id: string): Promise<void> {
  return withRLSFallback(
    () => sbStore.sbDeleteShipmentOrder(id),
    () => localStore.deleteShipmentOrder(id),
    'dsDeleteShipmentOrder',
    { table: 'shipment_orders', action: 'delete' }
  );
}

// ============================================================
// Patterns (Mold Management)
// ============================================================
export async function dsGetPatterns(): Promise<Pattern[]> {
  return withReadFallback(
    () => sbStore.sbGetPatterns(),
    () => localStore.getPatterns(),
    'dsGetPatterns'
  );
}

export async function dsCreatePattern(data: Omit<Pattern, 'id' | 'pattern_no' | 'usage_count' | 'created_at' | 'updated_at'>): Promise<Pattern> {
  return withRLSFallback(
    () => sbStore.sbCreatePattern(data),
    () => localStore.createPattern(data),
    'dsCreatePattern',
    { table: 'patterns', action: 'create' }
  );
}

export async function dsUpdatePattern(id: string, updates: Partial<Pattern>): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbUpdatePattern(id, updates); },
    () => { localStore.updatePattern(id, updates); },
    'dsUpdatePattern',
    { table: 'patterns', action: 'update' }
  );
}

export async function dsDeletePattern(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeletePattern(id); },
    () => { localStore.deletePattern(id); },
    'dsDeletePattern',
    { table: 'patterns', action: 'delete' }
  );
}

export async function dsGetPatternVersions(patternId: string): Promise<PatternVersion[]> {
  return withReadFallback(
    () => sbStore.sbGetPatternVersions(patternId),
    () => localStore.getPatternVersions(patternId),
    'dsGetPatternVersions'
  );
}

export async function dsCreatePatternVersion(data: Omit<PatternVersion, 'id' | 'created_at'>): Promise<PatternVersion> {
  return withRLSFallback(
    () => sbStore.sbCreatePatternVersion(data),
    () => localStore.createPatternVersion(data),
    'dsCreatePatternVersion',
    { table: 'pattern_versions', action: 'create' }
  );
}

export async function dsGetPatternHistory(patternId?: string): Promise<PatternHistory[]> {
  return withReadFallback(
    () => sbStore.sbGetPatternHistory(patternId),
    () => localStore.getPatternHistory(patternId),
    'dsGetPatternHistory'
  );
}

export async function dsCreatePatternHistory(data: Omit<PatternHistory, 'id' | 'created_at'>): Promise<PatternHistory> {
  return withRLSFallback(
    () => sbStore.sbCreatePatternHistory(data),
    () => localStore.createPatternHistory(data),
    'dsCreatePatternHistory',
    { table: 'pattern_history', action: 'create' }
  );
}

export async function dsGetPatternMaintenance(patternId?: string): Promise<PatternMaintenance[]> {
  return withReadFallback(
    () => sbStore.sbGetPatternMaintenance(patternId),
    () => localStore.getPatternMaintenance(patternId),
    'dsGetPatternMaintenance'
  );
}

export async function dsCreatePatternMaintenance(data: Omit<PatternMaintenance, 'id' | 'created_at'>): Promise<PatternMaintenance> {
  return withRLSFallback(
    () => sbStore.sbCreatePatternMaintenance(data),
    () => localStore.createPatternMaintenance(data),
    'dsCreatePatternMaintenance',
    { table: 'pattern_maintenance', action: 'create' }
  );
}

export async function dsGetPatternLoans(patternId?: string): Promise<PatternLoan[]> {
  return withReadFallback(
    () => sbStore.sbGetPatternLoans(patternId),
    () => localStore.getPatternLoans(patternId),
    'dsGetPatternLoans'
  );
}

export async function dsCreatePatternLoan(data: Omit<PatternLoan, 'id' | 'created_at'>): Promise<PatternLoan> {
  return withRLSFallback(
    () => sbStore.sbCreatePatternLoan(data),
    () => localStore.createPatternLoan(data),
    'dsCreatePatternLoan',
    { table: 'pattern_loans', action: 'create' }
  );
}

export async function dsReturnPatternLoan(loanId: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbReturnPatternLoan(loanId); },
    () => { localStore.returnPatternLoan(loanId); },
    'dsReturnPatternLoan',
    { table: 'pattern_loans', action: 'update' }
  );
}

// ============================================================
// Dashboard Stats (computed from data)
// ============================================================
export async function dsGetDashboardStats() {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.getDashboardStats();

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [batches, meltings, shipments] = await Promise.all([
      sbStore.sbGetMoldingBatches(),
      sbStore.sbGetMeltingRecords(),
      sbStore.sbGetShipmentOrders(),
    ]);

    const todayBatches = batches.filter(b => b.created_at.slice(0, 10) === today);
    const todayProduction = todayBatches.reduce((sum, b) => sum + b.quantity_completed, 0);

    const todayMeltings = meltings.filter(m => m.created_at.slice(0, 10) === today);
    const todayProductionKg = todayMeltings.reduce((sum, m) => sum + m.pouring_weight, 0);

    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
    const lastMonthMeltings = meltings.filter(m => m.created_at >= oneMonthAgo);
    const totalMeltingWeight = lastMonthMeltings.reduce((sum, m) => sum + m.melting_weight, 0);
    const totalPouringWeight = lastMonthMeltings.reduce((sum, m) => sum + m.pouring_weight, 0);
    const totalFailedWeight = totalMeltingWeight - totalPouringWeight;
    const yieldRate = totalMeltingWeight > 0 ? Math.round((1 - totalFailedWeight / totalMeltingWeight) * 10000) / 100 : 0;

    const wipQuantity = batches.filter(b => b.status !== 'Completed').reduce((sum, b) => sum + b.quantity_planned, 0);
    const pendingShipment = shipments.filter(s => s.status === 'Pending').length;

    return { todayProduction, todayProductionKg, yieldRate, wipQuantity, pendingShipment };
  } catch (err) {
    console.warn('[DataService] dsGetDashboardStats failed, using localStorage:', err);
    return localStore.getDashboardStats();
  }
}

// ============================================================
// Traceability (computed from data)
// ============================================================
export async function dsTraceByWorkOrder(orderNo: string) {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.traceByWorkOrder(orderNo);

  try {
    const [orders, allBatches, allMeltings, allInspections, allWarehouse, allShipments] = await Promise.all([
      sbStore.sbGetWorkOrders(),
      sbStore.sbGetMoldingBatches(),
      sbStore.sbGetMeltingRecords(),
      sbStore.sbGetQualityInspections(),
      sbStore.sbGetWarehouseEntries(),
      sbStore.sbGetShipmentOrders(),
    ]);
    const matchedOrders = orders.filter(o => o.order_no.includes(orderNo));
    const batches = allBatches.filter(b => matchedOrders.some(o => o.id === b.work_order_id));
    const meltings = allMeltings.filter(m => batches.some(b => b.id === m.batch_id));
    const inspections = allInspections.filter(i => batches.some(b => b.id === i.batch_id));
    const warehouse = allWarehouse.filter(w => batches.some(b => b.id === w.batch_id));
    const shipments = allShipments.filter(s => matchedOrders.some(o => o.id === s.work_order_id));
    return { orders: matchedOrders, batches, meltings, inspections, warehouse, shipments };
  } catch {
    return localStore.traceByWorkOrder(orderNo);
  }
}

export async function dsTraceByBatch(batchNo: string) {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.traceByBatch(batchNo);

  try {
    const [allOrders, allBatches, allMeltings, allInspections, allWarehouse, allShipments] = await Promise.all([
      sbStore.sbGetWorkOrders(),
      sbStore.sbGetMoldingBatches(),
      sbStore.sbGetMeltingRecords(),
      sbStore.sbGetQualityInspections(),
      sbStore.sbGetWarehouseEntries(),
      sbStore.sbGetShipmentOrders(),
    ]);
    const batches = allBatches.filter(b => b.batch_no.includes(batchNo));
    const orders = allOrders.filter(o => batches.some(b => b.work_order_id === o.id));
    const meltings = allMeltings.filter(m => batches.some(b => b.id === m.batch_id));
    const inspections = allInspections.filter(i => batches.some(b => b.id === i.batch_id));
    const warehouse = allWarehouse.filter(w => batches.some(b => b.id === w.batch_id));
    const shipments = allShipments.filter(s => orders.some(o => o.id === s.work_order_id));
    return { orders, batches, meltings, inspections, warehouse, shipments };
  } catch {
    return localStore.traceByBatch(batchNo);
  }
}

export async function dsTraceByHeatNo(heatNo: string) {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.traceByHeatNo(heatNo);

  try {
    const [allOrders, allBatches, allMeltings, allInspections, allWarehouse, allShipments] = await Promise.all([
      sbStore.sbGetWorkOrders(),
      sbStore.sbGetMoldingBatches(),
      sbStore.sbGetMeltingRecords(),
      sbStore.sbGetQualityInspections(),
      sbStore.sbGetWarehouseEntries(),
      sbStore.sbGetShipmentOrders(),
    ]);
    const meltings = allMeltings.filter(m => m.heat_no.includes(heatNo));
    const batches = allBatches.filter(b => meltings.some(m => m.batch_id === b.id));
    const orders = allOrders.filter(o => batches.some(b => b.work_order_id === o.id));
    const inspections = allInspections.filter(i => batches.some(b => b.id === i.batch_id));
    const warehouse = allWarehouse.filter(w => batches.some(b => b.id === w.batch_id));
    const shipments = allShipments.filter(s => orders.some(o => o.id === s.work_order_id));
    return { orders, batches, meltings, inspections, warehouse, shipments };
  } catch {
    return localStore.traceByHeatNo(heatNo);
  }
}

export async function dsTraceByShipment(shipmentNo: string) {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.traceByShipment(shipmentNo);

  try {
    const [allOrders, allBatches, allMeltings, allInspections, allWarehouse, allShipments] = await Promise.all([
      sbStore.sbGetWorkOrders(),
      sbStore.sbGetMoldingBatches(),
      sbStore.sbGetMeltingRecords(),
      sbStore.sbGetQualityInspections(),
      sbStore.sbGetWarehouseEntries(),
      sbStore.sbGetShipmentOrders(),
    ]);
    const shipments = allShipments.filter(s => s.shipment_no.includes(shipmentNo));
    const orders = allOrders.filter(o => shipments.some(s => s.work_order_id === o.id));
    const batches = allBatches.filter(b => orders.some(o => o.id === b.work_order_id));
    const meltings = allMeltings.filter(m => batches.some(b => b.id === m.batch_id));
    const inspections = allInspections.filter(i => batches.some(b => b.id === i.batch_id));
    const warehouse = allWarehouse.filter(w => batches.some(b => b.id === w.batch_id));
    return { orders, batches, meltings, inspections, warehouse, shipments };
  } catch {
    return localStore.traceByShipment(shipmentNo);
  }
}

// ============================================================
// Target Ranges (localStorage only - simple key-value)
// ============================================================
export async function dsGetMeltTargetRange(meltId: string): Promise<Record<string, number> | null> {
  return localStore.getMeltTargetRange(meltId);
}

export async function dsSaveMeltTargetRange(meltId: string, range: Record<string, number>): Promise<void> {
  localStore.saveMeltTargetRange(meltId, range);
}

export async function dsDeleteMeltTargetRange(meltId: string): Promise<void> {
  localStore.deleteMeltTargetRange(meltId);
}