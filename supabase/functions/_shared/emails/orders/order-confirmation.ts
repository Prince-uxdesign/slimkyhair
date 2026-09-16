/**
 * Order Confirmation email — also serves as the payment confirmation, since
 * in the current checkout flow an order only exists once product payment has
 * been verified (see requirement: "payment confirmation where implemented").
 */
import { badge, escapeHtml, heading, paragraph, renderButton, noticeBox, wrapEmailLayout } from '../shared/layout.ts';
import { formatCurrency, formatDate, renderOrderItemsTable, renderOrderMetaCard, renderOrderSummary } from '../shared/order-blocks.ts';
import { isNigeriaFlow, orderRef, type OrderPayload } from './types.ts';

export function renderOrderConfirmation(order: OrderPayload) {
  const ref = orderRef(order);
  const currency = order.pricing.currency || 'NGN';
  const nigeria = isNigeriaFlow(order);
  const storeUrl = order.storeUrl || 'https://slimkyhair.com/';
  const customerName = order.customer.fullName || 'Valued Customer';

  const subject = `Order Confirmed · ${ref} · Slimky Hair`;

  const shippingNotice = nigeria
    ? `Delivery fee is calculated separately. Our logistics team will contact you via WhatsApp / Phone at <strong>${escapeHtml(order.customer.phone || '')}</strong> with the delivery fee for ${escapeHtml(order.delivery.state || order.delivery.city)} before dispatch.`
    : `Shipping quote required. Slimky logistics will calculate international courier rates based on package weight and send the official quote to <strong>${escapeHtml(order.customer.email)}</strong>.`;

  const bodyHtml = `
    ${badge('Payment Verified · Order Placed')}
    ${heading('Order Confirmed')}
    ${paragraph(`Thank you for your order, <strong>${escapeHtml(customerName)}</strong>. Your product payment has been verified and your formulations are queued for processing.`)}

    <div class="card">
      ${renderOrderMetaCard({
        orderNumber: ref,
        orderDate: formatDate(order.createdAt),
        paymentStatusLabel: 'Successful (Verified)',
        customerEmail: order.customer.email,
      })}
      ${renderOrderItemsTable(order.items, currency)}
      ${renderOrderSummary({
        subtotal: order.pricing.subtotal,
        shippingStatusLabel: order.pricing.shippingStatus,
        totalPaid: order.pricing.productPaymentTotal,
        currency,
      })}
    </div>

    ${noticeBox(nigeria ? 'Logistics & Delivery Fee Notice' : 'International Shipping Quote Notice', shippingNotice)}

    ${paragraph(`
      <strong>Delivery Destination:</strong><br>
      ${escapeHtml(order.customer.fullName)}<br>
      ${escapeHtml(order.delivery.address)}, ${escapeHtml(order.delivery.city)}${order.delivery.state ? ', ' + escapeHtml(order.delivery.state) : ''}${order.delivery.postalCode ? ' ' + escapeHtml(order.delivery.postalCode) : ''}, ${escapeHtml(order.delivery.country)}
      ${order.delivery.instructions ? `<br><em>Notes: "${escapeHtml(order.delivery.instructions)}"</em>` : ''}
    `)}

    ${renderButton({
      href: `${storeUrl}order-confirmation/?order_id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.securityToken || '')}`,
      label: 'View Live Order Receipt',
    })}
  `;

  const text = `Order Confirmed

Thank you for your order, ${customerName}!

Order Number: ${ref}
Date: ${formatDate(order.createdAt)}
Payment Status: Successful (Verified)
Total Paid: ${formatCurrency(order.pricing.productPaymentTotal, currency)}

ITEMS ORDERED:
${order.items.map((it) => `- ${it.productName} (${it.variantName || 'Standard'}) x ${it.quantity} — ${formatCurrency(it.lineSubtotal ?? it.lineTotal ?? 0, currency)}`).join('\n')}

Product Subtotal: ${formatCurrency(order.pricing.subtotal, currency)}
Shipping: ${order.pricing.shippingStatus}
Total: ${formatCurrency(order.pricing.productPaymentTotal, currency)}

DELIVERY DESTINATION:
${order.delivery.address}
${order.delivery.city}${order.delivery.state ? ', ' + order.delivery.state : ''}${order.delivery.postalCode ? ' ' + order.delivery.postalCode : ''}
${order.delivery.country}

View your order receipt: ${storeUrl}order-confirmation/?order_id=${order.id}&token=${order.securityToken || ''}

Slimky Hair Client Care
care@slimkyhair.com`;

  return {
    subject,
    html: wrapEmailLayout({ title: subject, previewText: `Your order ${ref} is confirmed and payment verified.`, bodyHtml }),
    text,
  };
}
