-- ============================================================================
-- Slimky Hair — Provision a `customers` row at signup, not just `profiles`
-- (Phase 5: Wishlists & Addresses)
--
-- customer_wishlists / customer_addresses RLS (core_schema.sql) scopes every
-- policy through:
--   customer_id IN (SELECT id FROM customers WHERE auth_user_id = auth.uid())
--
-- Until now, a `customers` row was only created lazily by the sync-order
-- Edge Function on a customer's FIRST successful order (Phase 3). A customer
-- who registered but never checked out would have zero matching rows, so
-- every wishlist/address write would silently satisfy zero policy predicates
-- and fail — not a security hole (fails closed), but a real functional gap.
--
-- Fix: extend the existing handle_new_auth_user() trigger (already
-- provisioning `profiles` on every new auth.users row) to also provision
-- `customers`, keyed the same way Phase 1/3 already key it: customers.id =
-- the auth user's own UUID (as text). This makes account signup the single
-- place a customer record is born, matching `profiles`.
-- ============================================================================

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
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.customers (id, auth_user_id, email, full_name, phone, status)
  VALUES (
    NEW.id::text,
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.email),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Backfill: customers who registered before this migration and have not yet
-- placed an order (so sync-order never lazily created their row).
INSERT INTO public.customers (id, auth_user_id, email, full_name, phone, status)
SELECT
  u.id::text,
  u.id,
  u.email,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), u.email),
  NULLIF(u.raw_user_meta_data ->> 'phone', ''),
  'active'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = u.id::text)
ON CONFLICT (id) DO NOTHING;
