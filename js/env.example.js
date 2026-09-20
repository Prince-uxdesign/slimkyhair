/**
 * Public, frontend-safe runtime configuration — copy to js/env.js (gitignored)
 * and fill in your real values, or have your hosting pipeline generate
 * js/env.js from these same names at deploy time.
 *
 * SECURITY: only ever put values here that are safe for any site visitor to
 * read in "View Source". Supabase's publishable/anon key is designed for this
 * — it is gated by Row Level Security, not by secrecy. NEVER put
 * RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SEND_EMAIL_HOOK_SECRET,
 * CRON_SECRET, or any other secret in this file.
 *
 * SUPABASE_ANON_KEY accepts either a modern publishable key
 * (sb_publishable_...) or a legacy anon JWT. Prefer the publishable key: it
 * can be rotated independently of the project's JWT secret.
 */
window.__SLIMKY_ENV__ = {
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_YOUR_PUBLISHABLE_KEY',
  APP_URL: 'https://YOUR_PRODUCTION_DOMAIN.example/',
};
