-- ============================================================
-- 鑄造工廠生產紀錄系統 - 原料主檔（投料明細下拉選單項目）
-- 請在 Supabase Dashboard > SQL Editor 中執行此腳本
--
-- 用途：
-- 1. 使用者在「投料明細」的原料下拉選單自行輸入新原料時，系統自動寫入此表，
--    之後在其他裝置或下次登入即可直接選取，無須重新輸入。
-- 2. 下拉選單項目可直接刪除（僅移除主檔項目，不影響既有投料紀錄）。
-- ============================================================

BEGIN;

-- 1. 原料主檔表
CREATE TABLE IF NOT EXISTS melt_material_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_melt_material_options_name ON melt_material_options(name);

-- 2. 啟用 RLS 並開放 public（anon + authenticated）完整存取，
--    與既有各表的政策風格一致。
ALTER TABLE melt_material_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_melt_material_options_all" ON melt_material_options;
CREATE POLICY "public_melt_material_options_all" ON melt_material_options
  FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. updated_at 自動更新
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_melt_material_options_updated_at ON melt_material_options;
CREATE TRIGGER update_melt_material_options_updated_at
  BEFORE UPDATE ON melt_material_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. 啟用 Realtime 訂閱（跨裝置即時同步；若已加入可忽略 duplicate_object）
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE melt_material_options;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;

-- ============================================================
-- 完成！
-- 前端首次讀取時若偵測到本表為空，會自動寫入系統預設原料項目，
-- 之後所有新增／刪除皆以此表為唯一來源，跨裝置一致。
-- ============================================================
