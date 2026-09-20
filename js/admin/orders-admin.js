/**
 * Order Administration — shared query & presentation module (Phase A6)
 *
 * ONE implementation of order list querying, rendered by both entry points:
 * the `/admin` Orders tab and the dedicated `/admin/orders/` route. There is
 * no second order system and no second copy of this logic — both routes drive
 * the same controller in js/admin-page.js.
 *
 * Division of responsibility:
 * - order-store.js owns order records, status transitions and the history log.
 *   It is the only module that writes an order.
 * - payment-model.js owns the status vocabulary and which transitions are
 *   legal for each checkout flow. This module never re-implements that table.
 * - admin-service.js owns authorization and the base filter set.
 * - This module is PURE: it only selects, sorts, paginates and presents.
 *   It never mutates an order and never touches inventory.
 *
 * Everything here is exported so it can be tested without standing up the DOM.
 */

import { escapeHtml } from '../utils/html-format.js';
import { ORDER_STATUS, PAYMENT_STATUS } from '../payment/payment-model.js';

/** Rows per page in the admin order list. */
export const ORDERS_PAGE_SIZE = 10;

/** Sortable columns. `dir` is the direction applied on first selection. */
export const ORDER_SORTS = Object.freeze([
  { id: 'date-desc', label: 'Newest first' },
  { id: 'date-asc', label: 'Oldest first' },
  { id: 'amount-desc', label: 'Amount (high to low)' },
  { id: 'amount-asc', label: 'Amount (low to high)' },
  { id: 'customer-asc', label: 'Customer (A–Z)' },
  { id: 'customer-desc', label: 'Customer (Z–A)' },
  { id: 'status-asc', label: 'Order status' }
]);

export const DEFAULT_ORDER_SORT = 'date-desc';

/**
 * Workflow order used by the "Order status" sort, so the list reads as a
 * fulfilment pipeline rather than alphabetically. Mirrors the lifecycle in
 * payment-model.js — it does not invent new states.
 */
const STATUS_RANK = Object.freeze({
  [ORDER_STATUS.DRAFT]: 0,
  [ORDER_STATUS.PENDING_PAYMENT]: 1,
  [ORDER_STATUS.PAYMENT_FAILED]: 2,
  [ORDER_STATUS.PAID]: 3,
  [ORDER_STATUS.SHIPPING_QUOTE_REQUIRED]: 4,
  [ORDER_STATUS.SHIPPING_QUOTE_SENT]: 5,
  [ORDER_STATUS.SHIPPING_PAYMENT_PENDING]: 6,
  [ORDER_STATUS.SHIPPING_PAYMENT_CONFIRMED]: 7,
  [ORDER_STATUS.READY_FOR_DISPATCH]: 8,
  [ORDER_STATUS.SHIPPED]: 9,
  [ORDER_STATUS.DELIVERED]: 10,
  [ORDER_STATUS.CANCELLED]: 11
});

/* ------------------------------------------------------------------ */
/* Field selectors                                                     */
/*                                                                     */
/* Orders carry two historical shapes: a nested one (order.customer,   */
/* order.delivery, order.pricing) and a flat snapshot one              */
/* (order.customerName, order.country). Every read goes through these  */
/* so the difference is handled in exactly one place.                  */
/* ------------------------------------------------------------------ */

export function getCustomerName(order) {
  return order?.customer?.fullName || order?.customerName || 'Guest';
}

export function getCustomerEmail(order) {
  return order?.customer?.email || order?.customerEmail || '';
}

export function getCustomerPhone(order) {
  return order?.customer?.phone || order?.customerPhone || '';
}

export function getShippingCountry(order) {
  return order?.delivery?.country || order?.country || 'Nigeria';
}

export function getShippingState(order) {
  return order?.delivery?.state || order?.state || '';
}

/**
 * The amount the customer has been charged for PRODUCTS. Shipping is quoted
 * and paid separately in both flows, so it is deliberately never folded in
 * here — see getShippingAmount().
 */
export function getOrderTotal(order) {
  const pricing = order?.pricing || {};
  const value = pricing.productPaymentTotal ?? pricing.subtotal ?? order?.productPaymentTotal ?? order?.subtotal ?? 0;
  return Number(value) || 0;
}

/** The separately-quoted shipping amount, or null when not yet quoted. */
export function getShippingAmount(order) {
  const raw = order?.pricing?.shippingAmount
    ?? order?.shippingAmount
    ?? order?.shippingQuote?.amount
    ?? null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Human summary of where the order sits in the shipping workflow. */
export function getShippingStatusLabel(order) {
  return order?.pricing?.shippingStatus
    || order?.shippingStatus
    || (isNigeriaFlow(order) ? 'Calculated separately' : 'Quote required');
}

export function isNigeriaFlow(order) {
  return (order?.flow || 'nigeria_checkout') === 'nigeria_checkout';
}

export function getOrderTimestamp(order) {
  const t = Date.parse(order?.createdAt);
  return Number.isFinite(t) ? t : 0;
}

/** Title-case a snake_case status for display. */
export function humanizeStatus(status) {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Query                                                               */
/* ------------------------------------------------------------------ */

/**
 * Apply search, filters, sort and pagination to an order set.
 *
 * Pure: the input array is never mutated. Filtering that admin-service.js
 * already performs (status, payment status, queue, search) is NOT repeated
 * here — this function receives the already-authorized, already-filtered set
 * and adds only what the list view itself owns: country filter, sort, paging.
 *
 * @param {Array<Object>} orders
 * @param {{country?: string, sort?: string, page?: number, pageSize?: number}} state
 * @returns {{rows: Array<Object>, total: number, page: number, pageCount: number,
 *            pageSize: number, from: number, to: number, countries: Array<string>}}
 */
export function applyOrderQuery(orders, state = {}) {
  const {
    country = 'all',
    sort = DEFAULT_ORDER_SORT,
    page = 1,
    pageSize = ORDERS_PAGE_SIZE
  } = state;

  const all = Array.isArray(orders) ? orders.slice() : [];

  // Country options come from the unfiltered set, so selecting a country
  // never empties the dropdown that produced it.
  const countries = [...new Set(all.map(getShippingCountry).filter(Boolean))].sort();

  let rows = country === 'all'
    ? all
    : all.filter(o => getShippingCountry(o) === country);

  rows = sortOrders(rows, sort);

  const total = rows.length;
  const safePageSize = Math.max(1, Number(pageSize) || ORDERS_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (safePage - 1) * safePageSize;

  return {
    rows: rows.slice(start, start + safePageSize),
    total,
    page: safePage,
    pageCount,
    pageSize: safePageSize,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(total, start + safePageSize),
    countries
  };
}

/**
 * Sort orders by the given sort id. Ties break on newest-first so paging is
 * stable and an order never appears on two pages.
 */
export function sortOrders(orders, sortId = DEFAULT_ORDER_SORT) {
  const rows = Array.isArray(orders) ? orders.slice() : [];
  const newest = (a, b) => getOrderTimestamp(b) - getOrderTimestamp(a);
  const byName = (a, b) => getCustomerName(a).localeCompare(getCustomerName(b));

  switch (sortId) {
    case 'date-asc':
      return rows.sort((a, b) => getOrderTimestamp(a) - getOrderTimestamp(b) || byName(a, b));
    case 'amount-desc':
      return rows.sort((a, b) => getOrderTotal(b) - getOrderTotal(a) || newest(a, b));
    case 'amount-asc':
      return rows.sort((a, b) => getOrderTotal(a) - getOrderTotal(b) || newest(a, b));
    case 'customer-asc':
      return rows.sort((a, b) => byName(a, b) || newest(a, b));
    case 'customer-desc':
      return rows.sort((a, b) => byName(b, a) || newest(a, b));
    case 'status-asc':
      return rows.sort((a, b) => {
        const ra = STATUS_RANK[a?.orderStatus] ?? 99;
        const rb = STATUS_RANK[b?.orderStatus] ?? 99;
        return ra - rb || newest(a, b);
      });
    case 'date-desc':
    default:
      return rows.sort(newest);
  }
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

export function formatOrderDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatOrderDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/** Sort dropdown markup for the list toolbar. */
export function renderSortSelect(currentSort) {
  return `
    <label class="admin-visually-hidden" for="admin-order-sort">Sort orders</label>
    <select id="admin-order-sort" class="admin-select" aria-label="Sort orders">
      ${ORDER_SORTS.map(option => `
        <option value="${option.id}" ${option.id === currentSort ? 'selected' : ''}>${escapeHtml(option.label)}</option>
      `).join('')}
    </select>
  `;
}

/** Country filter markup for the list toolbar. */
export function renderCountrySelect(countries, currentCountry) {
  return `
    <label class="admin-visually-hidden" for="admin-filter-country">Filter by shipping country</label>
    <select id="admin-filter-country" class="admin-select" aria-label="Filter by shipping country">
      <option value="all" ${currentCountry === 'all' ? 'selected' : ''}>All Countries</option>
      ${countries.map(country => `
        <option value="${escapeHtml(country)}" ${country === currentCountry ? 'selected' : ''}>${escapeHtml(country)}</option>
      `).join('')}
    </select>
  `;
}

/**
 * Pagination control for the order list.
 * @param {ReturnType<typeof applyOrderQuery>} result
 */
export function renderOrdersPagination(result) {
  if (!result || result.total === 0) return '';

  if (result.pageCount <= 1) {
    return `
      <div class="admin-pagination">
        <span class="admin-pagination-info">${result.total} order${result.total === 1 ? '' : 's'}</span>
      </div>
    `;
  }

  return `
    <nav class="admin-pagination" aria-label="Order list pagination">
      <span class="admin-pagination-info">Showing ${result.from}–${result.to} of ${result.total}</span>
      <div class="admin-pagination-controls">
        <button type="button" class="btn-admin btn-admin-outline btn-admin-sm admin-order-page-btn"
                data-page="${result.page - 1}" ${result.page === 1 ? 'disabled' : ''}>Previous</button>
        <span class="admin-pagination-page">Page ${result.page} of ${result.pageCount}</span>
        <button type="button" class="btn-admin btn-admin-outline btn-admin-sm admin-order-page-btn"
                data-page="${result.page + 1}" ${result.page === result.pageCount ? 'disabled' : ''}>Next</button>
      </div>
    </nav>
  `;
}

/**
 * "Order not found" state for a detail route pointed at an id that does not
 * exist. The previous behaviour was a silent no-op, which left the operator
 * staring at an unchanged screen with no explanation.
 *
 * @param {string} orderId The requested id, echoed back for support triage.
 * @param {string} backHref
 */
export function renderOrderNotFound(orderId, backHref) {
  return `
    <div class="admin-card">
      <div class="admin-empty-state">
        <div class="admin-empty-icon" aria-hidden="true">🔍</div>
        <h3>Order not found</h3>
        <p>No order matches <code>${escapeHtml(orderId)}</code>. It may have been removed, or the reference may be mistyped.</p>
        <a href="${escapeHtml(backHref)}" class="btn-admin btn-admin-primary btn-admin-sm">Back to all orders</a>
      </div>
    </div>
  `;
}

export { escapeHtml, ORDER_STATUS, PAYMENT_STATUS };
