/**
 * Standard Webhooks signature verification.
 *
 * Supabase Auth's "Send Email" hook signs its request body per the Standard
 * Webhooks spec (https://www.standardwebhooks.com/) using the secret you set
 * as SEND_EMAIL_HOOK_SECRET (the `whsec_...` value shown when you enable the
 * hook in Supabase Dashboard → Authentication → Hooks).
 *
 * This must be verified before trusting the payload, since the endpoint has
 * verify_jwt disabled (Supabase does not send a user JWT to hooks).
 */

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyStandardWebhook(
  body: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');

  if (!id || !timestamp || !signatureHeader) return false;

  // Secrets are provisioned as `whsec_<base64>`.
  const secretBytes = base64ToBytes(secret.replace(/^whsec_/, ''));
  const signedContent = `${id}.${timestamp}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
  const expected = bytesToBase64(new Uint8Array(signatureBytes));

  // Header format: "v1,<base64sig> v1,<base64sig> ..." (supports secret rotation).
  const candidates = signatureHeader.split(' ').map((part) => part.split(',')[1]).filter(Boolean);
  return candidates.some((candidate) => timingSafeEqual(candidate, expected));
}
