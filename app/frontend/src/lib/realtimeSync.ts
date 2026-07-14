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
 * Uses a smart merge strategy:
 * - If Supabase has data, merge it with local data (Supabase wins on conflicts by id).
 * - If Supabase returns empty array, keep existing local data intact
 *   (prevents wiping demo users or locally-created records).
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
    // Only update localStorage if Supabase actually has data.
    if (data && data.length > 0) {
      // Merge strategy: Supabase data is authoritative for records it contains.
      // Keep any local records not present in Supabase (they may be pending upload).
      const existingRaw = localStorage.getItem(storageKey);
      const existingItems: Record<string, unknown>[] = existingRaw ? JSON.parse(existingRaw) : [];
      
      // Build a set of IDs from Supabase data
      const supabaseIds = new Set(data.map((item: Record<string, unknown>) => item.id));
      
      // Keep local items that are NOT in Supabase (pending upload)
      const localOnlyItems = existingItems.filter(
        (item: Record<string, unknown>) => item.id && !supabaseIds.has(item.id)
      );
      
      // Merged result: Supabase data + local-only items
      const merged = [...data, ...localOnlyItems];
      localStorage.setItem(storageKey, JSON.stringify(merged));
    }
  } catch (e) {
    console.warn(`[RealtimeSync] Exception refreshing ${table}:`, e);
  }
}

/**
 * Start listening to Supabase Realtime changes on all watched tables.
 * When a change is detected, refreshes localStorage and notifies listeners.
 */
export function startRealtimeSync(): void {
  if (_isSubscribed) return;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return;

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
      console.log('[RealtimeSync] Subscribed to real-time changes');
    } else if (status === 'CHANNEL_ERROR') {
      console.warn('[RealtimeSync] Channel error, will retry...');
      _isSubscribed = false;
    }
  });
}

/**
 * Stop listening to Supabase Realtime changes.
 */
export function stopRealtimeSync(): void {
  if (_channel) {
    supabase.removeChannel(_channel);
    _channel = null;
  }
  _isSubscribed = false;
}

/**
 * Perform a full sync: pull all tables from Supabase into localStorage.
 * Useful on initial load to ensure local data is up-to-date.
 */
export async function fullSyncFromSupabase(): Promise<void> {
  const promises = WATCHED_TABLES.map(table => refreshLocalFromSupabase(table));
  await Promise.allSettled(promises);
  // Notify listeners that all data has been refreshed
  notifyListeners('*');
}