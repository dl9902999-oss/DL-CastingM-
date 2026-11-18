-- Staged migration; NOT deployed. Existing business-table policies are unchanged.
-- Run once after review. Existing table names cause failure rather than silently
-- retaining unexpected policies. Employee provisioning requires a trusted server.
BEGIN;
CREATE TABLE public.employee_memberships (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id text NOT NULL UNIQUE CHECK (employee_id ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  role text NOT NULL CHECK (role IN ('Admin','Production','QC','Warehouse')),
  permissions text[] NOT NULL DEFAULT '{}' CHECK (
    array_position(permissions, NULL) IS NULL AND
    permissions <@ ARRAY['/dashboard','/customers','/work-orders','/molding',
      '/melting-management','/quality','/warehouse','/shipment','/mold-management',
      '/traceability','/sync-history','/user-management','/sync-verify']::text[] AND
    (role = 'Admin' OR NOT (permissions && ARRAY['/user-management','/sync-verify']::text[]))
  ),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.employee_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_memberships TO service_role;
CREATE POLICY employee_read_own_active_membership
  ON public.employee_memberships FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()) AND enabled);
-- No client write policies, including for employees whose role is Admin.
-- Admin management must validate the actor on a trusted server before writing.
COMMIT;
