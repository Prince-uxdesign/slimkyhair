/**
 * Confirm-signup / verify-email link, sent by the Supabase Auth "Send Email"
 * hook (email_action_type = "signup"). Distinct from the immediate welcome
 * email — this one gates account access on clicking the link.
 */
import { escapeHtml, heading, paragraph, renderButton, wrapEmailLayout } from '../shared/layout.ts';

export interface EmailVerificationPayload {
  customerName?: string;
  email: string;
  confirmationUrl: string;
}

export function renderEmailVerification({ customerName = 'Valued Customer', email, confirmationUrl }: EmailVerificationPayload) {
  const subject = 'Verify Your Email · Slimky Hair';

  const bodyHtml = `
    ${heading('Verify Your Email Address')}
    ${paragraph(`Hello <strong>${escapeHtml(customerName)}</strong>, please confirm <strong style="word-break: break-all;">${escapeHtml(email)}</strong> to activate your Slimky Hair account.`)}
    <div class="card" style="text-align: center; padding: 28px 20px;">
      <p style="font-size: 14px; color: #6A625D; margin: 0 0 20px 0;">Click below to verify your email and finish setting up your account:</p>
      ${renderButton({ href: confirmationUrl, label: 'Verify Email Address' })}
      <p style="font-size: 12px; color: #8A817C; margin: 18px 0 0 0;">This link can only be used once.</p>
    </div>
    ${paragraph('If you did not create a Slimky Hair account, you can safely ignore this email.', )}
  `;

  const text = `Verify Your Email Address

Hello ${customerName},

Please confirm ${email} to activate your Slimky Hair account by visiting this link:
${confirmationUrl}

If you did not create a Slimky Hair account, you can safely ignore this email.

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: 'Confirm your email to activate your account.', bodyHtml }),
    text,
  };
}
