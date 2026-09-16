/**
 * Service-role Supabase client for Edge Functions only.
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically injected into
 * every Edge Function's runtime by Supabase — they must never be set as
 * frontend-visible environment variables and are never sent in a response.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let cachedClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not available in this runtime.');
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}
