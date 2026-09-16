import { escapeHtml, heading, paragraph, renderButton, wrapEmailLayout } from '../shared/layout.ts';

export interface EmailChangeConfirmationPayload {
  customerName?: string;
  currentEmail: string;
  newEmail: string;
  confirmationUrl: string;
}

export function renderEmailChangeConfirmation({ customerName = 'Valued Customer', currentEmail, newEmail, confirmationUrl }: EmailChangeConfirmationPayload) {
  const subject = 'Confirm Your New Email Address · Slimky Hair';

  const bodyHtml = `
    ${heading('Confirm Your New Email')}
    ${paragraph(`Hello <strong>${escapeHtml(customerName)}</strong>, we received a request to change the email on your Slimky Hair account from <strong style="word-break: break-all;">${escapeHtml(currentEmail)}</strong> to <strong style="word-break: break-all;">${escapeHtml(newEmail)}</strong>.`)}
    <div class="card" style="text-align: center; padding: 28px 20px;">
      <p style="font-size: 14px; color: #6A625D; margin: 0 0 20px 0;">Confirm this change to start using your new email address:</p>
      ${renderButton({ href: confirmationUrl, label: 'Confirm Email Change' })}
      <p style="font-size: 12px; color: #8A817C; margin: 18px 0 0 0;">This link can only be used once.</p>
    </div>
    ${paragraph('If you did not request this change, please contact our Client Care team immediately — your account may be at risk.')}
  `;

  const text = `Confirm Your New Email

Hello ${customerName},

We received a request to change the email on your Slimky Hair account from ${currentEmail} to ${newEmail}.

Confirm this change by visiting this link:
${confirmationUrl}

If you did not request this change, please contact our Client Care team immediately.

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: 'Confirm your new email address.', bodyHtml }),
    text,
  };
}
