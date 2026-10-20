-- 總覽：記錄業務資料的最後異動（包含更新與刪除），不將查詢時間當成資料更新時間。
BEGIN;
CREATE TABLE IF NOT EXISTS public.dashboard_data_state (
  id integer PRIMARY KEY CHECK (id = 1),
  last_updated_at timestamptz
);
ALTER TABLE public.dashboard_data_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dashboard_state_read ON public.dashboard_data_state;
CREATE POLICY dashboard_state_read ON public.dashboard_data_state FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.dashboard_data_state TO anon, authenticated;
INSERT INTO public.dashboard_data_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_dashboard_data_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.dashboard_data_state SET last_updated_at = clock_timestamp() WHERE id = 1;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.record_dashboard_data_change() FROM PUBLIC;

DO $$
DECLARE
  tbl text;
  latest timestamptz;
  timestamp_column text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['customers','work_orders','molding_batches','melting_records','quality_inspections','defect_records','capa_records','warehouse_entries','shipment_orders','melt_records','melt_materials','melt_chemistries','melt_pourings','melt_preset_recipes','melt_material_specs','raw_material_receipts','melt_material_options','patterns','pattern_versions','pattern_histories','pattern_maintenances','pattern_loans','users_profile','melt_sequence_settings'] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN CONTINUE; END IF;
    SELECT column_name INTO timestamp_column FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name IN ('updated_at','created_at')
      ORDER BY CASE column_name WHEN 'updated_at' THEN 0 ELSE 1 END LIMIT 1;
    IF timestamp_column IS NOT NULL THEN
      EXECUTE format('SELECT max(%I)::timestamptz FROM public.%I', timestamp_column, tbl) INTO latest;
      UPDATE public.dashboard_data_state SET last_updated_at = greatest(last_updated_at, latest) WHERE id = 1;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS dashboard_data_changed ON public.%I', tbl);
    EXECUTE format('CREATE TRIGGER dashboard_data_changed AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.record_dashboard_data_change()', tbl);
  END LOOP;
END;
$$;
COMMIT;
