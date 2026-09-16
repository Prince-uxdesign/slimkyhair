import { escapeHtml, heading, paragraph, renderButton, noticeBox, wrapEmailLayout } from '../shared/layout.ts';
import { formatCurrency } from '../shared/order-blocks.ts';
import { isNigeriaFlow, orderRef, type OrderPayload, type ShippingQuote } from './types.ts';

export function renderShippingQuote({ order, quote }: { order: OrderPayload; quote: ShippingQuote }) {
  const ref = orderRef(order);
  const nigeria = isNigeriaFlow(order);
  const currency = quote.currency || (nigeria ? 'NGN' : 'NGN');
  const provider = quote.provider || (nigeria ? 'Local Courier' : 'DHL Express');
  const method = quote.method || (nigeria ? 'Doorstep Delivery' : 'Standard International Courier');
  const customerName = order.customer.fullName || 'Valued Customer';
  const destination = nigeria ? (order.delivery.state || order.delivery.city || 'your destination') : (order.delivery.country || 'your destination');

  const subject = `Shipping Quote for Order ${ref} | Slimky Hair`;

  const bodyHtml = `
    ${heading(`Shipping Quote for Order ${escapeHtml(ref)}`)}
    ${paragraph(`Dear ${escapeHtml(customerName)},`)}
    ${paragraph(`We have confirmed your actual delivery fee for your botanical formulation delivery to <strong>${escapeHtml(destination)}</strong>.`)}

    <div class="card">
      <table role="presentation" class="kv-table" width="100%" style="font-size: 13px; line-height: 1.7;"><colgroup><col style="width: 40%;"><col style="width: 60%;"></colgroup>
        <tr><td>${nigeria ? 'Provider:' : 'Carrier:'}</td><td align="right" style="word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(provider)}</td></tr>
        <tr><td>Method:</td><td align="right" style="word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(method)}</td></tr>
        <tr>
          <td style="font-size: 15px; font-weight: 600; padding-top: 6px;">${nigeria ? 'Delivery Fee:' : 'Shipping Fee:'}</td>
          <td align="right" style="font-size: 17px; font-weight: 600; padding-top: 6px; word-break: break-word; overflow-wrap: anywhere;">${formatCurrency(quote.amount, currency)}</td>
        </tr>
        ${quote.estimatedDelivery ? `<tr><td>Estimated Delivery:</td><td align="right" style="word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(quote.estimatedDelivery)}</td></tr>` : ''}
      </table>
    </div>

    ${nigeria ? '' : noticeBox(
      'Customs & Import Duties Notice',
      'Customs duties, import taxes, and international border handling fees are assessed by destination country authorities upon arrival and are paid directly by the recipient. They are strictly separate from this carrier shipping fee.',
    )}

    ${paragraph('You can accept and pay this quote directly from your order page — no account required.')}
    ${renderButton({
      href: `${order.storeUrl || 'https://slimkyhair.com/'}order-confirmation/?order_id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.securityToken || '')}`,
      label: 'View & Respond to Quote',
    })}
  `;

  const text = `Shipping Quote for Order ${ref}

Dear ${customerName},

We have confirmed your actual delivery fee for your order ${ref} to ${destination}.

${nigeria ? 'Provider' : 'Carrier'}: ${provider}
Delivery Method: ${method}
${nigeria ? 'Delivery Fee' : 'Shipping Fee'}: ${formatCurrency(quote.amount, currency)}
${quote.estimatedDelivery ? `Estimated Delivery: ${quote.estimatedDelivery}\n` : ''}
${nigeria ? '' : 'Customs duties, import taxes, and international border handling fees are determined by destination country border authorities and are paid directly by the recipient upon arrival. They are not included in the carrier shipping fee.\n'}
View your order and accept & pay this shipping quote here:
${order.storeUrl || 'https://slimkyhair.com/'}order-confirmation/?order_id=${order.id}&token=${order.securityToken || ''}

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: `Your shipping quote for order ${ref} is ready.`, bodyHtml }),
    text,
  };
}
