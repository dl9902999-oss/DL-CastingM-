export type UserRole = 'Admin' | 'Production' | 'QC' | 'Warehouse';

export interface UserProfile {
  id: string;
  employee_id: string;
  password: string;
  email?: string;
  role: UserRole;
  name: string;
  permissions?: string[]; // list of allowed path keys e.g. ['/dashboard', '/customers', ...]
}

export type MoldSupply = '客戶提供' | '公司自有' | '代客製作';
export type MoldType = '單面模' | '現板模' | '上下模' | '保模' | '其他';
export type HeatTreatment = '退火' | '淬火' | '回火' | '正常化' | '調質' | '其他';

export type CustomerType = '產業機械' | '砂石產業' | '營造工程' | '汽車模具' | '鑄造廠' | '加工廠' | '貿易商' | '其他';
export type CustomerStatus = '啟用' | '停用';

export interface Customer {
  id: string;
  customer_no: string;
  name: string;
  short_name: string;
  type: CustomerType | '';
  address: string;
  delivery_addresses: string[];
  phone: string;
  email: string;
  contact1_name: string;
  contact1_phone: string;
  contact2_name: string;
  contact2_phone: string;
  status: CustomerStatus;
  remarks: string;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  order_no: string;
  customer: string;
  product_name: string;
  material: string;
  quantity: number;
  estimated_weight: number;
  mold_supply: MoldSupply | '';
  mold_type: MoldType | '';
  heat_treatment: HeatTreatment | '';
  due_date: string;
  remarks: string;
  mold_photos: string[];
  drawing_photos: string[];
  status: 'Open' | 'Partial' | 'In Progress' | 'Completed' | 'Cancelled';
  created_at: string;
  updated_at: string;
}

export interface MoldingBatch {
  id: string;
  batch_no: string;
  work_order_id: string;
  order_no: string;
  customer: string;
  product_name: string;
  material: string;
  quantity_planned: number;
  quantity_completed: number;
  estimated_pouring_weight: number;
  remarks: string;
  molding_photos: string[];
  closing_photos: string[];
  status: 'Pending' | 'In Progress' | 'Completed';
  created_at: string;
  updated_at: string;
}

export interface MeltingRecord {
  id: string;
  heat_no: string;
  batch_id: string;
  batch_no: string;
  furnace_no: string;
  melting_weight: number;
  pouring_weight: number;
  pouring_weights: number[];
  yield_rate: number;
  status: 'Pending' | 'In Progress' | 'Completed';
  created_at: string;
  updated_at: string;
}

// === 熔解管理模組 (Melting Management) ===
export type SampleStage = 'TARGET' | 'IN_FURNACE' | 'AFTER_FURNACE';

export interface MeltRecord {
  id: string;
  melt_no: string;
  melt_date: string;
  material_grade: string;
  furnace_no: string;
  power_kwh: number;
  power_start_time: string;
  tap_time: string;
  melt_minutes: number;
  tap_temp: number;
  total_charge_weight: number;
  specific_energy: number;
  created_by: string;
  remark: string;
  created_at: string;
  updated_at: string;
}

export interface MeltMaterial {
  id: string;
  melt_id: string;
  raw_material: string;
  charge_weight: number;
  secondary_weight: number;
  subtotal: number;
}

export interface MeltChemistry {
  id: string;
  melt_id: string;
  sample_stage: SampleStage;
  C: number;
  Si: number;
  Mn: number;
  P: number;
  S: number;
  Ni: number;
  Cr: number;
  Mo: number;
  Cu: number;
  Fe: number;
}

export interface QualityInspection {
  id: string;
  inspection_no: string;
  batch_id: string;
  batch_no: string;
  heat_no: string;
  result: 'PASS' | 'HOLD' | 'REJECT';
  defect_count: number;
  inspected_quantity: number;
  remarks: string;
  inspector: string;
  created_at: string;
}

export interface WarehouseEntry {
  id: string;
  batch_id: string;
  batch_no: string;
  location: string;
  quantity: number;
  created_at: string;
}

export interface ShipmentOrder {
  id: string;
  shipment_no: string;
  work_order_id: string;
  order_no: string;
  customer: string;
  quantity: number;
  ship_date: string;
  status: 'Pending' | 'Shipped';
  created_at: string;
}

export interface DashboardStats {
  todayProduction: number;
  yieldRate: number;
  wipQuantity: number;
  pendingShipment: number;
}

// === 模具管理模組 (Pattern/Mold Management) ===
export type PatternType = '木模' | '樹脂模' | '金屬模' | '砂模' | '殼模' | '芯盒' | '其他';
export type PatternStatus = '待驗收' | '可生產' | '維修中' | '停用' | '報廢';
export type PatternLocationStatus = '在庫' | '借出' | '維修' | '使用中';
export type MaintenanceType = '清潔' | '補修' | '加工' | '翻修' | '更換';

export interface Pattern {
  id: string;
  pattern_no: string;
  name: string;
  product_no: string;
  customer: string;
  pattern_type: PatternType;
  material: string;
  cavities: number;
  dimensions: string;
  weight: number;
  open_date: string;
  supplier: string;
  cost: number;
  lifetime_count: number;
  usage_count: number;
  status: PatternStatus;
  location_warehouse: string;
  location_area: string;
  location_shelf: string;
  location_status: PatternLocationStatus;
  remarks: string;
  created_at: string;
  updated_at: string;
}

export interface PatternVersion {
  id: string;
  pattern_id: string;
  version: string;
  change_date: string;
  change_content: string;
  created_by: string;
  created_at: string;
}

export interface PatternHistory {
  id: string;
  pattern_id: string;
  date: string;
  work_order_id: string;
  order_no: string;
  product_name: string;
  quantity: number;
  molding_count: number;
  operator: string;
  created_at: string;
}

export interface PatternMaintenance {
  id: string;
  pattern_id: string;
  maintenance_date: string;
  type: MaintenanceType;
  content: string;
  cost: number;
  next_maintenance_date: string;
  created_by: string;
  created_at: string;
}

export interface PatternLoan {
  id: string;
  pattern_id: string;
  borrower: string;
  borrow_date: string;
  return_date: string;
  purpose: string;
  created_at: string;
}