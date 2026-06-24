import { WorkOrder, MoldingBatch, MeltingRecord, QualityInspection, WarehouseEntry, ShipmentOrder, UserProfile, Customer, MeltRecord, MeltMaterial, MeltChemistry, SampleStage, Pattern, PatternVersion, PatternHistory, PatternMaintenance, PatternLoan } from './types';

// Local storage-based store for demo/offline mode
// Will be replaced with Supabase queries when connected

const STORAGE_KEYS = {
  WORK_ORDERS: 'foundry_work_orders',
  MOLDING_BATCHES: 'foundry_molding_batches',
  MELTING_RECORDS: 'foundry_melting_records',
  QUALITY_INSPECTIONS: 'foundry_quality_inspections',
  WAREHOUSE_ENTRIES: 'foundry_warehouse_entries',
  SHIPMENT_ORDERS: 'foundry_shipment_orders',
  USERS: 'foundry_users',
  CURRENT_USER: 'foundry_current_user',
  CUSTOMERS: 'foundry_customers',
  SEQ_COUNTERS: 'foundry_seq_counters',
  MELT_RECORDS: 'foundry_melt_records',
  MELT_MATERIALS: 'foundry_melt_materials',
  MELT_CHEMISTRY: 'foundry_melt_chemistry',
  MELT_TARGET_RANGES: 'foundry_melt_target_ranges',
  PATTERNS: 'foundry_patterns',
  PATTERN_VERSIONS: 'foundry_pattern_versions',
  PATTERN_HISTORY: 'foundry_pattern_history',
  PATTERN_MAINTENANCE: 'foundry_pattern_maintenance',
  PATTERN_LOANS: 'foundry_pattern_loans',
};

function getItems<T>(key: string): T[] {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function setItems<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

function generateId(): string {
  return crypto.randomUUID();
}

// Sequential counter management
function getNextSeq(prefix: string): number {
  const countersRaw = localStorage.getItem(STORAGE_KEYS.SEQ_COUNTERS);
  const counters: Record<string, number> = countersRaw ? JSON.parse(countersRaw) : {};
  const current = counters[prefix] || 0;
  const next = current + 1;
  counters[prefix] = next;
  localStorage.setItem(STORAGE_KEYS.SEQ_COUNTERS, JSON.stringify(counters));
  return next;
}

function generateOrderNo(prefix: string): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = getNextSeq(prefix);
  const seqStr = String(seq).padStart(5, '0');
  return `${prefix}-${dateStr}-A01-${seqStr}`;
}

// Initialize demo users
export function initDemoUsers(): void {
  const users = getItems<UserProfile>(STORAGE_KEYS.USERS);
  // Migrate: if existing users lack employee_id, reset to new format
  const ALL_PATHS = ['/dashboard', '/customers', '/work-orders', '/molding', '/melting-management', '/quality', '/warehouse', '/shipment', '/mold-management', '/traceability', '/user-management'];
  const needsMigration = users.length === 0 || (users.length > 0 && !users[0].employee_id) || (users.length > 0 && !users[0].permissions) || (users.length > 0 && users[0].permissions && !users[0].permissions.includes('/mold-management'));
  if (needsMigration) {
    const demoUsers: UserProfile[] = [
      { id: '1', employee_id: 'A001', password: 'admin123', role: 'Admin', name: '管理員', permissions: ALL_PATHS },
      { id: '2', employee_id: 'P001', password: '1234', role: 'Production', name: '生產員', permissions: ['/dashboard', '/customers', '/work-orders', '/molding', '/melting-management', '/mold-management', '/traceability'] },
      { id: '3', employee_id: 'Q001', password: '1234', role: 'QC', name: '品管員', permissions: ['/dashboard', '/quality', '/traceability'] },
      { id: '4', employee_id: 'W001', password: '1234', role: 'Warehouse', name: '倉管員', permissions: ['/dashboard', '/warehouse', '/shipment', '/traceability'] },
    ];
    setItems(STORAGE_KEYS.USERS, demoUsers);
    // Clear current user session since format changed
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
}

// Auth
export function login(employeeId: string, password: string): UserProfile | null {
  const users = getItems<UserProfile>(STORAGE_KEYS.USERS);
  const user = users.find(u => u.employee_id === employeeId && u.password === password);
  if (user) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    return user;
  }
  return null;
}

// User Management (Admin)
export function getAllUsers(): UserProfile[] {
  return getItems<UserProfile>(STORAGE_KEYS.USERS);
}

export function createUser(userData: Omit<UserProfile, 'id'>): UserProfile {
  const users = getItems<UserProfile>(STORAGE_KEYS.USERS);
  const newUser: UserProfile = {
    id: crypto.randomUUID(),
    ...userData,
  };
  users.push(newUser);
  setItems(STORAGE_KEYS.USERS, users);
  return newUser;
}

export function updateUser(id: string, updates: Partial<Omit<UserProfile, 'id'>>): UserProfile | null {
  const users = getItems<UserProfile>(STORAGE_KEYS.USERS);
  const idx = users.findIndex(u => u.id === id);
  if (idx < 0) return null;
  users[idx] = { ...users[idx], ...updates };
  setItems(STORAGE_KEYS.USERS, users);
  return users[idx];
}

export function deleteUser(id: string): boolean {
  const users = getItems<UserProfile>(STORAGE_KEYS.USERS);
  const filtered = users.filter(u => u.id !== id);
  if (filtered.length === users.length) return false;
  setItems(STORAGE_KEYS.USERS, filtered);
  return true;
}

export function logout(): void {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
}

export function getCurrentUser(): UserProfile | null {
  const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  return data ? JSON.parse(data) : null;
}

// Customers
export function getCustomers(): Customer[] {
  return getItems<Customer>(STORAGE_KEYS.CUSTOMERS);
}

const CUSTOMER_TYPE_PREFIX_MAP: Record<string, string> = {
  '產業機械': 'A',
  '砂石產業': 'B',
  '營造工程': 'C',
  '汽車模具': 'D',
  '鑄造廠': 'E',
  '加工廠': 'F',
  '貿易商': 'G',
  '其他': 'H',
};

export function createCustomer(data: Omit<Customer, 'id' | 'customer_no' | 'created_at' | 'updated_at'>): Customer {
  const customers = getCustomers();
  const prefix = CUSTOMER_TYPE_PREFIX_MAP[data.type] || 'G';
  // Count existing customers with the same prefix
  const sameTypeCount = customers.filter(c => c.customer_no.startsWith(`${prefix}-`)).length;
  const seq = sameTypeCount + 1;
  const seqStr = String(seq).padStart(3, '0');
  const newCustomer: Customer = {
    ...data,
    delivery_addresses: data.delivery_addresses || [],
    id: generateId(),
    customer_no: `${prefix}-${seqStr}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  customers.push(newCustomer);
  setItems(STORAGE_KEYS.CUSTOMERS, customers);
  return newCustomer;
}

export function updateCustomer(id: string, data: Partial<Customer>): Customer | null {
  const customers = getCustomers();
  const idx = customers.findIndex(c => c.id === id);
  if (idx === -1) return null;
  customers[idx] = { ...customers[idx], ...data, updated_at: new Date().toISOString() };
  setItems(STORAGE_KEYS.CUSTOMERS, customers);
  return customers[idx];
}

export function deleteCustomer(id: string): void {
  const customers = getCustomers().filter(c => c.id !== id);
  setItems(STORAGE_KEYS.CUSTOMERS, customers);
}

// Work Orders
export function getWorkOrders(): WorkOrder[] {
  return getItems<WorkOrder>(STORAGE_KEYS.WORK_ORDERS);
}

export function createWorkOrder(data: Omit<WorkOrder, 'id' | 'order_no' | 'status' | 'created_at' | 'updated_at'>): WorkOrder {
  const orders = getWorkOrders();
  const newOrder: WorkOrder = {
    ...data,
    mold_photos: data.mold_photos || [],
    drawing_photos: data.drawing_photos || [],
    estimated_weight: data.estimated_weight || 0,
    mold_supply: data.mold_supply || '',
    mold_type: data.mold_type || '',
    heat_treatment: data.heat_treatment || '',
    id: generateId(),
    order_no: generateOrderNo('WO'),
    status: 'Open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  orders.push(newOrder);
  setItems(STORAGE_KEYS.WORK_ORDERS, orders);
  return newOrder;
}

export function deleteWorkOrder(id: string): void {
  const orders = getWorkOrders().filter(o => o.id !== id);
  setItems(STORAGE_KEYS.WORK_ORDERS, orders);
}

export function updateWorkOrder(id: string, data: Partial<WorkOrder>): WorkOrder | null {
  const orders = getWorkOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...data, updated_at: new Date().toISOString() };
  setItems(STORAGE_KEYS.WORK_ORDERS, orders);
  return orders[idx];
}

// Molding Batches
export function getMoldingBatches(): MoldingBatch[] {
  return getItems<MoldingBatch>(STORAGE_KEYS.MOLDING_BATCHES);
}

export function createMoldingBatch(data: { work_order_id: string; order_no: string; customer: string; product_name: string; material: string; quantity_planned: number; estimated_pouring_weight: number; remarks: string; molding_photos: string[]; closing_photos?: string[] }): MoldingBatch {
  const batches = getMoldingBatches();
  const newBatch: MoldingBatch = {
    id: generateId(),
    batch_no: generateOrderNo('MB'),
    work_order_id: data.work_order_id,
    order_no: data.order_no,
    customer: data.customer || '',
    product_name: data.product_name || '',
    material: data.material || '',
    quantity_planned: data.quantity_planned,
    quantity_completed: 0,
    estimated_pouring_weight: data.estimated_pouring_weight || 0,
    remarks: data.remarks || '',
    molding_photos: data.molding_photos || [],
    closing_photos: data.closing_photos || [],
    status: (data.closing_photos && data.closing_photos.length > 0) ? 'Completed' :
            (data.molding_photos && data.molding_photos.length > 0) ? 'In Progress' : 'Pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  batches.push(newBatch);
  setItems(STORAGE_KEYS.MOLDING_BATCHES, batches);
  return newBatch;
}

export function deleteMoldingBatch(id: string): void {
  const batches = getMoldingBatches().filter(b => b.id !== id);
  setItems(STORAGE_KEYS.MOLDING_BATCHES, batches);
}

export function updateMoldingBatch(id: string, data: Partial<MoldingBatch>): MoldingBatch | null {
  const batches = getMoldingBatches();
  const idx = batches.findIndex(b => b.id === id);
  if (idx === -1) return null;
  batches[idx] = { ...batches[idx], ...data, updated_at: new Date().toISOString() };
  setItems(STORAGE_KEYS.MOLDING_BATCHES, batches);
  return batches[idx];
}

// Melting Records
export function getMeltingRecords(): MeltingRecord[] {
  return getItems<MeltingRecord>(STORAGE_KEYS.MELTING_RECORDS);
}

export function createMeltingRecord(data: { batch_id: string; batch_no: string; furnace_no: string; melting_weight: number; pouring_weights: number[] }): MeltingRecord {
  const records = getMeltingRecords();
  const totalPouring = data.pouring_weights.reduce((sum, w) => sum + w, 0);
  // 預估得料率 = 工單預估重量 / 總澆注重量 * 100%
  const yieldRate = totalPouring > 0 && data.melting_weight > 0 ? (data.melting_weight / totalPouring) * 100 : 0;
  const newRecord: MeltingRecord = {
    id: generateId(),
    heat_no: generateOrderNo('HT'),
    batch_id: data.batch_id,
    batch_no: data.batch_no,
    furnace_no: data.furnace_no,
    melting_weight: data.melting_weight,
    pouring_weight: totalPouring,
    pouring_weights: data.pouring_weights,
    yield_rate: Math.round(yieldRate * 100) / 100,
    status: 'Completed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  records.push(newRecord);
  setItems(STORAGE_KEYS.MELTING_RECORDS, records);
  // Auto-update batch status: count total poured pieces for this batch
  syncBatchStatusFromMelting(data.batch_id);
  return newRecord;
}

function syncBatchStatusFromMelting(batchId: string) {
  const allRecords = getMeltingRecords();
  const batchRecords = allRecords.filter(r => r.batch_id === batchId);
  const totalPouredPieces = batchRecords.reduce((sum, r) => {
    const ws = r.pouring_weights && r.pouring_weights.length > 0 ? r.pouring_weights : [r.pouring_weight];
    return sum + ws.filter(w => w > 0).length;
  }, 0);
  const batches = getMoldingBatches();
  const batch = batches.find(b => b.id === batchId);
  if (!batch) return;
  if (totalPouredPieces >= batch.quantity_planned) {
    updateMoldingBatch(batch.id, { quantity_completed: batch.quantity_planned, status: 'Completed' });
  } else if (totalPouredPieces > 0) {
    updateMoldingBatch(batch.id, { quantity_completed: totalPouredPieces, status: 'In Progress' });
  } else {
    updateMoldingBatch(batch.id, { quantity_completed: 0, status: 'Pending' });
  }
}

export function updateMeltingRecord(id: string, data: { furnace_no?: string; pouring_weights?: number[]; melting_weight?: number }): MeltingRecord | null {
  const records = getMeltingRecords();
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return null;
  const record = records[index];
  if (data.furnace_no !== undefined) record.furnace_no = data.furnace_no;
  if (data.pouring_weights !== undefined) {
    record.pouring_weights = data.pouring_weights;
    record.pouring_weight = data.pouring_weights.reduce((sum, w) => sum + w, 0);
  }
  if (data.melting_weight !== undefined) record.melting_weight = data.melting_weight;
  // Recalculate yield rate
  if (record.pouring_weight > 0 && record.melting_weight > 0) {
    record.yield_rate = Math.round((record.melting_weight / record.pouring_weight) * 100 * 100) / 100;
  }
  record.updated_at = new Date().toISOString();
  records[index] = record;
  setItems(STORAGE_KEYS.MELTING_RECORDS, records);
  // Sync batch status
  syncBatchStatusFromMelting(record.batch_id);
  return record;
}

export function deleteMeltingRecord(id: string): boolean {
  const records = getMeltingRecords();
  const record = records.find(r => r.id === id);
  const filtered = records.filter(r => r.id !== id);
  if (filtered.length === records.length) return false;
  setItems(STORAGE_KEYS.MELTING_RECORDS, filtered);
  // Sync batch status after deletion
  if (record) syncBatchStatusFromMelting(record.batch_id);
  return true;
}

// Quality Inspections
export function getQualityInspections(): QualityInspection[] {
  return getItems<QualityInspection>(STORAGE_KEYS.QUALITY_INSPECTIONS);
}

export function createQualityInspection(data: Omit<QualityInspection, 'id' | 'inspection_no' | 'created_at'>): QualityInspection {
  const inspections = getQualityInspections();
  const newInspection: QualityInspection = {
    ...data,
    id: generateId(),
    inspection_no: generateOrderNo('QC'),
    created_at: new Date().toISOString(),
  };
  inspections.push(newInspection);
  setItems(STORAGE_KEYS.QUALITY_INSPECTIONS, inspections);
  return newInspection;
}

// Warehouse Entries
export function getWarehouseEntries(): WarehouseEntry[] {
  return getItems<WarehouseEntry>(STORAGE_KEYS.WAREHOUSE_ENTRIES);
}

export function createWarehouseEntry(data: { batch_id: string; batch_no: string; location: string; quantity: number }): WarehouseEntry {
  const entries = getWarehouseEntries();
  const newEntry: WarehouseEntry = {
    ...data,
    id: generateId(),
    created_at: new Date().toISOString(),
  };
  entries.push(newEntry);
  setItems(STORAGE_KEYS.WAREHOUSE_ENTRIES, entries);
  return newEntry;
}

// Shipment Orders
export function getShipmentOrders(): ShipmentOrder[] {
  return getItems<ShipmentOrder>(STORAGE_KEYS.SHIPMENT_ORDERS);
}

export function createShipmentOrder(data: { work_order_id: string; order_no: string; customer: string; quantity: number; ship_date: string }): ShipmentOrder {
  const orders = getShipmentOrders();
  const newOrder: ShipmentOrder = {
    ...data,
    id: generateId(),
    shipment_no: generateOrderNo('SH'),
    status: 'Pending',
    created_at: new Date().toISOString(),
  };
  orders.push(newOrder);
  setItems(STORAGE_KEYS.SHIPMENT_ORDERS, orders);
  return newOrder;
}

export function updateShipmentOrder(id: string, data: Partial<ShipmentOrder>): ShipmentOrder | null {
  const orders = getShipmentOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...data };
  setItems(STORAGE_KEYS.SHIPMENT_ORDERS, orders);
  return orders[idx];
}

// Dashboard Stats
export function getDashboardStats(): { todayProduction: number; todayProductionKg: number; yieldRate: number; wipQuantity: number; pendingShipment: number } {
  const today = new Date().toISOString().slice(0, 10);
  const batches = getMoldingBatches();
  const meltings = getMeltingRecords();
  const shipments = getShipmentOrders();

  // Today's production: pieces from batches completed today
  const todayBatches = batches.filter(b => b.created_at.slice(0, 10) === today);
  const todayProduction = todayBatches.reduce((sum, b) => sum + b.quantity_completed, 0);

  // Today's production weight: pouring weight from melting records created today
  const todayMeltings = meltings.filter(m => m.created_at.slice(0, 10) === today);
  const todayProductionKg = todayMeltings.reduce((sum, m) => sum + m.pouring_weight, 0);

  // Yield rate: last month statistics
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

// Traceability
export function traceByWorkOrder(orderNo: string) {
  const orders = getWorkOrders().filter(o => o.order_no.includes(orderNo));
  const batches = getMoldingBatches().filter(b => orders.some(o => o.id === b.work_order_id));
  const meltings = getMeltingRecords().filter(m => batches.some(b => b.id === m.batch_id));
  const inspections = getQualityInspections().filter(i => batches.some(b => b.id === i.batch_id));
  const warehouse = getWarehouseEntries().filter(w => batches.some(b => b.id === w.batch_id));
  const shipments = getShipmentOrders().filter(s => orders.some(o => o.id === s.work_order_id));
  return { orders, batches, meltings, inspections, warehouse, shipments };
}

export function traceByBatch(batchNo: string) {
  const batches = getMoldingBatches().filter(b => b.batch_no.includes(batchNo));
  const orders = getWorkOrders().filter(o => batches.some(b => b.work_order_id === o.id));
  const meltings = getMeltingRecords().filter(m => batches.some(b => b.id === m.batch_id));
  const inspections = getQualityInspections().filter(i => batches.some(b => b.id === i.batch_id));
  const warehouse = getWarehouseEntries().filter(w => batches.some(b => b.id === w.batch_id));
  const shipments = getShipmentOrders().filter(s => orders.some(o => o.id === s.work_order_id));
  return { orders, batches, meltings, inspections, warehouse, shipments };
}

export function traceByHeatNo(heatNo: string) {
  const meltings = getMeltingRecords().filter(m => m.heat_no.includes(heatNo));
  const batches = getMoldingBatches().filter(b => meltings.some(m => m.batch_id === b.id));
  const orders = getWorkOrders().filter(o => batches.some(b => b.work_order_id === o.id));
  const inspections = getQualityInspections().filter(i => batches.some(b => b.id === i.batch_id));
  const warehouse = getWarehouseEntries().filter(w => batches.some(b => b.id === w.batch_id));
  const shipments = getShipmentOrders().filter(s => orders.some(o => o.id === s.work_order_id));
  return { orders, batches, meltings, inspections, warehouse, shipments };
}

export function traceByShipment(shipmentNo: string) {
  const shipments = getShipmentOrders().filter(s => s.shipment_no.includes(shipmentNo));
  const orders = getWorkOrders().filter(o => shipments.some(s => s.work_order_id === o.id));
  const batches = getMoldingBatches().filter(b => orders.some(o => o.id === b.work_order_id));
  const meltings = getMeltingRecords().filter(m => batches.some(b => b.id === m.batch_id));
  const inspections = getQualityInspections().filter(i => batches.some(b => b.id === i.batch_id));
  const warehouse = getWarehouseEntries().filter(w => batches.some(b => b.id === w.batch_id));
  return { orders, batches, meltings, inspections, warehouse, shipments };
}

// === 熔解管理模組 (Melting Management) ===

export function getMeltRecords(): MeltRecord[] {
  return getItems<MeltRecord>(STORAGE_KEYS.MELT_RECORDS);
}

export function getMeltMaterials(meltId?: string): MeltMaterial[] {
  const all = getItems<MeltMaterial>(STORAGE_KEYS.MELT_MATERIALS);
  return meltId ? all.filter(m => m.melt_id === meltId) : all;
}

export function getMeltChemistry(meltId?: string): MeltChemistry[] {
  const all = getItems<MeltChemistry>(STORAGE_KEYS.MELT_CHEMISTRY);
  return meltId ? all.filter(c => c.melt_id === meltId) : all;
}

export function createMeltRecord(data: Omit<MeltRecord, 'id' | 'melt_no' | 'melt_minutes' | 'total_charge_weight' | 'specific_energy' | 'created_at' | 'updated_at'>): MeltRecord {
  const records = getMeltRecords();
  // Calculate melt_minutes from power_start_time and tap_time (HH:mm format)
  let meltMinutes = 0;
  if (data.power_start_time && data.tap_time) {
    const [sh, sm] = data.power_start_time.split(':').map(Number);
    const [eh, em] = data.tap_time.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // cross midnight
    meltMinutes = diff;
  }
  // total_charge_weight will be calculated from materials
  const materials = getMeltMaterials();
  // For new record, no materials yet, so 0
  const totalChargeWeight = 0;
  const specificEnergy = totalChargeWeight > 0 ? Math.round((data.power_kwh / totalChargeWeight) * 1000) / 1000 : 0;

  const newRecord: MeltRecord = {
    ...data,
    id: generateId(),
    melt_no: generateOrderNo('ML'),
    melt_minutes: meltMinutes,
    total_charge_weight: totalChargeWeight,
    specific_energy: specificEnergy,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  records.push(newRecord);
  setItems(STORAGE_KEYS.MELT_RECORDS, records);
  return newRecord;
}

export function updateMeltRecord(id: string, data: Partial<Omit<MeltRecord, 'id' | 'melt_no' | 'created_at'>>): MeltRecord | null {
  const records = getMeltRecords();
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return null;
  const record = { ...records[index], ...data, updated_at: new Date().toISOString() };
  // Recalculate melt_minutes from HH:mm format
  if (record.power_start_time && record.tap_time) {
    const [sh, sm] = record.power_start_time.split(':').map(Number);
    const [eh, em] = record.tap_time.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // cross midnight
    record.melt_minutes = diff;
  }
  // Recalculate total_charge_weight from materials
  const materials = getMeltMaterials(id);
  record.total_charge_weight = materials.reduce((sum, m) => sum + m.subtotal, 0);
  // Recalculate specific_energy
  record.specific_energy = record.total_charge_weight > 0
    ? Math.round((record.power_kwh / record.total_charge_weight) * 1000) / 1000
    : 0;
  records[index] = record;
  setItems(STORAGE_KEYS.MELT_RECORDS, records);
  return record;
}

export function deleteMeltRecord(id: string): boolean {
  const records = getMeltRecords();
  const filtered = records.filter(r => r.id !== id);
  if (filtered.length === records.length) return false;
  setItems(STORAGE_KEYS.MELT_RECORDS, filtered);
  // Also delete related materials and chemistry
  const materials = getItems<MeltMaterial>(STORAGE_KEYS.MELT_MATERIALS).filter(m => m.melt_id !== id);
  setItems(STORAGE_KEYS.MELT_MATERIALS, materials);
  const chemistry = getItems<MeltChemistry>(STORAGE_KEYS.MELT_CHEMISTRY).filter(c => c.melt_id !== id);
  setItems(STORAGE_KEYS.MELT_CHEMISTRY, chemistry);
  return true;
}

// Recalculate totals for a melt record based on its materials
export function recalcMeltRecord(meltId: string): MeltRecord | null {
  const materials = getMeltMaterials(meltId);
  const totalChargeWeight = materials.reduce((sum, m) => sum + m.subtotal, 0);
  const records = getMeltRecords();
  const index = records.findIndex(r => r.id === meltId);
  if (index === -1) return null;
  records[index].total_charge_weight = totalChargeWeight;
  records[index].specific_energy = totalChargeWeight > 0
    ? Math.round((records[index].power_kwh / totalChargeWeight) * 1000) / 1000
    : 0;
  records[index].updated_at = new Date().toISOString();
  setItems(STORAGE_KEYS.MELT_RECORDS, records);
  return records[index];
}

// Melt Materials CRUD
export function createMeltMaterial(data: Omit<MeltMaterial, 'id' | 'subtotal'>): MeltMaterial {
  const materials = getItems<MeltMaterial>(STORAGE_KEYS.MELT_MATERIALS);
  const newMaterial: MeltMaterial = {
    ...data,
    id: generateId(),
    subtotal: data.charge_weight + data.secondary_weight,
  };
  materials.push(newMaterial);
  setItems(STORAGE_KEYS.MELT_MATERIALS, materials);
  // Recalculate parent record
  recalcMeltRecord(data.melt_id);
  return newMaterial;
}

export function updateMeltMaterial(id: string, data: Partial<Omit<MeltMaterial, 'id' | 'subtotal'>>): MeltMaterial | null {
  const materials = getItems<MeltMaterial>(STORAGE_KEYS.MELT_MATERIALS);
  const index = materials.findIndex(m => m.id === id);
  if (index === -1) return null;
  const material = { ...materials[index], ...data };
  material.subtotal = material.charge_weight + material.secondary_weight;
  materials[index] = material;
  setItems(STORAGE_KEYS.MELT_MATERIALS, materials);
  recalcMeltRecord(material.melt_id);
  return material;
}

export function deleteMeltMaterial(id: string): boolean {
  const materials = getItems<MeltMaterial>(STORAGE_KEYS.MELT_MATERIALS);
  const material = materials.find(m => m.id === id);
  const filtered = materials.filter(m => m.id !== id);
  if (filtered.length === materials.length) return false;
  setItems(STORAGE_KEYS.MELT_MATERIALS, filtered);
  if (material) recalcMeltRecord(material.melt_id);
  return true;
}

// Melt Chemistry CRUD
export function createMeltChemistry(data: Omit<MeltChemistry, 'id'>): MeltChemistry {
  const chemistry = getItems<MeltChemistry>(STORAGE_KEYS.MELT_CHEMISTRY);
  // Calculate Fe as balance
  const otherElements = data.C + data.Si + data.Mn + data.P + data.S + data.Ni + data.Cr + data.Mo + data.Cu;
  const newChemistry: MeltChemistry = {
    ...data,
    id: generateId(),
    Fe: Math.round((100 - otherElements) * 1000) / 1000,
  };
  chemistry.push(newChemistry);
  setItems(STORAGE_KEYS.MELT_CHEMISTRY, chemistry);
  return newChemistry;
}

export function updateMeltChemistry(id: string, data: Partial<Omit<MeltChemistry, 'id'>>): MeltChemistry | null {
  const chemistry = getItems<MeltChemistry>(STORAGE_KEYS.MELT_CHEMISTRY);
  const index = chemistry.findIndex(c => c.id === id);
  if (index === -1) return null;
  const record = { ...chemistry[index], ...data };
  // Recalculate Fe
  const otherElements = record.C + record.Si + record.Mn + record.P + record.S + record.Ni + record.Cr + record.Mo + record.Cu;
  record.Fe = Math.round((100 - otherElements) * 1000) / 1000;
  chemistry[index] = record;
  setItems(STORAGE_KEYS.MELT_CHEMISTRY, chemistry);
  return record;
}

export function deleteMeltChemistry(id: string): boolean {
  const chemistry = getItems<MeltChemistry>(STORAGE_KEYS.MELT_CHEMISTRY);
  const filtered = chemistry.filter(c => c.id !== id);
  if (filtered.length === chemistry.length) return false;
  setItems(STORAGE_KEYS.MELT_CHEMISTRY, filtered);
  return true;
}

// Target Range storage (min/max for TARGET chemistry)
export interface MeltTargetRange {
  melt_id: string;
  [key: string]: number | string; // e.g., C_min, C_max, Si_min, Si_max, ...
}

export function getMeltTargetRange(meltId: string): Record<string, number> | null {
  const all = getItems<MeltTargetRange>(STORAGE_KEYS.MELT_TARGET_RANGES);
  const found = all.find(r => r.melt_id === meltId);
  if (!found) return null;
  const result: Record<string, number> = {};
  Object.keys(found).forEach(k => {
    if (k !== 'melt_id' && typeof found[k] === 'number') {
      result[k] = found[k] as number;
    }
  });
  return result;
}

export function saveMeltTargetRange(meltId: string, range: Record<string, number>): void {
  const all = getItems<MeltTargetRange>(STORAGE_KEYS.MELT_TARGET_RANGES);
  const idx = all.findIndex(r => r.melt_id === meltId);
  const entry: MeltTargetRange = { melt_id: meltId, ...range };
  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.push(entry);
  }
  setItems(STORAGE_KEYS.MELT_TARGET_RANGES, all);
}

export function deleteMeltTargetRange(meltId: string): void {
  const all = getItems<MeltTargetRange>(STORAGE_KEYS.MELT_TARGET_RANGES);
  const filtered = all.filter(r => r.melt_id !== meltId);
  setItems(STORAGE_KEYS.MELT_TARGET_RANGES, filtered);
}

// === Pattern/Mold Management ===

export function getPatterns(): Pattern[] {
  return getItems<Pattern>(STORAGE_KEYS.PATTERNS);
}

export function createPattern(data: Omit<Pattern, 'id' | 'pattern_no' | 'usage_count' | 'created_at' | 'updated_at'>): Pattern {
  const patterns = getPatterns();
  const no = generateOrderNo('MD');
  const pattern: Pattern = {
    ...data,
    id: generateId(),
    pattern_no: no,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  patterns.push(pattern);
  setItems(STORAGE_KEYS.PATTERNS, patterns);
  return pattern;
}

export function updatePattern(id: string, updates: Partial<Pattern>): void {
  const patterns = getPatterns();
  const idx = patterns.findIndex(p => p.id === id);
  if (idx >= 0) {
    patterns[idx] = { ...patterns[idx], ...updates, updated_at: new Date().toISOString() };
    setItems(STORAGE_KEYS.PATTERNS, patterns);
  }
}

export function deletePattern(id: string): void {
  const patterns = getPatterns().filter(p => p.id !== id);
  setItems(STORAGE_KEYS.PATTERNS, patterns);
}

export function getPatternVersions(patternId: string): PatternVersion[] {
  return getItems<PatternVersion>(STORAGE_KEYS.PATTERN_VERSIONS).filter(v => v.pattern_id === patternId);
}

export function createPatternVersion(data: Omit<PatternVersion, 'id' | 'created_at'>): PatternVersion {
  const all = getItems<PatternVersion>(STORAGE_KEYS.PATTERN_VERSIONS);
  const ver: PatternVersion = { ...data, id: generateId(), created_at: new Date().toISOString() };
  all.push(ver);
  setItems(STORAGE_KEYS.PATTERN_VERSIONS, all);
  return ver;
}

export function getPatternHistory(patternId?: string): PatternHistory[] {
  const all = getItems<PatternHistory>(STORAGE_KEYS.PATTERN_HISTORY);
  return patternId ? all.filter(h => h.pattern_id === patternId) : all;
}

export function createPatternHistory(data: Omit<PatternHistory, 'id' | 'created_at'>): PatternHistory {
  const all = getItems<PatternHistory>(STORAGE_KEYS.PATTERN_HISTORY);
  const entry: PatternHistory = { ...data, id: generateId(), created_at: new Date().toISOString() };
  all.push(entry);
  setItems(STORAGE_KEYS.PATTERN_HISTORY, all);
  // Auto-increment usage count
  const patterns = getPatterns();
  const idx = patterns.findIndex(p => p.id === data.pattern_id);
  if (idx >= 0) {
    patterns[idx].usage_count += 1;
    patterns[idx].updated_at = new Date().toISOString();
    setItems(STORAGE_KEYS.PATTERNS, patterns);
  }
  return entry;
}

export function getPatternMaintenance(patternId?: string): PatternMaintenance[] {
  const all = getItems<PatternMaintenance>(STORAGE_KEYS.PATTERN_MAINTENANCE);
  return patternId ? all.filter(m => m.pattern_id === patternId) : all;
}

export function createPatternMaintenance(data: Omit<PatternMaintenance, 'id' | 'created_at'>): PatternMaintenance {
  const all = getItems<PatternMaintenance>(STORAGE_KEYS.PATTERN_MAINTENANCE);
  const entry: PatternMaintenance = { ...data, id: generateId(), created_at: new Date().toISOString() };
  all.push(entry);
  setItems(STORAGE_KEYS.PATTERN_MAINTENANCE, all);
  return entry;
}

export function getPatternLoans(patternId?: string): PatternLoan[] {
  const all = getItems<PatternLoan>(STORAGE_KEYS.PATTERN_LOANS);
  return patternId ? all.filter(l => l.pattern_id === patternId) : all;
}

export function createPatternLoan(data: Omit<PatternLoan, 'id' | 'created_at'>): PatternLoan {
  const all = getItems<PatternLoan>(STORAGE_KEYS.PATTERN_LOANS);
  const entry: PatternLoan = { ...data, id: generateId(), created_at: new Date().toISOString() };
  all.push(entry);
  setItems(STORAGE_KEYS.PATTERN_LOANS, all);
  // Update pattern location status
  updatePattern(data.pattern_id, { location_status: '借出' });
  return entry;
}

export function returnPatternLoan(loanId: string): void {
  const all = getItems<PatternLoan>(STORAGE_KEYS.PATTERN_LOANS);
  const idx = all.findIndex(l => l.id === loanId);
  if (idx >= 0) {
    all[idx].return_date = new Date().toISOString().slice(0, 10);
    setItems(STORAGE_KEYS.PATTERN_LOANS, all);
    updatePattern(all[idx].pattern_id, { location_status: '在庫' });
  }
}