/**
 * Public, frontend-safe runtime configuration — copy to js/env.js (gitignored)
 * and fill in your real values, or have your hosting pipeline generate
 * js/env.js from these same names at deploy time.
 *
 * SECURITY: only ever put values here that are safe for any site visitor to
 * read in "View Source". Supabase's anon key is designed for this — it is
 * gated by Row Level Security, not secrecy. NEVER put RESEND_API_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, or any other secret in this file.
 */
window.__SLIMKY_ENV__ = {
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_PUBLIC_KEY',
  APP_URL: 'https://YOUR_PRODUCTION_DOMAIN.example/',
};
