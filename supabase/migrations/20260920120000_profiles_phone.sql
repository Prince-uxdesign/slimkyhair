-- ============================================================================
-- Slimky Hair — profiles.phone (Phase 1: Real Customer Identity)
--
-- Registration collects a phone number for delivery coordination. It is
-- stored in auth.users.raw_user_meta_data by the client (Supabase Auth has
-- no first-class phone-for-email-accounts column), and mirrored here so it's
-- queryable/reportable from SQL without reaching into JWT metadata. Additive
-- only — no existing column, policy, or trigger is changed.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone VARCHAR(64);

-- Keep it in sync at signup time, the same way handle_new_auth_user() already
-- seeds email/full_name from user metadata.
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
