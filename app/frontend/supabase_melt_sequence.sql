BEGIN;
CREATE TABLE IF NOT EXISTS public.melt_sequence_settings (
  melt_id uuid PRIMARY KEY REFERENCES public.melt_records(id) ON DELETE CASCADE,
  furnace_body integer NOT NULL CHECK (furnace_body > 0),
  rebuild boolean NOT NULL DEFAULT false,
  anchor integer CHECK (anchor > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.melt_sequence_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS melt_sequence_parent_access ON public.melt_sequence_settings;
CREATE POLICY melt_sequence_parent_access ON public.melt_sequence_settings FOR ALL TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.melt_records r WHERE r.id=melt_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.melt_records r WHERE r.id=melt_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.melt_sequence_settings TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.melt_natural_key(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT string_agg(CASE WHEN part ~ '^[0-9]+$' THEN lpad(part, 40, '0') ELSE lower(part) END, '' ORDER BY ord)
 FROM regexp_matches(value, '[0-9]+|[^0-9]+', 'g') WITH ORDINALITY AS pieces(parts, ord), LATERAL (SELECT parts[1] AS part) p;
$$;
CREATE OR REPLACE VIEW public.melt_sequence_records WITH (security_invoker=true) AS
WITH base AS (
 SELECT r.*, COALESCE(s.furnace_body, NULLIF(substring(r.furnace_no FROM '^([0-9]+)'), '')::integer) AS furnace_body,
 COALESCE(s.rebuild,false) AS rebuild, s.anchor AS heat_anchor, s.updated_at AS sequence_updated_at,
 public.melt_natural_key(r.melt_no) AS sort_key
 FROM public.melt_records r LEFT JOIN public.melt_sequence_settings s ON s.melt_id=r.id
), cycles AS (
 SELECT *, sum(rebuild::integer) OVER (PARTITION BY furnace_body ORDER BY melt_date,sort_key,id) AS cycle_number,
 row_number() OVER (PARTITION BY furnace_body,melt_date ORDER BY sort_key,id) AS daily_sequence FROM base
), ranked AS (
 SELECT *, row_number() OVER (PARTITION BY furnace_body,cycle_number ORDER BY melt_date,sort_key,id) AS cycle_rank,
 first_value(id) OVER (PARTITION BY furnace_body,cycle_number ORDER BY melt_date,sort_key,id) AS cycle_id FROM cycles
)
SELECT r.*, (r.cycle_rank + COALESCE((SELECT a.heat_anchor-a.cycle_rank FROM ranked a
 WHERE a.furnace_body=r.furnace_body AND a.cycle_number=r.cycle_number AND a.heat_anchor IS NOT NULL
 ORDER BY a.sequence_updated_at DESC,a.id DESC LIMIT 1),0))::integer AS heat_sequence
FROM ranked r;
GRANT SELECT ON public.melt_sequence_records TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.save_melt_sequence_record(p_id uuid,p_record jsonb,p_body integer,p_rebuild boolean,p_anchor integer)
RETURNS SETOF public.melt_sequence_records LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v public.melt_records; prior jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(72928401);
 SELECT to_jsonb(r) INTO prior FROM public.melt_records r WHERE r.id=p_id FOR UPDATE;
 IF prior IS NULL THEN
  prior := jsonb_build_object('id',p_id,'created_at',now(),'total_charge_weight',0,'specific_energy',0);
 END IF;
 SELECT * INTO v FROM jsonb_populate_record(NULL::public.melt_records,prior || p_record || jsonb_build_object('id',p_id,'updated_at',now()));
 IF v.melt_no IS NULL OR trim(v.melt_no)='' OR p_body IS NULL OR p_body<1 THEN RAISE EXCEPTION '請填寫熔解編號與爐體'; END IF;
 IF EXISTS(SELECT 1 FROM public.melt_records WHERE melt_no=v.melt_no AND id<>p_id) THEN RAISE EXCEPTION '熔解編號已存在'; END IF;
 INSERT INTO public.melt_records SELECT v.* ON CONFLICT(id) DO UPDATE SET
 melt_no=excluded.melt_no,melt_date=excluded.melt_date,material_grade=excluded.material_grade,furnace_no=excluded.furnace_no,
 power_kwh=excluded.power_kwh,power_start_time=excluded.power_start_time,tap_time=excluded.tap_time,melt_minutes=excluded.melt_minutes,
 tap_temp=excluded.tap_temp,created_by=excluded.created_by,remark=excluded.remark,residual_weight=excluded.residual_weight,updated_at=excluded.updated_at;
 INSERT INTO public.melt_sequence_settings VALUES(p_id,p_body,p_rebuild,CASE WHEN p_rebuild THEN 1 ELSE p_anchor END,clock_timestamp())
 ON CONFLICT(melt_id) DO UPDATE SET furnace_body=excluded.furnace_body,rebuild=excluded.rebuild,anchor=excluded.anchor,
 updated_at=CASE WHEN (melt_sequence_settings.furnace_body,melt_sequence_settings.rebuild,melt_sequence_settings.anchor)
 IS DISTINCT FROM (excluded.furnace_body,excluded.rebuild,excluded.anchor) THEN excluded.updated_at ELSE melt_sequence_settings.updated_at END;
 IF EXISTS(SELECT 1 FROM public.melt_sequence_records WHERE heat_sequence<1 OR (cycle_number>0 AND heat_sequence<>cycle_rank)) THEN
 RAISE EXCEPTION '校正後爐次不可小於001，且已標記築爐的週期必須由001連續累計'; END IF;
 RETURN QUERY SELECT * FROM public.melt_sequence_records WHERE id=p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_melt_sequence_record(uuid,jsonb,integer,boolean,integer) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
