-- ============================================================================
-- Slimky Hair — Admin Account Provisioning & Store Settings Initialization
-- Project: irmxpsygbccmqtcpfmmb
-- 
-- Run this entire script in Supabase Dashboard -> SQL Editor
-- It is idempotent: safe to run multiple times without causing duplicates or errors.
-- ============================================================================

DO $$
DECLARE
  v_admin_user_id UUID;
  v_test_customer_id UUID;
BEGIN
  -- --------------------------------------------------------------------------
  -- 1. Provision Admin User in auth.users (if not already present)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_admin_user_id FROM auth.users WHERE email = 'admin@slimkyhair.com';

  IF v_admin_user_id IS NULL THEN
    v_admin_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_admin_user_id,
      'authenticated',
      'authenticated',
      'admin@slimkyhair.com',
      crypt('BotanicalAdmin2026', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Slimky Hair Operations Lead"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  ELSE
    -- If user already exists, update their password and confirmed status
    UPDATE auth.users
    SET encrypted_password = crypt('BotanicalAdmin2026', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_admin_user_id;
  END IF;

  -- --------------------------------------------------------------------------
  -- 2. Promote / Ensure Admin Profile in public.profiles
  -- --------------------------------------------------------------------------
  INSERT INTO public.profiles (id, email, full_name, role, is_active, created_at, updated_at)
  VALUES (
    v_admin_user_id,
    'admin@slimkyhair.com',
    'Slimky Hair Operations Lead',
    'admin',
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    is_active = true,
    full_name = 'Slimky Hair Operations Lead',
    updated_at = now();

  -- --------------------------------------------------------------------------
  -- 3. Provision Optional Test Customer (customer.test@slimkyhair.com)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_test_customer_id FROM auth.users WHERE email = 'customer.test@slimkyhair.com';

  IF v_test_customer_id IS NULL THEN
    v_test_customer_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_test_customer_id,
      'authenticated',
      'authenticated',
      'customer.test@slimkyhair.com',
      crypt('BotanicalCustomer2026', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Control Customer"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, is_active, created_at, updated_at)
  VALUES (
    v_test_customer_id,
    'customer.test@slimkyhair.com',
    'Control Customer',
    'customer',
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = 'Control Customer',
    is_active = true,
    updated_at = now();

  -- Also ensure row in public.customers for the test customer
  INSERT INTO public.customers (id, auth_user_id, email, full_name, status, created_at, updated_at)
  VALUES (
    v_test_customer_id::text,
    v_test_customer_id,
    'customer.test@slimkyhair.com',
    'Control Customer',
    'active',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    auth_user_id = excluded.auth_user_id,
    full_name = excluded.full_name,
    status = 'active',
    updated_at = now();

  -- --------------------------------------------------------------------------
  -- 4. Seed Initial Store Settings in public.admin_settings
  -- --------------------------------------------------------------------------
  INSERT INTO public.admin_settings (key, value, label, description, updated_by, updated_at) VALUES
    ('base_currency', '"NGN"', 'Base currency', 'Currency all order totals are stored in.', v_admin_user_id, now()),
    ('low_stock_threshold', '10', 'Low stock threshold', 'Units at or below which a SKU is flagged as low stock.', v_admin_user_id, now()),
    ('order_number_prefix', '"SLM"', 'Order number prefix', 'Prefix applied to human-readable order numbers.', v_admin_user_id, now()),
    ('store_name', '"Slimky Hair"', 'Store name', 'Name shown in the backoffice and on transactional email.', v_admin_user_id, now()),
    ('support_email', '"support@slimkyhair.com"', 'Support email', 'Reply-to address used on customer-facing email.', v_admin_user_id, now())
  ON CONFLICT (key) DO UPDATE SET
    value = excluded.value,
    label = excluded.label,
    description = excluded.description,
    updated_by = excluded.updated_by,
    updated_at = now();

END $$;

-- ----------------------------------------------------------------------------
-- Verification Output
-- ----------------------------------------------------------------------------
SELECT 
  p.email, 
  p.full_name, 
  p.role, 
  p.is_active,
  u.email_confirmed_at IS NOT NULL AS is_email_confirmed
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.email IN ('admin@slimkyhair.com', 'customer.test@slimkyhair.com');

SELECT key, value, label FROM public.admin_settings ORDER BY key;
