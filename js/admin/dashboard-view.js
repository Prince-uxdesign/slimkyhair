/**
 * Admin Dashboard Overview View - Slimky Hair
 * Phase A2: Dashboard Overview
 *
 * Pure presentation. Every figure rendered here comes from
 * buildDashboardSnapshot(); this file computes no business numbers of its own.
 *
 * Each section renders one of four honest states — loading, error, empty,
 * populated. There is no placeholder/skeleton content standing in for data that
 * does not exist: an empty section says so in words.
 */

import { formatNaira } from '../cart-store.js';
import { escapeHtml } from '../utils/html-format.js';
import { DATE_RANGE_PRESETS } from './dashboard-service.js';

/**
 * Format an order timestamp for the operator's locale, compactly.
 * @param {string|null} iso
 * @returns {string}
 */
function formatOrderDate(iso) {
  if (!iso) return 'No date recorded';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No date recorded';
  return date.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Human label for a payment_status enum value.
 * @param {string|null} status
 * @returns {string}
 */
function paymentLabel(status) {
  if (!status) return 'Unknown';
  return String(status).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Human label for an order_status enum value.
 * @param {string|null} status
 * @returns {string}
 */
function orderStatusLabel(status) {
  if (!status) return 'Unknown';
  const map = {
    pending_payment: 'Pending Payment',
    paid: 'Paid',
    shipping_quote_required: 'Shipping Quote Required',
    shipping_quote_sent: 'Shipping Quote Sent',
    shipping_payment_pending: 'Shipping Payment Pending',
    shipping_payment_confirmed: 'Shipping Paid',
    ready_for_dispatch: 'Ready for Dispatch',
    shipped: 'Shipped',
    delivered: 'Delivered',
    payment_failed: 'Payment Failed',
    cancelled: 'Cancelled',
    draft: 'Draft'
  };
  return map[status] || paymentLabel(status);
}

/**
 * Order detail deep link.
 *
 * The dedicated order detail route is not built yet (it arrives in a later
 * admin phase). Until it does, a row points at the Orders view with the order
 * preselected via the query string — a real destination that already works,
 * rather than a dead `href="#"`. When /admin/orders/:id ships, only this one
 * function changes.
 *
 * @param {string} orderId
 * @returns {string}
 */
export function orderDetailHref(orderId) {
  return `?view=orders&order=${encodeURIComponent(orderId)}`;
}

/**
 * Section wrapper with a heading and optional trailing action.
 * @returns {string}
 */
function section(title, note, body, action = '') {
  return `
    <section class="admin-dash-section">
      <div class="admin-dash-section-head">
        <div>
          <h3 class="admin-dash-section-title">${escapeHtml(title)}</h3>
          ${note ? `<p class="admin-dash-section-note">${escapeHtml(note)}</p>` : ''}
        </div>
        ${action}
      </div>
      ${body}
    </section>
  `;
}

/**
 * Honest empty state — states plainly that there is no data, never a fake row.
 * @param {string} message
 * @returns {string}
 */
function emptyState(message) {
  return `<div class="admin-dash-empty" role="status">${escapeHtml(message)}</div>`;
}

/**
 * One summary metric card.
 * @returns {string}
 */
function metricCard({ label, value, hint, tone = '' }) {
  return `
    <div class="admin-metric-card ${tone ? `is-${tone}` : ''}">
      <span class="admin-metric-label">${escapeHtml(label)}</span>
      <span class="admin-metric-value">${escapeHtml(String(value))}</span>
      ${hint ? `<span class="admin-metric-hint">${escapeHtml(hint)}</span>` : ''}
    </div>
  `;
}

/**
 * Render the summary metric grid.
 * @param {Object} snapshot
 * @returns {string}
 */
function renderMetrics(snapshot) {
  const m = snapshot.metrics;
  const windowed = snapshot.range.since !== null;
  const windowHint = windowed ? snapshot.range.label : 'All time';

  // Revenue is only stated as a single money figure when every settled payment
  // shares one currency. Mixed currencies are reported, not silently summed.
  const revenueValue = m.mixedCurrency
    ? 'Mixed currencies'
    : formatNaira(m.totalRevenue);
  const revenueHint = m.mixedCurrency
    ? `${m.successfulPayments} settled payments across multiple currencies`
    : `${formatNaira(m.productRevenue)} product · ${formatNaira(m.shippingRevenue)} shipping`;

  const cards = [
    metricCard({
      label: 'Total Orders',
      value: m.totalOrders,
      hint: m.undatedOrders > 0
        ? `${windowHint} · ${m.undatedOrders} undated excluded`
        : windowHint
    }),
    metricCard({
      label: 'Paid Orders',
      value: m.paidOrders,
      hint: m.totalOrders > 0
        ? `${Math.round((m.paidOrders / m.totalOrders) * 100)}% of orders in range`
        : 'No orders in range',
      tone: 'paid'
    }),
    metricCard({
      label: 'Revenue (Settled)',
      value: revenueValue,
      hint: revenueHint,
      tone: 'revenue'
    }),
    metricCard({
      label: 'Registered Customers',
      value: m.totalCustomers,
      hint: windowed
        ? `${m.newCustomers} new · ${m.guestOrdersInRange} guest orders in range`
        : `${m.guestOrdersInRange} guest orders all time`
    }),
    metricCard({
      label: 'Products',
      value: m.totalProducts,
      hint: `${m.trackedSkus} tracked SKUs · current`
    }),
    metricCard({
      label: 'Stock Alerts',
      value: m.lowStockSkus + m.outOfStockSkus,
      hint: `${m.lowStockSkus} low · ${m.outOfStockSkus} out of stock · current`,
      tone: (m.lowStockSkus + m.outOfStockSkus) > 0 ? 'alert' : ''
    })
  ];

  return `<div class="admin-metric-grid">${cards.join('')}</div>`;
}

/**
 * Render the recent orders section (table on desktop, cards on narrow screens).
 * @param {Object} snapshot
 * @returns {string}
 */
function renderRecentOrders(snapshot) {
  const orders = snapshot.recentOrders;

  if (orders.length === 0) {
    return section(
      'Recent Orders',
      null,
      emptyState(
        snapshot.range.since === null
          ? 'No orders yet.'
          : `No orders in the selected range (${snapshot.range.label}).`
      )
    );
  }

  const rows = orders.map(order => {
    const href = orderDetailHref(order.id);
    const customer = order.customerName || order.customerEmail || 'Unnamed customer';
    return `
      <tr>
        <td>
          <a class="admin-order-link" href="${escapeHtml(href)}">${escapeHtml(order.orderNumber)}</a>
        </td>
        <td>
          <div class="admin-dash-customer">${escapeHtml(customer)}</div>
          ${order.isGuest ? '<span class="admin-dash-guest-tag">Guest</span>' : ''}
        </td>
        <td>${escapeHtml(formatOrderDate(order.createdAt))}</td>
        <td class="admin-dash-amount">${escapeHtml(formatNaira(order.amount))}</td>
        <td><span class="admin-badge badge-${escapeHtml(order.paymentStatus || 'pending')}">${escapeHtml(paymentLabel(order.paymentStatus))}</span></td>
        <td><span class="admin-badge badge-${escapeHtml(order.orderStatus || 'pending')}">${escapeHtml(orderStatusLabel(order.orderStatus))}</span></td>
      </tr>
    `;
  }).join('');

  const cards = orders.map(order => {
    const href = orderDetailHref(order.id);
    const customer = order.customerName || order.customerEmail || 'Unnamed customer';
    return `
      <a class="admin-dash-order-card" href="${escapeHtml(href)}">
        <div class="admin-dash-order-card-top">
          <span class="admin-dash-order-number">${escapeHtml(order.orderNumber)}</span>
          <span class="admin-dash-amount">${escapeHtml(formatNaira(order.amount))}</span>
        </div>
        <div class="admin-dash-order-card-customer">
          ${escapeHtml(customer)}${order.isGuest ? ' <span class="admin-dash-guest-tag">Guest</span>' : ''}
        </div>
        <div class="admin-dash-order-card-date">${escapeHtml(formatOrderDate(order.createdAt))}</div>
        <div class="admin-dash-order-card-badges">
          <span class="admin-badge badge-${escapeHtml(order.paymentStatus || 'pending')}">${escapeHtml(paymentLabel(order.paymentStatus))}</span>
          <span class="admin-badge badge-${escapeHtml(order.orderStatus || 'pending')}">${escapeHtml(orderStatusLabel(order.orderStatus))}</span>
        </div>
      </a>
    `;
  }).join('');

  const body = `
    <div class="admin-dash-table-wrap">
      <table class="admin-table admin-dash-table">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Customer</th>
            <th scope="col">Date</th>
            <th scope="col">Amount</th>
            <th scope="col">Payment</th>
            <th scope="col">Order Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="admin-dash-order-cards">${cards}</div>
  `;

  const action = `<a class="btn-admin btn-admin-outline btn-admin-sm" href="?view=orders">View all orders</a>`;
  return section('Recent Orders', `Newest ${orders.length} in range`, body, action);
}

/**
 * Render the order status breakdown.
 * @param {Object} snapshot
 * @returns {string}
 */
function renderStatusBreakdown(snapshot) {
  const { statusBreakdown, totalStatusCounted } = snapshot;

  if (statusBreakdown.length === 0) {
    return section(
      'Order Status Overview',
      null,
      emptyState(
        snapshot.range.since === null
          ? 'No orders yet.'
          : `No orders in the selected range (${snapshot.range.label}).`
      )
    );
  }

  const items = statusBreakdown.map(entry => {
    const pct = totalStatusCounted > 0
      ? Math.round((entry.count / totalStatusCounted) * 100)
      : 0;
    return `
      <li class="admin-status-row">
        <div class="admin-status-row-head">
          <span class="admin-status-dot tone-${escapeHtml(entry.tone)}" aria-hidden="true"></span>
          <span class="admin-status-name">${escapeHtml(entry.label)}</span>
          <span class="admin-status-count">${entry.count}</span>
        </div>
        <div class="admin-status-bar" role="img" aria-label="${escapeHtml(`${entry.label}: ${entry.count} of ${totalStatusCounted} orders`)}">
          <span class="admin-status-bar-fill tone-${escapeHtml(entry.tone)}" style="width: ${pct}%;"></span>
        </div>
      </li>
    `;
  }).join('');

  return section(
    'Order Status Overview',
    `${totalStatusCounted} orders in range`,
    `<ul class="admin-status-list">${items}</ul>`
  );
}

/**
 * Render inventory alerts. Read-only: this view never adjusts stock.
 * @param {Object} snapshot
 * @returns {string}
 */
function renderInventoryAlerts(snapshot) {
  const { lowStock, outOfStock, threshold } = snapshot.inventory;
  const alerts = [...outOfStock, ...lowStock];

  if (snapshot.metrics.trackedSkus === 0) {
    return section('Inventory Alerts', null, emptyState('No inventory records yet.'));
  }

  if (alerts.length === 0) {
    return section(
      'Inventory Alerts',
      `Low-stock threshold: ${threshold} units`,
      emptyState('All tracked SKUs are above the low-stock threshold.')
    );
  }

  const items = alerts.map(entry => {
    const isOut = entry.stock <= 0;
    const label = isOut ? 'Out of Stock' : 'Low Stock';
    const cls = isOut ? 'out-of-stock' : 'low-stock';
    return `
      <li class="admin-alert-row">
        <div class="admin-alert-main">
          <span class="admin-alert-product">${escapeHtml(entry.productName)}</span>
          ${entry.variantName ? `<span class="admin-alert-variant">${escapeHtml(entry.variantName)}</span>` : ''}
          <span class="admin-alert-sku">${escapeHtml(entry.sku)}</span>
        </div>
        <div class="admin-alert-side">
          <span class="admin-stock-number">${entry.stock}</span>
          <span class="admin-badge admin-stock-badge-${cls}">${escapeHtml(label)}</span>
        </div>
      </li>
    `;
  }).join('');

  const action = `<a class="btn-admin btn-admin-outline btn-admin-sm" href="?view=inventory">Manage inventory</a>`;
  return section(
    'Inventory Alerts',
    `${outOfStock.length} out of stock · ${lowStock.length} at or below ${threshold} units`,
    `<ul class="admin-alert-list">${items}</ul>`,
    action
  );
}

/**
 * Render the date range filter control.
 * @param {string} activeRangeId
 * @returns {string}
 */
function renderRangeFilter(activeRangeId) {
  const options = DATE_RANGE_PRESETS.map(preset => `
    <button
      type="button"
      class="admin-range-btn ${preset.id === activeRangeId ? 'is-active' : ''}"
      data-range="${escapeHtml(preset.id)}"
      aria-pressed="${preset.id === activeRangeId ? 'true' : 'false'}"
    >${escapeHtml(preset.label)}</button>
  `).join('');

  return `
    <div class="admin-range-filter" role="group" aria-label="Filter dashboard metrics by date range">
      ${options}
    </div>
  `;
}

/**
 * Loading state for the whole overview. Deliberately a single honest message
 * plus a spinner — not shimmering fake rows that imply data already exists.
 * @returns {string}
 */
export function renderDashboardLoading() {
  return `
    <div class="admin-dash-status" role="status" aria-live="polite">
      <div class="admin-dash-spinner" aria-hidden="true"></div>
      <p>Loading dashboard data…</p>
    </div>
  `;
}

/**
 * Error state for the whole overview.
 * @param {Error|string} error
 * @returns {string}
 */
export function renderDashboardError(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return `
    <div class="admin-dash-status is-error" role="alert">
      <h3>Dashboard data could not be loaded</h3>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn-admin btn-admin-primary btn-admin-sm" id="admin-dash-retry">
        Retry
      </button>
    </div>
  `;
}

/**
 * Render the populated dashboard overview.
 * @param {Object} snapshot
 * @returns {string}
 */
export function renderDashboardOverview(snapshot) {
  return `
    <div class="admin-dash">
      <div class="admin-dash-toolbar">
        ${renderRangeFilter(snapshot.range.id)}
        <button type="button" class="btn-admin btn-admin-outline btn-admin-sm" id="admin-dash-refresh">
          Refresh
        </button>
      </div>

      ${renderMetrics(snapshot)}

      <div class="admin-dash-grid">
        ${renderRecentOrders(snapshot)}
        <div class="admin-dash-column">
          ${renderStatusBreakdown(snapshot)}
          ${renderInventoryAlerts(snapshot)}
        </div>
      </div>
    </div>
  `;
}
