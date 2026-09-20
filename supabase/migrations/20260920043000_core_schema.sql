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
