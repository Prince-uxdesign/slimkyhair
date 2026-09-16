/**
 * Resend transactional email client.
 *
 * SECURITY: RESEND_API_KEY is read exclusively from the Edge Function runtime
 * environment (set via `supabase secrets set`). It is never returned to the
 * caller, logged, or exposed to the frontend.
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  messageId: string;
}

export async function sendViaResend({ to, subject, html, text }: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
  const fromName = Deno.env.get('RESEND_FROM_NAME') || 'Slimky Hair';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured on this Edge Function.');
  }
  if (!fromEmail) {
    throw new Error('RESEND_FROM_EMAIL is not configured on this Edge Function.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText;
    throw new Error(`Resend API error (${response.status}): ${message}`);
  }

  return { messageId: data.id as string };
}
