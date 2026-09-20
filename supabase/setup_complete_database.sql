-- ============================================================================
-- Slimky Hair — Complete Database Initialization Script for Supabase
-- Run this in Supabase SQL Editor to set up all tables, enums, triggers, and RLS.
-- ============================================================================

-- ============================================================================
-- 1. TRANSACTIONAL EMAIL NOTIFICATIONS & IDEMPOTENCY LOG
-- ============================================================================
-- ============================================================================
-- Slimky Hair — Transactional Email Notifications (Milestone C20.9)
-- Idempotency log + audit trail for all Resend-dispatched emails.
--
-- Sending happens exclusively in Supabase Edge Functions (see supabase/functions/).
-- This table never stores the Resend API key or any email body secrets — it only
-- records enough metadata to prevent duplicate sends and support retries.
-- ============================================================================

CREATE TYPE email_type AS ENUM (
  'registration_confirmation',
  'email_verification',
  'password_reset',
  'email_change_confirmation',
  'order_confirmation',
  'shipping_quote',
  'shipping_payment_required',
  'shipping_payment_confirmed',
  'order_shipped',
  'order_delivered'
);

CREATE TYPE email_status AS ENUM ('pending', 'sent', 'failed');

-- 1. Email Log Table (idempotency ledger + retry queue)
CREATE TABLE IF NOT EXISTS email_log (
  id BIGSERIAL PRIMARY KEY,

  -- Uniqueness on this key is what prevents duplicate sends caused by
  -- refresh, payment retries, webhook retries, or duplicate events.
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,

  email_type email_type NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,

  -- Nullable, no FK constraint: orders currently live client-side (localStorage)
  -- during this milestone, so order_id is a soft reference for filtering/audit
  -- only. Add `REFERENCES orders(id)` once orders are persisted server-side.
  order_id VARCHAR(64),

  provider VARCHAR(32) NOT NULL DEFAULT 'resend',
  provider_message_id VARCHAR(255),

  status email_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  -- Minimal data needed to re-render the email on retry. Must never contain
  -- secrets (API keys, passwords, tokens beyond what the email itself reveals).
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status);
CREATE INDEX IF NOT EXISTS idx_email_log_order_id ON email_log(order_id);
CREATE INDEX IF NOT EXISTS idx_email_log_email_type ON email_log(email_type);
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log(created_at DESC);

-- 2. Atomic status-transition helpers (used by Edge Functions via .rpc())
CREATE OR REPLACE FUNCTION mark_email_log_sent(p_id BIGINT, p_provider_message_id TEXT)
RETURNS VOID
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE email_log
  SET status = 'sent',
      provider_message_id = p_provider_message_id,
      sent_at = NOW(),
      attempts = attempts + 1,
      updated_at = NOW()
  WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION mark_email_log_failed(p_id BIGINT, p_error TEXT)
RETURNS VOID
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE email_log
  SET status = 'failed',
      last_error = p_error,
      attempts = attempts + 1,
      updated_at = NOW()
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION mark_email_log_sent(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mark_email_log_failed(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_email_log_sent(BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION mark_email_log_failed(BIGINT, TEXT) TO service_role;

-- 3. Row Level Security — deny-all by default.
-- Only the service role (used exclusively inside Edge Functions) may read or
-- write this table. No policies are defined for `anon` or `authenticated`,
-- so RLS blocks them entirely while service_role bypasses RLS as usual.
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 2. CORE COMMERCE SCHEMA (CUSTOMERS, INVENTORY, ORDERS, PAYMENTS, WISHLISTS)
-- ============================================================================
-- ============================================================================
-- Slimky Hair — Core Commerce Schema (consolidated baseline)
--
-- This is the faithful, applied form of database/schema.sql (milestones
-- C10–C20), consolidated so a fresh project can be provisioned in one pass:
-- enum values that schema.sql appended with `ALTER TYPE ... ADD VALUE` are
-- declared inline here, and the columns added by the C20.10 Nigeria shipping
-- parity block are part of the base table definitions.
--
-- Admin/role authorization and admin-side RLS live in the NEXT migration
-- (20260920043100_admin_authorization.sql). This file deliberately contains
-- only customer/public access, exactly as it did before, so that the admin
-- foundation is a reviewable addition rather than a rewrite.
-- ============================================================================

-- 1. Custom Enum Types -------------------------------------------------------
CREATE TYPE order_status AS ENUM (
  'draft',
  'pending_payment',
  'paid',
  'shipping_quote_required',
  'shipping_quote_sent',
  'shipping_payment_pending',
  'shipping_payment_confirmed', -- C20.10: shipping fee verified, not yet dispatched
  'ready_for_dispatch',
  'shipped',
  'delivered',
  'payment_failed',
  'cancelled'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'successful',
  'failed',
  'declined',
  'cancelled',
  'refunded'
);

CREATE TYPE shipping_flow AS ENUM (
  'nigeria_checkout',
  'international_checkout'
);

CREATE TYPE customer_status AS ENUM (
  'guest',
  'registered',
  'pending_confirmation',
  'active',
  'suspended'
);

-- 2. Registered Customers ----------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(64),
  status customer_status NOT NULL DEFAULT 'active',
  default_shipping_address_id BIGINT,
  default_shipping_address JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id BIGSERIAL PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label VARCHAR(64) NOT NULL DEFAULT 'Home',
  recipient_name VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  street_address TEXT NOT NULL,
  city VARCHAR(128) NOT NULL,
  state VARCHAR(128) NOT NULL,
  postal_code VARCHAR(32),
  country VARCHAR(128) NOT NULL DEFAULT 'Nigeria',
  delivery_instructions TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customers
  ADD CONSTRAINT fk_customers_default_address
  FOREIGN KEY (default_shipping_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL;

-- 3. SKU / Variant-Level Inventory ------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  sku VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  variant_id VARCHAR(64),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  availability VARCHAR(32) NOT NULL DEFAULT 'In Stock',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Orders ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  order_number VARCHAR(64) NOT NULL UNIQUE,
  checkout_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
  is_guest BOOLEAN NOT NULL DEFAULT true,
  security_token VARCHAR(64) NOT NULL,
  flow shipping_flow NOT NULL DEFAULT 'nigeria_checkout',

  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(64) NOT NULL,

  country VARCHAR(128) NOT NULL,
  state VARCHAR(128) NOT NULL,
  city VARCHAR(128) NOT NULL,
  postal_code VARCHAR(32),
  street_address TEXT NOT NULL,
  delivery_instructions TEXT,

  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  shipping_status VARCHAR(64) NOT NULL,
  shipping_amount NUMERIC(12, 2) DEFAULT NULL,
  shipping_fee NUMERIC(12, 2) DEFAULT NULL,
  product_payment_total NUMERIC(12, 2) NOT NULL CHECK (product_payment_total >= 0),
  total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_paid >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'NGN',

  order_status order_status NOT NULL DEFAULT 'pending_payment',
  payment_status payment_status NOT NULL DEFAULT 'pending',

  latest_payment_id VARCHAR(64),

  -- C20.10 shipping workflow payloads
  shipping_quote JSONB DEFAULT NULL,
  shipping_payment JSONB DEFAULT NULL,
  shipping_details JSONB DEFAULT NULL, -- legacy Nigeria-only entry, superseded by shipping_quote
  tracking JSONB DEFAULT NULL,
  shipping_payment_id VARCHAR(64),
  shipping_payment_status payment_status DEFAULT NULL,

  history JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Order Items (immutable snapshot of purchased catalog items) -------------
CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(64) NOT NULL,
  variant_id VARCHAR(64),
  sku VARCHAR(64) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  variant_name VARCHAR(128),
  product_image TEXT,
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_subtotal NUMERIC(12, 2) NOT NULL CHECK (line_subtotal >= 0),
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Payments (ZERO card data / CVVs stored) --------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider VARCHAR(64) NOT NULL,
  provider_reference VARCHAR(128) NOT NULL UNIQUE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
  payment_method VARCHAR(64) NOT NULL DEFAULT 'demo_card',
  status payment_status NOT NULL DEFAULT 'pending',
  -- 'product' = original product payment, 'shipping' = separate shipping-fee
  -- payment charged after a quote is accepted. Never combined into one total.
  purpose VARCHAR(16) NOT NULL DEFAULT 'product' CHECK (purpose IN ('product', 'shipping')),
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(64),
  failure_reason TEXT,
  verified_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_latest_payment
  FOREIGN KEY (latest_payment_id) REFERENCES payments(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_shipping_payment
  FOREIGN KEY (shipping_payment_id) REFERENCES payments(id) ON DELETE SET NULL;

-- 7. Customer Wishlists ------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_wishlists (
  id BIGSERIAL PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id VARCHAR(64) NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, product_id)
);

-- 8. Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id ON customers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_is_default ON customer_addresses(is_default);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_security_token ON orders(security_token);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_payment_id ON orders(shipping_payment_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider_reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_purpose ON payments(purpose);
CREATE INDEX IF NOT EXISTS idx_customer_wishlists_customer_id ON customer_wishlists(customer_id);

-- 9. Atomic Inventory Deduction Procedure -----------------------------------
-- search_path is pinned: a SECURITY INVOKER function with a mutable search_path
-- is a privilege-escalation vector once SECURITY DEFINER callers exist.
CREATE OR REPLACE FUNCTION public.deduct_order_inventory(p_order_id VARCHAR(64))
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT sku, quantity FROM order_items WHERE order_id = p_order_id LOOP
    IF NOT EXISTS (
      SELECT 1 FROM inventory WHERE sku = r.sku AND stock >= r.quantity
    ) THEN
      RAISE EXCEPTION 'Insufficient stock for SKU % in order %', r.sku, p_order_id;
    END IF;
  END LOOP;

  FOR r IN SELECT sku, quantity FROM order_items WHERE order_id = p_order_id LOOP
    UPDATE inventory
    SET stock = stock - r.quantity,
        availability = CASE WHEN (stock - r.quantity) = 0 THEN 'Out of Stock' ELSE 'In Stock' END,
        updated_at = NOW()
    WHERE sku = r.sku;
  END LOOP;

  RETURN TRUE;
END;
$$;

-- 10. Row Level Security — CUSTOMER + PUBLIC access only ---------------------
-- Every table is RLS-enabled and deny-by-default: any operation without a
-- matching policy below is refused for anon and authenticated roles.
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_wishlists  ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_self_select ON customers
  FOR SELECT
  USING (
    auth.uid() = auth_user_id
    OR id = current_setting('request.jwt.claim.sub', true)
    OR email = current_setting('request.jwt.claim.email', true)
  );

CREATE POLICY customers_self_update ON customers
  FOR UPDATE
  USING (
    auth.uid() = auth_user_id
    OR id = current_setting('request.jwt.claim.sub', true)
  );

CREATE POLICY addresses_customer_all ON customer_addresses
  FOR ALL
  USING (
    customer_id IN (
      SELECT id FROM customers
      WHERE auth_user_id = auth.uid()
         OR id = current_setting('request.jwt.claim.sub', true)
    )
  );

-- No blanket authenticated-role access: every row must be scoped to the
-- caller's own customer_id or a guest security token, otherwise any signed-in
-- user could read every customer's orders.
CREATE POLICY orders_customer_select ON orders
  FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM customers
      WHERE auth_user_id = auth.uid()
         OR id = current_setting('request.jwt.claim.sub', true)
    )
    OR (is_guest = true AND security_token = current_setting('request.header.order-token', true))
  );

CREATE POLICY order_items_customer_select ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (
        orders.customer_id IN (
          SELECT id FROM customers
          WHERE auth_user_id = auth.uid()
             OR id = current_setting('request.jwt.claim.sub', true)
        )
        OR (orders.is_guest = true AND orders.security_token = current_setting('request.header.order-token', true))
      )
    )
  );

CREATE POLICY payments_customer_select ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = payments.order_id
      AND (
        orders.customer_id IN (
          SELECT id FROM customers
          WHERE auth_user_id = auth.uid()
             OR id = current_setting('request.jwt.claim.sub', true)
        )
        OR (orders.is_guest = true AND orders.security_token = current_setting('request.header.order-token', true))
      )
    )
  );

-- Stock levels are intentionally public: the storefront shows availability to
-- anonymous visitors. Writes have no anon/authenticated policy at all.
CREATE POLICY inventory_public_read ON inventory
  FOR SELECT
  USING (true);

CREATE POLICY customer_wishlists_select ON customer_wishlists
  FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM customers
      WHERE auth_user_id = auth.uid()
         OR id = current_setting('request.jwt.claim.sub', true)
    )
  );

CREATE POLICY customer_wishlists_insert ON customer_wishlists
  FOR INSERT
  WITH CHECK (
    customer_id IN (
      SELECT id FROM customers
      WHERE auth_user_id = auth.uid()
         OR id = current_setting('request.jwt.claim.sub', true)
    )
  );

CREATE POLICY customer_wishlists_delete ON customer_wishlists
  FOR DELETE
  USING (
    customer_id IN (
      SELECT id FROM customers
      WHERE auth_user_id = auth.uid()
         OR id = current_setting('request.jwt.claim.sub', true)
    )
  );

-- Guest-to-account order linking (C19.9): an authenticated customer may claim
-- an eligible guest order ONLY with the secret security_token AND a matching
-- email.
--
-- KNOWN FINDING (carried over unchanged, documented in the A1 report):
-- `current_setting('request.header.order-token', true)` is not a GUC PostgREST
-- populates (modern PostgREST exposes `request.headers` as JSON), so this
-- clause and the guest clauses above currently never match — they fail CLOSED
-- (deny), so this is a correctness bug, not an exposure. Orders are not yet
-- persisted to Postgres, so nothing depends on it today. It is deliberately
-- NOT "fixed" here: switching it on changes customer-side guest-access
-- behaviour, which is outside the A1 admin scope.
CREATE POLICY orders_customer_link_guest ON orders
  FOR UPDATE
  USING (
    (customer_id IS NULL OR is_guest = true)
    AND security_token = current_setting('request.header.order-token', true)
    AND LOWER(customer_email) = LOWER(current_setting('request.jwt.claim.email', true))
  )
  WITH CHECK (
    customer_id IN (
      SELECT id FROM customers
      WHERE auth_user_id = auth.uid()
         OR id = current_setting('request.jwt.claim.sub', true)
    )
    AND is_guest = false
  );


-- ============================================================================
-- 3. PRODUCT REVIEWS TABLE & STOREFRONT POLICIES
-- ============================================================================
-- 12. Phase A8: Customer Product Reviews with editorial moderation.
-- Submissions start as 'pending' and are invisible on the storefront until an
-- admin approves them. The localStorage mirror is js/reviews/review-service.js
-- (key: slimky_reviews) with identical states and transition rules.
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected', 'hidden');

CREATE TABLE IF NOT EXISTS product_reviews (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
  author VARCHAR(60) NOT NULL,
  customer_email VARCHAR(255),
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(120) NOT NULL DEFAULT '',
  text TEXT NOT NULL CHECK (char_length(text) >= 10 AND char_length(text) <= 2000),
  verified BOOLEAN NOT NULL DEFAULT false,
  status review_status NOT NULL DEFAULT 'pending',
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_status ON product_reviews(status);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created_at ON product_reviews(created_at DESC);

ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

-- Public storefront: approved reviews only. Pending/rejected/hidden rows are
-- invisible to anon and authenticated customers alike.
CREATE POLICY product_reviews_public_select ON product_reviews
  FOR SELECT TO anon, authenticated
  USING (status = 'approved');

-- Submission: anyone (guest or signed-in) may insert, but ONLY as pending —
-- WITH CHECK rejects any other status, so storefront input can never self-approve.
CREATE POLICY product_reviews_public_insert ON product_reviews
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');

-- ============================================================================
-- 4. ADMIN AUTHORIZATION, PROFILES & ROLE-BASED ACCESS CONTROL
-- ============================================================================
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
  phone VARCHAR(64),
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
  INSERT INTO public.profiles (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
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


-- ============================================================================
-- 5. PRODUCT REVIEWS ADMIN POLICIES
-- ============================================================================
-- ============================================================================
-- Slimky Hair — Product Review Moderation (Phase A8)
--
-- Admin-side RLS for the `product_reviews` table declared in
-- database/schema.sql (§12). Additive only: no customer/public policy is
-- relaxed — the public can still SELECT approved rows and INSERT pending
-- rows, and still cannot UPDATE or DELETE anything.
--
-- The browser is hostile (see 20260920043100_admin_authorization.sql): the
-- anon key is public, so moderation MUST be enforced here, not in JS.
-- ============================================================================

-- Admins read the full moderation queue (all states) for support/fulfilment.
CREATE POLICY product_reviews_admin_select ON product_reviews
  FOR SELECT TO authenticated USING (public.is_admin());

-- Admins transition moderation state (approve / reject / hide / reopen) and
-- may confirm verified purchase. No INSERT (submissions come from the public
-- insert policy) and no DELETE — rejected history is preserved, not erased.
CREATE POLICY product_reviews_admin_update ON product_reviews
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

