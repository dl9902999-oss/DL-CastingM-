-- 待部署：先於隔離資料庫驗證，再由管理員套用。此檔不會自動執行。
-- SECURITY INVOKER 保留既有表授權與 RLS，不提供繞過權限的能力。
BEGIN;
CREATE OR REPLACE FUNCTION public.save_melt_pourings_checked(
 p_melt_id uuid, p_expected jsonb, p_rows jsonb, p_check_only boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE current_rows jsonb; desired_rows jsonb; r jsonb; total numeric; filled integer;
BEGIN
 IF p_check_only THEN RETURN '[]'::jsonb; END IF;
 IF p_melt_id IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'array' OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid pouring request'; END IF;
 -- Serialize with direct inserts/updates/deletes as well as this function.
 LOCK TABLE public.melt_pourings IN SHARE ROW EXCLUSIVE MODE;
 PERFORM 1 FROM public.melt_records WHERE id=p_melt_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Melt missing or inaccessible'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) INTO current_rows FROM public.melt_pourings p WHERE melt_id=p_melt_id;
 IF current_rows IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'POURING_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) AS input_row(value) GROUP BY input_row.value->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate pouring ID'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF (r->>'melt_id')::uuid IS DISTINCT FROM p_melt_id OR (r->>'id') IS NULL OR (r->>'batch_id') IS NULL THEN RAISE EXCEPTION 'Invalid identity'; END IF;
  IF EXISTS(SELECT 1 FROM public.melt_pourings WHERE id=(r->>'id')::uuid AND melt_id IS DISTINCT FROM p_melt_id) THEN RAISE EXCEPTION 'ID belongs to another melt'; END IF;
  PERFORM 1 FROM public.molding_batches WHERE id::text=r->>'batch_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch missing or inaccessible'; END IF;
  IF jsonb_typeof(r->'quantity') IS DISTINCT FROM 'number' OR (r->>'quantity')::numeric<=0 OR (r->>'quantity')::numeric<>trunc((r->>'quantity')::numeric) OR jsonb_typeof(r->'pouring_weights') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  IF jsonb_array_length(r->'pouring_weights')<>(r->>'quantity')::integer THEN RAISE EXCEPTION 'Weight count mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'pouring_weights') w WHERE jsonb_typeof(w)<>'number' OR (w::text)::numeric<0) THEN RAISE EXCEPTION 'Invalid weight'; END IF;
  IF jsonb_typeof(r->'estimated_weight') IS DISTINCT FROM 'number' OR jsonb_typeof(r->'estimated_pouring_weight') IS DISTINCT FROM 'number' OR (r->>'estimated_weight')::numeric<0 OR (r->>'estimated_pouring_weight')::numeric<0 THEN RAISE EXCEPTION 'Invalid estimate'; END IF;
 END LOOP;
 DELETE FROM public.melt_pourings WHERE melt_id=p_melt_id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) AS input_row(value) WHERE (input_row.value->>'id')::uuid=melt_pourings.id);
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  SELECT coalesce(sum((w::text)::numeric),0),count(*) FILTER(WHERE (w::text)::numeric>0) INTO total,filled FROM jsonb_array_elements(r->'pouring_weights') w;
  INSERT INTO public.melt_pourings(id,melt_id,batch_id,batch_no,customer,product_name,material,quantity,estimated_weight,estimated_pouring_weight,pouring_weights,total_pouring_weight,avg_pouring_weight)
  VALUES((r->>'id')::uuid,p_melt_id,r->>'batch_id',r->>'batch_no',r->>'customer',r->>'product_name',r->>'material',(r->>'quantity')::integer,(r->>'estimated_weight')::numeric,(r->>'estimated_pouring_weight')::numeric,ARRAY(SELECT (w::text)::numeric FROM jsonb_array_elements(r->'pouring_weights') w),total,CASE WHEN filled>0 THEN total/filled ELSE 0 END)
  ON CONFLICT(id) DO UPDATE SET batch_id=excluded.batch_id,batch_no=excluded.batch_no,customer=excluded.customer,product_name=excluded.product_name,material=excluded.material,quantity=excluded.quantity,estimated_weight=excluded.estimated_weight,estimated_pouring_weight=excluded.estimated_pouring_weight,pouring_weights=excluded.pouring_weights,total_pouring_weight=excluded.total_pouring_weight,avg_pouring_weight=excluded.avg_pouring_weight;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) INTO desired_rows FROM public.melt_pourings p WHERE melt_id=p_melt_id;
 IF jsonb_array_length(desired_rows)<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Pouring save verification failed'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) expected WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(desired_rows) saved WHERE (saved - 'created_at' - 'updated_at' - 'total_pouring_weight' - 'avg_pouring_weight') @> (expected - 'total_pouring_weight' - 'avg_pouring_weight'))) THEN RAISE EXCEPTION 'Pouring rows were not applied'; END IF;
 RETURN desired_rows;
END; $$;
REVOKE ALL ON FUNCTION public.save_melt_pourings_checked(uuid,jsonb,jsonb,boolean) FROM PUBLIC;
-- 與現有應用匿名連線相容；不是身份驗證修正。登入/RLS 仍須另行遷移。
GRANT EXECUTE ON FUNCTION public.save_melt_pourings_checked(uuid,jsonb,jsonb,boolean) TO anon, authenticated;
COMMIT;

