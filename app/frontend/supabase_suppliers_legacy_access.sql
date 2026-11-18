-- Owner explicitly approved and deployed 2026-11-16 for employee testing.
-- Matches the current customers access model; run once on a new database only.
-- Legacy employee login is not Supabase Auth. These policies allow ANY holder
-- of the public API key to read/write suppliers, regardless of employee login.
-- Do not deploy without the owner's approval of that access scope.
BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.suppliers_supplier_seq_seq TO anon, authenticated;
CREATE POLICY suppliers_legacy_anon ON public.suppliers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY suppliers_legacy_authenticated ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMIT;
