/**
 * Sent when a customer accepts an international shipping quote — prompts
 * them to complete the separate shipping payment before dispatch.
 */
import { escapeHtml, heading, paragraph, renderButton, wrapEmailLayout } from '../shared/layout.ts';
import { formatCurrency } from '../shared/order-blocks.ts';
import { orderRef, type OrderPayload, type ShippingQuote } from './types.ts';

export function renderShippingPaymentRequired({ order, quote }: { order: OrderPayload; quote: ShippingQuote }) {
  const ref = orderRef(order);
  const currency = quote.currency || 'NGN';
  const customerName = order.customer.fullName || 'Valued Customer';

  const subject = `Action Required: Shipping Payment for Order ${ref} | Slimky Hair`;

  const bodyHtml = `
    ${heading('Shipping Payment Required')}
    ${paragraph(`Dear ${escapeHtml(customerName)}, thank you for accepting your shipping quote for order <strong>${escapeHtml(ref)}</strong>.`)}
    <div class="card">
      <table role="presentation" width="100%" style="table-layout: fixed; width: 100%; font-size: 13px; line-height: 1.7;"><colgroup><col style="width: 40%;"><col style="width: 60%;"></colgroup>
        <tr>
          <td style="font-size: 15px; font-weight: 600;">Shipping Fee Due:</td>
          <td align="right" style="font-size: 17px; font-weight: 600; word-break: break-word; overflow-wrap: anywhere;">${formatCurrency(quote.amount, currency)}</td>
        </tr>
      </table>
    </div>
    ${paragraph('Please complete payment for shipping to move your order to dispatch. Our Client Care team will share the payment details for your reference.')}
    ${renderButton({
      href: `${order.storeUrl || 'https://slimkyhair.com/'}order-confirmation/?order_id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.securityToken || '')}`,
      label: 'View Order Status',
    })}
  `;

  const text = `Shipping Payment Required — Order ${ref}

Dear ${customerName},

Thank you for accepting your shipping quote for order ${ref}.

Shipping Fee Due: ${formatCurrency(quote.amount, currency)}

Please complete payment for shipping so we can move your order to dispatch.

View your order status: ${order.storeUrl || 'https://slimkyhair.com/'}order-confirmation/?order_id=${order.id}&token=${order.securityToken || ''}

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: `Complete your shipping payment for order ${ref}.`, bodyHtml }),
    text,
  };
}
