-- ============================================================
-- 鑄造工廠生產紀錄系統 - Supabase 資料庫建立腳本
-- 請在 Supabase Dashboard > SQL Editor 中執行此腳本
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 使用者帳號表 (users_profile)
-- ============================================================
CREATE TABLE IF NOT EXISTS users_profile (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  employee_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Production' CHECK (role IN ('Admin', 'Production', 'QC', 'Warehouse')),
  permissions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. 客戶資料表 (customers)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT DEFAULT '',
  type TEXT DEFAULT '' CHECK (type IN ('產業機械', '砂石產業', '營造工程', '汽車模具', '鑄造廠', '加工廠', '貿易商', '其他', '')),
  address TEXT DEFAULT '',
  delivery_addresses TEXT[] DEFAULT '{}',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  contact1_name TEXT DEFAULT '',
  contact1_phone TEXT DEFAULT '',
  contact2_name TEXT DEFAULT '',
  contact2_phone TEXT DEFAULT '',
  status TEXT DEFAULT '啟用' CHECK (status IN ('啟用', '停用')),
  remarks TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 模具管理表 (patterns)
-- ============================================================
CREATE TABLE IF NOT EXISTS patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  product_no TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  pattern_type TEXT DEFAULT '上下模' CHECK (pattern_type IN ('上下模', '單面模', '現板模', '保模', '中板模', '砂心模', '其他')),
  material TEXT DEFAULT '',
  cavities INTEGER DEFAULT 1,
  template_count INTEGER DEFAULT 0,
  sand_core_count INTEGER DEFAULT 0,
  dimensions TEXT DEFAULT '',
  weight NUMERIC DEFAULT 0,
  photos TEXT[] DEFAULT '{}',
  open_date DATE,
  supplier TEXT DEFAULT '',
  cost NUMERIC DEFAULT 0,
  lifetime_count INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  status TEXT DEFAULT '可生產' CHECK (status IN ('待驗收', '可生產', '維修中', '停用', '報廢')),
  location_warehouse TEXT DEFAULT '',
  location_area TEXT DEFAULT '',
  location_shelf TEXT DEFAULT '',
  location_status TEXT DEFAULT '在庫' CHECK (location_status IN ('在庫', '借出', '維修', '使用中')),
  remarks TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. 模具版本紀錄 (pattern_versions)
-- ============================================================
CREATE TABLE IF NOT EXISTS pattern_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_id UUID REFERENCES patterns(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  change_date DATE NOT NULL,
  change_content TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. 模具生產履歷 (pattern_histories)
-- ============================================================
CREATE TABLE IF NOT EXISTS pattern_histories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_id UUID REFERENCES patterns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  work_order_id UUID,
  order_no TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  quantity INTEGER DEFAULT 0,
  molding_count INTEGER DEFAULT 0,
  operator TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. 模具保養紀錄 (pattern_maintenances)
-- ============================================================
CREATE TABLE IF NOT EXISTS pattern_maintenances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_id UUID REFERENCES patterns(id) ON DELETE CASCADE,
  maintenance_date DATE NOT NULL,
  type TEXT DEFAULT '清潔' CHECK (type IN ('清潔', '補修', '加工', '翻修', '更換')),
  content TEXT DEFAULT '',
  cost NUMERIC DEFAULT 0,
  next_maintenance_date DATE,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. 模具借出紀錄 (pattern_loans)
-- ============================================================
CREATE TABLE IF NOT EXISTS pattern_loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_id UUID REFERENCES patterns(id) ON DELETE CASCADE,
  borrower TEXT NOT NULL,
  borrow_date DATE NOT NULL,
  return_date DATE,
  purpose TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. 工單表 (work_orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  product_name TEXT NOT NULL,
  material TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  estimated_weight NUMERIC DEFAULT 0,
  mold_supply TEXT DEFAULT '' CHECK (mold_supply IN ('客戶提供', '公司自有', '代客製作', '')),
  mold_type TEXT DEFAULT '' CHECK (mold_type IN ('上下模', '單面模', '現板模', '保模', '中板模', '砂心模', '其他', '')),
  pattern_id TEXT DEFAULT '',
  heat_treatment TEXT DEFAULT '' CHECK (heat_treatment IN ('退火', '淬火', '回火', '正常化', '調質', '其他', '')),
  due_date DATE,
  remarks TEXT DEFAULT '',
  mold_photos TEXT[] DEFAULT '{}',
  drawing_photos TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'Partial', 'In Progress', 'Completed', 'Cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. 造模批次表 (molding_batches)
-- ============================================================
CREATE TABLE IF NOT EXISTS molding_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_no TEXT NOT NULL UNIQUE,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  order_no TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  material TEXT DEFAULT '',
  quantity_planned INTEGER DEFAULT 1,
  quantity_completed INTEGER DEFAULT 0,
  estimated_pouring_weight NUMERIC DEFAULT 0,
  remarks TEXT DEFAULT '',
  molding_photos TEXT[] DEFAULT '{}',
  closing_photos TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. 熔煉紀錄表 (melting_records) - 舊版簡易
-- ============================================================
CREATE TABLE IF NOT EXISTS melting_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  heat_no TEXT NOT NULL,
  batch_id UUID REFERENCES molding_batches(id) ON DELETE SET NULL,
  batch_no TEXT DEFAULT '',
  furnace_no TEXT DEFAULT '',
  melting_weight NUMERIC DEFAULT 0,
  pouring_weight NUMERIC DEFAULT 0,
  pouring_weights NUMERIC[] DEFAULT '{}',
  yield_rate NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. 熔解管理紀錄表 (melt_records) - 新版完整
-- ============================================================
CREATE TABLE IF NOT EXISTS melt_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  melt_no TEXT NOT NULL UNIQUE,
  melt_date DATE NOT NULL,
  material_grade TEXT DEFAULT '',
  furnace_no TEXT DEFAULT '',
  power_kwh NUMERIC DEFAULT 0,
  power_start_time TEXT DEFAULT '',
  tap_time TEXT DEFAULT '',
  melt_minutes INTEGER DEFAULT 0,
  tap_temp NUMERIC DEFAULT 0,
  total_charge_weight NUMERIC DEFAULT 0,
  specific_energy NUMERIC DEFAULT 0,
  created_by TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 12. 熔解投料明細 (melt_materials)
-- ============================================================
CREATE TABLE IF NOT EXISTS melt_materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  melt_id UUID REFERENCES melt_records(id) ON DELETE CASCADE,
  raw_material TEXT NOT NULL,
  charge_weight NUMERIC DEFAULT 0,
  secondary_weight NUMERIC DEFAULT 0,
  subtotal NUMERIC DEFAULT 0
);

-- ============================================================
-- 13. 熔解成份紀錄 (melt_chemistries)
-- ============================================================
CREATE TABLE IF NOT EXISTS melt_chemistries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  melt_id UUID REFERENCES melt_records(id) ON DELETE CASCADE,
  sample_stage TEXT NOT NULL CHECK (sample_stage IN ('TARGET', 'IN_FURNACE', 'AFTER_FURNACE')),
  "C" NUMERIC DEFAULT 0,
  "Si" NUMERIC DEFAULT 0,
  "Mn" NUMERIC DEFAULT 0,
  "P" NUMERIC DEFAULT 0,
  "S" NUMERIC DEFAULT 0,
  "Ni" NUMERIC DEFAULT 0,
  "Cr" NUMERIC DEFAULT 0,
  "Mo" NUMERIC DEFAULT 0,
  "Cu" NUMERIC DEFAULT 0,
  "Fe" NUMERIC DEFAULT 0
);

-- ============================================================
-- 14. 熔解澆注紀錄 (melt_pourings)
-- ============================================================
CREATE TABLE IF NOT EXISTS melt_pourings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  melt_id UUID REFERENCES melt_records(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  batch_no TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  material TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  estimated_weight NUMERIC DEFAULT 0,
  estimated_pouring_weight NUMERIC DEFAULT 0,
  pouring_weights NUMERIC[] DEFAULT '{}',
  total_pouring_weight NUMERIC DEFAULT 0,
  avg_pouring_weight NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 15. 預設投料配比 (melt_preset_recipes)
-- ============================================================
CREATE TABLE IF NOT EXISTS melt_preset_recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  materials JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 16. 品質檢驗表 (quality_inspections)
-- ============================================================
CREATE TABLE IF NOT EXISTS quality_inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('FAI', 'IPQC', 'FQC', 'OQC')),
  batch_id UUID REFERENCES molding_batches(id) ON DELETE SET NULL,
  batch_no TEXT DEFAULT '',
  work_order_id UUID,
  order_no TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  material TEXT DEFAULT '',
  mold_id TEXT DEFAULT '',
  heat_no TEXT DEFAULT '',
  melt_record_id UUID,
  inspection_date DATE NOT NULL,
  inspector TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL', 'CONDITIONAL')),
  inspected_quantity INTEGER DEFAULT 0,
  pass_quantity INTEGER DEFAULT 0,
  defect_count INTEGER DEFAULT 0,
  yield_rate NUMERIC DEFAULT 0,
  sampling_method TEXT DEFAULT '',
  item_results JSONB DEFAULT '[]',
  defects JSONB DEFAULT '[]',
  attachments TEXT[] DEFAULT '{}',
  remarks TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 17. 缺陷紀錄表 (defect_records)
-- ============================================================
CREATE TABLE IF NOT EXISTS defect_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID REFERENCES quality_inspections(id) ON DELETE CASCADE,
  batch_id UUID,
  batch_no TEXT DEFAULT '',
  defect_code TEXT NOT NULL,
  defect_label TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  cause TEXT DEFAULT '',
  responsible_station TEXT DEFAULT '',
  disposition TEXT DEFAULT 'REWORK' CHECK (disposition IN ('REWORK', 'SCRAP', 'CONCESSION', 'RETURN')),
  remarks TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 18. CAPA 矯正預防措施 (capa_records)
-- ============================================================
CREATE TABLE IF NOT EXISTS capa_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  capa_no TEXT NOT NULL UNIQUE,
  inspection_id UUID REFERENCES quality_inspections(id) ON DELETE SET NULL,
  defect_id UUID REFERENCES defect_records(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANALYZING', 'IMPLEMENTING', 'VERIFYING', 'CLOSED')),
  problem_description TEXT DEFAULT '',
  five_why TEXT DEFAULT '',
  root_cause TEXT DEFAULT '',
  corrective_action TEXT DEFAULT '',
  preventive_action TEXT DEFAULT '',
  responsible_person TEXT NOT NULL,
  due_date DATE NOT NULL,
  verified_by TEXT DEFAULT '',
  verified_date DATE,
  attachments TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 19. 入庫紀錄表 (warehouse_entries)
-- ============================================================
CREATE TABLE IF NOT EXISTS warehouse_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID REFERENCES molding_batches(id) ON DELETE SET NULL,
  batch_no TEXT DEFAULT '',
  location TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 20. 出貨單表 (shipment_orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS shipment_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_no TEXT NOT NULL UNIQUE,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  order_no TEXT DEFAULT '',
  customer TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  ship_date DATE NOT NULL,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Shipped')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 建立索引 (Indexes)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customers_customer_no ON customers(customer_no);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_short_name ON customers(short_name);

CREATE INDEX IF NOT EXISTS idx_patterns_pattern_no ON patterns(pattern_no);
CREATE INDEX IF NOT EXISTS idx_patterns_customer ON patterns(customer);

CREATE INDEX IF NOT EXISTS idx_work_orders_order_no ON work_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_work_orders_customer ON work_orders(customer);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_due_date ON work_orders(due_date);

CREATE INDEX IF NOT EXISTS idx_molding_batches_batch_no ON molding_batches(batch_no);
CREATE INDEX IF NOT EXISTS idx_molding_batches_work_order_id ON molding_batches(work_order_id);
CREATE INDEX IF NOT EXISTS idx_molding_batches_status ON molding_batches(status);

CREATE INDEX IF NOT EXISTS idx_melting_records_heat_no ON melting_records(heat_no);
CREATE INDEX IF NOT EXISTS idx_melting_records_batch_id ON melting_records(batch_id);

CREATE INDEX IF NOT EXISTS idx_melt_records_melt_no ON melt_records(melt_no);
CREATE INDEX IF NOT EXISTS idx_melt_records_melt_date ON melt_records(melt_date);
CREATE INDEX IF NOT EXISTS idx_melt_records_furnace_no ON melt_records(furnace_no);

CREATE INDEX IF NOT EXISTS idx_melt_materials_melt_id ON melt_materials(melt_id);
CREATE INDEX IF NOT EXISTS idx_melt_chemistries_melt_id ON melt_chemistries(melt_id);
CREATE INDEX IF NOT EXISTS idx_melt_pourings_melt_id ON melt_pourings(melt_id);

CREATE INDEX IF NOT EXISTS idx_quality_inspections_inspection_no ON quality_inspections(inspection_no);
CREATE INDEX IF NOT EXISTS idx_quality_inspections_batch_id ON quality_inspections(batch_id);
CREATE INDEX IF NOT EXISTS idx_quality_inspections_type ON quality_inspections(type);
CREATE INDEX IF NOT EXISTS idx_quality_inspections_result ON quality_inspections(result);

CREATE INDEX IF NOT EXISTS idx_defect_records_inspection_id ON defect_records(inspection_id);
CREATE INDEX IF NOT EXISTS idx_capa_records_inspection_id ON capa_records(inspection_id);
CREATE INDEX IF NOT EXISTS idx_capa_records_status ON capa_records(status);

CREATE INDEX IF NOT EXISTS idx_warehouse_entries_batch_id ON warehouse_entries(batch_id);
CREATE INDEX IF NOT EXISTS idx_shipment_orders_work_order_id ON shipment_orders(work_order_id);
CREATE INDEX IF NOT EXISTS idx_shipment_orders_status ON shipment_orders(status);

-- ============================================================
-- 啟用 Row Level Security (RLS)
-- ============================================================
ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE molding_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE melting_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE melt_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE melt_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE melt_chemistries ENABLE ROW LEVEL SECURITY;
ALTER TABLE melt_pourings ENABLE ROW LEVEL SECURITY;
ALTER TABLE melt_preset_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE capa_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_orders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS 政策 - 允許已認證使用者完整存取
-- (可依需求調整為更細緻的角色權限控制)
-- ============================================================

-- users_profile: 使用者可讀取所有，只能修改自己的
CREATE POLICY "users_profile_select" ON users_profile FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_profile_insert" ON users_profile FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "users_profile_update" ON users_profile FOR UPDATE TO authenticated USING (true);
CREATE POLICY "users_profile_delete" ON users_profile FOR DELETE TO authenticated USING (true);

-- 其他表: 已認證使用者可完整 CRUD
CREATE POLICY "customers_all" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "patterns_all" ON patterns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pattern_versions_all" ON pattern_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pattern_histories_all" ON pattern_histories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pattern_maintenances_all" ON pattern_maintenances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pattern_loans_all" ON pattern_loans FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "work_orders_all" ON work_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "molding_batches_all" ON molding_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "melting_records_all" ON melting_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "melt_records_all" ON melt_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "melt_materials_all" ON melt_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "melt_chemistries_all" ON melt_chemistries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "melt_pourings_all" ON melt_pourings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "melt_preset_recipes_all" ON melt_preset_recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "quality_inspections_all" ON quality_inspections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "defect_records_all" ON defect_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "capa_records_all" ON capa_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_entries_all" ON warehouse_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shipment_orders_all" ON shipment_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 自動更新 updated_at 觸發器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_profile_updated_at BEFORE UPDATE ON users_profile FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_patterns_updated_at BEFORE UPDATE ON patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_work_orders_updated_at BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_molding_batches_updated_at BEFORE UPDATE ON molding_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_melting_records_updated_at BEFORE UPDATE ON melting_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_melt_records_updated_at BEFORE UPDATE ON melt_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_melt_preset_recipes_updated_at BEFORE UPDATE ON melt_preset_recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- ============================================================
-- 完成！所有資料表已建立。
-- 
-- 資料表清單：
-- 1.  users_profile        - 使用者帳號
-- 2.  customers            - 客戶資料
-- 3.  patterns             - 模具管理
-- 4.  pattern_versions     - 模具版本紀錄
-- 5.  pattern_histories    - 模具生產履歷
-- 6.  pattern_maintenances - 模具保養紀錄
-- 7.  pattern_loans        - 模具借出紀錄
-- 8.  work_orders          - 工單
-- 9.  molding_batches      - 造模批次
-- 10. melting_records      - 熔煉紀錄(簡易)
-- 11. melt_records         - 熔解管理紀錄(完整)
-- 12. melt_materials       - 熔解投料明細
-- 13. melt_chemistries     - 熔解成份紀錄
-- 14. melt_pourings        - 熔解澆注紀錄
-- 15. melt_preset_recipes  - 預設投料配比
-- 16. quality_inspections  - 品質檢驗
-- 17. defect_records       - 缺陷紀錄
-- 18. capa_records         - CAPA矯正預防
-- 19. warehouse_entries    - 入庫紀錄
-- 20. shipment_orders      - 出貨單
-- ============================================================