BEGIN;
DROP FUNCTION IF EXISTS public.save_raw_receipt_checked(uuid,jsonb,jsonb);
CREATE OR REPLACE FUNCTION public.save_raw_receipt_checked(p_id text,p_input jsonb,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE current_row public.raw_material_receipts; saved public.raw_material_receipts; prefix text; next_no integer; spec_value numeric; total numeric:=0;
BEGIN
 IF p_id IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
 IF coalesce(trim(p_input->>'raw_material'),'')='' OR coalesce(trim(p_input->>'supplier'),'')='' OR coalesce(p_input->>'receipt_date','')='' THEN RAISE EXCEPTION '原料、供應商與日期必填'; END IF;
 IF jsonb_typeof(p_input->'weight') IS DISTINCT FROM 'number' OR (p_input->>'weight')::numeric<=0
 OR jsonb_typeof(p_input->'unit_price') IS DISTINCT FROM 'number' OR (p_input->>'unit_price')::numeric<0 THEN RAISE EXCEPTION '重量須大於零，單價不可負值'; END IF;
 IF jsonb_typeof(p_input->'spec') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION '成分格式錯誤'; END IF;
 FOR spec_value IN SELECT (value #>> '{}')::numeric FROM jsonb_each(p_input->'spec') LOOP
  IF spec_value IS NULL OR spec_value<0 OR spec_value>100 OR spec_value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION '成分須介於0至100'; END IF;
  total:=total+spec_value;
 END LOOP;
 IF total>100.001 THEN RAISE EXCEPTION '成分合計不可超過100'; END IF;
 PERFORM pg_advisory_xact_lock(72928402);
 SELECT * INTO current_row FROM public.raw_material_receipts WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF to_jsonb(current_row) @> p_input THEN RETURN to_jsonb(current_row); END IF;
  IF p_expected IS NULL OR current_row.updated_at IS DISTINCT FROM (p_expected->>'updated_at')::timestamptz
  OR NOT ((to_jsonb(current_row)-ARRAY['created_at','updated_at']) @> (p_expected-ARRAY['created_at','updated_at'])) THEN RAISE EXCEPTION 'RECEIPT_CONFLICT'; END IF;
 ELSE
  IF p_expected IS NOT NULL THEN RAISE EXCEPTION 'RECEIPT_CONFLICT'; END IF;
 END IF;
 saved:=jsonb_populate_record(current_row,p_input);
 saved.id:=p_id; saved.updated_at:=clock_timestamp();
 IF current_row.id IS NULL THEN
  prefix:='RM-'||to_char(saved.receipt_date::date,'YYYYMMDD')||'-';
  SELECT coalesce(max(substring(receipt_no from '([0-9]+)$')::integer),0)+1 INTO next_no
   FROM public.raw_material_receipts WHERE receipt_no LIKE prefix||'%';
  saved.receipt_no:=prefix||lpad(next_no::text,greatest(3,length(next_no::text)),'0'); saved.created_at:=clock_timestamp();
  INSERT INTO public.raw_material_receipts SELECT saved.* RETURNING * INTO saved;
 ELSE
  UPDATE public.raw_material_receipts SET receipt_date=saved.receipt_date,raw_material=saved.raw_material,weight=saved.weight,unit_price=saved.unit_price,
   supplier=saved.supplier,supplier_id=saved.supplier_id,lot_no=saved.lot_no,spec=saved.spec,remark=saved.remark,created_by=saved.created_by,updated_at=saved.updated_at
   WHERE id=p_id RETURNING * INTO saved;
 END IF;
 IF saved.id IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'Receipt save not confirmed'; END IF;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.save_raw_receipt_checked(text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_raw_receipt_checked(text,jsonb,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
