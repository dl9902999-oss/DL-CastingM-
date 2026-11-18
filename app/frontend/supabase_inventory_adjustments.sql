BEGIN;
ALTER TABLE public.raw_material_receipts ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
 id uuid PRIMARY KEY,
 adjustment_date date NOT NULL,
 raw_material text NOT NULL CHECK(length(btrim(raw_material)) > 0),
 quantity_delta numeric(14,2) NOT NULL CHECK(quantity_delta <> 0 AND quantity_delta::text NOT IN ('NaN','Infinity','-Infinity')),
 reason text NOT NULL CHECK(length(btrim(reason)) > 0),
 created_by text NOT NULL CHECK(length(btrim(created_by)) > 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
-- Preserve the existing inventory access model; adjustments are append-only.
CREATE POLICY inventory_adjustments_read ON public.inventory_adjustments FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY inventory_adjustments_append ON public.inventory_adjustments FOR INSERT TO anon,authenticated WITH CHECK(true);
GRANT SELECT, INSERT ON public.inventory_adjustments TO anon,authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.inventory_adjustments FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.append_inventory_adjustment(p_row jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v public.inventory_adjustments; wanted public.inventory_adjustments;
BEGIN
 wanted.id := (p_row->>'id')::uuid;
 wanted.adjustment_date := (p_row->>'adjustment_date')::date;
 wanted.raw_material := btrim(p_row->>'raw_material');
 wanted.quantity_delta := (p_row->>'quantity_delta')::numeric;
 wanted.reason := btrim(p_row->>'reason');
 wanted.created_by := btrim(p_row->>'created_by');
 IF wanted.adjustment_date > (now() AT TIME ZONE 'Asia/Taipei')::date THEN RAISE EXCEPTION '不可登錄未來盤點'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(wanted.id::text,0));
 SELECT * INTO v FROM public.inventory_adjustments WHERE id=wanted.id;
 IF FOUND THEN
   IF (to_jsonb(v)-'created_at') IS DISTINCT FROM (to_jsonb(wanted)-'created_at') THEN RAISE EXCEPTION '此調整編號已使用，請重新讀取'; END IF;
   RETURN to_jsonb(v);
 END IF;
 INSERT INTO public.inventory_adjustments(id,adjustment_date,raw_material,quantity_delta,reason,created_by)
 VALUES(wanted.id,wanted.adjustment_date,wanted.raw_material,wanted.quantity_delta,wanted.reason,wanted.created_by) RETURNING * INTO v;
 RETURN to_jsonb(v);
END $$;
REVOKE ALL ON FUNCTION public.append_inventory_adjustment(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_inventory_adjustment(jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
