-- Deployed 2026-11-16 to tprroinxufykbsfstfyf. Run once on a new database only.
-- Independent supplier directory; does not modify customers.
BEGIN;
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  supplier_no text GENERATED ALWAYS AS ('S-' || lpad(supplier_seq::text, greatest(6, length(supplier_seq::text)), '0')) STORED UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  short_name text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('原料供應商','耗材供應商','設備供應商','加工廠','熱處理廠','運輸商','貿易商','其他')),
  address text NOT NULL DEFAULT '',
  delivery_addresses jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(delivery_addresses) = 'array'),
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  contact1_name text NOT NULL CHECK (length(trim(contact1_name)) > 0),
  contact1_phone text NOT NULL CHECK (length(trim(contact1_phone)) > 0),
  contact2_name text NOT NULL DEFAULT '',
  contact2_phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '啟用' CHECK (status IN ('啟用','停用')),
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX suppliers_unique_name ON public.suppliers (lower(regexp_replace(normalize(name, NFKC), '\s+', '', 'g')));
CREATE UNIQUE INDEX suppliers_unique_short_name ON public.suppliers (lower(regexp_replace(normalize(short_name, NFKC), '\s+', '', 'g')))
  WHERE length(trim(short_name)) > 0;
CREATE FUNCTION public.suppliers_set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.suppliers_set_updated_at();
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.suppliers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.suppliers TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.suppliers_supplier_seq_seq TO service_role;
COMMIT;

-- Client access is intentionally configured separately after access review.
