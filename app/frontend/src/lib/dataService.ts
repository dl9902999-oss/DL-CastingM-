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
// Track if write operations failed due to RLS - forces fallback for reads too
let _writeFailed = false;

export async function isSupabaseConnected(): Promise<boolean> {
  if (_writeFailed) return false;
  if (_connectionChecked) return _isConnected!;
  if (_checkPromise) return _checkPromise;
  _checkPromise = sbStore.checkSupabaseConnection().then(connected => {
    _isConnected = connected;
    _connectionChecked = true;
    console.log(`[DataService] Supabase ${connected ? '已連接 ✓' : '未連接，使用離線模式'}`);
    return connected;
  }).catch(() => {
    _isConnected = false;
    _connectionChecked = true;
    return false;
  });
  return _checkPromise;
}

// Force re-check connection
export function resetConnectionState(): void {
  _isConnected = null;
  _connectionChecked = false;
  _checkPromise = null;
  _writeFailed = false;
}

export function getConnectionStatus(): boolean | null {
  return _isConnected;
}

// ============================================================
// Users / Auth
// ============================================================
export async function dsLogin(employeeId: string, password: string): Promise<UserProfile | null> {
  const connected = await isSupabaseConnected();
  if (connected) {
    return sbStore.sbLogin(employeeId, password);
  }
  return localStore.login(employeeId, password);
}

export async function dsGetAllUsers(): Promise<UserProfile[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetAllUsers();
  return localStore.getAllUsers();
}

export async function dsCreateUser(userData: Omit<UserProfile, 'id'>): Promise<UserProfile> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateUser(userData);
  return localStore.createUser(userData);
}

export async function dsUpdateUser(id: string, updates: Partial<Omit<UserProfile, 'id'>>): Promise<UserProfile | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateUser(id, updates);
  return localStore.updateUser(id, updates);
}

export async function dsDeleteUser(id: string): Promise<boolean> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteUser(id);
  return localStore.deleteUser(id);
}

// ============================================================
// Customers
// ============================================================
export async function dsGetCustomers(): Promise<Customer[]> {
  const connected = await isSupabaseConnected();
  if (connected) {
    try {
      return await sbStore.sbGetCustomers();
    } catch (err) {
      console.warn('[DataService] sbGetCustomers failed, falling back to localStorage:', err);
      return localStore.getCustomers();
    }
  }
  return localStore.getCustomers();
}

export async function dsCreateCustomer(data: Omit<Customer, 'id' | 'customer_no' | 'created_at' | 'updated_at'>): Promise<Customer> {
  const connected = await isSupabaseConnected();
  if (connected) {
    try {
      return await sbStore.sbCreateCustomer(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // RLS policy error - fall back to localStorage and warn
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security') || msg.includes('42501') || msg.includes('new row violates')) {
        console.warn('[DataService] Supabase RLS blocked insert, switching to offline mode. Please run supabase_rls_fix.sql');
        _writeFailed = true;
        const result = localStore.createCustomer(data);
        return result;
      }
      throw err;
    }
  }
  return localStore.createCustomer(data);
}

export async function dsUpdateCustomer(id: string, data: Partial<Customer>): Promise<Customer | null> {
  const connected = await isSupabaseConnected();
  if (connected) {
    try {
      return await sbStore.sbUpdateCustomer(id, data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security') || msg.includes('42501')) {
        console.warn('[DataService] Supabase RLS blocked update, switching to offline mode');
        _writeFailed = true;
        return localStore.updateCustomer(id, data);
      }
      throw err;
    }
  }
  return localStore.updateCustomer(id, data);
}

export async function dsDeleteCustomer(id: string): Promise<void> {
  const connected = await isSupabaseConnected();
  if (connected) {
    try {
      return await sbStore.sbDeleteCustomer(id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security') || msg.includes('42501')) {
        console.warn('[DataService] Supabase RLS blocked delete, switching to offline mode');
        _writeFailed = true;
        localStore.deleteCustomer(id);
        return;
      }
      throw err;
    }
  }
  localStore.deleteCustomer(id);
}

// ============================================================
// Work Orders
// ============================================================
export async function dsGetWorkOrders(): Promise<WorkOrder[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetWorkOrders();
  return localStore.getWorkOrders();
}

export async function dsCreateWorkOrder(data: Omit<WorkOrder, 'id' | 'order_no' | 'status' | 'created_at' | 'updated_at'>): Promise<WorkOrder> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateWorkOrder(data);
  return localStore.createWorkOrder(data);
}

export async function dsUpdateWorkOrder(id: string, data: Partial<WorkOrder>): Promise<WorkOrder | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateWorkOrder(id, data);
  return localStore.updateWorkOrder(id, data);
}

export async function dsDeleteWorkOrder(id: string): Promise<void> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteWorkOrder(id);
  localStore.deleteWorkOrder(id);
}

// ============================================================
// Molding Batches
// ============================================================
export async function dsGetMoldingBatches(): Promise<MoldingBatch[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetMoldingBatches();
  return localStore.getMoldingBatches();
}

export async function dsCreateMoldingBatch(data: { work_order_id: string; order_no: string; customer: string; product_name: string; material: string; quantity_planned: number; estimated_pouring_weight: number; remarks: string; molding_photos: string[]; closing_photos?: string[] }): Promise<MoldingBatch> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateMoldingBatch(data);
  return localStore.createMoldingBatch(data);
}

export async function dsUpdateMoldingBatch(id: string, data: Partial<MoldingBatch>): Promise<MoldingBatch | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateMoldingBatch(id, data);
  return localStore.updateMoldingBatch(id, data);
}

export async function dsDeleteMoldingBatch(id: string): Promise<void> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteMoldingBatch(id);
  localStore.deleteMoldingBatch(id);
}

// ============================================================
// Melting Records (Legacy)
// ============================================================
export async function dsGetMeltingRecords(): Promise<MeltingRecord[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetMeltingRecords();
  return localStore.getMeltingRecords();
}

export async function dsCreateMeltingRecord(data: { batch_id: string; batch_no: string; furnace_no: string; melting_weight: number; pouring_weights: number[] }): Promise<MeltingRecord> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateMeltingRecord(data);
  return localStore.createMeltingRecord(data);
}

export async function dsUpdateMeltingRecord(id: string, data: { furnace_no?: string; pouring_weights?: number[]; melting_weight?: number }): Promise<MeltingRecord | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateMeltingRecord(id, data);
  return localStore.updateMeltingRecord(id, data);
}

export async function dsDeleteMeltingRecord(id: string): Promise<boolean> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteMeltingRecord(id);
  return localStore.deleteMeltingRecord(id);
}

// ============================================================
// Melt Records (New full)
// ============================================================
export async function dsGetMeltRecords(): Promise<MeltRecord[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetMeltRecords();
  return localStore.getMeltRecords();
}

export async function dsCreateMeltRecord(data: Omit<MeltRecord, 'id' | 'melt_no' | 'melt_minutes' | 'total_charge_weight' | 'specific_energy' | 'created_at' | 'updated_at'>): Promise<MeltRecord> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateMeltRecord(data);
  return localStore.createMeltRecord(data);
}

export async function dsUpdateMeltRecord(id: string, data: Partial<Omit<MeltRecord, 'id' | 'melt_no' | 'created_at'>>): Promise<MeltRecord | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateMeltRecord(id, data);
  return localStore.updateMeltRecord(id, data);
}

export async function dsDeleteMeltRecord(id: string): Promise<boolean> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteMeltRecord(id);
  return localStore.deleteMeltRecord(id);
}

export async function dsRecalcMeltRecord(meltId: string): Promise<MeltRecord | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbRecalcMeltRecord(meltId);
  return localStore.recalcMeltRecord(meltId);
}

// ============================================================
// Melt Materials
// ============================================================
export async function dsGetMeltMaterials(meltId?: string): Promise<MeltMaterial[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetMeltMaterials(meltId);
  return localStore.getMeltMaterials(meltId);
}

export async function dsCreateMeltMaterial(data: Omit<MeltMaterial, 'id' | 'subtotal'>): Promise<MeltMaterial> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateMeltMaterial(data);
  return localStore.createMeltMaterial(data);
}

export async function dsUpdateMeltMaterial(id: string, data: Partial<Omit<MeltMaterial, 'id' | 'subtotal'>>): Promise<MeltMaterial | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateMeltMaterial(id, data);
  return localStore.updateMeltMaterial(id, data);
}

export async function dsDeleteMeltMaterial(id: string): Promise<boolean> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteMeltMaterial(id);
  return localStore.deleteMeltMaterial(id);
}

// ============================================================
// Melt Chemistry
// ============================================================
export async function dsGetMeltChemistry(meltId?: string): Promise<MeltChemistry[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetMeltChemistry(meltId);
  return localStore.getMeltChemistry(meltId);
}

export async function dsCreateMeltChemistry(data: Omit<MeltChemistry, 'id'>): Promise<MeltChemistry> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateMeltChemistry(data);
  return localStore.createMeltChemistry(data);
}

export async function dsUpdateMeltChemistry(id: string, data: Partial<Omit<MeltChemistry, 'id'>>): Promise<MeltChemistry | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateMeltChemistry(id, data);
  return localStore.updateMeltChemistry(id, data);
}

export async function dsDeleteMeltChemistry(id: string): Promise<boolean> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteMeltChemistry(id);
  return localStore.deleteMeltChemistry(id);
}

// ============================================================
// Melt Pourings
// ============================================================
export async function dsGetMeltPourings(meltId?: string): Promise<sbStore.MeltPouring[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetMeltPourings(meltId);
  // localStorage fallback - stored in melt_pourings key
  const key = 'foundry_melt_pourings';
  const raw = localStorage.getItem(key);
  const all: sbStore.MeltPouring[] = raw ? JSON.parse(raw) : [];
  return meltId ? all.filter(p => p.melt_id === meltId) : all;
}

export async function dsCreateMeltPouring(data: Omit<sbStore.MeltPouring, 'id' | 'created_at'>): Promise<sbStore.MeltPouring> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateMeltPouring(data);
  // localStorage fallback
  const key = 'foundry_melt_pourings';
  const raw = localStorage.getItem(key);
  const all: sbStore.MeltPouring[] = raw ? JSON.parse(raw) : [];
  const entry: sbStore.MeltPouring = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  all.push(entry);
  localStorage.setItem(key, JSON.stringify(all));
  return entry;
}

export async function dsUpdateMeltPouring(id: string, updates: Partial<sbStore.MeltPouring>): Promise<sbStore.MeltPouring | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateMeltPouring(id, updates);
  const key = 'foundry_melt_pourings';
  const raw = localStorage.getItem(key);
  const all: sbStore.MeltPouring[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex(p => p.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...updates };
  localStorage.setItem(key, JSON.stringify(all));
  return all[idx];
}

export async function dsDeleteMeltPouring(id: string): Promise<boolean> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteMeltPouring(id);
  const key = 'foundry_melt_pourings';
  const raw = localStorage.getItem(key);
  const all: sbStore.MeltPouring[] = raw ? JSON.parse(raw) : [];
  const filtered = all.filter(p => p.id !== id);
  localStorage.setItem(key, JSON.stringify(filtered));
  return filtered.length < all.length;
}

// ============================================================
// Melt Preset Recipes
// ============================================================
export async function dsGetMeltPresetRecipes(): Promise<sbStore.MeltPresetRecipe[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetMeltPresetRecipes();
  const key = 'foundry_melt_preset_recipes';
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

export async function dsCreateMeltPresetRecipe(data: { name: string; materials: sbStore.MeltPresetRecipe['materials'] }): Promise<sbStore.MeltPresetRecipe> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateMeltPresetRecipe(data);
  const key = 'foundry_melt_preset_recipes';
  const raw = localStorage.getItem(key);
  const all: sbStore.MeltPresetRecipe[] = raw ? JSON.parse(raw) : [];
  const entry: sbStore.MeltPresetRecipe = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  all.push(entry);
  localStorage.setItem(key, JSON.stringify(all));
  return entry;
}

export async function dsUpdateMeltPresetRecipe(id: string, updates: Partial<{ name: string; materials: sbStore.MeltPresetRecipe['materials'] }>): Promise<sbStore.MeltPresetRecipe | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateMeltPresetRecipe(id, updates);
  const key = 'foundry_melt_preset_recipes';
  const raw = localStorage.getItem(key);
  const all: sbStore.MeltPresetRecipe[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex(r => r.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(all));
  return all[idx];
}

export async function dsDeleteMeltPresetRecipe(id: string): Promise<boolean> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteMeltPresetRecipe(id);
  const key = 'foundry_melt_preset_recipes';
  const raw = localStorage.getItem(key);
  const all: sbStore.MeltPresetRecipe[] = raw ? JSON.parse(raw) : [];
  const filtered = all.filter(r => r.id !== id);
  localStorage.setItem(key, JSON.stringify(filtered));
  return filtered.length < all.length;
}

// ============================================================
// Quality Inspections
// ============================================================
export async function dsGetQualityInspections(): Promise<QualityInspection[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetQualityInspections();
  return localStore.getQualityInspections();
}

export async function dsCreateQualityInspection(data: Omit<QualityInspection, 'id' | 'inspection_no' | 'created_at'>): Promise<QualityInspection> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateQualityInspection(data);
  return localStore.createQualityInspection(data);
}

export async function dsUpdateQualityInspection(id: string, data: Partial<QualityInspection>): Promise<void> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateQualityInspection(id, data);
  localStore.updateQualityInspection(id, data);
}

export async function dsDeleteQualityInspection(id: string): Promise<void> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeleteQualityInspection(id);
  localStore.deleteQualityInspection(id);
}

// ============================================================
// Defect Records
// ============================================================
export async function dsGetDefectRecords(): Promise<DefectRecord[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetDefectRecords();
  return localStore.getDefectRecords();
}

export async function dsCreateDefectRecord(data: Omit<DefectRecord, 'id' | 'created_at'>): Promise<DefectRecord> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateDefectRecord(data);
  return localStore.createDefectRecord(data);
}

// ============================================================
// CAPA Records
// ============================================================
export async function dsGetCAPARecords(): Promise<CAPARecord[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetCAPARecords();
  return localStore.getCAPARecords();
}

export async function dsCreateCAPARecord(data: Omit<CAPARecord, 'id' | 'capa_no' | 'created_at'>): Promise<CAPARecord> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateCAPARecord(data);
  return localStore.createCAPARecord(data);
}

export async function dsUpdateCAPARecord(id: string, data: Partial<CAPARecord>): Promise<void> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateCAPARecord(id, data);
  localStore.updateCAPARecord(id, data);
}

// ============================================================
// Warehouse Entries
// ============================================================
export async function dsGetWarehouseEntries(): Promise<WarehouseEntry[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetWarehouseEntries();
  return localStore.getWarehouseEntries();
}

export async function dsCreateWarehouseEntry(data: { batch_id: string; batch_no: string; location: string; quantity: number }): Promise<WarehouseEntry> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateWarehouseEntry(data);
  return localStore.createWarehouseEntry(data);
}

// ============================================================
// Shipment Orders
// ============================================================
export async function dsGetShipmentOrders(): Promise<ShipmentOrder[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetShipmentOrders();
  return localStore.getShipmentOrders();
}

export async function dsCreateShipmentOrder(data: { work_order_id: string; order_no: string; customer: string; quantity: number; ship_date: string }): Promise<ShipmentOrder> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreateShipmentOrder(data);
  return localStore.createShipmentOrder(data);
}

export async function dsUpdateShipmentOrder(id: string, data: Partial<ShipmentOrder>): Promise<ShipmentOrder | null> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdateShipmentOrder(id, data);
  return localStore.updateShipmentOrder(id, data);
}

// ============================================================
// Patterns (Mold Management)
// ============================================================
export async function dsGetPatterns(): Promise<Pattern[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetPatterns();
  return localStore.getPatterns();
}

export async function dsCreatePattern(data: Omit<Pattern, 'id' | 'pattern_no' | 'usage_count' | 'created_at' | 'updated_at'>): Promise<Pattern> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreatePattern(data);
  return localStore.createPattern(data);
}

export async function dsUpdatePattern(id: string, updates: Partial<Pattern>): Promise<void> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbUpdatePattern(id, updates);
  localStore.updatePattern(id, updates);
}

export async function dsDeletePattern(id: string): Promise<void> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbDeletePattern(id);
  localStore.deletePattern(id);
}

export async function dsGetPatternVersions(patternId: string): Promise<PatternVersion[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetPatternVersions(patternId);
  return localStore.getPatternVersions(patternId);
}

export async function dsCreatePatternVersion(data: Omit<PatternVersion, 'id' | 'created_at'>): Promise<PatternVersion> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreatePatternVersion(data);
  return localStore.createPatternVersion(data);
}

export async function dsGetPatternHistory(patternId?: string): Promise<PatternHistory[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetPatternHistory(patternId);
  return localStore.getPatternHistory(patternId);
}

export async function dsCreatePatternHistory(data: Omit<PatternHistory, 'id' | 'created_at'>): Promise<PatternHistory> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreatePatternHistory(data);
  return localStore.createPatternHistory(data);
}

export async function dsGetPatternMaintenance(patternId?: string): Promise<PatternMaintenance[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetPatternMaintenance(patternId);
  return localStore.getPatternMaintenance(patternId);
}

export async function dsCreatePatternMaintenance(data: Omit<PatternMaintenance, 'id' | 'created_at'>): Promise<PatternMaintenance> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreatePatternMaintenance(data);
  return localStore.createPatternMaintenance(data);
}

export async function dsGetPatternLoans(patternId?: string): Promise<PatternLoan[]> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbGetPatternLoans(patternId);
  return localStore.getPatternLoans(patternId);
}

export async function dsCreatePatternLoan(data: Omit<PatternLoan, 'id' | 'created_at'>): Promise<PatternLoan> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbCreatePatternLoan(data);
  return localStore.createPatternLoan(data);
}

export async function dsReturnPatternLoan(loanId: string): Promise<void> {
  const connected = await isSupabaseConnected();
  if (connected) return sbStore.sbReturnPatternLoan(loanId);
  localStore.returnPatternLoan(loanId);
}

// ============================================================
// Dashboard Stats (computed from data)
// ============================================================
export async function dsGetDashboardStats() {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.getDashboardStats();

  // Compute from Supabase data
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
}

// ============================================================
// Traceability (computed from data)
// ============================================================
export async function dsTraceByWorkOrder(orderNo: string) {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.traceByWorkOrder(orderNo);

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
}

export async function dsTraceByBatch(batchNo: string) {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.traceByBatch(batchNo);

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
}

export async function dsTraceByHeatNo(heatNo: string) {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.traceByHeatNo(heatNo);

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
}

export async function dsTraceByShipment(shipmentNo: string) {
  const connected = await isSupabaseConnected();
  if (!connected) return localStore.traceByShipment(shipmentNo);

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
}

// ============================================================
// Target Ranges (localStorage only - simple key-value)
// ============================================================
export async function dsGetMeltTargetRange(meltId: string): Promise<Record<string, number> | null> {
  // Target ranges are stored locally for now
  return localStore.getMeltTargetRange(meltId);
}

export async function dsSaveMeltTargetRange(meltId: string, range: Record<string, number>): Promise<void> {
  localStore.saveMeltTargetRange(meltId, range);
}

export async function dsDeleteMeltTargetRange(meltId: string): Promise<void> {
  localStore.deleteMeltTargetRange(meltId);
}