import { escapeHtml, heading, paragraph, renderButton, wrapEmailLayout } from '../shared/layout.ts';
import { orderRef, type OrderPayload, type Tracking } from './types.ts';

export function renderOrderShipped({ order, tracking }: { order: OrderPayload; tracking: Tracking }) {
  const ref = orderRef(order);
  const customerName = order.customer.fullName || 'Valued Customer';
  const carrier = tracking.carrier || 'Carrier';

  const subject = `Your Order ${ref} Has Been Dispatched | Slimky Hair`;

  const bodyHtml = `
    ${heading('Your Order Has Shipped')}
    ${paragraph(`Dear ${escapeHtml(customerName)}, your order <strong>${escapeHtml(ref)}</strong> is now on its way to you.`)}
    <div class="card">
      <table role="presentation" class="kv-table" width="100%" style="font-size: 13px; line-height: 1.7;"><colgroup><col style="width: 40%;"><col style="width: 60%;"></colgroup>
        <tr><td>Shipping Carrier:</td><td align="right" style="word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(carrier)}</td></tr>
        <tr>
          <td>Tracking Number:</td>
          <td align="right"><code style="background: #EFE9E0; padding: 2px 6px; border-radius: 4px; font-size: 13px; word-break: break-all; overflow-wrap: anywhere;">${escapeHtml(tracking.trackingNumber)}</code></td>
        </tr>
        <tr><td>Destination:</td><td align="right" style="word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(order.delivery.city || '')}, ${escapeHtml(order.delivery.country || '')}</td></tr>
      </table>
    </div>
    ${tracking.trackingUrl ? renderButton({ href: tracking.trackingUrl, label: 'Track Your Package' }) : ''}
  `;

  const text = `Your Order Has Shipped — Order ${ref}

Dear ${customerName},

Your botanical hair formulations for order ${ref} have been carefully packed and handed over to our shipping partner.

Carrier: ${carrier}
Tracking Number: ${tracking.trackingNumber}
${tracking.trackingUrl ? `Tracking Link: ${tracking.trackingUrl}\n` : ''}Destination: ${order.delivery.city || ''}, ${order.delivery.country || ''}

Slimky Hair Fulfillment Team`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: `Order ${ref} is on its way — tracking inside.`, bodyHtml }),
    text,
  };
}
