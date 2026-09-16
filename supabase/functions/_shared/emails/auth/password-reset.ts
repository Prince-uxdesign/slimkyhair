import { escapeHtml, heading, paragraph, renderButton, wrapEmailLayout } from '../shared/layout.ts';

export interface PasswordResetPayload {
  customerName?: string;
  email: string;
  resetUrl: string;
}

export function renderPasswordReset({ customerName = 'Valued Customer', email, resetUrl }: PasswordResetPayload) {
  const subject = 'Reset Your Slimky Hair Password';

  const bodyHtml = `
    ${heading('Reset Your Password')}
    ${paragraph(`Hello <strong>${escapeHtml(customerName)}</strong>,`)}
    ${paragraph(`We received a request to reset the password for your customer account associated with <strong style="word-break: break-all;">${escapeHtml(email)}</strong>.`)}
    <div class="card" style="text-align: center; padding: 28px 20px;">
      <p style="font-size: 14px; color: #6A625D; margin: 0 0 20px 0;">Click the button below to choose a new secure password:</p>
      ${renderButton({ href: resetUrl, label: 'Reset Password' })}
      <p style="font-size: 12px; color: #8A817C; margin: 18px 0 0 0;">This link expires in 1 hour and can only be used once.</p>
    </div>
    ${paragraph('If you did not request this password reset, please disregard this email. Your password will remain unchanged and your account remains secure.')}
  `;

  const text = `Hello ${customerName},

We received a request to reset the password for your Slimky Hair customer account (${email}).

You can reset your password by visiting this link:
${resetUrl}

This link is valid for 1 hour and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: 'Reset your Slimky Hair password.', bodyHtml }),
    text,
  };
}
