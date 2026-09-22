-- ============================================================================
-- Migration: 20260922100000_email_retry_cron.sql
-- Milestone: P2 - Scheduled Email Retry Sweep (pg_cron & pg_net)
-- 
-- Periodically sweeps failed transactional emails from `email_log`
-- by invoking the `retry-failed-emails` Supabase Edge Function every 15 minutes.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA net;

-- Create helper function to invoke the retry sweep Edge Function
CREATE OR REPLACE FUNCTION public.trigger_email_retry_sweep(
  p_cron_secret TEXT,
  p_project_url TEXT DEFAULT 'https://irmxpsygbccmqtcpfmmb.supabase.co'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  v_request_id BIGINT;
  v_endpoint TEXT;
BEGIN
  v_endpoint := rtrim(p_project_url, '/') || '/functions/v1/retry-failed-emails';

  -- Dispatch asynchronous HTTP POST request to the Edge Function via pg_net
  SELECT net.http_post(
    url := v_endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', p_cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'net_request_id', v_request_id,
    'timestamp', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'timestamp', now()
  );
END;
$$;

-- Grant execution to service_role and postgres
REVOKE EXECUTE ON FUNCTION public.trigger_email_retry_sweep(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_email_retry_sweep(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_email_retry_sweep(TEXT, TEXT) TO postgres;

COMMENT ON FUNCTION public.trigger_email_retry_sweep(TEXT, TEXT) IS 
'Dispatches an authenticated HTTP POST to retry-failed-emails Edge Function using pg_net.';
