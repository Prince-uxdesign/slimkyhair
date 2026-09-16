import { escapeHtml, heading, paragraph, renderButton, noticeBox, wrapEmailLayout } from '../shared/layout.ts';
import { formatCurrency } from '../shared/order-blocks.ts';
import { orderRef, type OrderPayload, type ShippingQuote } from './types.ts';

export function renderShippingQuote({ order, quote }: { order: OrderPayload; quote: ShippingQuote }) {
  const ref = orderRef(order);
  const currency = quote.currency || 'NGN';
  const provider = quote.provider || 'DHL Express';
  const method = quote.method || 'Standard International Courier';
  const customerName = order.customer.fullName || 'Valued Customer';
  const country = order.delivery.country || 'your destination';

  const subject = `Shipping Quote for Order ${ref} | Slimky Hair`;

  const bodyHtml = `
    ${heading(`Shipping Quote for Order ${escapeHtml(ref)}`)}
    ${paragraph(`Dear ${escapeHtml(customerName)},`)}
    ${paragraph(`We have obtained an actual carrier shipping quote for your botanical formulation delivery to <strong>${escapeHtml(country)}</strong>.`)}

    <div class="card">
      <table role="presentation" width="100%" style="table-layout: fixed; width: 100%; font-size: 13px; line-height: 1.7;"><colgroup><col style="width: 40%;"><col style="width: 60%;"></colgroup>
        <tr><td>Carrier:</td><td align="right" style="word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(provider)}</td></tr>
        <tr><td>Method:</td><td align="right" style="word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(method)}</td></tr>
        <tr>
          <td style="font-size: 15px; font-weight: 600; padding-top: 6px;">Shipping Fee:</td>
          <td align="right" style="font-size: 17px; font-weight: 600; padding-top: 6px; word-break: break-word; overflow-wrap: anywhere;">${formatCurrency(quote.amount, currency)}</td>
        </tr>
        ${quote.estimatedDelivery ? `<tr><td>Estimated Delivery:</td><td align="right" style="word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(quote.estimatedDelivery)}</td></tr>` : ''}
      </table>
    </div>

    ${noticeBox(
      'Customs & Import Duties Notice',
      'Customs duties, import taxes, and international border handling fees are assessed by destination country authorities upon arrival and are paid directly by the recipient. They are strictly separate from this carrier shipping fee.',
    )}

    ${paragraph('You can accept this quote or decline / contact support directly from your order page — no account required.')}
    ${renderButton({
      href: `${order.storeUrl || 'https://slimkyhair.com/'}order-confirmation/?order_id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.securityToken || '')}`,
      label: 'View & Respond to Quote',
    })}
  `;

  const text = `Shipping Quote for Order ${ref}

Dear ${customerName},

We have obtained an actual shipping quote for your order ${ref} to ${country}.

Carrier: ${provider}
Delivery Method: ${method}
Shipping Fee: ${formatCurrency(quote.amount, currency)}
${quote.estimatedDelivery ? `Estimated Delivery: ${quote.estimatedDelivery}\n` : ''}
Customs duties, import taxes, and international border handling fees are determined by destination country border authorities and are paid directly by the recipient upon arrival. They are not included in the carrier shipping fee.

View your order and Accept or Decline this shipping quote here:
${order.storeUrl || 'https://slimkyhair.com/'}order-confirmation/?order_id=${order.id}&token=${order.securityToken || ''}

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: `Your shipping quote for order ${ref} is ready.`, bodyHtml }),
    text,
  };
}
