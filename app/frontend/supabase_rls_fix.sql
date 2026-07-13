-- ============================================================
-- RLS 修正腳本 - 允許 anon 角色存取
-- 請在 Supabase Dashboard > SQL Editor 中執行此腳本
-- ============================================================

BEGIN;

-- 新增 password 欄位到 users_profile（如果尚未存在）
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS password TEXT DEFAULT '';

-- 為所有表新增 anon 角色的存取政策
CREATE POLICY "anon_users_profile_all" ON users_profile FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_customers_all" ON customers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_patterns_all" ON patterns FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_pattern_versions_all" ON pattern_versions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_pattern_histories_all" ON pattern_histories FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_pattern_maintenances_all" ON pattern_maintenances FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_pattern_loans_all" ON pattern_loans FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_work_orders_all" ON work_orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_molding_batches_all" ON molding_batches FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_melting_records_all" ON melting_records FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_melt_records_all" ON melt_records FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_melt_materials_all" ON melt_materials FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_melt_chemistries_all" ON melt_chemistries FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_melt_pourings_all" ON melt_pourings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_melt_preset_recipes_all" ON melt_preset_recipes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_quality_inspections_all" ON quality_inspections FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_defect_records_all" ON defect_records FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_capa_records_all" ON capa_records FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_warehouse_entries_all" ON warehouse_entries FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_shipment_orders_all" ON shipment_orders FOR ALL TO anon USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- 完成！現在 anon 角色可以存取所有資料表。
-- ============================================================