import { escapeHtml, heading, paragraph, renderButton, wrapEmailLayout } from '../shared/layout.ts';

export interface RegistrationConfirmationPayload {
  customerName?: string;
  email: string;
  storeUrl?: string;
}

export function renderRegistrationConfirmation({ customerName = 'Valued Customer', email, storeUrl = 'https://slimkyhair.com/' }: RegistrationConfirmationPayload) {
  const subject = 'Welcome to Slimky Hair · Your Account is Ready';

  const bodyHtml = `
    ${heading(`Welcome, ${escapeHtml(customerName)}`)}
    ${paragraph(`Your Slimky Hair customer account is officially registered and active under <strong style="word-break: break-all;">${escapeHtml(email)}</strong>.`)}
    <div class="card">
      <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #3B4E43; font-weight: 600; margin-bottom: 8px;">Next Step</div>
      <div style="font-size: 14px; color: #4A423D; line-height: 1.5;">
        You can now check out seamlessly, track your order history, and access order receipts any time from your account dashboard.
      </div>
    </div>
    ${renderButton({ href: `${storeUrl}shop/`, label: 'Explore Botanical Formulations' })}
  `;

  const text = `Welcome to Slimky Hair, ${customerName}!

Your customer account has been registered with email: ${email}.

You can now sign in to view your orders and track fulfillment of your botanical hair care formulations.

Explore the collection: ${storeUrl}shop/

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: 'Your Slimky Hair account is ready.', bodyHtml }),
    text,
  };
}
