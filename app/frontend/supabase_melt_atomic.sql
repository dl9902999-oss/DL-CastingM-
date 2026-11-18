-- Atomic melt editing. SECURITY INVOKER preserves existing table/RLS permissions.
BEGIN;
ALTER TABLE public.melt_records ADD COLUMN IF NOT EXISTS target_range jsonb;

CREATE OR REPLACE FUNCTION public.read_melt_bundle(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'record',to_jsonb(r),
  'materials',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.melt_materials m WHERE melt_id=p_id),'[]'::jsonb),
  'chemistry',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.melt_chemistries c WHERE melt_id=p_id),'[]'::jsonb),
  'pourings',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.melt_pourings p WHERE melt_id=p_id),'[]'::jsonb),
  'target_range',(SELECT target_range FROM public.melt_records WHERE id=p_id)
 ) FROM public.melt_sequence_records r WHERE r.id=p_id;
$$;

CREATE OR REPLACE FUNCTION public.save_melt_bundle(
 p_id uuid, p_record jsonb, p_body integer, p_rebuild boolean, p_anchor integer,
 p_expected jsonb, p_materials jsonb, p_chemistry jsonb, p_target_range jsonb, p_pourings jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE current_bundle jsonb; row_data jsonb; total numeric; power numeric; result jsonb; field text; value numeric; chem_total numeric;
BEGIN
 IF p_id IS NULL OR jsonb_typeof(p_record) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_materials) IS DISTINCT FROM 'array' OR jsonb_typeof(p_chemistry) IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_pourings) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid melt bundle'; END IF;
 IF coalesce(p_record->>'melt_date','')='' OR coalesce(trim(p_record->>'material_grade'),'')='' THEN RAISE EXCEPTION '請填寫日期與材質'; END IF;
 IF coalesce(p_record->>'furnace_no','') !~ '^[1-3]-[1-9][0-9]*$' OR split_part(p_record->>'furnace_no','-',1)::integer IS DISTINCT FROM p_body THEN RAISE EXCEPTION '爐號與爐體不一致'; END IF;
 IF coalesce(p_record->>'power_start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
 OR coalesce(p_record->>'tap_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
 OR left(p_record->>'power_start_time',5)=left(p_record->>'tap_time',5) THEN RAISE EXCEPTION '開始送電與出湯時間必填且不可相同'; END IF;
 FOREACH field IN ARRAY ARRAY['power_kwh','tap_temp','residual_weight'] LOOP
  IF jsonb_typeof(p_record->field) IS DISTINCT FROM 'number' OR (p_record->>field)::numeric<0 THEN RAISE EXCEPTION '耗電、溫度與殘湯須為非負數'; END IF;
 END LOOP;
 FOR row_data IN SELECT e.value FROM jsonb_array_elements(p_chemistry) AS e LOOP
  chem_total:=0;
  FOREACH field IN ARRAY ARRAY['C','Si','Mn','P','S','Ni','Cr','Mo','Cu','Fe'] LOOP
   IF jsonb_typeof(row_data->field) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '成分須為有效數值'; END IF;
   value:=(row_data->>field)::numeric;
   IF value<0 OR value>100 THEN RAISE EXCEPTION '成分須介於0至100'; END IF;
   chem_total:=chem_total+value;
  END LOOP;
  IF row_data->>'sample_stage'<>'TARGET' AND chem_total>100.01 THEN RAISE EXCEPTION '實測成分合計不可超過100'; END IF;
 END LOOP;
 IF p_target_range IS NOT NULL THEN
  FOR field,value IN SELECT key, (val #>> '{}')::numeric FROM jsonb_each(p_target_range) AS e(key,val) LOOP
   IF value IS NULL OR value<0 OR value>100 THEN RAISE EXCEPTION '目標成分須介於0至100'; END IF;
   IF right(field,4)='_min' AND coalesce((p_target_range->>replace(field,'_min','_max'))::numeric,0)>0
   AND value>(p_target_range->>replace(field,'_min','_max'))::numeric THEN RAISE EXCEPTION '目標下限不可大於上限'; END IF;
  END LOOP;
 END IF;
 -- Same lock ordering as the existing pouring RPC; block legacy child writers
 -- while verifying the snapshot and replacing its children.
 LOCK TABLE public.melt_pourings IN SHARE ROW EXCLUSIVE MODE;
 PERFORM pg_advisory_xact_lock(72928401);
 LOCK TABLE public.melt_materials, public.melt_chemistries IN SHARE ROW EXCLUSIVE MODE;
 PERFORM 1 FROM public.melt_records WHERE id=p_id FOR UPDATE;
 current_bundle := public.read_melt_bundle(p_id);
 -- Derived totals can be refreshed independently; all editable content must match.
 IF (current_bundle - 'record') IS DISTINCT FROM (p_expected - 'record') OR
 ((current_bundle->'record') - ARRAY['updated_at','total_charge_weight','specific_energy']) IS DISTINCT FROM
 ((p_expected->'record') - ARRAY['updated_at','total_charge_weight','specific_energy']) THEN
  RAISE EXCEPTION 'MELT_CONFLICT: 此熔解紀錄已被修改，請重新載入核對';
 END IF;
 PERFORM set_config('app.melt_actor',coalesce(nullif(p_record->>'_audit_actor',''),'未提供登入者'),true);
 PERFORM public.save_melt_sequence_record(p_id,p_record-'_audit_actor',p_body,p_rebuild,p_anchor);
 DELETE FROM public.melt_materials WHERE melt_id=p_id;
 DELETE FROM public.melt_chemistries WHERE melt_id=p_id;
 IF EXISTS(SELECT 1 FROM public.melt_materials WHERE melt_id=p_id) OR EXISTS(SELECT 1 FROM public.melt_chemistries WHERE melt_id=p_id) THEN
  RAISE EXCEPTION '舊明細刪除未生效';
 END IF;
 FOR row_data IN SELECT e.value FROM jsonb_array_elements(p_materials) AS e LOOP
  IF coalesce(trim(row_data->>'raw_material'),'')='' OR jsonb_typeof(row_data->'charge_weight') IS DISTINCT FROM 'number'
  OR jsonb_typeof(row_data->'secondary_weight') IS DISTINCT FROM 'number'
  OR (row_data->>'charge_weight')::numeric<0 OR (row_data->>'secondary_weight')::numeric<0 THEN RAISE EXCEPTION 'Invalid material'; END IF;
  INSERT INTO public.melt_materials(melt_id,raw_material,charge_weight,secondary_weight,subtotal)
  VALUES(p_id,row_data->>'raw_material',(row_data->>'charge_weight')::numeric,(row_data->>'secondary_weight')::numeric,
   (row_data->>'charge_weight')::numeric+(row_data->>'secondary_weight')::numeric);
 END LOOP;
 FOR row_data IN SELECT e.value FROM jsonb_array_elements(p_chemistry) AS e LOOP
  INSERT INTO public.melt_chemistries(melt_id,sample_stage,c_val,si_val,mn_val,p_val,s_val,ni_val,cr_val,mo_val,cu_val,fe_val)
  VALUES(p_id,row_data->>'sample_stage',(row_data->>'C')::numeric,(row_data->>'Si')::numeric,(row_data->>'Mn')::numeric,
  (row_data->>'P')::numeric,(row_data->>'S')::numeric,(row_data->>'Ni')::numeric,(row_data->>'Cr')::numeric,
  (row_data->>'Mo')::numeric,(row_data->>'Cu')::numeric,(row_data->>'Fe')::numeric);
 END LOOP;
 IF p_target_range IS NOT NULL AND jsonb_typeof(p_target_range) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid target range'; END IF;
 UPDATE public.melt_records SET target_range=p_target_range WHERE id=p_id;
 PERFORM public.save_melt_pourings_checked(p_id,coalesce(p_expected->'pourings','[]'::jsonb),p_pourings,false);
 SELECT coalesce(sum(charge_weight+secondary_weight),0) INTO total FROM public.melt_materials WHERE melt_id=p_id;
 SELECT power_kwh INTO STRICT power FROM public.melt_records WHERE id=p_id;
 UPDATE public.melt_records SET total_charge_weight=total,specific_energy=CASE WHEN total>0 THEN round(power/total,3) ELSE 0 END WHERE id=p_id;
 result := public.read_melt_bundle(p_id);
 IF result IS NULL OR jsonb_array_length(result->'materials')<>jsonb_array_length(p_materials)
 OR jsonb_array_length(result->'chemistry')<>jsonb_array_length(p_chemistry) THEN RAISE EXCEPTION 'Melt verification failed'; END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.read_melt_bundle(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_melt_bundle(uuid,jsonb,integer,boolean,integer,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_melt_bundle(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_melt_bundle(uuid,jsonb,integer,boolean,integer,jsonb,jsonb,jsonb,jsonb,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
