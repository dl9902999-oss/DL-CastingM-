-- ============================================================
-- RLS 修正腳本 V2 - 完整修復版
-- 問題：Schema V2 只建立了 authenticated 角色的政策，
--       但前端使用 anon key（未經 Supabase Auth 登入），
--       導致所有寫入操作被 RLS 拒絕。
--
-- 解法：為所有表同時允許 anon 和 authenticated 角色的完整存取。
--       使用 DROP IF EXISTS + CREATE 確保冪等（可重複執行）。
--
-- 請在 Supabase Dashboard > SQL Editor 中執行此腳本
-- ============================================================

BEGIN;

-- ============================================================
-- 步驟 1：確保所有表已啟用 RLS
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
-- 步驟 2：移除舊政策（避免衝突）
-- ============================================================

-- users_profile
DROP POLICY IF EXISTS "allow_all_users_profile" ON users_profile;
DROP POLICY IF EXISTS "anon_users_profile_all" ON users_profile;
DROP POLICY IF EXISTS "public_users_profile_all" ON users_profile;

-- customers
DROP POLICY IF EXISTS "allow_all_customers" ON customers;
DROP POLICY IF EXISTS "anon_customers_all" ON customers;
DROP POLICY IF EXISTS "public_customers_all" ON customers;

-- patterns
DROP POLICY IF EXISTS "allow_all_patterns" ON patterns;
DROP POLICY IF EXISTS "anon_patterns_all" ON patterns;
DROP POLICY IF EXISTS "public_patterns_all" ON patterns;

-- pattern_versions
DROP POLICY IF EXISTS "allow_all_pattern_versions" ON pattern_versions;
DROP POLICY IF EXISTS "anon_pattern_versions_all" ON pattern_versions;
DROP POLICY IF EXISTS "public_pattern_versions_all" ON pattern_versions;

-- pattern_histories
DROP POLICY IF EXISTS "allow_all_pattern_histories" ON pattern_histories;
DROP POLICY IF EXISTS "anon_pattern_histories_all" ON pattern_histories;
DROP POLICY IF EXISTS "public_pattern_histories_all" ON pattern_histories;

-- pattern_maintenances
DROP POLICY IF EXISTS "allow_all_pattern_maintenances" ON pattern_maintenances;
DROP POLICY IF EXISTS "anon_pattern_maintenances_all" ON pattern_maintenances;
DROP POLICY IF EXISTS "public_pattern_maintenances_all" ON pattern_maintenances;

-- pattern_loans
DROP POLICY IF EXISTS "allow_all_pattern_loans" ON pattern_loans;
DROP POLICY IF EXISTS "anon_pattern_loans_all" ON pattern_loans;
DROP POLICY IF EXISTS "public_pattern_loans_all" ON pattern_loans;

-- work_orders
DROP POLICY IF EXISTS "allow_all_work_orders" ON work_orders;
DROP POLICY IF EXISTS "anon_work_orders_all" ON work_orders;
DROP POLICY IF EXISTS "public_work_orders_all" ON work_orders;

-- molding_batches
DROP POLICY IF EXISTS "allow_all_molding_batches" ON molding_batches;
DROP POLICY IF EXISTS "anon_molding_batches_all" ON molding_batches;
DROP POLICY IF EXISTS "public_molding_batches_all" ON molding_batches;

-- melting_records
DROP POLICY IF EXISTS "allow_all_melting_records" ON melting_records;
DROP POLICY IF EXISTS "anon_melting_records_all" ON melting_records;
DROP POLICY IF EXISTS "public_melting_records_all" ON melting_records;

-- melt_records
DROP POLICY IF EXISTS "allow_all_melt_records" ON melt_records;
DROP POLICY IF EXISTS "anon_melt_records_all" ON melt_records;
DROP POLICY IF EXISTS "public_melt_records_all" ON melt_records;

-- melt_materials
DROP POLICY IF EXISTS "allow_all_melt_materials" ON melt_materials;
DROP POLICY IF EXISTS "anon_melt_materials_all" ON melt_materials;
DROP POLICY IF EXISTS "public_melt_materials_all" ON melt_materials;

-- melt_chemistries
DROP POLICY IF EXISTS "allow_all_melt_chemistries" ON melt_chemistries;
DROP POLICY IF EXISTS "anon_melt_chemistries_all" ON melt_chemistries;
DROP POLICY IF EXISTS "public_melt_chemistries_all" ON melt_chemistries;

-- melt_pourings
DROP POLICY IF EXISTS "allow_all_melt_pourings" ON melt_pourings;
DROP POLICY IF EXISTS "anon_melt_pourings_all" ON melt_pourings;
DROP POLICY IF EXISTS "public_melt_pourings_all" ON melt_pourings;

-- melt_preset_recipes
DROP POLICY IF EXISTS "allow_all_melt_preset_recipes" ON melt_preset_recipes;
DROP POLICY IF EXISTS "anon_melt_preset_recipes_all" ON melt_preset_recipes;
DROP POLICY IF EXISTS "public_melt_preset_recipes_all" ON melt_preset_recipes;

-- quality_inspections
DROP POLICY IF EXISTS "allow_all_quality_inspections" ON quality_inspections;
DROP POLICY IF EXISTS "anon_quality_inspections_all" ON quality_inspections;
DROP POLICY IF EXISTS "public_quality_inspections_all" ON quality_inspections;

-- defect_records
DROP POLICY IF EXISTS "allow_all_defect_records" ON defect_records;
DROP POLICY IF EXISTS "anon_defect_records_all" ON defect_records;
DROP POLICY IF EXISTS "public_defect_records_all" ON defect_records;

-- capa_records
DROP POLICY IF EXISTS "allow_all_capa_records" ON capa_records;
DROP POLICY IF EXISTS "anon_capa_records_all" ON capa_records;
DROP POLICY IF EXISTS "public_capa_records_all" ON capa_records;

-- warehouse_entries
DROP POLICY IF EXISTS "allow_all_warehouse_entries" ON warehouse_entries;
DROP POLICY IF EXISTS "anon_warehouse_entries_all" ON warehouse_entries;
DROP POLICY IF EXISTS "public_warehouse_entries_all" ON warehouse_entries;

-- shipment_orders
DROP POLICY IF EXISTS "allow_all_shipment_orders" ON shipment_orders;
DROP POLICY IF EXISTS "anon_shipment_orders_all" ON shipment_orders;
DROP POLICY IF EXISTS "public_shipment_orders_all" ON shipment_orders;

-- ============================================================
-- 步驟 3：建立新政策 - 允許 public（含 anon + authenticated）完整存取
-- 使用 TO public 表示所有角色（anon + authenticated）都可以操作
-- ============================================================

CREATE POLICY "public_users_profile_all" ON users_profile FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_customers_all" ON customers FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_patterns_all" ON patterns FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_pattern_versions_all" ON pattern_versions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_pattern_histories_all" ON pattern_histories FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_pattern_maintenances_all" ON pattern_maintenances FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_pattern_loans_all" ON pattern_loans FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_work_orders_all" ON work_orders FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_molding_batches_all" ON molding_batches FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_melting_records_all" ON melting_records FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_melt_records_all" ON melt_records FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_melt_materials_all" ON melt_materials FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_melt_chemistries_all" ON melt_chemistries FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_melt_pourings_all" ON melt_pourings FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_melt_preset_recipes_all" ON melt_preset_recipes FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_quality_inspections_all" ON quality_inspections FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_defect_records_all" ON defect_records FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_capa_records_all" ON capa_records FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_warehouse_entries_all" ON warehouse_entries FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_shipment_orders_all" ON shipment_orders FOR ALL TO public USING (true) WITH CHECK (true);

-- ============================================================
-- 步驟 4：啟用 Realtime 訂閱（確保前端可以接收即時更新）
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE work_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE patterns;
ALTER PUBLICATION supabase_realtime ADD TABLE molding_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE melting_records;
ALTER PUBLICATION supabase_realtime ADD TABLE quality_inspections;
ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE shipment_orders;

COMMIT;

-- ============================================================
-- 完成！
-- 
-- 執行後請回到應用程式，點擊同步狀態列的「重新連線」按鈕，
-- 系統會自動重試寫入並恢復正常同步狀態。
--
-- 注意：如果 ALTER PUBLICATION 報錯「already member」可忽略，
--       表示 Realtime 訂閱已經設定過了。
-- ============================================================