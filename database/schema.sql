-- ============================================================================
-- Slimky Hair — E-Commerce Database Schema (PostgreSQL / Supabase)
-- Milestones C10 - C20: Orders, Inventory, Customer Accounts & Security
-- ============================================================================

-- 1. Custom Enum Types
CREATE TYPE order_status AS ENUM (
  'draft',
  'pending_payment',
  'paid',
  'shipping_quote_required',
  'shipping_quote_sent',
  'shipping_payment_pending',
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

-- Account Status Lifecycle (Guest -> Registered -> Active/Pending/Suspended)
CREATE TYPE customer_status AS ENUM (
  'guest',
  'registered',
  'pending_confirmation',
  'active',
  'suspended'
);

-- 2. Registered Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY, -- e.g. cust_20260911_8f4k92 or Supabase auth.users UUID
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Supabase Auth Identity Link
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(64), -- Phone / WhatsApp communication channel
  status customer_status NOT NULL DEFAULT 'active',
  default_shipping_address_id BIGINT, -- Relational link to customer_addresses table
  default_shipping_address JSONB DEFAULT '{}'::jsonb, -- JSON snapshot for fast hydration
  metadata JSONB DEFAULT '{}'::jsonb, -- Preferences, hair profile, reorder tags
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2b. Customer Saved Addresses Table
CREATE TABLE IF NOT EXISTS customer_addresses (
  id BIGSERIAL PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label VARCHAR(64) NOT NULL DEFAULT 'Home', -- e.g. 'Home', 'Office', 'Salon'
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

-- Foreign key link for default_shipping_address_id
ALTER TABLE customers 
  ADD CONSTRAINT fk_customers_default_address 
  FOREIGN KEY (default_shipping_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL;

-- 3. SKU / Variant-Level Inventory Table
CREATE TABLE IF NOT EXISTS inventory (
  sku VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  variant_id VARCHAR(64),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  availability VARCHAR(32) NOT NULL DEFAULT 'In Stock',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY, -- e.g. ORD-20260911-8F4K9
  order_number VARCHAR(64) NOT NULL UNIQUE, -- Human-friendly reference: SLM-20260911-XXXX
  checkout_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
  is_guest BOOLEAN NOT NULL DEFAULT true,
  security_token VARCHAR(64) NOT NULL, -- Cryptographic URL access token preventing enumeration
  flow shipping_flow NOT NULL DEFAULT 'nigeria_checkout',
  
  -- Customer Details (Snapshotted for order fulfillment)
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(64) NOT NULL,
  
  -- Delivery Address
  country VARCHAR(128) NOT NULL,
  state VARCHAR(128) NOT NULL,
  city VARCHAR(128) NOT NULL,
  postal_code VARCHAR(32),
  street_address TEXT NOT NULL,
  delivery_instructions TEXT,
  
  -- Pricing & Currency (Authoritative Subtotal, Shipping, and Payment Totals)
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  shipping_status VARCHAR(64) NOT NULL, -- 'Calculated separately' or 'Quote required'
  shipping_amount NUMERIC(12, 2) DEFAULT NULL,
  shipping_fee NUMERIC(12, 2) DEFAULT NULL, -- Backward compatibility alias
  product_payment_total NUMERIC(12, 2) NOT NULL CHECK (product_payment_total >= 0),
  total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_paid >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
  
  -- Order Status & Payment Status (Strictly decoupled)
  order_status order_status NOT NULL DEFAULT 'pending_payment',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  
  -- Relational link to latest payment
  latest_payment_id VARCHAR(64),
  
  -- Audit metadata & state history log
  history JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Order Items Table (Immutable snapshot of purchased catalog items)
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
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0), -- Backward compatibility alias
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(64) PRIMARY KEY, -- e.g. pay_20260911_3j7x91
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  
  -- Provider & Reference
  provider VARCHAR(64) NOT NULL, -- 'demo' (Slimky DemoPay), later 'paystack', 'flutterwave'
  provider_reference VARCHAR(128) NOT NULL UNIQUE, -- e.g. DEMO-PAY-8F4K92L or Paystack reference
  
  -- Amount & Currency
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
  
  -- Payment Method & Status
  payment_method VARCHAR(64) NOT NULL DEFAULT 'demo_card',
  status payment_status NOT NULL DEFAULT 'pending',
  
  -- Customer info snapshot
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(64),
  
  -- Audit Timestamps & Reason (ZERO CVVs stored)
  failure_reason TEXT,
  verified_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Foreign key constraint for latest_payment_id
ALTER TABLE orders 
  ADD CONSTRAINT fk_orders_latest_payment 
  FOREIGN KEY (latest_payment_id) REFERENCES payments(id) ON DELETE SET NULL;

-- 8. Indexes for High-Performance Queries & Security
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
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider_reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 9. Atomic Inventory Deduction Procedure
CREATE OR REPLACE FUNCTION deduct_order_inventory(p_order_id VARCHAR(64))
RETURNS BOOLEAN AS $$
DECLARE
  r RECORD;
BEGIN
  -- Verify all items have sufficient inventory before performing any deduction
  FOR r IN SELECT sku, quantity FROM order_items WHERE order_id = p_order_id LOOP
    IF NOT EXISTS (
      SELECT 1 FROM inventory 
      WHERE sku = r.sku AND stock >= r.quantity
    ) THEN
      RAISE EXCEPTION 'Insufficient stock for SKU % in order %', r.sku, p_order_id;
    END IF;
  END LOOP;

  -- Deduct stock atomically
  FOR r IN SELECT sku, quantity FROM order_items WHERE order_id = p_order_id LOOP
    UPDATE inventory 
    SET 
      stock = stock - r.quantity,
      availability = CASE WHEN (stock - r.quantity) = 0 THEN 'Out of Stock' ELSE 'In Stock' END,
      updated_at = NOW()
    WHERE sku = r.sku;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 10. Row Level Security (RLS) Configuration
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Customers can view their own profile (Supabase auth.uid or JWT claims)
CREATE POLICY customers_self_select ON customers 
  FOR SELECT 
  USING (
    auth.uid() = auth_user_id 
    OR id = current_setting('request.jwt.claim.sub', true) 
    OR email = current_setting('request.jwt.claim.email', true)
  );

-- Customers can update their own profile details
CREATE POLICY customers_self_update ON customers 
  FOR UPDATE 
  USING (
    auth.uid() = auth_user_id 
    OR id = current_setting('request.jwt.claim.sub', true)
  );

-- Customers can view and manage their own saved addresses
CREATE POLICY addresses_customer_all ON customer_addresses 
  FOR ALL 
  USING (
    customer_id IN (
      SELECT id FROM customers 
      WHERE auth_user_id = auth.uid() 
         OR id = current_setting('request.jwt.claim.sub', true)
    )
  );

-- Authenticated customers can view their own orders; guest access requires security token match
CREATE POLICY orders_customer_select ON orders 
  FOR SELECT 
  USING (
    customer_id IN (
      SELECT id FROM customers 
      WHERE auth_user_id = auth.uid() 
         OR id = current_setting('request.jwt.claim.sub', true)
    )
    OR (is_guest = true AND security_token = current_setting('request.header.order-token', true))
    -- NOTE: no blanket authenticated-role access here. Every row must be
    -- scoped to the caller's own customer_id or a guest security token,
    -- otherwise any signed-in user could read every customer's orders.
  );

-- Customers can view order items belonging to their authorized orders
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

CREATE POLICY inventory_public_read ON inventory 
  FOR SELECT 
  USING (true);

-- 8. Customer Wishlists Table (Relational customer wishlist records)
CREATE TABLE IF NOT EXISTS customer_wishlists (
  id BIGSERIAL PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id VARCHAR(64) NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_wishlists_customer_id ON customer_wishlists(customer_id);

-- Enable Row-Level Security for customer wishlists
ALTER TABLE customer_wishlists ENABLE ROW LEVEL SECURITY;

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

-- 9. Guest-to-Account Order Linking Policy (Milestone C19.9)
-- Authenticated customers can link an eligible guest order to their account ONLY when
-- they possess the valid secret security_token and their email matches the order's customer_email.
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

-- 11. Milestone C20.10: Nigeria Shipping Workflow — Schema Parity Additions
-- Nigeria orders now go through the same manual quote -> customer-paid shipping fee
-- workflow as international orders, so these columns generalize what was previously
-- international-only, plus a new intermediate order_status value for the moment a
-- shipping payment is verified but not yet moved to dispatch by an admin.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'shipping_payment_confirmed' AFTER 'shipping_payment_pending';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_quote JSONB DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_payment JSONB DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_details JSONB DEFAULT NULL; -- legacy Nigeria-only entry, superseded by shipping_quote
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking JSONB DEFAULT NULL;

-- A payment row now has a purpose: the original product payment, or a separate
-- shipping-fee payment charged after the quote is accepted. Never combined into
-- one total — see orders.product_payment_total vs orders.shipping_amount.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(16) NOT NULL DEFAULT 'product' CHECK (purpose IN ('product', 'shipping'));

-- Separate pointer from latest_payment_id (the product payment) so a shipping
-- payment attempt never overwrites the authoritative product payment reference.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_payment_id VARCHAR(64) REFERENCES payments(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_payment_status payment_status DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shipping_payment_id ON orders(shipping_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_purpose ON payments(purpose);

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

-- No UPDATE/DELETE policy for anon/authenticated: customers cannot alter
-- moderation state (or anyone's review). Moderation is admin-only; see the
-- A8 migration (20260920043200_product_reviews.sql) for the is_admin() policies.

