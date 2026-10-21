BEGIN;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS order_date date, ADD COLUMN IF NOT EXISTS delivery_address text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS source_filename text NOT NULL DEFAULT '';
ALTER TABLE public.molding_batches ADD COLUMN IF NOT EXISTS work_order_item_id text;
ALTER TABLE public.shipment_orders ADD COLUMN IF NOT EXISTS work_order_item_id text;

CREATE OR REPLACE FUNCTION public.validate_work_order_items() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE item jsonb; qty numeric; weight numeric; used numeric; ids text[] := ARRAY[]::text[]; itemid text;
BEGIN
  IF jsonb_typeof(NEW.items) <> 'array' THEN RAISE EXCEPTION '品項資料必須為陣列'; END IF;
  IF jsonb_array_length(NEW.items)=0 THEN
    IF TG_OP='UPDATE' AND jsonb_array_length(OLD.items)>0 THEN RAISE EXCEPTION '不可清除多品項工單的全部品項'; END IF;
    RETURN NEW;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
    itemid := item->>'id';
    IF coalesce(itemid,'')='' OR itemid=ANY(ids) THEN RAISE EXCEPTION '品項識別碼缺漏或重複'; END IF;
    ids := array_append(ids,itemid);
    qty := (item->>'quantity')::numeric; weight := (item->>'estimated_weight')::numeric;
    IF qty IS NULL OR qty<=0 OR qty<>trunc(qty) OR qty>99999 OR weight IS NULL OR weight<0 OR weight>999999 OR coalesce(btrim(item->>'product_name'),'')='' OR coalesce(btrim(item->>'material'),'')='' THEN RAISE EXCEPTION '品項品名、材質、數量或單重無效'; END IF;
    SELECT coalesce(sum(quantity_planned),0) INTO used FROM public.molding_batches WHERE work_order_id=NEW.id AND coalesce(work_order_item_id,'legacy')=itemid;
    IF used>qty THEN RAISE EXCEPTION '品項數量不可小於已排產數量'; END IF;
    SELECT coalesce(sum(quantity),0) INTO used FROM public.shipment_orders WHERE work_order_id=NEW.id AND coalesce(work_order_item_id,'legacy')=itemid;
    IF used>qty THEN RAISE EXCEPTION '品項數量不可小於已建立出貨數量'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.molding_batches WHERE work_order_id=NEW.id AND NOT(coalesce(work_order_item_id,'legacy')=ANY(ids))) OR EXISTS(SELECT 1 FROM public.shipment_orders WHERE work_order_id=NEW.id AND NOT(coalesce(work_order_item_id,'legacy')=ANY(ids))) THEN RAISE EXCEPTION '不可移除已關聯造模或出貨的品項'; END IF;
  SELECT sum((value->>'quantity')::integer), string_agg(value->>'product_name','、'), string_agg(DISTINCT value->>'material','、'), sum((value->>'quantity')::numeric*(value->>'estimated_weight')::numeric)/sum((value->>'quantity')::numeric)
  INTO NEW.quantity,NEW.product_name,NEW.material,NEW.estimated_weight FROM jsonb_array_elements(NEW.items);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS validate_work_order_items ON public.work_orders;
CREATE TRIGGER validate_work_order_items BEFORE INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.validate_work_order_items();

CREATE OR REPLACE FUNCTION public.validate_order_item_allocation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE parent public.work_orders%ROWTYPE; item jsonb; limit_qty numeric; used numeric; requested numeric;
BEGIN
  IF NEW.work_order_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO parent FROM public.work_orders WHERE id=NEW.work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到關聯工單'; END IF;
  IF jsonb_array_length(parent.items)=0 THEN
    IF coalesce(NEW.work_order_item_id,'legacy')<>'legacy' THEN RAISE EXCEPTION '找不到工單品項'; END IF;
    limit_qty:=parent.quantity;
  ELSE
    IF coalesce(NEW.work_order_item_id,'')='' THEN
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(parent.items) WHERE value->>'id'='legacy') THEN NEW.work_order_item_id:='legacy';
      ELSIF jsonb_array_length(parent.items)=1 THEN NEW.work_order_item_id:=parent.items->0->>'id';
      ELSE RAISE EXCEPTION '請選擇工單品項'; END IF;
    END IF;
    SELECT value INTO item FROM jsonb_array_elements(parent.items) WHERE value->>'id'=NEW.work_order_item_id;
    IF item IS NULL THEN RAISE EXCEPTION '找不到工單品項'; END IF;
    limit_qty:=(item->>'quantity')::numeric;
  END IF;
  IF TG_TABLE_NAME='molding_batches' THEN
    requested:=NEW.quantity_planned;
    SELECT coalesce(sum(quantity_planned),0) INTO used FROM public.molding_batches WHERE work_order_id=NEW.work_order_id AND id<>NEW.id AND coalesce(work_order_item_id,'legacy')=coalesce(NEW.work_order_item_id,'legacy');
    IF NEW.quantity_completed<0 OR NEW.quantity_completed>requested THEN RAISE EXCEPTION '完成數量不可超過計劃數量'; END IF;
    IF item IS NOT NULL THEN NEW.product_name:=item->>'product_name'; NEW.material:=item->>'material'; END IF;
  ELSE
    requested:=NEW.quantity;
    SELECT coalesce(sum(quantity),0) INTO used FROM public.shipment_orders WHERE work_order_id=NEW.work_order_id AND id<>NEW.id AND coalesce(work_order_item_id,'legacy')=coalesce(NEW.work_order_item_id,'legacy');
  END IF;
  IF requested IS NULL OR requested<=0 OR used+requested>limit_qty THEN RAISE EXCEPTION '超過此品項可用數量'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS validate_order_item_allocation ON public.molding_batches;
CREATE TRIGGER validate_order_item_allocation BEFORE INSERT OR UPDATE ON public.molding_batches FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_allocation();
DROP TRIGGER IF EXISTS validate_order_item_allocation ON public.shipment_orders;
CREATE TRIGGER validate_order_item_allocation BEFORE INSERT OR UPDATE ON public.shipment_orders FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_allocation();
COMMIT;
