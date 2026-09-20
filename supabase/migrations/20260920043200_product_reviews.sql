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
