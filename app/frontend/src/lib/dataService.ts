/**
 * 資料服務層 - 統一 API
 * 自動偵測 Supabase 連接狀態：
 * - 連接成功：使用 Supabase 即時資料
 * - 連接失敗：降級到 localStorage（離線模式）
 */

import * as localStore from './store';
import * as sbStore from './supabaseStore';
import { Customer, WorkOrder, MoldingBatch, MeltingRecord, MeltRecord, MeltMaterial, MeltChemistry, QualityInspection, DefectRecord, CAPARecord, WarehouseEntry, ShipmentOrder, UserProfile, Pattern, PatternVersion, PatternHistory, PatternMaintenance, PatternLoan } from './types';

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
  if (_writeFailed) return false;

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

export function getConnectionStatus(): { connected: boolean | null; writeFailed: boolean; reason: string } {
  return {
    connected: _writeFailed ? false : _isConnected,
    writeFailed: _writeFailed,
    reason: _offlineReason,
  };
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
  return connected;
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

const OPERATION_TIMEOUT = 10_000; // 10 seconds

async function withRLSFallback<T>(
  sbOperation: () => Promise<T>,
  localFallback: () => T,
  operationName: string
): Promise<T> {
  const connected = await isSupabaseConnected();
  if (!connected) return localFallback();

  try {
    return await withTimeout(sbOperation(), OPERATION_TIMEOUT, operationName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('policy') ||
      msg.includes('permission') ||
      msg.includes('row-level security') ||
      msg.includes('42501') ||
      msg.includes('new row violates')
    ) {
      console.warn(`[DataService] ${operationName}: RLS blocked, switching to offline mode`);
      _writeFailed = true;
      _offlineReason = 'rls_blocked';
      return localFallback();
    }
    // Timeout or network error - fallback to localStorage
    if (msg.includes('timeout')) {
      console.warn(`[DataService] ${operationName}: timeout, falling back to localStorage`);
      return localFallback();
    }
    throw err;
  }
}

async function withReadFallback<T>(
  sbOperation: () => Promise<T>,
  localFallback: () => T,
  operationName: string
): Promise<T> {
  const connected = await isSupabaseConnected();
  if (!connected) return localFallback();

  try {
    return await withTimeout(sbOperation(), OPERATION_TIMEOUT, operationName);
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
      return await sbStore.sbLogin(employeeId, password);
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
    'dsCreateUser'
  );
}

export async function dsUpdateUser(id: string, updates: Partial<Omit<UserProfile, 'id'>>): Promise<UserProfile | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateUser(id, updates),
    () => localStore.updateUser(id, updates),
    'dsUpdateUser'
  );
}

export async function dsDeleteUser(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteUser(id),
    () => localStore.deleteUser(id),
    'dsDeleteUser'
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
    'dsCreateCustomer'
  );
}

export async function dsUpdateCustomer(id: string, data: Partial<Customer>): Promise<Customer | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateCustomer(id, data),
    () => localStore.updateCustomer(id, data),
    'dsUpdateCustomer'
  );
}

export async function dsDeleteCustomer(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeleteCustomer(id); },
    () => { localStore.deleteCustomer(id); },
    'dsDeleteCustomer'
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
    'dsCreateWorkOrder'
  );
}

export async function dsUpdateWorkOrder(id: string, data: Partial<WorkOrder>): Promise<WorkOrder | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateWorkOrder(id, data),
    () => localStore.updateWorkOrder(id, data),
    'dsUpdateWorkOrder'
  );
}

export async function dsDeleteWorkOrder(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeleteWorkOrder(id); },
    () => { localStore.deleteWorkOrder(id); },
    'dsDeleteWorkOrder'
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
    'dsCreateMoldingBatch'
  );
}

export async function dsUpdateMoldingBatch(id: string, data: Partial<MoldingBatch>): Promise<MoldingBatch | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMoldingBatch(id, data),
    () => localStore.updateMoldingBatch(id, data),
    'dsUpdateMoldingBatch'
  );
}

export async function dsDeleteMoldingBatch(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeleteMoldingBatch(id); },
    () => { localStore.deleteMoldingBatch(id); },
    'dsDeleteMoldingBatch'
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
    'dsCreateMeltingRecord'
  );
}

export async function dsUpdateMeltingRecord(id: string, data: { furnace_no?: string; pouring_weights?: number[]; melting_weight?: number }): Promise<MeltingRecord | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltingRecord(id, data),
    () => localStore.updateMeltingRecord(id, data),
    'dsUpdateMeltingRecord'
  );
}

export async function dsDeleteMeltingRecord(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltingRecord(id),
    () => localStore.deleteMeltingRecord(id),
    'dsDeleteMeltingRecord'
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

export async function dsCreateMeltRecord(data: Omit<MeltRecord, 'id' | 'melt_no' | 'melt_minutes' | 'total_charge_weight' | 'specific_energy' | 'created_at' | 'updated_at'>): Promise<MeltRecord> {
  return withRLSFallback(
    () => sbStore.sbCreateMeltRecord(data),
    () => localStore.createMeltRecord(data),
    'dsCreateMeltRecord'
  );
}

export async function dsUpdateMeltRecord(id: string, data: Partial<Omit<MeltRecord, 'id' | 'melt_no' | 'created_at'>>): Promise<MeltRecord | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltRecord(id, data),
    () => localStore.updateMeltRecord(id, data),
    'dsUpdateMeltRecord'
  );
}

export async function dsDeleteMeltRecord(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltRecord(id),
    () => localStore.deleteMeltRecord(id),
    'dsDeleteMeltRecord'
  );
}

export async function dsRecalcMeltRecord(meltId: string): Promise<MeltRecord | null> {
  return withRLSFallback(
    () => sbStore.sbRecalcMeltRecord(meltId),
    () => localStore.recalcMeltRecord(meltId),
    'dsRecalcMeltRecord'
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
    'dsCreateMeltMaterial'
  );
}

export async function dsUpdateMeltMaterial(id: string, data: Partial<Omit<MeltMaterial, 'id' | 'subtotal'>>): Promise<MeltMaterial | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltMaterial(id, data),
    () => localStore.updateMeltMaterial(id, data),
    'dsUpdateMeltMaterial'
  );
}

export async function dsDeleteMeltMaterial(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltMaterial(id),
    () => localStore.deleteMeltMaterial(id),
    'dsDeleteMeltMaterial'
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
    'dsCreateMeltChemistry'
  );
}

export async function dsUpdateMeltChemistry(id: string, data: Partial<Omit<MeltChemistry, 'id'>>): Promise<MeltChemistry | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateMeltChemistry(id, data),
    () => localStore.updateMeltChemistry(id, data),
    'dsUpdateMeltChemistry'
  );
}

export async function dsDeleteMeltChemistry(id: string): Promise<boolean> {
  return withRLSFallback(
    () => sbStore.sbDeleteMeltChemistry(id),
    () => localStore.deleteMeltChemistry(id),
    'dsDeleteMeltChemistry'
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
    'dsCreateMeltPouring'
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
    'dsUpdateMeltPouring'
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
    'dsDeleteMeltPouring'
  );
}

// ============================================================
// Melt Preset Recipes
// ============================================================
export async function dsGetMeltPresetRecipes(): Promise<sbStore.MeltPresetRecipe[]> {
  return withReadFallback(
    () => sbStore.sbGetMeltPresetRecipes(),
    () => {
      const key = 'foundry_melt_preset_recipes';
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    },
    'dsGetMeltPresetRecipes'
  );
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
    'dsCreateMeltPresetRecipe'
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
    'dsUpdateMeltPresetRecipe'
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
    'dsDeleteMeltPresetRecipe'
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
    'dsCreateQualityInspection'
  );
}

export async function dsUpdateQualityInspection(id: string, data: Partial<QualityInspection>): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbUpdateQualityInspection(id, data); },
    () => { localStore.updateQualityInspection(id, data); },
    'dsUpdateQualityInspection'
  );
}

export async function dsDeleteQualityInspection(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeleteQualityInspection(id); },
    () => { localStore.deleteQualityInspection(id); },
    'dsDeleteQualityInspection'
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
    'dsCreateDefectRecord'
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
    'dsCreateCAPARecord'
  );
}

export async function dsUpdateCAPARecord(id: string, data: Partial<CAPARecord>): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbUpdateCAPARecord(id, data); },
    () => { localStore.updateCAPARecord(id, data); },
    'dsUpdateCAPARecord'
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
    'dsCreateWarehouseEntry'
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
    'dsCreateShipmentOrder'
  );
}

export async function dsUpdateShipmentOrder(id: string, data: Partial<ShipmentOrder>): Promise<ShipmentOrder | null> {
  return withRLSFallback(
    () => sbStore.sbUpdateShipmentOrder(id, data),
    () => localStore.updateShipmentOrder(id, data),
    'dsUpdateShipmentOrder'
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
    'dsCreatePattern'
  );
}

export async function dsUpdatePattern(id: string, updates: Partial<Pattern>): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbUpdatePattern(id, updates); },
    () => { localStore.updatePattern(id, updates); },
    'dsUpdatePattern'
  );
}

export async function dsDeletePattern(id: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbDeletePattern(id); },
    () => { localStore.deletePattern(id); },
    'dsDeletePattern'
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
    'dsCreatePatternVersion'
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
    'dsCreatePatternHistory'
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
    'dsCreatePatternMaintenance'
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
    'dsCreatePatternLoan'
  );
}

export async function dsReturnPatternLoan(loanId: string): Promise<void> {
  await withRLSFallback(
    async () => { await sbStore.sbReturnPatternLoan(loanId); },
    () => { localStore.returnPatternLoan(loanId); },
    'dsReturnPatternLoan'
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