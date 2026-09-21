import { supabase } from './supabase';
import { Customer, WorkOrder, MoldingBatch, MeltingRecord, MeltRecord, MeltMaterial, MeltChemistry, QualityInspection, DefectRecord, CAPARecord, WarehouseEntry, ShipmentOrder, UserProfile, Pattern, PatternVersion, PatternHistory, PatternMaintenance, PatternLoan } from './types';

/**
 * 雲端刪除未生效的錯誤標記。
 *
 * PostgREST 在 RLS 未開放 DELETE 時會「刪除 0 列且不報錯」，若把它當成成功，
 * 雲端舊資料會保留並在下次讀取時復活（編輯刪除投料明細後又出現）。
 * 帶上此標記的錯誤在資料層必須視為硬失敗，不可降級成本地刪除成功。
 */
export const CLOUD_DELETE_NOT_APPLIED = 'CLOUD_DELETE_NOT_APPLIED';

/** 判斷錯誤是否為「雲端刪除未生效」 */
export function isCloudDeleteNotAppliedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(CLOUD_DELETE_NOT_APPLIED);
}

/**
 * Expose the Supabase client for direct operations (e.g., pending sync deletes).
 */
export function supabaseClient() {
  return supabase;
}

// ============================================================
// Supabase connection check
// ============================================================
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return false;

    // Use a RLS-independent method to check connectivity.
    // Previously we used `customers.select('id').limit(1)` which would fail
    // if RLS blocked SELECT, causing the entire system to enter offline mode
    // even though INSERT/UPDATE operations might work fine.
    //
    // Strategy: Use Supabase auth API (not affected by table RLS) to verify
    // the connection is alive. If auth responds, the connection is good.
    // Individual table operations will handle RLS errors gracefully via
    // withRLSFallback's catch block.
    const { error: authError } = await supabase.auth.getSession();
    if (authError) {
      // Auth API error could mean network issue or invalid credentials
      console.warn('[Supabase] Auth API 錯誤，可能是網路問題:', authError.message);
      return false;
    }

    // Auth responded successfully - connection is alive.
    // Optionally verify the database is reachable with a lightweight query
    // that doesn't depend on business table RLS policies.
    // Use a simple RPC or system table if available, otherwise just trust auth.
    try {
      // Try a simple SELECT on a table - but treat RLS errors as "connected"
      // because the network works, just permissions need fixing.
      const { error } = await supabase.from('customers').select('id').limit(1);
      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist - connection works but schema not set up
          console.warn('[Supabase] 連接成功但資料表尚未建立，請執行 SQL schema');
          // Still return true - connection is alive, schema issue is separate
          return true;
        }
        if (error.code === '42501' || error.message?.includes('permission denied')) {
          // RLS blocks SELECT - but connection works! Let writes attempt and
          // fail gracefully via withRLSFallback if needed.
          console.log('[Supabase] 連接成功（RLS 限制 SELECT，寫入將嘗試執行）');
          return true;
        }
        // Other errors - still connected if auth worked
        console.warn('[Supabase] 資料表查詢有錯誤但連線正常:', error.message);
        return true;
      }
    } catch {
      // Table query failed but auth worked - connection is alive
      console.warn('[Supabase] 資料表查詢異常但 auth 連線正常');
      return true;
    }

    return true;
  } catch (e) {
    console.warn('[Supabase] 連接失敗:', e);
    return false;
  }
}

// ============================================================
// Users
// ============================================================
export async function sbGetAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from('users_profile').select('*');
  if (error) throw error;
  return (data || []).map(mapUserProfile);
}

export async function sbLogin(employeeId: string, password: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('users_profile').select('*').eq('employee_id', employeeId).single();
  if (error || !data) return null;
  const user = mapUserProfile(data);
  // Password check - stored in profile for demo
  if ((data as Record<string, unknown>).password !== password) return null;
  return user;
}

export async function sbCreateUser(userData: Omit<UserProfile, 'id'>): Promise<UserProfile> {
  const { data, error } = await supabase.from('users_profile').insert({
    employee_id: userData.employee_id,
    name: userData.name,
    role: userData.role,
    permissions: userData.permissions || [],
    password: userData.password,
  }).select().single();
  if (error) throw error;
  return mapUserProfile(data);
}

export async function sbUpdateUser(id: string, updates: Partial<Omit<UserProfile, 'id'>>): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('users_profile').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data ? mapUserProfile(data) : null;
}

export async function sbDeleteUser(id: string): Promise<boolean> {
  const { error } = await supabase.from('users_profile').delete().eq('id', id);
  return !error;
}

function mapUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    employee_id: row.employee_id as string,
    password: (row.password as string) || '',
    email: (row.email as string) || '',
    role: row.role as UserProfile['role'],
    name: row.name as string,
    permissions: (row.permissions as string[]) || [],
  };
}

// ============================================================
// Customers
// ============================================================
export async function sbGetCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapCustomer);
}

export async function sbCreateCustomer(customerData: Omit<Customer, 'id' | 'customer_no' | 'created_at' | 'updated_at'>): Promise<Customer> {
  // Generate customer_no
  const prefixMap: Record<string, string> = {
    '產業機械': 'A', '砂石產業': 'B', '營造工程': 'C', '汽車模具': 'D',
    '鑄造廠': 'E', '加工廠': 'F', '貿易商': 'G', '其他': 'H',
  };
  const prefix = prefixMap[customerData.type] || 'G';
  const { data: existing } = await supabase.from('customers').select('customer_no').like('customer_no', `${prefix}-%`);
  const seq = (existing?.length || 0) + 1;
  const customerNo = `${prefix}-${String(seq).padStart(3, '0')}`;

  const insertPayload = {
    name: customerData.name,
    short_name: customerData.short_name || '',
    type: customerData.type || '',
    address: customerData.address || '',
    delivery_addresses: customerData.delivery_addresses || [],
    phone: customerData.phone || '',
    email: customerData.email || '',
    contact1_name: customerData.contact1_name || '',
    contact1_phone: customerData.contact1_phone || '',
    contact2_name: customerData.contact2_name || '',
    contact2_phone: customerData.contact2_phone || '',
    status: customerData.status || '啟用',
    remarks: customerData.remarks || '',
    customer_no: customerNo,
  };

  const { data, error } = await supabase.from('customers').insert(insertPayload).select().single();
  if (error) {
    console.error('[Supabase] sbCreateCustomer error:', error.code, error.message, error.details, error.hint);
    const errMsg = error.message + ' [code: ' + error.code + ']';
    throw new Error(errMsg);
  }
  return mapCustomer(data);
}

export async function sbUpdateCustomer(id: string, updates: Partial<Customer>): Promise<Customer | null> {
  const { data, error } = await supabase.from('customers').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data ? mapCustomer(data) : null;
}

export async function sbDeleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
}

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    customer_no: (row.customer_no as string) || '',
    name: (row.name as string) || '',
    short_name: (row.short_name as string) || '',
    type: (row.type as Customer['type']) || '',
    address: (row.address as string) || '',
    delivery_addresses: (row.delivery_addresses as string[]) || [],
    phone: (row.phone as string) || '',
    email: (row.email as string) || '',
    contact1_name: (row.contact1_name as string) || '',
    contact1_phone: (row.contact1_phone as string) || '',
    contact2_name: (row.contact2_name as string) || '',
    contact2_phone: (row.contact2_phone as string) || '',
    status: (row.status as Customer['status']) || '啟用',
    remarks: (row.remarks as string) || '',
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

// ============================================================
// Work Orders
// ============================================================

/**
 * Columns that actually exist on the `work_orders` table.
 * Any extra key coming from the UI form (or from a legacy pending-sync payload)
 * would make Postgres reject the whole INSERT/UPDATE, so we whitelist here.
 */
const WORK_ORDER_COLUMNS = [
  'customer',
  'product_name',
  'material',
  'quantity',
  'estimated_weight',
  'mold_supply',
  'mold_type',
  'pattern_id',
  'heat_treatment',
  'due_date',
  'remarks',
  'mold_photos',
  'drawing_photos',
  'status',
] as const;

/** DATE / TIMESTAMP columns: an empty string is invalid for Postgres, must be NULL. */
const WORK_ORDER_DATE_COLUMNS = new Set<string>(['due_date']);

/** Numeric columns: an empty string is invalid for Postgres, coerce to a number. */
const WORK_ORDER_NUMERIC_COLUMNS = new Set<string>(['quantity', 'estimated_weight']);

/**
 * Build a Postgres-safe payload for work_orders.
 * Root cause of "新增工單無法寫入": the form keeps `due_date` as '' when the user
 * leaves it blank, and `''` is not a valid DATE literal — Postgres aborts the INSERT
 * with `invalid input syntax for type date`. Empty dates must be sent as NULL.
 */
function buildWorkOrderPayload(source: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const column of WORK_ORDER_COLUMNS) {
    if (!(column in source)) continue;
    const value = source[column];

    if (WORK_ORDER_DATE_COLUMNS.has(column)) {
      // '' / null / undefined → NULL (column is nullable in the schema)
      payload[column] = value === '' || value === null || value === undefined ? null : value;
      continue;
    }

    if (WORK_ORDER_NUMERIC_COLUMNS.has(column)) {
      const numeric = typeof value === 'number' ? value : Number(value);
      payload[column] = Number.isFinite(numeric) ? numeric : 0;
      continue;
    }

    if (value === undefined) continue;
    payload[column] = value;
  }

  return payload;
}

export async function sbGetWorkOrders(): Promise<WorkOrder[]> {
  const { data, error } = await supabase.from('work_orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapWorkOrder);
}

export async function sbCreateWorkOrder(orderData: Omit<WorkOrder, 'id' | 'order_no' | 'status' | 'created_at' | 'updated_at'>): Promise<WorkOrder> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  // Find customer code - use fallback if SELECT is blocked by RLS
  // Use a short 3-second timeout so this optional lookup doesn't block the INSERT
  let customerCode = 'X00';
  try {
    const customerQuery = supabase.from('customers').select('customer_no, name, short_name');
    const result = await Promise.race([
      customerQuery,
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'customer lookup timeout' } }), 3000)
      ),
    ]);
    const { data: customers, error: custErr } = result;
    if (!custErr && customers && customers.length > 0) {
      const matched = customers.find((c: Record<string, unknown>) => c.name === orderData.customer || c.short_name === orderData.customer);
      if (matched?.customer_no) {
        customerCode = (matched.customer_no as string).replace(/-/g, '');
      }
    }
  } catch (e) {
    console.warn('[sbCreateWorkOrder] Failed to query customers for code, using fallback:', e);
  }

  // Generate a unique order_no using timestamp + random suffix to avoid UNIQUE constraint violations.
  // Previously we counted existing orders with a SELECT, but if RLS blocks that SELECT,
  // it returns empty → seq always = 1 → duplicate order_no on second insert.
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const orderNo = `WO-${today}-${customerCode}-${timestamp}${randomSuffix}`;

  const insertPayload = {
    ...buildWorkOrderPayload(orderData as unknown as Record<string, unknown>),
    order_no: orderNo,
    status: 'Open',
  };

  const { data, error } = await supabase.from('work_orders').insert(insertPayload).select().single();
  if (error) {
    console.error('[Supabase] sbCreateWorkOrder error:', error.code, error.message, error.details, error.hint);
    throw new Error(`${error.message} [code: ${error.code}]`);
  }
  return mapWorkOrder(data);
}

export async function sbUpdateWorkOrder(id: string, updates: Partial<WorkOrder>): Promise<WorkOrder | null> {
  // Strip non-column keys (id / order_no / created_at / updated_at) and normalize
  // empty date strings to NULL, otherwise Postgres rejects the whole UPDATE.
  const updatePayload = buildWorkOrderPayload(updates as unknown as Record<string, unknown>);

  const { data, error } = await supabase.from('work_orders').update(updatePayload).eq('id', id).select().single();
  if (error) {
    console.error('[Supabase] sbUpdateWorkOrder error:', error.code, error.message, error.details, error.hint);
    throw new Error(`${error.message} [code: ${error.code}]`);
  }
  return data ? mapWorkOrder(data) : null;
}

export async function sbDeleteWorkOrder(id: string): Promise<void> {
  const { error } = await supabase.from('work_orders').delete().eq('id', id);
  if (error) throw error;
}

function mapWorkOrder(row: Record<string, unknown>): WorkOrder {
  return {
    id: row.id as string,
    order_no: (row.order_no as string) || '',
    customer: (row.customer as string) || '',
    product_name: (row.product_name as string) || '',
    material: (row.material as string) || '',
    quantity: (row.quantity as number) || 1,
    estimated_weight: (row.estimated_weight as number) || 0,
    mold_supply: (row.mold_supply as WorkOrder['mold_supply']) || '',
    mold_type: (row.mold_type as WorkOrder['mold_type']) || '',
    pattern_id: (row.pattern_id as string) || '',
    heat_treatment: (row.heat_treatment as WorkOrder['heat_treatment']) || '',
    due_date: (row.due_date as string) || '',
    remarks: (row.remarks as string) || '',
    mold_photos: (row.mold_photos as string[]) || [],
    drawing_photos: (row.drawing_photos as string[]) || [],
    status: (row.status as WorkOrder['status']) || 'Open',
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

// ============================================================
// Molding Batches
// ============================================================
export async function sbGetMoldingBatches(): Promise<MoldingBatch[]> {
  const { data, error } = await supabase.from('molding_batches').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapMoldingBatch);
}

export async function sbCreateMoldingBatch(batchData: { work_order_id: string; order_no: string; customer: string; product_name: string; material: string; quantity_planned: number; estimated_pouring_weight: number; remarks: string; molding_photos: string[]; closing_photos?: string[] }): Promise<MoldingBatch> {
  const batchNo = `MB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-5)}`;
  const status = (batchData.closing_photos && batchData.closing_photos.length > 0) ? 'Completed' :
    (batchData.molding_photos && batchData.molding_photos.length > 0) ? 'In Progress' : 'Pending';

  const { data, error } = await supabase.from('molding_batches').insert({
    batch_no: batchNo,
    work_order_id: batchData.work_order_id,
    order_no: batchData.order_no,
    customer: batchData.customer,
    product_name: batchData.product_name,
    material: batchData.material,
    quantity_planned: batchData.quantity_planned,
    quantity_completed: 0,
    estimated_pouring_weight: batchData.estimated_pouring_weight,
    remarks: batchData.remarks,
    molding_photos: batchData.molding_photos,
    closing_photos: batchData.closing_photos || [],
    status,
  }).select().single();
  if (error) throw error;
  return mapMoldingBatch(data);
}

export async function sbUpdateMoldingBatch(id: string, updates: Partial<MoldingBatch>): Promise<MoldingBatch | null> {
  const { data, error } = await supabase.from('molding_batches').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data ? mapMoldingBatch(data) : null;
}

export async function sbDeleteMoldingBatch(id: string): Promise<void> {
  const { error } = await supabase.from('molding_batches').delete().eq('id', id);
  if (error) throw error;
}

function mapMoldingBatch(row: Record<string, unknown>): MoldingBatch {
  return {
    id: row.id as string,
    batch_no: (row.batch_no as string) || '',
    work_order_id: (row.work_order_id as string) || '',
    order_no: (row.order_no as string) || '',
    customer: (row.customer as string) || '',
    product_name: (row.product_name as string) || '',
    material: (row.material as string) || '',
    quantity_planned: (row.quantity_planned as number) || 1,
    quantity_completed: (row.quantity_completed as number) || 0,
    estimated_pouring_weight: (row.estimated_pouring_weight as number) || 0,
    remarks: (row.remarks as string) || '',
    molding_photos: (row.molding_photos as string[]) || [],
    closing_photos: (row.closing_photos as string[]) || [],
    status: (row.status as MoldingBatch['status']) || 'Pending',
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

// ============================================================
// Melting Records (Legacy simple)
// ============================================================
export async function sbGetMeltingRecords(): Promise<MeltingRecord[]> {
  const { data, error } = await supabase.from('melting_records').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapMeltingRecord);
}

export async function sbCreateMeltingRecord(recordData: { batch_id: string; batch_no: string; furnace_no: string; melting_weight: number; pouring_weights: number[]; residual_weight?: number }): Promise<MeltingRecord> {
  const totalPouring = recordData.pouring_weights.reduce((sum, w) => sum + w, 0);
  const yieldRate = totalPouring > 0 && recordData.melting_weight > 0 ? Math.round((recordData.melting_weight / totalPouring) * 100 * 100) / 100 : 0;
  const heatNo = `HT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-5)}`;

  const { data, error } = await supabase.from('melting_records').insert({
    heat_no: heatNo,
    batch_id: recordData.batch_id,
    batch_no: recordData.batch_no,
    furnace_no: recordData.furnace_no,
    melting_weight: recordData.melting_weight,
    pouring_weight: totalPouring,
    pouring_weights: recordData.pouring_weights,
    residual_weight: recordData.residual_weight ?? 0,
    yield_rate: yieldRate,
    status: 'Completed',
  }).select().single();
  if (error) throw error;
  return mapMeltingRecord(data);
}

export async function sbUpdateMeltingRecord(id: string, updates: { furnace_no?: string; pouring_weights?: number[]; melting_weight?: number; residual_weight?: number }): Promise<MeltingRecord | null> {
  const updatePayload: Record<string, unknown> = {};
  if (updates.furnace_no !== undefined) updatePayload.furnace_no = updates.furnace_no;
  if (updates.melting_weight !== undefined) updatePayload.melting_weight = updates.melting_weight;
  if (updates.residual_weight !== undefined) updatePayload.residual_weight = updates.residual_weight;
  if (updates.pouring_weights !== undefined) {
    updatePayload.pouring_weights = updates.pouring_weights;
    updatePayload.pouring_weight = updates.pouring_weights.reduce((sum, w) => sum + w, 0);
  }
  const { data, error } = await supabase.from('melting_records').update(updatePayload).eq('id', id).select().single();
  if (error) throw error;
  return data ? mapMeltingRecord(data) : null;
}

export async function sbDeleteMeltingRecord(id: string): Promise<boolean> {
  const { error } = await supabase.from('melting_records').delete().eq('id', id);
  return !error;
}

function mapMeltingRecord(row: Record<string, unknown>): MeltingRecord {
  return {
    id: row.id as string,
    heat_no: (row.heat_no as string) || '',
    batch_id: (row.batch_id as string) || '',
    batch_no: (row.batch_no as string) || '',
    furnace_no: (row.furnace_no as string) || '',
    melting_weight: (row.melting_weight as number) || 0,
    pouring_weight: (row.pouring_weight as number) || 0,
    pouring_weights: (row.pouring_weights as number[]) || [],
    residual_weight: Number(row.residual_weight) || 0,
    yield_rate: (row.yield_rate as number) || 0,
    status: (row.status as MeltingRecord['status']) || 'Pending',
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

// ============================================================
// Melt Records (New full version)
// ============================================================
export async function sbGetMeltRecords(): Promise<MeltRecord[]> {
  const { data, error } = await supabase.from('melt_records').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapMeltRecord);
}

/**
 * 產生熔解編號：ML-yyyymmdd-爐號
 * @param meltDate 熔解日期（YYYY-MM-DD）
 * @param furnaceNo 爐號（例：1-1）
 */
export async function generateMeltNo(meltDate: string, furnaceNo: string): Promise<string> {
  const datePart = (meltDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const furnacePart = (furnaceNo || '').trim() || 'NA';
  const base = `ML-${datePart}-${furnacePart}`;

  try {
    const { data } = await supabase.from('melt_records').select('melt_no').like('melt_no', `${base}%`);
    const existing = (data || []).map(r => (r.melt_no as string) || '');
    if (existing.length === 0 || !existing.includes(base)) return base;
    // 同日同爐重複時追加 -2、-3 ... 流水序號
    let seq = 2;
    while (existing.includes(`${base}-${seq}`)) seq += 1;
    return `${base}-${seq}`;
  } catch {
    return base;
  }
}

export async function sbCreateMeltRecord(recordData: Omit<MeltRecord, 'id' | 'melt_no' | 'melt_minutes' | 'total_charge_weight' | 'specific_energy' | 'created_at' | 'updated_at'> & { melt_no?: string }): Promise<MeltRecord> {
  let meltMinutes = 0;
  if (recordData.power_start_time && recordData.tap_time) {
    const [sh, sm] = recordData.power_start_time.split(':').map(Number);
    const [eh, em] = recordData.tap_time.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    meltMinutes = diff;
  }
  // 熔解編號規則：ML-yyyymmdd-爐號（依熔解日期與爐號組成）
  // 同日同爐若已有紀錄，於尾端追加流水序號避免編號重複
  // 使用者若自行輸入編號則直接沿用，未輸入才依規則自動產生
  const customMeltNo = (recordData.melt_no || '').trim();
  const meltNo = customMeltNo || await generateMeltNo(recordData.melt_date, recordData.furnace_no);

  const { data, error } = await supabase.from('melt_records').insert({
    ...recordData,
    melt_no: meltNo,
    melt_minutes: meltMinutes,
    total_charge_weight: 0,
    specific_energy: 0,
  }).select().single();
  if (error) throw error;
  return mapMeltRecord(data);
}

export async function sbUpdateMeltRecord(id: string, updates: Partial<MeltRecord>): Promise<MeltRecord | null> {
  // Recalculate melt_minutes if times changed
  const payload: Record<string, unknown> = { ...updates };
  // 總投料（total_charge_weight）與能耗（specific_energy）為衍生欄位，
  // 一律由 sbRecalcMeltRecord 依投料明細重算後寫入；通用更新若夾帶這兩個欄位，
  // 舊值會覆蓋最新重算結果，造成清單卡片總投料與投料明細不同步，因此一律剝除。
  delete payload.total_charge_weight;
  delete payload.specific_energy;
  if (updates.power_start_time && updates.tap_time) {
    const [sh, sm] = updates.power_start_time.split(':').map(Number);
    const [eh, em] = updates.tap_time.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    payload.melt_minutes = diff;
  }
  const { data, error } = await supabase.from('melt_records').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data ? mapMeltRecord(data) : null;
}

export async function sbDeleteMeltRecord(id: string): Promise<boolean> {
  const { error } = await supabase.from('melt_records').delete().eq('id', id);
  return !error;
}

export async function sbRecalcMeltRecord(meltId: string): Promise<MeltRecord | null> {
  const { data: materials } = await supabase.from('melt_materials').select('*').eq('melt_id', meltId);
  const totalChargeWeight = (materials || []).reduce((sum: number, m: Record<string, unknown>) => sum + ((m.subtotal as number) || 0), 0);
  const { data: record } = await supabase.from('melt_records').select('power_kwh').eq('id', meltId).single();
  const powerKwh = (record?.power_kwh as number) || 0;
  const specificEnergy = totalChargeWeight > 0 ? Math.round((powerKwh / totalChargeWeight) * 1000) / 1000 : 0;

  const { data, error } = await supabase.from('melt_records').update({
    total_charge_weight: totalChargeWeight,
    specific_energy: specificEnergy,
  }).eq('id', meltId).select().single();
  if (error) throw error;
  return data ? mapMeltRecord(data) : null;
}

function mapMeltRecord(row: Record<string, unknown>): MeltRecord {
  return {
    id: row.id as string,
    melt_no: (row.melt_no as string) || '',
    melt_date: (row.melt_date as string) || '',
    material_grade: (row.material_grade as string) || '',
    furnace_no: (row.furnace_no as string) || '',
    power_kwh: (row.power_kwh as number) || 0,
    power_start_time: (row.power_start_time as string) || '',
    tap_time: (row.tap_time as string) || '',
    melt_minutes: (row.melt_minutes as number) || 0,
    tap_temp: (row.tap_temp as number) || 0,
    total_charge_weight: (row.total_charge_weight as number) || 0,
    specific_energy: (row.specific_energy as number) || 0,
    residual_weight: (row.residual_weight as number) || 0,
    created_by: (row.created_by as string) || '',
    remark: (row.remark as string) || '',
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

// ============================================================
// Melt Materials
// ============================================================
export async function sbGetMeltMaterials(meltId?: string): Promise<MeltMaterial[]> {
  let query = supabase.from('melt_materials').select('*');
  if (meltId) query = query.eq('melt_id', meltId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapMeltMaterial);
}

export async function sbCreateMeltMaterial(materialData: Omit<MeltMaterial, 'id' | 'subtotal'>): Promise<MeltMaterial> {
  const subtotal = materialData.charge_weight + materialData.secondary_weight;
  const { data, error } = await supabase.from('melt_materials').insert({
    ...materialData,
    subtotal,
  }).select().single();
  if (error) throw error;
  await sbRecalcMeltRecord(materialData.melt_id);
  return mapMeltMaterial(data);
}

export async function sbUpdateMeltMaterial(id: string, updates: Partial<Omit<MeltMaterial, 'id' | 'subtotal'>>): Promise<MeltMaterial | null> {
  // Get current to calculate subtotal
  const { data: current } = await supabase.from('melt_materials').select('*').eq('id', id).single();
  if (!current) return null;
  const chargeWeight = updates.charge_weight ?? (current.charge_weight as number);
  const secondaryWeight = updates.secondary_weight ?? (current.secondary_weight as number);
  const { data, error } = await supabase.from('melt_materials').update({
    ...updates,
    subtotal: chargeWeight + secondaryWeight,
  }).eq('id', id).select().single();
  if (error) throw error;
  if (data) await sbRecalcMeltRecord(data.melt_id as string);
  return data ? mapMeltMaterial(data) : null;
}

export async function sbDeleteMeltMaterial(id: string): Promise<boolean> {
  // 先取得 melt_id，刪除後才能重算父熔解紀錄的總投料重與能耗
  const { data: material } = await supabase.from('melt_materials').select('melt_id').eq('id', id).single();
  // 使用 select('id') 取得實際刪除的列，以便確認雲端真的刪掉了（而非被 RLS 靜默忽略）
  const { data: deleted, error } = await supabase
    .from('melt_materials')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) {
    // 不可吞掉錯誤：必須拋出讓資料層改走 fallback + pending queue，
    // 否則雲端仍保有該列，下次讀取時會把已刪除的投料「復活」回畫面。
    console.error('[supabaseStore] sbDeleteMeltMaterial failed:', error.code, error.message, error.details, error.hint);
    throw error;
  }
  // RLS 若未開放 DELETE，PostgREST 會「靜默刪除 0 列且不報錯」，
  // 因此必須以實際回傳列數判斷是否真的刪除成功，否則雲端資料會一直復活。
  // 但只有「雲端確實存在該列、卻沒被刪掉」才算失敗：
  // 若該列原本只存在本機（離線新增尚未上傳），刪除 0 列屬正常結果，
  // 否則會讓這類紀錄永遠無法刪除、連帶卡住整筆編輯儲存。
  if ((!Array.isArray(deleted) || deleted.length === 0) && material) {
    throw new Error(
      `${CLOUD_DELETE_NOT_APPLIED}: sbDeleteMeltMaterial 刪除未生效（可能被 row-level security policy 阻擋），id=${id}`
    );
  }
  if (material) await sbRecalcMeltRecord(material.melt_id as string);
  return true;
}

function mapMeltMaterial(row: Record<string, unknown>): MeltMaterial {
  return {
    id: row.id as string,
    melt_id: (row.melt_id as string) || '',
    raw_material: (row.raw_material as string) || '',
    charge_weight: (row.charge_weight as number) || 0,
    secondary_weight: (row.secondary_weight as number) || 0,
    subtotal: (row.subtotal as number) || 0,
  };
}

// ============================================================
// Melt Chemistry
// ============================================================
export async function sbGetMeltChemistry(meltId?: string): Promise<MeltChemistry[]> {
  let query = supabase.from('melt_chemistries').select('*');
  if (meltId) query = query.eq('melt_id', meltId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapMeltChemistry);
}

export async function sbCreateMeltChemistry(chemData: Omit<MeltChemistry, 'id'>): Promise<MeltChemistry> {
  const otherElements = chemData.C + chemData.Si + chemData.Mn + chemData.P + chemData.S + chemData.Ni + chemData.Cr + chemData.Mo + chemData.Cu;
  const Fe = Math.round((100 - otherElements) * 1000) / 1000;
  const { data, error } = await supabase.from('melt_chemistries').insert({
    melt_id: chemData.melt_id,
    sample_stage: chemData.sample_stage,
    c_val: chemData.C,
    si_val: chemData.Si,
    mn_val: chemData.Mn,
    p_val: chemData.P,
    s_val: chemData.S,
    ni_val: chemData.Ni,
    cr_val: chemData.Cr,
    mo_val: chemData.Mo,
    cu_val: chemData.Cu,
    fe_val: Fe,
  }).select().single();
  if (error) throw error;
  return mapMeltChemistry(data);
}

export async function sbUpdateMeltChemistry(id: string, updates: Partial<Omit<MeltChemistry, 'id'>>): Promise<MeltChemistry | null> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.sample_stage !== undefined) dbUpdates.sample_stage = updates.sample_stage;
  if (updates.melt_id !== undefined) dbUpdates.melt_id = updates.melt_id;
  if (updates.C !== undefined) dbUpdates.c_val = updates.C;
  if (updates.Si !== undefined) dbUpdates.si_val = updates.Si;
  if (updates.Mn !== undefined) dbUpdates.mn_val = updates.Mn;
  if (updates.P !== undefined) dbUpdates.p_val = updates.P;
  if (updates.S !== undefined) dbUpdates.s_val = updates.S;
  if (updates.Ni !== undefined) dbUpdates.ni_val = updates.Ni;
  if (updates.Cr !== undefined) dbUpdates.cr_val = updates.Cr;
  if (updates.Mo !== undefined) dbUpdates.mo_val = updates.Mo;
  if (updates.Cu !== undefined) dbUpdates.cu_val = updates.Cu;

  const { data, error } = await supabase.from('melt_chemistries').update(dbUpdates).eq('id', id).select().single();
  if (error) throw error;
  return data ? mapMeltChemistry(data) : null;
}

export async function sbDeleteMeltChemistry(id: string): Promise<boolean> {
  // 先確認雲端是否真的有這筆成份列，才能區分「刪除未生效」與「本來就只存在本機」
  const { data: existing } = await supabase.from('melt_chemistries').select('id').eq('id', id).maybeSingle();
  const { data: deleted, error } = await supabase
    .from('melt_chemistries')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) {
    // 同 sbDeleteMeltMaterial：刪除失敗必須拋出，交由資料層 fallback + pending queue 處理
    console.error('[supabaseStore] sbDeleteMeltChemistry failed:', error.code, error.message, error.details, error.hint);
    throw error;
  }
  // 同 sbDeleteMeltMaterial：雲端存在該列卻刪除 0 列代表刪除未生效，必須視為失敗；
  // 若該列只存在本機，則刪除 0 列是預期結果。
  if ((!Array.isArray(deleted) || deleted.length === 0) && existing) {
    throw new Error(
      `${CLOUD_DELETE_NOT_APPLIED}: sbDeleteMeltChemistry 刪除未生效（可能被 row-level security policy 阻擋），id=${id}`
    );
  }
  return true;
}

function mapMeltChemistry(row: Record<string, unknown>): MeltChemistry {
  return {
    id: row.id as string,
    melt_id: (row.melt_id as string) || '',
    sample_stage: (row.sample_stage as MeltChemistry['sample_stage']) || 'TARGET',
    C: (row.c_val as number) || 0,
    Si: (row.si_val as number) || 0,
    Mn: (row.mn_val as number) || 0,
    P: (row.p_val as number) || 0,
    S: (row.s_val as number) || 0,
    Ni: (row.ni_val as number) || 0,
    Cr: (row.cr_val as number) || 0,
    Mo: (row.mo_val as number) || 0,
    Cu: (row.cu_val as number) || 0,
    Fe: (row.fe_val as number) || 0,
  };
}

// ============================================================
// Melt Pourings
// ============================================================
export interface MeltPouring {
  id: string;
  melt_id: string;
  batch_id: string;
  batch_no: string;
  customer: string;
  product_name: string;
  material: string;
  quantity: number;
  estimated_weight: number;
  estimated_pouring_weight: number;
  pouring_weights: number[];
  total_pouring_weight: number;
  avg_pouring_weight: number;
  created_at: string;
}

export async function sbGetMeltPourings(meltId?: string): Promise<MeltPouring[]> {
  let query = supabase.from('melt_pourings').select('*');
  if (meltId) query = query.eq('melt_id', meltId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    melt_id: (row.melt_id as string) || '',
    batch_id: (row.batch_id as string) || '',
    batch_no: (row.batch_no as string) || '',
    customer: (row.customer as string) || '',
    product_name: (row.product_name as string) || '',
    material: (row.material as string) || '',
    quantity: (row.quantity as number) || 1,
    estimated_weight: (row.estimated_weight as number) || 0,
    estimated_pouring_weight: (row.estimated_pouring_weight as number) || 0,
    pouring_weights: (row.pouring_weights as number[]) || [],
    total_pouring_weight: (row.total_pouring_weight as number) || 0,
    avg_pouring_weight: (row.avg_pouring_weight as number) || 0,
    created_at: (row.created_at as string) || '',
  }));
}

export async function sbCreateMeltPouring(data: Omit<MeltPouring, 'id' | 'created_at'>): Promise<MeltPouring> {
  const { data: result, error } = await supabase.from('melt_pourings').insert(data).select().single();
  if (error) throw error;
  return {
    id: result.id as string,
    melt_id: (result.melt_id as string) || '',
    batch_id: (result.batch_id as string) || '',
    batch_no: (result.batch_no as string) || '',
    customer: (result.customer as string) || '',
    product_name: (result.product_name as string) || '',
    material: (result.material as string) || '',
    quantity: (result.quantity as number) || 1,
    estimated_weight: (result.estimated_weight as number) || 0,
    estimated_pouring_weight: (result.estimated_pouring_weight as number) || 0,
    pouring_weights: (result.pouring_weights as number[]) || [],
    total_pouring_weight: (result.total_pouring_weight as number) || 0,
    avg_pouring_weight: (result.avg_pouring_weight as number) || 0,
    created_at: (result.created_at as string) || '',
  };
}

export async function sbUpdateMeltPouring(id: string, updates: Partial<MeltPouring>): Promise<MeltPouring | null> {
  const { data, error } = await supabase.from('melt_pourings').update(updates).eq('id', id).select().single();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    melt_id: (data.melt_id as string) || '',
    batch_id: (data.batch_id as string) || '',
    batch_no: (data.batch_no as string) || '',
    customer: (data.customer as string) || '',
    product_name: (data.product_name as string) || '',
    material: (data.material as string) || '',
    quantity: (data.quantity as number) || 1,
    estimated_weight: (data.estimated_weight as number) || 0,
    estimated_pouring_weight: (data.estimated_pouring_weight as number) || 0,
    pouring_weights: (data.pouring_weights as number[]) || [],
    total_pouring_weight: (data.total_pouring_weight as number) || 0,
    avg_pouring_weight: (data.avg_pouring_weight as number) || 0,
    created_at: (data.created_at as string) || '',
  };
}

export async function sbDeleteMeltPouring(id: string): Promise<boolean> {
  const { error } = await supabase.from('melt_pourings').delete().eq('id', id);
  return !error;
}

// ============================================================
// Melt Preset Recipes
// ============================================================
export interface MeltPresetRecipe {
  id: string;
  name: string;
  materials: Array<{ raw_material: string; charge_weight: number; secondary_weight: number }>;
  created_at: string;
  updated_at: string;
}

export async function sbGetMeltPresetRecipes(): Promise<MeltPresetRecipe[]> {
  const { data, error } = await supabase.from('melt_preset_recipes').select('*');
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: (row.name as string) || '',
    materials: (row.materials as MeltPresetRecipe['materials']) || [],
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  }));
}

export async function sbCreateMeltPresetRecipe(data: { name: string; materials: MeltPresetRecipe['materials'] }): Promise<MeltPresetRecipe> {
  const { data: result, error } = await supabase.from('melt_preset_recipes').insert(data).select().single();
  if (error) throw error;
  return {
    id: result.id as string,
    name: (result.name as string) || '',
    materials: (result.materials as MeltPresetRecipe['materials']) || [],
    created_at: (result.created_at as string) || '',
    updated_at: (result.updated_at as string) || '',
  };
}

export async function sbUpdateMeltPresetRecipe(id: string, updates: Partial<{ name: string; materials: MeltPresetRecipe['materials'] }>): Promise<MeltPresetRecipe | null> {
  const { data, error } = await supabase.from('melt_preset_recipes').update(updates).eq('id', id).select().single();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    name: (data.name as string) || '',
    materials: (data.materials as MeltPresetRecipe['materials']) || [],
    created_at: (data.created_at as string) || '',
    updated_at: (data.updated_at as string) || '',
  };
}

export async function sbDeleteMeltPresetRecipe(id: string): Promise<boolean> {
  const { error } = await supabase.from('melt_preset_recipes').delete().eq('id', id);
  return !error;
}

// ============================================================
// Melt Material Specs (材質規範)
// ============================================================
export interface MeltMaterialSpec {
  id: string;
  name: string;
  ranges: Record<string, number>;
  remark: string;
  created_at: string;
  updated_at: string;
}

function mapMeltMaterialSpec(row: Record<string, unknown>): MeltMaterialSpec {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    ranges: (row.ranges as Record<string, number>) || {},
    remark: (row.remark as string) || '',
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

export async function sbGetMeltMaterialSpecs(): Promise<MeltMaterialSpec[]> {
  const { data, error } = await supabase
    .from('melt_material_specs')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapMeltMaterialSpec);
}

export async function sbCreateMeltMaterialSpec(
  data: { name: string; ranges: Record<string, number>; remark: string }
): Promise<MeltMaterialSpec> {
  const { data: result, error } = await supabase.from('melt_material_specs').insert(data).select().single();
  if (error) throw error;
  return mapMeltMaterialSpec(result);
}

export async function sbUpdateMeltMaterialSpec(
  id: string,
  updates: Partial<{ name: string; ranges: Record<string, number>; remark: string }>
): Promise<MeltMaterialSpec | null> {
  const { data, error } = await supabase.from('melt_material_specs').update(updates).eq('id', id).select().single();
  if (error) throw error;
  if (!data) return null;
  return mapMeltMaterialSpec(data);
}

export async function sbDeleteMeltMaterialSpec(id: string): Promise<boolean> {
  const { error } = await supabase.from('melt_material_specs').delete().eq('id', id);
  return !error;
}

// ============================================================
// Raw Material Receipts (原料入庫)
// ============================================================
export interface RawMaterialReceipt {
  id: string;
  receipt_no: string;
  receipt_date: string;
  raw_material: string;
  weight: number;
  unit_price: number;
  supplier: string;
  lot_no: string;
  spec: Record<string, number>;
  remark: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type RawMaterialReceiptInput = Omit<RawMaterialReceipt, 'id' | 'receipt_no' | 'created_at' | 'updated_at'>;

function mapRawMaterialReceipt(row: Record<string, unknown>): RawMaterialReceipt {
  return {
    id: row.id as string,
    receipt_no: (row.receipt_no as string) || '',
    receipt_date: (row.receipt_date as string) || '',
    raw_material: (row.raw_material as string) || '',
    weight: Number(row.weight) || 0,
    unit_price: Number(row.unit_price) || 0,
    supplier: (row.supplier as string) || '',
    lot_no: (row.lot_no as string) || '',
    spec: (row.spec as Record<string, number>) || {},
    remark: (row.remark as string) || '',
    created_by: (row.created_by as string) || '',
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

/** 產生原料入庫單號：RM-yyyymmdd-流水序號 */
function buildReceiptNo(dateStr: string, existing: string[]): string {
  const compact = (dateStr || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const prefix = `RM-${compact}-`;
  const used = existing
    .filter(no => no.startsWith(prefix))
    .map(no => parseInt(no.slice(prefix.length), 10))
    .filter(n => !Number.isNaN(n));
  const next = used.length > 0 ? Math.max(...used) + 1 : 1;
  return `${prefix}${next.toString().padStart(3, '0')}`;
}

/** 過濾出資料表實際存在的欄位，避免多餘鍵導致整筆寫入失敗 */
function buildReceiptPayload(data: Partial<RawMaterialReceiptInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (data.receipt_date !== undefined) payload.receipt_date = data.receipt_date || null;
  if (data.raw_material !== undefined) payload.raw_material = data.raw_material;
  if (data.weight !== undefined) payload.weight = Number(data.weight) || 0;
  if (data.unit_price !== undefined) payload.unit_price = Number(data.unit_price) || 0;
  if (data.supplier !== undefined) payload.supplier = data.supplier || '';
  if (data.lot_no !== undefined) payload.lot_no = data.lot_no || '';
  if (data.spec !== undefined) payload.spec = data.spec || {};
  if (data.remark !== undefined) payload.remark = data.remark || '';
  if (data.created_by !== undefined) payload.created_by = data.created_by || '';
  return payload;
}

export async function sbGetRawMaterialReceipts(): Promise<RawMaterialReceipt[]> {
  const { data, error } = await supabase
    .from('raw_material_receipts')
    .select('*')
    .order('receipt_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapRawMaterialReceipt);
}

export async function sbCreateRawMaterialReceipt(data: RawMaterialReceiptInput): Promise<RawMaterialReceipt> {
  const { data: sameDay } = await supabase
    .from('raw_material_receipts')
    .select('receipt_no')
    .eq('receipt_date', data.receipt_date || new Date().toISOString().slice(0, 10));
  const existingNos = (sameDay || []).map(r => (r as Record<string, unknown>).receipt_no as string);
  const payload = {
    ...buildReceiptPayload(data),
    id: crypto.randomUUID(),
    receipt_no: buildReceiptNo(data.receipt_date, existingNos),
  };
  const { data: result, error } = await supabase
    .from('raw_material_receipts')
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error('[sbCreateRawMaterialReceipt] insert failed:', error.code, error.message, error.details, error.hint);
    throw error;
  }
  return mapRawMaterialReceipt(result);
}

export async function sbUpdateRawMaterialReceipt(
  id: string,
  updates: Partial<RawMaterialReceiptInput>
): Promise<RawMaterialReceipt | null> {
  const payload = { ...buildReceiptPayload(updates), updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('raw_material_receipts')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[sbUpdateRawMaterialReceipt] update failed:', error.code, error.message, error.details, error.hint);
    throw error;
  }
  if (!data) return null;
  return mapRawMaterialReceipt(data);
}

export async function sbDeleteRawMaterialReceipt(id: string): Promise<boolean> {
  const { error } = await supabase.from('raw_material_receipts').delete().eq('id', id);
  return !error;
}

// ============================================================
// Quality Inspections
// ============================================================
export async function sbGetQualityInspections(): Promise<QualityInspection[]> {
  const { data, error } = await supabase.from('quality_inspections').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapQualityInspection);
}

export async function sbCreateQualityInspection(inspData: Omit<QualityInspection, 'id' | 'inspection_no' | 'created_at'>): Promise<QualityInspection> {
  const prefix = inspData.type;
  const inspNo = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-5)}`;
  const { data, error } = await supabase.from('quality_inspections').insert({
    ...inspData,
    inspection_no: inspNo,
  }).select().single();
  if (error) throw error;
  return mapQualityInspection(data);
}

export async function sbUpdateQualityInspection(id: string, updates: Partial<QualityInspection>): Promise<void> {
  const { error } = await supabase.from('quality_inspections').update(updates).eq('id', id);
  if (error) throw error;
}

export async function sbDeleteQualityInspection(id: string): Promise<void> {
  const { error } = await supabase.from('quality_inspections').delete().eq('id', id);
  if (error) throw error;
}

function mapQualityInspection(row: Record<string, unknown>): QualityInspection {
  return {
    id: row.id as string,
    inspection_no: (row.inspection_no as string) || '',
    type: (row.type as QualityInspection['type']) || 'FAI',
    batch_id: (row.batch_id as string) || '',
    batch_no: (row.batch_no as string) || '',
    work_order_id: (row.work_order_id as string) || undefined,
    order_no: (row.order_no as string) || undefined,
    customer: (row.customer as string) || undefined,
    product_name: (row.product_name as string) || undefined,
    material: (row.material as string) || undefined,
    mold_id: (row.mold_id as string) || undefined,
    heat_no: (row.heat_no as string) || '',
    melt_record_id: (row.melt_record_id as string) || undefined,
    inspection_date: (row.inspection_date as string) || '',
    inspector: (row.inspector as string) || '',
    result: (row.result as QualityInspection['result']) || 'PASS',
    inspected_quantity: (row.inspected_quantity as number) || 0,
    pass_quantity: (row.pass_quantity as number) || 0,
    defect_count: (row.defect_count as number) || 0,
    yield_rate: (row.yield_rate as number) || 0,
    sampling_method: (row.sampling_method as string) || '',
    item_results: (row.item_results as QualityInspection['item_results']) || [],
    defects: (row.defects as QualityInspection['defects']) || [],
    attachments: (row.attachments as string[]) || [],
    remarks: (row.remarks as string) || '',
    created_at: (row.created_at as string) || '',
  };
}

// ============================================================
// Defect Records
// ============================================================
export async function sbGetDefectRecords(): Promise<DefectRecord[]> {
  const { data, error } = await supabase.from('defect_records').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapDefectRecord);
}

export async function sbCreateDefectRecord(defectData: Omit<DefectRecord, 'id' | 'created_at'>): Promise<DefectRecord> {
  const { data, error } = await supabase.from('defect_records').insert(defectData).select().single();
  if (error) throw error;
  return mapDefectRecord(data);
}

function mapDefectRecord(row: Record<string, unknown>): DefectRecord {
  return {
    id: row.id as string,
    inspection_id: (row.inspection_id as string) || undefined,
    batch_id: (row.batch_id as string) || undefined,
    batch_no: (row.batch_no as string) || undefined,
    defect_code: (row.defect_code as string) || '',
    defect_label: (row.defect_label as string) || '',
    quantity: (row.quantity as number) || 1,
    cause: (row.cause as string) || undefined,
    responsible_station: (row.responsible_station as string) || undefined,
    disposition: (row.disposition as DefectRecord['disposition']) || 'REWORK',
    remarks: (row.remarks as string) || undefined,
    created_at: (row.created_at as string) || '',
  };
}

// ============================================================
// CAPA Records
// ============================================================
export async function sbGetCAPARecords(): Promise<CAPARecord[]> {
  const { data, error } = await supabase.from('capa_records').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapCAPARecord);
}

export async function sbCreateCAPARecord(capaData: Omit<CAPARecord, 'id' | 'capa_no' | 'created_at'>): Promise<CAPARecord> {
  const capaNo = `CAPA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-5)}`;
  const { data, error } = await supabase.from('capa_records').insert({
    ...capaData,
    capa_no: capaNo,
  }).select().single();
  if (error) throw error;
  return mapCAPARecord(data);
}

export async function sbUpdateCAPARecord(id: string, updates: Partial<CAPARecord>): Promise<void> {
  const { error } = await supabase.from('capa_records').update(updates).eq('id', id);
  if (error) throw error;
}

function mapCAPARecord(row: Record<string, unknown>): CAPARecord {
  return {
    id: row.id as string,
    capa_no: (row.capa_no as string) || '',
    inspection_id: (row.inspection_id as string) || undefined,
    defect_id: (row.defect_id as string) || undefined,
    status: (row.status as CAPARecord['status']) || 'OPEN',
    problem_description: (row.problem_description as string) || '',
    five_why: (row.five_why as string) || undefined,
    root_cause: (row.root_cause as string) || undefined,
    corrective_action: (row.corrective_action as string) || undefined,
    preventive_action: (row.preventive_action as string) || undefined,
    responsible_person: (row.responsible_person as string) || '',
    due_date: (row.due_date as string) || '',
    verified_by: (row.verified_by as string) || undefined,
    verified_date: (row.verified_date as string) || undefined,
    attachments: (row.attachments as string[]) || undefined,
    created_at: (row.created_at as string) || '',
  };
}

// ============================================================
// Warehouse Entries
// ============================================================
export async function sbGetWarehouseEntries(): Promise<WarehouseEntry[]> {
  const { data, error } = await supabase.from('warehouse_entries').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    batch_id: (row.batch_id as string) || '',
    batch_no: (row.batch_no as string) || '',
    location: (row.location as string) || '',
    quantity: (row.quantity as number) || 0,
    created_at: (row.created_at as string) || '',
  }));
}

export async function sbCreateWarehouseEntry(entryData: { batch_id: string; batch_no: string; location: string; quantity: number }): Promise<WarehouseEntry> {
  const { data, error } = await supabase.from('warehouse_entries').insert(entryData).select().single();
  if (error) throw error;
  return {
    id: data.id as string,
    batch_id: (data.batch_id as string) || '',
    batch_no: (data.batch_no as string) || '',
    location: (data.location as string) || '',
    quantity: (data.quantity as number) || 0,
    created_at: (data.created_at as string) || '',
  };
}

export async function sbUpdateWarehouseEntry(id: string, updates: Partial<WarehouseEntry>): Promise<WarehouseEntry | null> {
  const payload: Record<string, unknown> = {};
  if (updates.batch_id !== undefined) payload.batch_id = updates.batch_id;
  if (updates.batch_no !== undefined) payload.batch_no = updates.batch_no;
  if (updates.location !== undefined) payload.location = updates.location;
  if (updates.quantity !== undefined) payload.quantity = updates.quantity;
  const { data, error } = await supabase.from('warehouse_entries').update(payload).eq('id', id).select().single();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    batch_id: (data.batch_id as string) || '',
    batch_no: (data.batch_no as string) || '',
    location: (data.location as string) || '',
    quantity: (data.quantity as number) || 0,
    created_at: (data.created_at as string) || '',
  };
}

export async function sbDeleteWarehouseEntry(id: string): Promise<void> {
  const { error } = await supabase.from('warehouse_entries').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Shipment Orders
// ============================================================
export async function sbGetShipmentOrders(): Promise<ShipmentOrder[]> {
  const { data, error } = await supabase.from('shipment_orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    shipment_no: (row.shipment_no as string) || '',
    work_order_id: (row.work_order_id as string) || '',
    order_no: (row.order_no as string) || '',
    customer: (row.customer as string) || '',
    quantity: (row.quantity as number) || 0,
    ship_date: (row.ship_date as string) || '',
    status: (row.status as ShipmentOrder['status']) || 'Pending',
    created_at: (row.created_at as string) || '',
  }));
}

export async function sbCreateShipmentOrder(orderData: { work_order_id: string; order_no: string; customer: string; quantity: number; ship_date: string }): Promise<ShipmentOrder> {
  const shipmentNo = `SH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-5)}`;
  const { data, error } = await supabase.from('shipment_orders').insert({
    ...orderData,
    shipment_no: shipmentNo,
    status: 'Pending',
  }).select().single();
  if (error) throw error;
  return {
    id: data.id as string,
    shipment_no: (data.shipment_no as string) || '',
    work_order_id: (data.work_order_id as string) || '',
    order_no: (data.order_no as string) || '',
    customer: (data.customer as string) || '',
    quantity: (data.quantity as number) || 0,
    ship_date: (data.ship_date as string) || '',
    status: (data.status as ShipmentOrder['status']) || 'Pending',
    created_at: (data.created_at as string) || '',
  };
}

export async function sbUpdateShipmentOrder(id: string, updates: Partial<ShipmentOrder>): Promise<ShipmentOrder | null> {
  const { data, error } = await supabase.from('shipment_orders').update(updates).eq('id', id).select().single();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    shipment_no: (data.shipment_no as string) || '',
    work_order_id: (data.work_order_id as string) || '',
    order_no: (data.order_no as string) || '',
    customer: (data.customer as string) || '',
    quantity: (data.quantity as number) || 0,
    ship_date: (data.ship_date as string) || '',
    status: (data.status as ShipmentOrder['status']) || 'Pending',
    created_at: (data.created_at as string) || '',
  };
}

export async function sbDeleteShipmentOrder(id: string): Promise<void> {
  const { error } = await supabase.from('shipment_orders').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Patterns (Mold Management)
// ============================================================
export async function sbGetPatterns(): Promise<Pattern[]> {
  const { data, error } = await supabase.from('patterns').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapPattern);
}

export async function sbCreatePattern(patternData: Omit<Pattern, 'id' | 'pattern_no' | 'usage_count' | 'created_at' | 'updated_at'>): Promise<Pattern> {
  const { data: customers } = await supabase.from('customers').select('customer_no, name, short_name');
  const matched = customers?.find((c: Record<string, unknown>) => c.name === patternData.customer || c.short_name === patternData.customer);
  let customerCode = 'X00';
  if (matched?.customer_no) {
    const parts = (matched.customer_no as string).replace(/-/g, '');
    customerCode = parts.length >= 3 ? parts.slice(0, 3) : parts.padEnd(3, '0');
  }
  const { data: existingPatterns } = await supabase.from('patterns').select('id').eq('customer', patternData.customer);
  const seq = (existingPatterns?.length || 0) + 1;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const patternNo = `MD-${dateStr}-${customerCode}-${String(seq).padStart(5, '0')}`;

  const { data, error } = await supabase.from('patterns').insert({
    ...patternData,
    pattern_no: patternNo,
    usage_count: 0,
  }).select().single();
  if (error) throw error;
  return mapPattern(data);
}

export async function sbUpdatePattern(id: string, updates: Partial<Pattern>): Promise<void> {
  const { error } = await supabase.from('patterns').update(updates).eq('id', id);
  if (error) throw error;
}

export async function sbDeletePattern(id: string): Promise<void> {
  const { error } = await supabase.from('patterns').delete().eq('id', id);
  if (error) throw error;
}

function mapPattern(row: Record<string, unknown>): Pattern {
  return {
    id: row.id as string,
    pattern_no: (row.pattern_no as string) || '',
    name: (row.name as string) || '',
    product_no: (row.product_no as string) || '',
    customer: (row.customer as string) || '',
    pattern_type: (row.pattern_type as Pattern['pattern_type']) || '上下模',
    material: (row.material as string) || '',
    cavities: (row.cavities as number) || 1,
    template_count: (row.template_count as number) || 0,
    sand_core_count: (row.sand_core_count as number) || 0,
    dimensions: (row.dimensions as string) || '',
    weight: (row.weight as number) || 0,
    photos: (row.photos as string[]) || [],
    open_date: (row.open_date as string) || '',
    supplier: (row.supplier as string) || '',
    cost: (row.cost as number) || 0,
    lifetime_count: (row.lifetime_count as number) || 0,
    usage_count: (row.usage_count as number) || 0,
    status: (row.status as Pattern['status']) || '可生產',
    location_warehouse: (row.location_warehouse as string) || '',
    location_area: (row.location_area as string) || '',
    location_shelf: (row.location_shelf as string) || '',
    location_status: (row.location_status as Pattern['location_status']) || '在庫',
    remarks: (row.remarks as string) || '',
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

// ============================================================
// Pattern sub-tables
// ============================================================
export async function sbGetPatternVersions(patternId: string): Promise<PatternVersion[]> {
  const { data, error } = await supabase.from('pattern_versions').select('*').eq('pattern_id', patternId);
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    pattern_id: (row.pattern_id as string) || '',
    version: (row.version as string) || '',
    change_date: (row.change_date as string) || '',
    change_content: (row.change_content as string) || '',
    created_by: (row.created_by as string) || '',
    created_at: (row.created_at as string) || '',
  }));
}

export async function sbCreatePatternVersion(data: Omit<PatternVersion, 'id' | 'created_at'>): Promise<PatternVersion> {
  const { data: result, error } = await supabase.from('pattern_versions').insert(data).select().single();
  if (error) throw error;
  return {
    id: result.id as string,
    pattern_id: (result.pattern_id as string) || '',
    version: (result.version as string) || '',
    change_date: (result.change_date as string) || '',
    change_content: (result.change_content as string) || '',
    created_by: (result.created_by as string) || '',
    created_at: (result.created_at as string) || '',
  };
}

export async function sbGetPatternHistory(patternId?: string): Promise<PatternHistory[]> {
  let query = supabase.from('pattern_histories').select('*');
  if (patternId) query = query.eq('pattern_id', patternId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    pattern_id: (row.pattern_id as string) || '',
    date: (row.date as string) || '',
    work_order_id: (row.work_order_id as string) || '',
    order_no: (row.order_no as string) || '',
    product_name: (row.product_name as string) || '',
    quantity: (row.quantity as number) || 0,
    molding_count: (row.molding_count as number) || 0,
    operator: (row.operator as string) || '',
    created_at: (row.created_at as string) || '',
  }));
}

export async function sbCreatePatternHistory(data: Omit<PatternHistory, 'id' | 'created_at'>): Promise<PatternHistory> {
  const { data: result, error } = await supabase.from('pattern_histories').insert(data).select().single();
  if (error) throw error;
  // Increment usage count
  await supabase.rpc('increment_pattern_usage', { pattern_id_input: data.pattern_id }).catch(() => {
    // Fallback: manual increment
    supabase.from('patterns').select('usage_count').eq('id', data.pattern_id).single().then(({ data: p }) => {
      if (p) supabase.from('patterns').update({ usage_count: ((p.usage_count as number) || 0) + 1 }).eq('id', data.pattern_id);
    });
  });
  return {
    id: result.id as string,
    pattern_id: (result.pattern_id as string) || '',
    date: (result.date as string) || '',
    work_order_id: (result.work_order_id as string) || '',
    order_no: (result.order_no as string) || '',
    product_name: (result.product_name as string) || '',
    quantity: (result.quantity as number) || 0,
    molding_count: (result.molding_count as number) || 0,
    operator: (result.operator as string) || '',
    created_at: (result.created_at as string) || '',
  };
}

export async function sbGetPatternMaintenance(patternId?: string): Promise<PatternMaintenance[]> {
  let query = supabase.from('pattern_maintenances').select('*');
  if (patternId) query = query.eq('pattern_id', patternId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    pattern_id: (row.pattern_id as string) || '',
    maintenance_date: (row.maintenance_date as string) || '',
    type: (row.type as PatternMaintenance['type']) || '清潔',
    content: (row.content as string) || '',
    cost: (row.cost as number) || 0,
    next_maintenance_date: (row.next_maintenance_date as string) || '',
    created_by: (row.created_by as string) || '',
    created_at: (row.created_at as string) || '',
  }));
}

export async function sbCreatePatternMaintenance(data: Omit<PatternMaintenance, 'id' | 'created_at'>): Promise<PatternMaintenance> {
  const { data: result, error } = await supabase.from('pattern_maintenances').insert(data).select().single();
  if (error) throw error;
  return {
    id: result.id as string,
    pattern_id: (result.pattern_id as string) || '',
    maintenance_date: (result.maintenance_date as string) || '',
    type: (result.type as PatternMaintenance['type']) || '清潔',
    content: (result.content as string) || '',
    cost: (result.cost as number) || 0,
    next_maintenance_date: (result.next_maintenance_date as string) || '',
    created_by: (result.created_by as string) || '',
    created_at: (result.created_at as string) || '',
  };
}

export async function sbGetPatternLoans(patternId?: string): Promise<PatternLoan[]> {
  let query = supabase.from('pattern_loans').select('*');
  if (patternId) query = query.eq('pattern_id', patternId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    pattern_id: (row.pattern_id as string) || '',
    borrower: (row.borrower as string) || '',
    borrow_date: (row.borrow_date as string) || '',
    return_date: (row.return_date as string) || '',
    purpose: (row.purpose as string) || '',
    created_at: (row.created_at as string) || '',
  }));
}

export async function sbCreatePatternLoan(data: Omit<PatternLoan, 'id' | 'created_at'>): Promise<PatternLoan> {
  const { data: result, error } = await supabase.from('pattern_loans').insert(data).select().single();
  if (error) throw error;
  await sbUpdatePattern(data.pattern_id, { location_status: '借出' });
  return {
    id: result.id as string,
    pattern_id: (result.pattern_id as string) || '',
    borrower: (result.borrower as string) || '',
    borrow_date: (result.borrow_date as string) || '',
    return_date: (result.return_date as string) || '',
    purpose: (result.purpose as string) || '',
    created_at: (result.created_at as string) || '',
  };
}

export async function sbReturnPatternLoan(loanId: string): Promise<void> {
  const { data } = await supabase.from('pattern_loans').select('pattern_id').eq('id', loanId).single();
  await supabase.from('pattern_loans').update({ return_date: new Date().toISOString().slice(0, 10) }).eq('id', loanId);
  if (data) await sbUpdatePattern(data.pattern_id as string, { location_status: '在庫' });
}

// ============================================================
// Background Sync - Batch Upsert
// ============================================================
/**
 * Normalize a localStorage row before sending it to Postgres.
 *
 * Two failure sources this guards against (both silently killed whole batches):
 * 1. Empty-string dates/timestamps ('' is not a valid DATE/TIMESTAMPTZ literal).
 *    We drop the key entirely so column defaults still apply.
 * 2. Internal client-side flags (`_writeFailed`, `_offlineReason`, `_pendingSync`, ...)
 *    which do not exist as columns — Postgres rejects the entire request.
 */
function sanitizeRowForUpsert(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    // Drop internal client-only flags — they are not real columns.
    if (key.startsWith('_')) continue;
    if (value === undefined) continue;

    // Empty date/timestamp strings are invalid for Postgres → omit the key.
    if (value === '' && /(_date|_at)$/.test(key)) continue;

    clean[key] = value;
  }

  return clean;
}

/**
 * 內部表名 → 實際 Supabase 表名對照。
 *
 * 資料層與 pending queue 使用歷史命名（例如 `melt_chemistry`），
 * 但雲端實際表名為 `melt_chemistries`。任何直接以內部表名操作雲端的程式
 * （例如 pending queue 的刪除同步）都必須先經過這裡轉換，否則會打到
 * 不存在的表而永遠同步失敗，資料也就永遠刪不掉。
 */
const SUPABASE_TABLE_NAME_MAP: Record<string, string> = {
  customers: 'customers',
  work_orders: 'work_orders',
  molding_batches: 'molding_batches',
  melting_records: 'melting_records',
  quality_inspections: 'quality_inspections',
  defect_records: 'defect_records',
  capa_records: 'capa_records',
  warehouse_entries: 'warehouse_entries',
  shipment_orders: 'shipment_orders',
  melt_records: 'melt_records',
  melt_materials: 'melt_materials',
  melt_chemistry: 'melt_chemistries',
  melt_chemistries: 'melt_chemistries',
  patterns: 'patterns',
  pattern_versions: 'pattern_versions',
  pattern_history: 'pattern_histories',
  pattern_maintenance: 'pattern_maintenances',
  pattern_loans: 'pattern_loans',
  users: 'users_profile',
  melt_material_options: 'melt_material_options',
  melt_material_specs: 'melt_material_specs',
  raw_material_receipts: 'raw_material_receipts',
  melt_preset_recipes: 'melt_preset_recipes',
};

/** 將內部表名轉為實際 Supabase 表名；未知表名回傳 undefined */
export function resolveSupabaseTableName(table: string): string | undefined {
  return SUPABASE_TABLE_NAME_MAP[table];
}

export async function sbUpsertBatch(table: string, items: Record<string, unknown>[]): Promise<void> {
  if (!items || items.length === 0) return;
 
  
  const supabaseTable = resolveSupabaseTableName(table);
  if (!supabaseTable) {
    console.warn(`[sbUpsertBatch] Unknown table: ${table}`);
    return;
  }

  try {
    // Upsert in batches of 50 to avoid payload limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE).map(sanitizeRowForUpsert);
      const { error } = await supabase
        .from(supabaseTable)
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

      if (error) {
        console.warn(
          `[sbUpsertBatch] ${supabaseTable} batch ${i}-${i + batch.length} error:`,
          error.code,
          error.message,
          error.details
        );
      }
    }
  } catch (e) {
    console.warn(`[sbUpsertBatch] ${supabaseTable} exception:`, e);
  }
}

// ============================================================
// Melt Material Options (投料原料主檔)
// 使用者在「投料明細」下拉選單自行輸入新原料時寫入此表，
// 之後在其他裝置或下次登入即可直接選取，無須重新輸入；
// 下拉選單項目亦可刪除，僅移除主檔項目，不影響既有投料紀錄。
// ============================================================
export interface MeltMaterialOption {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function mapMeltMaterialOption(row: Record<string, unknown>): MeltMaterialOption {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

export async function sbGetMeltMaterialOptions(): Promise<MeltMaterialOption[]> {
  const { data, error } = await supabase
    .from('melt_material_options')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapMeltMaterialOption);
}

export async function sbCreateMeltMaterialOption(name: string): Promise<MeltMaterialOption> {
  const { data, error } = await supabase
    .from('melt_material_options')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return mapMeltMaterialOption(data);
}

export async function sbDeleteMeltMaterialOption(id: string): Promise<boolean> {
  const { error } = await supabase.from('melt_material_options').delete().eq('id', id);
  if (error) throw error;
  return true;
}

