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
RETURNS VOID AS $$
  UPDATE email_log
  SET status = 'sent',
      provider_message_id = p_provider_message_id,
      sent_at = NOW(),
      attempts = attempts + 1,
      updated_at = NOW()
  WHERE id = p_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION mark_email_log_failed(p_id BIGINT, p_error TEXT)
RETURNS VOID AS $$
  UPDATE email_log
  SET status = 'failed',
      last_error = p_error,
      attempts = attempts + 1,
      updated_at = NOW()
  WHERE id = p_id;
$$ LANGUAGE sql;

-- 3. Row Level Security — deny-all by default.
-- Only the service role (used exclusively inside Edge Functions) may read or
-- write this table. No policies are defined for `anon` or `authenticated`,
-- so RLS blocks them entirely while service_role bypasses RLS as usual.
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
