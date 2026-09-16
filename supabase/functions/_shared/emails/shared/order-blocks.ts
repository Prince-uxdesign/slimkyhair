/**
 * Reusable order-email building blocks: item rows, pricing summary, formatting.
 * Shared across every order lifecycle email so they render identically.
 */
import { COLORS } from './tokens.ts';
import { escapeHtml } from './layout.ts';

export interface OrderItem {
  productName: string;
  variantName?: string;
  quantity: number;
  lineSubtotal?: number;
  lineTotal?: number;
}

export function formatCurrency(amount: number | string, currency = 'NGN'): string {
  const num = Number(amount) || 0;
  if (currency === 'NGN') return `₦${num.toLocaleString('en-NG')}`;
  const symbols: Record<string, string> = { USD: '$', GBP: '£', EUR: '€' };
  const symbol = symbols[currency] || `${currency} `;
  return `${symbol}${num.toLocaleString('en-US')}`;
}

export function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Long product names wrap naturally; no fixed-width truncation. */
export function renderOrderItemsTable(items: OrderItem[], currency = 'NGN'): string {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.productName)}</strong><br>
            <span style="font-size: 12px; color: ${COLORS.muted};">${escapeHtml(item.variantName || 'Standard')}</span>
          </td>
          <td align="center">${Number(item.quantity)}</td>
          <td align="right" style="font-weight: 500; white-space: nowrap;">
            ${formatCurrency(item.lineSubtotal ?? item.lineTotal ?? 0, currency)}
          </td>
        </tr>`,
    )
    .join('');

  return `
    <table role="presentation" class="items-table" style="table-layout: fixed; width: 100%;">
      <colgroup>
        <col style="width: 55%;">
        <col style="width: 15%;">
        <col style="width: 30%;">
      </colgroup>
      <thead>
        <tr>
          <th>Item</th>
          <th align="center">Qty</th>
          <th align="right">Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export interface OrderSummaryFields {
  subtotal: number;
  shippingStatusLabel: string;
  totalPaid: number;
  currency?: string;
}

export function renderOrderSummary({ subtotal, shippingStatusLabel, totalPaid, currency = 'NGN' }: OrderSummaryFields): string {
  return `
    <table role="presentation" class="kv-table" width="100%" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
           font-size: 13px; line-height: 1.6; border-top: 1px solid ${COLORS.border}; padding-top: 12px;">
      <colgroup><col style="width: 44%;"><col style="width: 56%;"></colgroup>
      <tr>
        <td>Product Subtotal:</td>
        <td align="right" style="font-weight: 500; word-break: break-word; overflow-wrap: anywhere;">${formatCurrency(subtotal, currency)}</td>
      </tr>
      <tr>
        <td>Shipping Status:</td>
        <td align="right" style="color: ${COLORS.inkSoft ?? '#4A423D'}; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(shippingStatusLabel)}</td>
      </tr>
      <tr>
        <td style="font-size: 15px; font-weight: 600; padding-top: 8px;">Total Paid:</td>
        <td align="right" style="font-size: 18px; font-weight: 600; color: ${COLORS.ink}; padding-top: 8px; word-break: break-word; overflow-wrap: anywhere;">
          ${formatCurrency(totalPaid, currency)}
        </td>
      </tr>
    </table>`;
}

export interface OrderMetaFields {
  orderNumber: string;
  orderDate: string;
  paymentStatusLabel: string;
  customerEmail: string;
}

export function renderOrderMetaCard({ orderNumber, orderDate, paymentStatusLabel, customerEmail }: OrderMetaFields): string {
  return `
    <table role="presentation" class="kv-table" width="100%" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
           font-size: 13px; line-height: 1.7;">
      <colgroup><col style="width: 40%;"><col style="width: 60%;"></colgroup>
      <tr>
        <td>Order Number:</td>
        <td align="right" class="order-number">${escapeHtml(orderNumber)}</td>
      </tr>
      <tr>
        <td>Order Date:</td>
        <td align="right" style="word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(orderDate)}</td>
      </tr>
      <tr>
        <td>Payment Status:</td>
        <td align="right" style="color: ${COLORS.sage}; font-weight: 600; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(paymentStatusLabel)}</td>
      </tr>
      <tr>
        <td>Customer Email:</td>
        <td align="right" style="word-break: break-all; overflow-wrap: anywhere;">${escapeHtml(customerEmail)}</td>
      </tr>
    </table>`;
}
