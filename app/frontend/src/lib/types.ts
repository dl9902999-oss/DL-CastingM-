export type UserRole = 'Admin' | 'Production' | 'QC' | 'Warehouse';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

export type MoldSupply = '客戶提供' | '公司自有' | '代客製作';
export type MoldType = '單面模' | '現板模' | '上下模' | '保模' | '其他';
export type HeatTreatment = '退火' | '淬火' | '回火' | '正常化' | '調質' | '其他';

export type CustomerType = '一般客戶' | 'VIP客戶' | '經銷商' | '代工客戶' | '其他';
export type CustomerStatus = '啟用' | '停用';

export interface Customer {
  id: string;
  customer_no: string;
  name: string;
  short_name: string;
  type: CustomerType | '';
  address: string;
  delivery_address: string;
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