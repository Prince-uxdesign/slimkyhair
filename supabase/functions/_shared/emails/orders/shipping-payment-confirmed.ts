import { badge, escapeHtml, heading, paragraph, wrapEmailLayout } from '../shared/layout.ts';
import { orderRef, type OrderPayload, type ShippingPayment } from './types.ts';

export function renderShippingPaymentConfirmed({ order, payment }: { order: OrderPayload; payment: ShippingPayment }) {
  const ref = orderRef(order);
  const customerName = order.customer.fullName || 'Valued Customer';

  const subject = `Shipping Payment Confirmed · Order ${ref} | Slimky Hair`;

  const bodyHtml = `
    ${badge('Shipping Payment Verified')}
    ${heading('Shipping Payment Confirmed')}
    ${paragraph(`Dear ${escapeHtml(customerName)}, we've confirmed your shipping payment for order <strong>${escapeHtml(ref)}</strong>${payment.reference ? ` (Ref: <span style="word-break: break-all;">${escapeHtml(payment.reference)}</span>)` : ''}.`)}
    ${paragraph('Your order is now ready for dispatch. We will notify you again with carrier tracking details as soon as it ships.')}
  `;

  const text = `Shipping Payment Confirmed — Order ${ref}

Dear ${customerName},

We've confirmed your shipping payment for order ${ref}${payment.reference ? ` (Ref: ${payment.reference})` : ''}.

Your order is now ready for dispatch. We'll notify you again with carrier tracking details as soon as it ships.

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: `Shipping payment confirmed for order ${ref}.`, bodyHtml }),
    text,
  };
}
