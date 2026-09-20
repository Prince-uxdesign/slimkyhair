-- =====================================================================
-- Migration: 20260920150000_fix_prevent_client_role_change.sql
-- Description: Harden prevent_client_role_change trigger function to
--              inspect auth.role() rather than current_user.
--              In PostgreSQL, inside a SECURITY DEFINER function,
--              current_user is the function owner (postgres), which
--              inadvertently allowed authenticated clients to self-assign
--              privileged roles. Checking auth.role() / session_user
--              ensures that requests initiated by anon or authenticated
--              clients are strictly forbidden from altering role or is_active.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.prevent_client_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  calling_role text := coalesce(auth.role(), session_user);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'customer' AND calling_role IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Privileged roles cannot be self-assigned (attempted by %)', calling_role
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable' USING ERRCODE = '42501';
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND calling_role IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'role/is_active may only be changed by a service-role or database administrator (attempted by %)', calling_role
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_client_role_change() FROM PUBLIC, anon, authenticated;
