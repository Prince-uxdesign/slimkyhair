/**
 * Supabase Auth "Send Email" Hook (Milestone C20.9 — Auth Emails).
 *
 * When enabled in Dashboard -> Authentication -> Hooks, Supabase Auth calls
 * this function instead of its built-in email sender for: signup
 * confirmation, password recovery, and email change confirmation. This
 * keeps Supabase Auth as the source of truth for tokens/links (no custom
 * password reset system) while routing delivery through Resend with Slimky
 * Hair's own templates.
 *
 * Contract: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
 *   - Request is signed per the Standard Webhooks spec using
 *     SEND_EMAIL_HOOK_SECRET (the `whsec_...` value from the Dashboard).
 *   - verify_jwt MUST be disabled for this function (see supabase/config.toml)
 *     since Supabase does not attach a user JWT to hook requests.
 *   - Return 200 with an empty JSON body on success. Return a non-200 with
 *     `{ error: { http_code, message } }` on failure so Supabase can surface
 *     it appropriately instead of silently dropping the email.
 */
import { getAdminClient } from '../_shared/supabase-admin.ts';
import { markEmailFailed, markEmailSent, reserveIdempotencyKey } from '../_shared/idempotency.ts';
import { sendViaResend } from '../_shared/resend.ts';
import { verifyStandardWebhook } from '../_shared/webhook-verify.ts';
import { renderEmailVerification } from '../_shared/emails/auth/email-verification.ts';
import { renderPasswordReset } from '../_shared/emails/auth/password-reset.ts';
import { renderEmailChangeConfirmation } from '../_shared/emails/auth/email-change-confirmation.ts';

interface HookPayload {
  user: {
    id: string;
    email: string;
    new_email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

function errorResponse(httpCode: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status: httpCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildVerifyUrl(siteUrl: string, tokenHash: string, type: string, redirectTo: string): string {
  const url = new URL('/auth/v1/verify', siteUrl);
  url.searchParams.set('token', tokenHash);
  url.searchParams.set('type', type);
  url.searchParams.set('redirect_to', redirectTo);
  return url.toString();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }

  const rawBody = await req.text();

  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
  if (!hookSecret) {
    console.error('[auth-email-hook] SEND_EMAIL_HOOK_SECRET is not configured.');
    return errorResponse(500, 'Hook secret not configured on the server.');
  }

  const isValid = await verifyStandardWebhook(rawBody, req.headers, hookSecret);
  if (!isValid) {
    return errorResponse(401, 'Invalid webhook signature.');
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, 'Invalid JSON payload.');
  }

  const { user, email_data: emailData } = payload;
  const actionType = emailData.email_action_type;
  const customerName = (user.user_metadata?.full_name as string) || 'Valued Customer';

  let type: string;
  let recipient: string;
  // deno-lint-ignore no-explicit-any
  let rendered: { subject: string; html: string; text: string };

  try {
    if (actionType === 'signup' || actionType === 'invite' || actionType === 'magiclink') {
      const confirmationUrl = buildVerifyUrl(emailData.site_url, emailData.token_hash, actionType, emailData.redirect_to);
      type = 'email_verification';
      recipient = user.email;
      rendered = renderEmailVerification({ customerName, email: user.email, confirmationUrl });
    } else if (actionType === 'recovery') {
      const resetUrl = buildVerifyUrl(emailData.site_url, emailData.token_hash, 'recovery', emailData.redirect_to);
      type = 'password_reset';
      recipient = user.email;
      rendered = renderPasswordReset({ customerName, email: user.email, resetUrl });
    } else if (actionType === 'email_change') {
      const confirmationUrl = buildVerifyUrl(
        emailData.site_url,
        emailData.token_hash_new || emailData.token_hash,
        'email_change',
        emailData.redirect_to,
      );
      type = 'email_change_confirmation';
      recipient = user.new_email || user.email;
      rendered = renderEmailChangeConfirmation({
        customerName,
        currentEmail: user.email,
        newEmail: user.new_email || '',
        confirmationUrl,
      });
    } else {
      return errorResponse(400, `Unsupported email_action_type: "${actionType}"`);
    }
  } catch (err) {
    return errorResponse(500, `Failed to render email: ${(err as Error).message}`);
  }

  const admin = getAdminClient();
  const idempotencyKey = `auth:${actionType}:${emailData.token_hash}`;

  const reservation = await reserveIdempotencyKey(admin, {
    idempotencyKey,
    emailType: type,
    recipient,
    subject: rendered.subject,
    orderId: null,
    payloadSnapshot: { actionType, userId: user.id },
  });

  if (!reservation.reserved) {
    // Same token already dispatched (Supabase retried the hook) — succeed silently.
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { messageId } = await sendViaResend({
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await markEmailSent(admin, reservation.id, messageId);
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = (err as Error).message;
    await markEmailFailed(admin, reservation.id, message);
    // Auth emails are not retried by our sweep (tokens are single-use and
    // short-lived) — surface the failure so Supabase/the user knows to retry.
    return errorResponse(500, `Failed to send email via Resend: ${message}`);
  }
});
