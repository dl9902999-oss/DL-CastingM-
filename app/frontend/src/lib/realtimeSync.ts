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
 * - If Supabase returns empty array, also replace localStorage (supports delete sync).
 *   Exception: 'users_profile' table keeps local data if server is empty (demo users).
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
      // Supabase has data - it is authoritative, replace localStorage
      localStorage.setItem(storageKey, JSON.stringify(data));
    } else if (data && data.length === 0) {
      // Server returned empty - for most tables, this means all records were deleted
      // Exception: keep demo users if users_profile is empty on server
      if (table === 'users_profile') {
        // Keep existing localStorage intact for users
        return;
      }
      // For other tables, clear localStorage to reflect server state (delete sync)
      localStorage.setItem(storageKey, JSON.stringify([]));
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