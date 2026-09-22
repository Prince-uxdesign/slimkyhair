/**
 * Supabase Client Singleton - Slimky Hair
 * Phase 1: Real Customer Identity
 *
 * Wraps the vendored supabase-js UMD build (js/vendor/supabase-js.min.js,
 * loaded as a plain <script> before this module on any page that needs
 * authenticated Supabase access) into a lazily-constructed singleton.
 *
 * Only pages that perform an auth MUTATION (register, login, logout,
 * password reset) or a real DB read need to import this. Read-only
 * "who is logged in right now" checks (customerService.getCurrentCustomer)
 * deliberately do NOT depend on this module — they decode the session JWT
 * Supabase already persisted to localStorage, so the vast majority of pages
 * that merely display login state don't need the vendor bundle loaded at all.
 */

let client = null;

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient() {
  if (client) return client;

  if (typeof window === 'undefined' || typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
    throw new Error('Supabase client library is not loaded on this page (missing js/vendor/supabase-js.min.js).');
  }

  const env = window.__SLIMKY_ENV__ || {};
  const url = (env.SUPABASE_URL && !String(env.SUPABASE_URL).includes('YOUR_PROJECT_REF'))
    ? env.SUPABASE_URL
    : 'https://irmxpsygbccmqtcpfmmb.supabase.co';
  const anonKey = (env.SUPABASE_ANON_KEY && !String(env.SUPABASE_ANON_KEY).includes('YOUR_SUPABASE_ANON'))
    ? env.SUPABASE_ANON_KEY
    : 'sb_publishable_qRthPnH-P3aF-5Cv7-RHnQ_ekqDJrAj';

  if (!url || !anonKey) {
    throw new Error('Supabase is not configured for this environment.');
  }

  client = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return client;
}

/**
 * True when the vendor library + real env config are both present, i.e.
 * getSupabaseClient() would succeed. Callers use this to fail fast with a
 * clear message instead of letting a raw exception surface to the user.
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  try {
    getSupabaseClient();
    return true;
  } catch {
    return false;
  }
}
