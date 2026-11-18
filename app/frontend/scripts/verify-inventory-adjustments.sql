BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE test_id uuid:=gen_random_uuid(); payload jsonb; a jsonb; b jsonb; failed boolean:=false;
BEGIN
payload:=jsonb_build_object('id',test_id,'adjustment_date','2026-11-01','raw_material','__ROLLBACK_TEST__','quantity_delta',12.50,'reason','rollback verification','created_by','test');
a:=public.append_inventory_adjustment(payload);
b:=public.append_inventory_adjustment(payload);
IF a IS DISTINCT FROM b OR (SELECT count(*) FROM public.inventory_adjustments WHERE id=test_id)<>1 THEN RAISE EXCEPTION 'retry duplicated'; END IF;
BEGIN PERFORM public.append_inventory_adjustment(payload||jsonb_build_object('quantity_delta',20)); EXCEPTION WHEN OTHERS THEN failed:=true; END;
IF NOT failed THEN RAISE EXCEPTION 'conflicting retry accepted'; END IF;
failed:=false;
BEGIN PERFORM public.append_inventory_adjustment(payload||jsonb_build_object('id',gen_random_uuid(),'quantity_delta',0)); EXCEPTION WHEN check_violation THEN failed:=true; END;
IF NOT failed THEN RAISE EXCEPTION 'zero adjustment accepted'; END IF;
PERFORM public.append_inventory_adjustment(payload||jsonb_build_object('id',gen_random_uuid(),'quantity_delta',-2.5));
IF (SELECT sum(quantity_delta) FROM public.inventory_adjustments WHERE raw_material='__ROLLBACK_TEST__')<>10 THEN RAISE EXCEPTION 'signed delta incorrect'; END IF;
IF has_table_privilege('anon','public.inventory_adjustments','DELETE') OR has_table_privilege('anon','public.inventory_adjustments','UPDATE') THEN RAISE EXCEPTION 'history must be append-only'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: signed adjustments, idempotent retry, conflicts, zero validation, append-only permissions; rolled back' AS verification;
