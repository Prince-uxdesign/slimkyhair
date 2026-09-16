/**
 * Shared CORS headers for Slimky Hair Edge Functions.
 * APP_URL restricts browser calls to the storefront's own origin in production;
 * falls back to '*' only when APP_URL has not been configured yet.
 */
export function corsHeaders(): Record<string, string> {
  const appUrl = Deno.env.get('APP_URL');
  return {
    'Access-Control-Allow-Origin': appUrl || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  return null;
}
