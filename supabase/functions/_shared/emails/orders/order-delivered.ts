import { badge, escapeHtml, heading, paragraph, renderButton, wrapEmailLayout } from '../shared/layout.ts';
import { orderRef, type OrderPayload } from './types.ts';

export function renderOrderDelivered(order: OrderPayload) {
  const ref = orderRef(order);
  const customerName = order.customer.fullName || 'Valued Customer';
  const storeUrl = order.storeUrl || 'https://slimkyhair.com/';

  const subject = `Delivered · Order ${ref} | Slimky Hair`;

  const bodyHtml = `
    ${badge('Delivered')}
    ${heading('Your Order Has Arrived')}
    ${paragraph(`Dear ${escapeHtml(customerName)}, your order <strong>${escapeHtml(ref)}</strong> has been marked as delivered. We hope you love your botanical formulations.`)}
    ${paragraph('If anything about your delivery needs attention, reply to this email and our Client Care team will help right away.')}
    ${renderButton({ href: `${storeUrl}shop/`, label: 'Shop More Formulations' })}
  `;

  const text = `Your Order Has Arrived — Order ${ref}

Dear ${customerName},

Your order ${ref} has been marked as delivered. We hope you love your botanical formulations.

If anything about your delivery needs attention, reply to this email and our Client Care team will help right away.

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: `Order ${ref} has been delivered.`, bodyHtml }),
    text,
  };
}
