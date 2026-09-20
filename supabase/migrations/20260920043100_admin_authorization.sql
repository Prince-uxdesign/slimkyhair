-- ============================================================================
-- Slimky Hair — Admin Authorization Foundation (Phase A1)
--
-- THREAT MODEL THIS MIGRATION DEFENDS AGAINST
--   The browser is hostile. The admin dashboard is a static page served from
--   the same origin as the storefront; anyone can open it, read every line of
--   its JavaScript, and call the Supabase REST API directly with the public
--   anon key. Therefore:
--
--     * Admin identity is a real Supabase Auth user (server-issued, signed JWT).
--     * Admin PRIVILEGE is a row in public.profiles.role, readable but NOT
--       writable by the client (see prevent_client_role_change below).
--     * Every admin-visible table is gated by an RLS policy calling
--       public.is_admin(), so revoking a role in the database instantly revokes
--       data access regardless of what the browser believes or caches.
--     * The frontend route guard is a UX affordance ONLY. Deleting it would
--       expose an empty shell, never data.
--
-- ROLE ASSIGNMENT IS NOT A CLIENT OPERATION. Roles are granted by service_role
-- or by a database superuser (SQL editor / migration), never over PostgREST as
-- anon or authenticated — enforced by a trigger, not by convention.
-- ============================================================================

-- 1. Role vocabulary ---------------------------------------------------------
CREATE TYPE app_role AS ENUM ('customer', 'staff', 'admin');

-- 2. Profiles — the authorization record for every auth user -----------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  -- Default is deliberately the LEAST privileged role. A new signup can never
  -- arrive as staff/admin, and role is never derived from user metadata
  -- (raw_user_meta_data is client-supplied at sign-up time — untrusted).
  role app_role NOT NULL DEFAULT 'customer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- 3. Authorization predicates ------------------------------------------------
-- SECURITY DEFINER so that policies on `profiles` itself do not recurse when a
-- policy on another table asks "is the caller an admin?". search_path is
-- pinned so a caller cannot shadow `profiles` with a temp table.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'staff')
      AND is_active = true
  );
$$;

-- Single round-trip the admin shell calls to establish its own authority.
-- Returns the caller's own record only; it cannot be used to probe others.
CREATE OR REPLACE FUNCTION public.current_admin()
RETURNS TABLE (id UUID, email VARCHAR(255), full_name VARCHAR(255), role app_role)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.email, p.full_name, p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active = true
    AND p.role IN ('admin', 'staff');
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin()      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_staff()      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.current_admin() TO authenticated, service_role;

-- 4. Provision a least-privilege profile for every new auth user -------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    'customer'  -- hardcoded: never read a role out of client-supplied metadata
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 5. THE privilege-escalation barrier ---------------------------------------
-- RLS decides WHICH ROWS a client may touch; it cannot stop a client from
-- changing a column it is allowed to update. This trigger is what makes
-- `role` and `is_active` unwritable from a browser session: PostgREST connects
-- as `anon` or `authenticated`, and neither is permitted to move them.
-- Triggers fire for service_role too (RLS does not apply to it, triggers do),
-- so the allow-list below is the complete set of role-granting identities.
CREATE OR REPLACE FUNCTION public.prevent_client_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'customer' AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      RAISE EXCEPTION 'Privileged roles cannot be self-assigned (attempted by %)', current_user
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable' USING ERRCODE = '42501';
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'role/is_active may only be changed by a service-role or database administrator (attempted by %)', current_user
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_client_role_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_guard_role
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_client_role_change();

-- 6. Admin settings — real operational configuration, admin-only ------------
CREATE TABLE IF NOT EXISTS admin_settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  label VARCHAR(160) NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Admin audit log — append-only record of administrative activity --------
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64),
  target_id VARCHAR(128),
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);

-- 8. RLS: profiles -----------------------------------------------------------
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- A user sees their own profile. Nothing lets one customer read another's, and
-- nothing lets an anonymous visitor enumerate who the administrators are.
CREATE POLICY profiles_self_select ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_admin_select ON profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Self-service of display fields only; `role`/`is_active` are blocked by the
-- profiles_guard_role trigger regardless of what is submitted here.
CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No INSERT or DELETE policy: profiles are created solely by the SECURITY
-- DEFINER auth trigger and removed solely by auth.users cascade.

-- 9. RLS: admin settings + audit log ----------------------------------------
CREATE POLICY admin_settings_admin_select ON admin_settings
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_settings_admin_insert ON admin_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND updated_by = auth.uid());
CREATE POLICY admin_settings_admin_update ON admin_settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin() AND updated_by = auth.uid());
-- Deliberately no DELETE policy: settings keys are part of the app contract.

-- Append-only: admins may read the log and add entries attributed to
-- themselves, but no policy grants UPDATE or DELETE to any client role, so the
-- trail cannot be rewritten from the dashboard.
CREATE POLICY admin_audit_log_admin_select ON admin_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_audit_log_staff_insert ON admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_staff() AND actor_id = auth.uid());

-- 10. RLS: admin access to commerce tables ----------------------------------
-- Additive only. Not one customer/public policy from the core schema is
-- relaxed, replaced, or dropped; these sit alongside them as extra permissive
-- policies that require public.is_admin().

-- Customers & their data: admins read for support/fulfilment, and may update
-- account STATUS. No DELETE policy — customer erasure is a service-role
-- operation with legal implications, not a dashboard button.
CREATE POLICY customers_admin_select ON customers
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY customers_admin_update ON customers
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY addresses_admin_select ON customer_addresses
  FOR SELECT TO authenticated USING (public.is_admin());

-- Orders: read + update (status, quote, tracking). No INSERT (orders are
-- created by checkout, never hand-made in the backoffice) and no DELETE
-- (orders are financial records — cancel via order_status instead).
CREATE POLICY orders_admin_select ON orders
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY orders_admin_update ON orders
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Order items are an immutable snapshot of what was bought: read only.
CREATE POLICY order_items_admin_select ON order_items
  FOR SELECT TO authenticated USING (public.is_admin());

-- Payments are read-only to the dashboard. Money state transitions belong to
-- the payment provider webhook running with service_role, never to a browser.
CREATE POLICY payments_admin_select ON payments
  FOR SELECT TO authenticated USING (public.is_admin());

-- Inventory is the one place an admin legitimately writes stock.
CREATE POLICY inventory_admin_insert ON inventory
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY inventory_admin_update ON inventory
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY inventory_admin_delete ON inventory
  FOR DELETE TO authenticated USING (public.is_admin());

-- Wishlists carry customer preference data; admins may read for support only.
CREATE POLICY customer_wishlists_admin_select ON customer_wishlists
  FOR SELECT TO authenticated USING (public.is_admin());

-- Email log: previously service_role-only (deny-all). Admins get READ access
-- for deliverability triage. Still no client write path — sending and status
-- transitions stay inside the Edge Functions.
CREATE POLICY email_log_admin_select ON email_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- 11. Baseline operational settings -----------------------------------------
-- Real configuration defaults, not sample data. updated_by is NULL because
-- these were seeded by the migration rather than by an administrator.
INSERT INTO admin_settings (key, value, label, description) VALUES
  ('store_name',           '"Slimky Hair"'::jsonb,        'Store name',                'Name shown in the backoffice and on transactional email.'),
  ('base_currency',        '"NGN"'::jsonb,                'Base currency',             'Currency all order totals are stored in. Server constant — not surfaced in the browser settings UI (single-currency pipeline).'),
  ('low_stock_threshold',  '8'::jsonb,                    'Low stock threshold',       'Units at or below which a SKU is flagged as low stock. Mirrors the inventory writer default (LOW_STOCK_THRESHOLD).'),
  ('support_email',        '"care@slimkyhair.com"'::jsonb, 'Support email',           'Primary customer channel; matches transactional email templates.'),
  ('support_phone_display','"+234 816 910 4565"'::jsonb,  'Support phone (display)', 'Human-readable concierge number.'),
  ('whatsapp_number',      '"2348169104565"'::jsonb,      'WhatsApp number',         'International digits used to build wa.me links.'),
  ('support_hours',        '"Monday–Saturday, 9:00 AM–6:00 PM WAT"'::jsonb, 'Support hours', 'Concierge availability line.'),
  ('order_number_prefix',  '"SLM"'::jsonb,                'Order number prefix',       'Prefix applied to human-readable order numbers.')
ON CONFLICT (key) DO NOTHING;
