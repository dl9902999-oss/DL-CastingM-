import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

// Tables to monitor for real-time changes
const WATCHED_TABLES = [
  'customers',
  'work_orders',
  'molding_batches',
  'melting_records',
  'quality_inspections',
  'defect_records',
  'capa_records',
  'warehouse_entries',
  'shipment_orders',
  'melt_records',
  'melt_materials',
  'melt_chemistries',
  'melt_pourings',
  'melt_preset_recipes',
  'patterns',
  'pattern_versions',
  'pattern_histories',
  'pattern_maintenances',
  'pattern_loans',
  'users_profile',
];

// Map Supabase table names to localStorage keys
const TABLE_TO_STORAGE_KEY: Record<string, string> = {
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
  melt_chemistries: 'foundry_melt_chemistry',
  melt_pourings: 'foundry_melt_pourings',
  melt_preset_recipes: 'foundry_melt_preset_recipes',
  patterns: 'foundry_patterns',
  pattern_versions: 'foundry_pattern_versions',
  pattern_histories: 'foundry_pattern_history',
  pattern_maintenances: 'foundry_pattern_maintenance',
  pattern_loans: 'foundry_pattern_loans',
  users_profile: 'foundry_users',
};

type ChangeListener = (table: string) => void;

// Track recent write timestamps per table to protect against premature clearing.
// Also persisted to localStorage so page refresh doesn't lose the protection window.
const RECENT_WRITE_PROTECTION_WINDOW = 30_000; // 30 seconds - survives page refresh
const RECENT_WRITES_STORAGE_KEY = 'foundry_recent_writes';
const _recentWriteTimestamps: Record<string, number> = (() => {
  try {
    const raw = localStorage.getItem(RECENT_WRITES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      // Clean up expired entries on load
      const now = Date.now();
      const cleaned: Record<string, number> = {};
      for (const [table, ts] of Object.entries(parsed)) {
        if (now - ts < RECENT_WRITE_PROTECTION_WINDOW) {
          cleaned[table] = ts;
        }
      }
      return cleaned;
    }
  } catch { /* ignore */ }
  return {};
})();

/**
 * Mark a table as having a recent write operation.
 * Called by dataService after successful Supabase writes.
 * This prevents refreshLocalFromSupabase from clearing local data
 * during the protection window (guards against RLS blocking SELECT
 * while INSERT succeeded).
 * 
 * Persisted to localStorage so the protection survives page refresh.
 */
export function markRecentWrite(table: string): void {
  _recentWriteTimestamps[table] = Date.now();
  // Persist to localStorage so page refresh doesn't lose the protection
  try {
    localStorage.setItem(RECENT_WRITES_STORAGE_KEY, JSON.stringify(_recentWriteTimestamps));
  } catch { /* ignore quota errors */ }
}

/**
 * Check if a table (or any table) has a recent write within the protection window.
 * Used by withReadFallback to prefer localStorage when Supabase might return stale data.
 */
export function hasRecentWrite(table?: string): boolean {
  const now = Date.now();
  if (table) {
    const ts = _recentWriteTimestamps[table] || 0;
    return (now - ts) < RECENT_WRITE_PROTECTION_WINDOW;
  }
  // Check any table
  return Object.values(_recentWriteTimestamps).some(ts => (now - ts) < RECENT_WRITE_PROTECTION_WINDOW);
}

// Cross-device work order change event
export type WorkOrderChangeEvent = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  newRecord?: Record<string, unknown>;
  oldRecord?: Record<string, unknown>;
  timestamp: number;
};
type WorkOrderChangeListener = (event: WorkOrderChangeEvent) => void;
let _workOrderChangeListeners: WorkOrderChangeListener[] = [];

/**
 * Subscribe to cross-device work_orders change notifications.
 * Fires when another device creates/updates/deletes a work order via Realtime.
 */
export function onWorkOrderChange(listener: WorkOrderChangeListener): () => void {
  _workOrderChangeListeners.push(listener);
  return () => {
    _workOrderChangeListeners = _workOrderChangeListeners.filter(l => l !== listener);
  };
}

function notifyWorkOrderChangeListeners(event: WorkOrderChangeEvent) {
  _workOrderChangeListeners.forEach(l => {
    try { l(event); } catch (e) { console.warn('[RealtimeSync] WO change listener error:', e); }
  });
}

let _channel: RealtimeChannel | null = null;
let _listeners: ChangeListener[] = [];
let _isSubscribed = false;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _retryCount = 0;
const MAX_RETRY_COUNT = 10;
const BASE_RETRY_DELAY = 3000; // 3 seconds

// Visibility change tracking
let _visibilityListenerAttached = false;
let _lastVisibilitySync = 0;
const VISIBILITY_SYNC_DEBOUNCE = 5000; // At least 5 seconds between visibility syncs

/**
 * Subscribe to a change notification callback.
 * Returns an unsubscribe function.
 */
export function onDataChange(listener: ChangeListener): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter(l => l !== listener);
  };
}

function notifyListeners(table: string) {
  _listeners.forEach(l => {
    try { l(table); } catch (e) { console.warn('[RealtimeSync] listener error:', e); }
  });
}

/**
 * Pull fresh data from Supabase for a specific table and update localStorage.
 * Strategy:
 * - If Supabase has data, it is authoritative - replace localStorage entirely.
 * - If Supabase returns empty array AND local has data, apply safety checks:
 *   - Only clear local data if the empty result is confirmed (double-check query).
 *   - Exception: 'users_profile' table always keeps local data if server is empty.
 * - On error, keep existing localStorage intact.
 */
async function refreshLocalFromSupabase(table: string): Promise<void> {
  const storageKey = TABLE_TO_STORAGE_KEY[table];
  if (!storageKey) return;

  try {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.warn(`[RealtimeSync] Failed to refresh ${table}:`, error.message);
      return;
    }
    if (data && data.length > 0) {
      // Supabase has data - it is authoritative, but we must preserve:
      // 1. Pending local items that haven't been synced yet (offline creates)
      // 2. Recently written items that might not yet appear in SELECT due to replication lag
      // 3. Any local items that would be lost if cloud returns fewer items (RLS partial block)
      const pendingRaw = localStorage.getItem('foundry_pending_sync');
      let pendingCreates: Record<string, unknown>[] = [];
      if (pendingRaw) {
        try {
          const queue = JSON.parse(pendingRaw) as Array<{ table: string; action: string; data?: Record<string, unknown> }>;
          pendingCreates = queue
            .filter(item => item.table === table && item.action === 'create' && item.data && item.data.id)
            .map(item => item.data as Record<string, unknown>);
        } catch { /* ignore parse errors */ }
      }

      // Check if there was a recent write to this table - if so, we must also
      // preserve any localStorage items that are missing from the Supabase result
      // (they may not have propagated to the read replica yet, or RLS blocks SELECT
      // for newly inserted rows).
      const lastWrite = _recentWriteTimestamps[table] || 0;
      const recentWriteDetected = (Date.now() - lastWrite) < RECENT_WRITE_PROTECTION_WINDOW;

      // ALWAYS check for missing local items when there's a recent write,
      // regardless of whether pending queue has items. This covers the case where
      // INSERT succeeded (pending queue cleared) but SELECT doesn't return the new row.
      let recentLocalCreates: Record<string, unknown>[] = [];
      if (recentWriteDetected) {
        try {
          const localRaw = localStorage.getItem(storageKey);
          if (localRaw) {
            const localItems = JSON.parse(localRaw) as Record<string, unknown>[];
            const cloudIds = new Set(data.map((d: Record<string, unknown>) => d.id));
            recentLocalCreates = localItems.filter(
              (item) => item.id && !cloudIds.has(item.id)
            );
            if (recentLocalCreates.length > 0) {
              console.log(
                `[RealtimeSync] ${table}: Recent write detected (${Date.now() - lastWrite}ms ago). ` +
                `Preserving ${recentLocalCreates.length} local items not yet in Supabase result.`
              );
            }
          }
        } catch { /* ignore parse errors */ }
      }

      // Additional safety: if local has MORE items than cloud and no recent write,
      // still preserve local items that are missing from cloud (they might be from
      // a previous session where RLS blocked the upload confirmation).
      let orphanedLocalItems: Record<string, unknown>[] = [];
      if (!recentWriteDetected && pendingCreates.length === 0) {
        try {
          const localRaw = localStorage.getItem(storageKey);
          if (localRaw) {
            const localItems = JSON.parse(localRaw) as Record<string, unknown>[];
            if (localItems.length > data.length) {
              const cloudIds = new Set(data.map((d: Record<string, unknown>) => d.id));
              orphanedLocalItems = localItems.filter(
                (item) => item.id && !cloudIds.has(item.id)
              );
              if (orphanedLocalItems.length > 0) {
                console.warn(
                  `[RealtimeSync] ${table}: Local has ${localItems.length} items but cloud only ${data.length}. ` +
                  `Preserving ${orphanedLocalItems.length} orphaned local items (possible RLS partial block).`
                );
              }
            }
          }
        } catch { /* ignore parse errors */ }
      }

      const cloudIds = new Set(data.map((d: Record<string, unknown>) => d.id));
      const missingPending = pendingCreates.filter(p => !cloudIds.has(p.id));
      const missingRecent = recentLocalCreates.filter(r => !cloudIds.has(r.id));
      const missingOrphaned = orphanedLocalItems.filter(o => !cloudIds.has(o.id));
      const allMissing = [...missingPending, ...missingRecent, ...missingOrphaned];

      // Deduplicate by id
      const seenIds = new Set<unknown>();
      const uniqueMissing = allMissing.filter(item => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      });

      if (uniqueMissing.length > 0) {
        console.log(`[RealtimeSync] ${table}: Preserving ${uniqueMissing.length} local items during refresh (pending: ${missingPending.length}, recent: ${missingRecent.length}, orphaned: ${missingOrphaned.length})`);
        localStorage.setItem(storageKey, JSON.stringify([...uniqueMissing, ...data]));
      } else {
        localStorage.setItem(storageKey, JSON.stringify(data));
      }
    } else if (data && data.length === 0) {
      // Server returned empty - apply safety checks before clearing local data
      if (table === 'users_profile') {
        // Always keep existing localStorage intact for users
        return;
      }

      // Safety check: if local has data but server says empty, verify with a count query
      const localRaw = localStorage.getItem(storageKey);
      const localItems = localRaw ? JSON.parse(localRaw) : [];

      if (localItems.length > 0) {
        // Local has data but server returned empty - this could be:
        // 1. RLS blocking the query (session expired)
        // 2. Legitimate deletion from another device
        // 3. Upload not yet committed
        // Perform a confirmation query with count to distinguish
        const { count, error: countError } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });

        if (countError) {
          // Query failed - likely RLS/auth issue, keep local data safe
          console.warn(`[RealtimeSync] Count check failed for ${table}, keeping local data:`, countError.message);
          return;
        }

        if (count === 0) {
          // Before clearing, check if there was a recent write to this table.
          // If so, the "0 count" is likely RLS blocking the count query too
          // (RLS returns 0 for count when SELECT is blocked, not null).
          const lastWrite = _recentWriteTimestamps[table] || 0;
          if (Date.now() - lastWrite < RECENT_WRITE_PROTECTION_WINDOW) {
            console.warn(
              `[RealtimeSync] ${table}: count=0 but recent write detected (${Date.now() - lastWrite}ms ago). ` +
              `Likely RLS blocking both SELECT and count. Keeping local data safe.`
            );
            return;
          }
          // Confirmed: server truly has 0 records and no recent writes. Safe to clear local.
          console.log(`[RealtimeSync] Confirmed ${table} is empty on server, clearing local (had ${localItems.length} items)`);
          localStorage.setItem(storageKey, JSON.stringify([]));
        } else if (count === null) {
          // Count returned null - ambiguous, keep local data
          console.warn(`[RealtimeSync] Ambiguous count for ${table} (null), keeping local data`);
          return;
        } else {
          // Count > 0 but select returned empty - RLS issue, keep local data
          console.warn(`[RealtimeSync] ${table}: count=${count} but select returned empty. Likely RLS issue, keeping local data.`);
          return;
        }
      } else {
        // Local is also empty, nothing to protect
        localStorage.setItem(storageKey, JSON.stringify([]));
      }
    }
  } catch (e) {
    console.warn(`[RealtimeSync] Exception refreshing ${table}:`, e);
  }
}

/**
 * Start listening to Supabase Realtime changes on all watched tables.
 * When a change is detected, refreshes localStorage and notifies listeners.
 * Includes automatic reconnection on channel errors.
 */
export function startRealtimeSync(): void {
  if (_isSubscribed) return;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return;

  // Clean up any existing channel before creating a new one
  if (_channel) {
    supabase.removeChannel(_channel);
    _channel = null;
  }

  _channel = supabase.channel('db-changes');

  // Subscribe to all watched tables
  for (const table of WATCHED_TABLES) {
    _channel = _channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      async (payload) => {
        console.log(`[RealtimeSync] Change on ${payload.table}:`, payload.eventType);
        await refreshLocalFromSupabase(payload.table);
        notifyListeners(payload.table);

        // Fire cross-device work_orders change event
        if (payload.table === 'work_orders') {
          notifyWorkOrderChangeListeners({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: payload.table,
            newRecord: payload.new as Record<string, unknown> | undefined,
            oldRecord: payload.old as Record<string, unknown> | undefined,
            timestamp: Date.now(),
          });
        }
      }
    );
  }

  _channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      _isSubscribed = true;
      _retryCount = 0; // Reset retry count on successful subscription
      console.log('[RealtimeSync] Subscribed to real-time changes');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn(`[RealtimeSync] Channel ${status}, scheduling retry...`);
      _isSubscribed = false;
      scheduleRetry();
    } else if (status === 'CLOSED') {
      _isSubscribed = false;
    }
  });

  // Attach visibility change listener (once)
  attachVisibilityListener();
}

/**
 * Schedule a reconnection attempt with exponential backoff.
 */
function scheduleRetry(): void {
  if (_retryTimer) return; // Already scheduled
  if (_retryCount >= MAX_RETRY_COUNT) {
    console.warn('[RealtimeSync] Max retries reached, stopping auto-reconnect.');
    return;
  }

  const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, _retryCount), 60_000); // Max 60s
  _retryCount++;

  console.log(`[RealtimeSync] Retry #${_retryCount} in ${delay}ms...`);
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    // Clean up and retry
    if (_channel) {
      supabase.removeChannel(_channel);
      _channel = null;
    }
    _isSubscribed = false;
    startRealtimeSync();
  }, delay);
}

/**
 * Attach a document visibility change listener to trigger sync
 * when the user returns to the tab/app (handles mobile background/foreground).
 */
function attachVisibilityListener(): void {
  if (_visibilityListenerAttached) return;
  _visibilityListenerAttached = true;

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    triggerVisibilitySync();
  }
}

function handleWindowFocus(): void {
  triggerVisibilitySync();
}

/**
 * When the page becomes visible or gains focus, pull fresh data from Supabase.
 * Debounced to avoid excessive API calls.
 */
function triggerVisibilitySync(): void {
  const now = Date.now();
  if (now - _lastVisibilitySync < VISIBILITY_SYNC_DEBOUNCE) return;
  _lastVisibilitySync = now;

  console.log('[RealtimeSync] Page became visible, syncing fresh data...');

  // If realtime channel is disconnected, try to reconnect
  if (!_isSubscribed) {
    _retryCount = 0; // Reset retry count on manual trigger
    if (_channel) {
      supabase.removeChannel(_channel);
      _channel = null;
    }
    startRealtimeSync();
  }

  // Always pull fresh data regardless of realtime status
  fullSyncFromSupabase();
}

/**
 * Stop listening to Supabase Realtime changes.
 */
export function stopRealtimeSync(): void {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  if (_channel) {
    supabase.removeChannel(_channel);
    _channel = null;
  }
  _isSubscribed = false;
  _retryCount = 0;
}

/**
 * Remove all event listeners (for cleanup on unmount).
 */
export function cleanupRealtimeSync(): void {
  stopRealtimeSync();
  if (_visibilityListenerAttached) {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleWindowFocus);
    _visibilityListenerAttached = false;
  }
  _listeners = [];
}

/**
 * Check if realtime sync is currently connected.
 */
export function isRealtimeConnected(): boolean {
  return _isSubscribed;
}

/**
 * Perform a full sync: pull all tables from Supabase into localStorage.
 * Useful on initial load or when returning to the app to ensure local data is up-to-date.
 */
export async function fullSyncFromSupabase(): Promise<void> {
  const promises = WATCHED_TABLES.map(table => refreshLocalFromSupabase(table));
  await Promise.allSettled(promises);
  // Notify listeners that all data has been refreshed
  notifyListeners('*');
}