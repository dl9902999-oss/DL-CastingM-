BEGIN;
CREATE TABLE IF NOT EXISTS public.melt_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), melt_id uuid NOT NULL, melt_no text,
 action text NOT NULL, actor text NOT NULL, reason text, before_data jsonb, after_data jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.melt_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS melt_audit_read ON public.melt_audit_log;
CREATE POLICY melt_audit_read ON public.melt_audit_log FOR SELECT TO anon,authenticated USING(true);
GRANT SELECT ON public.melt_audit_log TO anon,authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.melt_audit_log FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.capture_melt_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b jsonb; a jsonb; mid uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN b:=to_jsonb(OLD); END IF;
 IF TG_TABLE_NAME='melt_records' AND TG_OP='DELETE' THEN b:=to_jsonb(OLD)||jsonb_build_object('archived_bundle',public.read_melt_bundle(OLD.id)); END IF;
 IF TG_OP<>'DELETE' THEN a:=to_jsonb(NEW); END IF;
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW; END IF;
 mid:=CASE WHEN TG_TABLE_NAME='melt_records' THEN coalesce(a,b)->>'id' ELSE coalesce(a,b)->>'melt_id' END;
 INSERT INTO public.melt_audit_log(melt_id,melt_no,action,actor,reason,before_data,after_data)
 VALUES(mid,coalesce(a->>'melt_no',b->>'melt_no',(SELECT melt_no FROM public.melt_records WHERE id=mid)),
 TG_TABLE_NAME||':'||TG_OP,coalesce(nullif(current_setting('app.melt_actor',true),''),'未提供登入者（舊版或直接寫入）'),
 nullif(current_setting('app.melt_reason',true),''),b,a);
 RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.capture_melt_audit() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['melt_records','melt_materials','melt_chemistries','melt_pourings'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS capture_melt_audit ON public.%I',t);
 EXECUTE format('CREATE TRIGGER capture_melt_audit %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_melt_audit()',CASE WHEN t='melt_records' THEN 'BEFORE INSERT OR UPDATE OR DELETE' ELSE 'AFTER INSERT OR UPDATE OR DELETE' END,t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.void_melt_checked(p_id uuid,p_expected jsonb,p_actor text,p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE b jsonb;
BEGIN
 IF length(btrim(coalesce(p_reason,'')))=0 OR length(btrim(coalesce(p_actor,'')))=0 THEN RAISE EXCEPTION '作廢原因及操作人必填'; END IF;
 LOCK TABLE public.melt_pourings IN SHARE ROW EXCLUSIVE MODE;
 PERFORM pg_advisory_xact_lock(72928401);
 LOCK TABLE public.melt_materials,public.melt_chemistries IN SHARE ROW EXCLUSIVE MODE;
 PERFORM 1 FROM public.melt_records WHERE id=p_id FOR UPDATE;
 b:=public.read_melt_bundle(p_id);
 IF b IS NULL OR b IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'MELT_CONFLICT: 資料已變動，請重新讀取後作廢'; END IF;
 IF jsonb_array_length(b->'pourings')>0 THEN RAISE EXCEPTION '已有澆注關聯，請先確認並解除關聯後再作廢'; END IF;
 PERFORM set_config('app.melt_actor',p_actor,true);
 PERFORM set_config('app.melt_reason','作廢：'||p_reason,true);
 -- Archive a complete snapshot in the protected history through the parent trigger.
 UPDATE public.melt_records SET remark=coalesce(remark,'') WHERE id=p_id;
 DELETE FROM public.melt_records WHERE id=p_id;
 IF FOUND THEN RETURN true; END IF;
 RAISE EXCEPTION '作廢未生效';
END $$;
REVOKE ALL ON FUNCTION public.void_melt_checked(uuid,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_melt_checked(uuid,jsonb,text,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.inventory_book_weight(p_material text,p_date date) RETURNS numeric
LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT round(coalesce((SELECT sum(weight) FROM public.raw_material_receipts WHERE btrim(raw_material)=btrim(p_material) AND receipt_date<=p_date),0)
 -coalesce((SELECT sum(m.charge_weight+m.secondary_weight) FROM public.melt_materials m JOIN public.melt_records r ON r.id=m.melt_id WHERE btrim(m.raw_material)=btrim(p_material) AND r.melt_date<=p_date),0)
 +coalesce((SELECT sum(quantity_delta) FROM public.inventory_adjustments WHERE btrim(raw_material)=btrim(p_material) AND adjustment_date<=p_date),0),2);
$$;
CREATE OR REPLACE FUNCTION public.save_inventory_count(p_id uuid,p_material text,p_date date,p_actual numeric,p_expected numeric,p_reason text,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE book numeric; existing public.inventory_adjustments; note text;
BEGIN
 IF p_actual IS NULL OR p_actual<0 OR p_actual::text IN ('NaN','Infinity','-Infinity') OR p_expected IS NULL OR p_expected::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION '盤點重量須為有效非負數'; END IF;
 IF p_date IS NULL OR p_date>(now() AT TIME ZONE 'Asia/Taipei')::date OR length(btrim(coalesce(p_reason,'')))=0 OR length(btrim(coalesce(p_actor,'')))=0 OR length(btrim(coalesce(p_material,'')))=0 THEN RAISE EXCEPTION '盤點日期、原料、原因及登錄人必填'; END IF;
 IF p_material LIKE '%殘湯%' THEN RAISE EXCEPTION '殘湯不列入固態盤點'; END IF;
 LOCK TABLE public.melt_pourings IN SHARE ROW EXCLUSIVE MODE;
 PERFORM pg_advisory_xact_lock(72928401);
 PERFORM pg_advisory_xact_lock(72928402);
 LOCK TABLE public.melt_materials,public.raw_material_receipts,public.melt_records,public.inventory_adjustments IN SHARE ROW EXCLUSIVE MODE;
 note:=btrim(p_reason)||format(' [帳面 %s kg；實盤 %s kg]',round(p_expected,2),round(p_actual,2));
 SELECT * INTO existing FROM public.inventory_adjustments WHERE id=p_id;
 IF FOUND THEN
 IF existing.raw_material<>btrim(p_material) OR existing.adjustment_date<>p_date OR existing.quantity_delta<>round(p_actual-p_expected,2) OR existing.reason<>note OR existing.created_by<>btrim(p_actor) THEN RAISE EXCEPTION '盤點請求內容已變動'; END IF;
 RETURN to_jsonb(existing);
 END IF;
 book:=public.inventory_book_weight(p_material,p_date);
 IF book<>round(p_expected,2) THEN RAISE EXCEPTION 'INVENTORY_CONFLICT: 帳面庫存已變更，請重新讀取並確認差額'; END IF;
 IF round(p_actual-book,2)=0 THEN RETURN jsonb_build_object('id',p_id,'unchanged',true); END IF;
 RETURN public.append_inventory_adjustment(jsonb_build_object('id',p_id,'adjustment_date',p_date,'raw_material',btrim(p_material),'quantity_delta',round(p_actual-book,2),'reason',note,'created_by',btrim(p_actor)));
END $$;
REVOKE ALL ON FUNCTION public.inventory_book_weight(text,date),public.save_inventory_count(uuid,text,date,numeric,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_book_weight(text,date),public.save_inventory_count(uuid,text,date,numeric,numeric,text,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
