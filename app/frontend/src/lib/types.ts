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
export type MoldType = '上下模' | '單面模' | '現板模' | '保模' | '中板模' | '砂心模' | '其他';
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
  pattern_id: string;
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

// Quality Inspection Types
export type InspectionType = 'FAI' | 'IPQC' | 'FQC' | 'OQC';
export type InspectionResult = 'PASS' | 'FAIL' | 'CONDITIONAL';
export type DefectDisposition = 'REWORK' | 'SCRAP' | 'CONCESSION' | 'RETURN';
export type CAPAStatus = 'OPEN' | 'ANALYZING' | 'IMPLEMENTING' | 'VERIFYING' | 'CLOSED';

export const DEFECT_CODES = [
  { code: 'DIM', label: '尺寸異常' },
  { code: 'SHR', label: '縮孔' },
  { code: 'GAS', label: '氣孔' },
  { code: 'SAND', label: '砂孔' },
  { code: 'CRK', label: '裂紋' },
  { code: 'COLD', label: '冷隔' },
  { code: 'SLAG', label: '夾渣' },
  { code: 'DEF', label: '變形' },
  { code: 'MACH', label: '加工不足' },
  { code: 'COMP', label: '成份異常' },
  { code: 'HARD', label: '硬度異常' },
  { code: 'OTHER', label: '其他' },
] as const;

export const INSPECTION_ITEMS_FAI = ['尺寸', '重量', '外觀', '成份', '硬度', '外觀缺陷'] as const;
export const INSPECTION_ITEMS_IPQC = ['尺寸', '外觀', '重量', '溫度', '砂模狀況', '氣孔', '縮孔', '裂紋'] as const;
export const INSPECTION_ITEMS_FQC = ['尺寸', '重量', '材質', '表面', '外觀', '組裝', '包裝', '文件'] as const;
export const INSPECTION_ITEMS_OQC = ['數量', '標籤', '包裝', '外觀', '文件', '客戶要求'] as const;

export interface QualityInspection {
  id: string;
  inspection_no: string;
  type: InspectionType;
  batch_id: string;
  batch_no: string;
  work_order_id?: string;
  order_no?: string;
  customer?: string;
  product_name?: string;
  material?: string;
  mold_id?: string;
  heat_no: string;
  melt_record_id?: string;
  inspection_date: string;
  inspector: string;
  result: InspectionResult;
  inspected_quantity: number;
  pass_quantity: number;
  defect_count: number;
  yield_rate: number;
  sampling_method?: string;
  item_results: InspectionItemResult[];
  defects: DefectRecord[];
  attachments?: string[];
  remarks: string;
  created_at: string;
}

// 檢驗判定：OK 合格、PNG 部分不合格、ANG 全部不合格、X 不適用／未檢驗
// 'NG' 為舊版判定值，保留以相容既有歷史紀錄
export type InspectionItemVerdict = 'OK' | 'PNG' | 'ANG' | 'X' | 'NG';

export interface InspectionItemResult {
  item: string;
  result: InspectionItemVerdict;
  measured_value?: string;
  standard_value?: string;
  remarks?: string;
}

export interface DefectRecord {
  id: string;
  inspection_id?: string;
  batch_id?: string;
  batch_no?: string;
  defect_code: string;
  defect_label: string;
  quantity: number;
  cause?: string;
  responsible_station?: string;
  disposition: DefectDisposition;
  remarks?: string;
  created_at: string;
}

export interface CAPARecord {
  id: string;
  capa_no: string;
  inspection_id?: string;
  defect_id?: string;
  status: CAPAStatus;
  problem_description: string;
  five_why?: string;
  root_cause?: string;
  corrective_action?: string;
  preventive_action?: string;
  responsible_person: string;
  due_date: string;
  verified_by?: string;
  verified_date?: string;
  attachments?: string[];
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
export type PatternType = '上下模' | '單面模' | '現板模' | '保模' | '中板模' | '砂心模' | '其他';
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
  template_count: number;
  sand_core_count: number;
  dimensions: string;
  weight: number;
  photos: string[];
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