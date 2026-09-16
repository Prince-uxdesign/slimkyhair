/**
 * Slimky Hair — Transactional Email Dispatcher (Milestone C20.9)
 *
 * Architecture: Storefront (client) -> this Edge Function -> Resend -> Customer.
 * RESEND_API_KEY never leaves this function's runtime environment.
 *
 * The client sends only the data needed to render the email (order snapshot,
 * customer name, etc.) — never HTML, never a rendered subject, and never
 * anything resembling a secret. This function renders the template, calls
 * Resend, and records the outcome in `email_log` for idempotency + retry.
 *
 * Request body:
 *   {
 *     type: 'order_confirmation' | 'shipping_quote' | ... (see _shared/emails/render.ts),
 *     recipient: string,           // destination email address
 *     dedupKey: string,            // caller-defined idempotency key, e.g. "order_confirmation:ORD-123"
 *     orderId?: string,            // optional, for audit/filtering only
 *     payload: object              // renderer-specific data (order, quote, tracking, etc.)
 *   }
 *
 * Known limitation: because orders are not yet persisted in Supabase (they
 * currently live client-side during this milestone), this function trusts
 * the client-supplied payload rather than re-fetching an authoritative
 * order record. Once orders move server-side, add a lookup + cross-check
 * against `orders`/`payments` before rendering.
 */
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabase-admin.ts';
import { countRecentEmailsForRecipient, markEmailFailed, markEmailSent, reserveIdempotencyKey } from '../_shared/idempotency.ts';
import { sendViaResend } from '../_shared/resend.ts';
import { KNOWN_EMAIL_TYPES, renderEmail } from '../_shared/emails/render.ts';

interface RequestBody {
  type: string;
  recipient: string;
  dedupKey: string;
  orderId?: string;
  payload: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { type, recipient, dedupKey, orderId, payload } = body;

  if (!type || !KNOWN_EMAIL_TYPES.includes(type)) {
    return jsonResponse({ error: `Invalid or missing "type". Expected one of: ${KNOWN_EMAIL_TYPES.join(', ')}` }, 400);
  }
  if (!recipient || typeof recipient !== 'string' || !recipient.includes('@')) {
    return jsonResponse({ error: 'A valid "recipient" email address is required.' }, 400);
  }
  if (!dedupKey || typeof dedupKey !== 'string') {
    return jsonResponse({ error: 'A "dedupKey" string is required for idempotency.' }, 400);
  }

  let rendered;
  try {
    rendered = renderEmail(type, payload);
  } catch (err) {
    return jsonResponse({ error: `Failed to render email: ${(err as Error).message}` }, 400);
  }

  const admin = getAdminClient();

  // Abuse guard: this endpoint only requires the public anon key (verify_jwt
  // just checks for *a* JWT, not ownership of the order), so without a limit
  // any caller could spam an arbitrary recipient using the store's sending
  // domain. A real order/customer only ever generates a handful of emails,
  // so this ceiling is well above legitimate traffic.
  const RATE_LIMIT_WINDOW_MINUTES = 60;
  const RATE_LIMIT_MAX_PER_RECIPIENT = 15;
  const recentCount = await countRecentEmailsForRecipient(admin, recipient, RATE_LIMIT_WINDOW_MINUTES);
  if (recentCount >= RATE_LIMIT_MAX_PER_RECIPIENT) {
    return jsonResponse({ error: 'Too many emails sent to this recipient recently. Please try again later.' }, 429);
  }

  // Reserve the idempotency key BEFORE calling Resend. If reservation fails
  // because the key already exists, this exact email was already sent (or is
  // currently being sent) — duplicate refreshes / retries stop here.
  const reservation = await reserveIdempotencyKey(admin, {
    idempotencyKey: dedupKey,
    emailType: type,
    recipient,
    subject: rendered.subject,
    orderId: orderId ?? null,
    payloadSnapshot: payload,
  });

  if (!reservation.reserved) {
    return jsonResponse({ success: true, alreadySent: true, message: 'Duplicate suppressed by idempotency key.' });
  }

  try {
    const { messageId } = await sendViaResend({
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await markEmailSent(admin, reservation.id, messageId);
    return jsonResponse({ success: true, messageId });
  } catch (err) {
    const message = (err as Error).message;
    // Requirement: email failure must never fail the order. We record the
    // failure for the retry sweep and still respond 200 — the caller (an
    // already-successful checkout/admin action) should not treat this as a
    // hard error.
    await markEmailFailed(admin, reservation.id, message);
    return jsonResponse({ success: false, error: message, queuedForRetry: true });
  }
});
