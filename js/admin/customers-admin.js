/**
 * Customer Administration — shared query & presentation module (Phase A7)
 *
 * ONE implementation of customer querying and presentation, rendered by the
 * `/admin/customers/` route (list and detail). There is no second customer
 * system: customerService owns registered accounts and addresses, OrderStore
 * owns orders, and this module only selects, groups, sorts, paginates and
 * presents what those two already hold.
 *
 * Two kinds of customer exist in this architecture and they are NOT the same
 * record type:
 *
 *  - REGISTERED customers are rows in the `customers` store, with an id, a
 *    status, saved addresses and orders linked by `customer_id`.
 *  - GUEST customers have no account at all. They exist only as the customer
 *    snapshot on their own orders (`customer_email` / `customer_name` /
 *    `customer_phone`). This module derives a read-only view of them by
 *    grouping guest orders on email.
 *
 * Deliberate boundary — see `linkHistoricalOrders` / `canConvertGuestOrder` in
 * customer-service.js: a guest order is only ever attached to an account
 * through the existing conversion flow, which requires the order's secret
 * security token. This module therefore NEVER folds a guest order into a
 * registered customer's history just because the email matches. Where such
 * orders exist we surface them as an unlinked signal, clearly labelled, and
 * leave the claiming to the customer-driven flow.
 *
 * Everything is exported so it can be tested without standing up the DOM.
 */

import { escapeHtml } from '../utils/html-format.js';
import { formatNaira } from '../cart-store.js';
import { PAYMENT_STATUS } from '../payment/payment-model.js';
import { formatOrderStatus, formatPaymentStatus } from '../auth/customer-orders-helper.js';

/** Rows per page in the admin customer list. */
export const CUSTOMERS_PAGE_SIZE = 10;

/** Customer record kinds. */
export const CUSTOMER_KIND = Object.freeze({
  REGISTERED: 'registered',
  GUEST: 'guest'
});

/** Sort options. */
export const CUSTOMER_SORTS = Object.freeze([
  { id: 'recent-order', label: 'Most recent order' },
  { id: 'name-asc', label: 'Name (A–Z)' },
  { id: 'name-desc', label: 'Name (Z–A)' },
  { id: 'orders-desc', label: 'Most orders' },
  { id: 'spend-desc', label: 'Highest spend' },
  { id: 'registered-desc', label: 'Newest account' },
  { id: 'registered-asc', label: 'Oldest account' }
]);

export const DEFAULT_CUSTOMER_SORT = 'recent-order';

/**
 * Account status labels. Mirrors CUSTOMER_STATUSES in customer-service.js —
 * no status name is invented here.
 */
const STATUS_LABELS = Object.freeze({
  guest: 'Guest',
  registered: 'Registered',
  pending_confirmation: 'Pending Confirmation',
  active: 'Active',
  suspended: 'Suspended'
});

const STATUS_TONE = Object.freeze({
  active: 'paid',
  registered: 'quote',
  pending_confirmation: 'pending',
  suspended: 'failed',
  guest: 'pending'
});

export function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || 'Unknown');
}

export function statusTone(status) {
  return STATUS_TONE[status] || 'pending';
}

/** Epoch ms for a record timestamp, tolerating the snake_case schema alias. */
function timeOf(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Normalized email key used for grouping. Never used to claim orders. */
function emailKey(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Reduce a set of orders to the per-customer aggregates the list needs.
 * A single pass — no per-column re-filtering.
 *
 * @param {Array<Object>} orders
 * @returns {{count: number, totalPaid: number, lastOrderAt: number|null, lastOrder: Object|null}}
 */
function summarizeOrders(orders) {
  let totalPaid = 0;
  let lastOrderAt = null;
  let lastOrder = null;

  for (const order of orders) {
    // Spend counts only money that actually settled, so the figure matches the
    // payments ledger rather than the value of abandoned carts.
    const paid = (order.paymentStatus || order.payment_status) === PAYMENT_STATUS.SUCCESSFUL;
    if (paid) {
      totalPaid += Number(
        order.productPaymentTotal ?? order.product_payment_total ?? order.total ?? 0
      ) || 0;
    }

    const ms = timeOf(order.createdAt || order.created_at);
    if (ms !== null && (lastOrderAt === null || ms > lastOrderAt)) {
      lastOrderAt = ms;
      lastOrder = order;
    }
  }

  return { count: orders.length, totalPaid, lastOrderAt, lastOrder };
}

/**
 * Build the unified customer row set: registered accounts plus derived guests.
 *
 * @param {Object} input
 * @param {Array<Object>} input.customers Registered customer records (sanitized)
 * @param {Array<Object>} input.orders All orders
 * @returns {Array<Object>} rows
 */
export function buildCustomerRows({ customers = [], orders = [] } = {}) {
  // Index orders once: by customer id (the only authoritative link) and,
  // separately, guest orders by email (a grouping key, never a claim).
  const byCustomerId = new Map();
  const guestOrdersByEmail = new Map();

  for (const order of orders) {
    if (!order) continue;
    const customerId = order.customerId ?? order.customer_id ?? null;
    const isGuest = order.isGuest !== undefined ? Boolean(order.isGuest) : Boolean(order.is_guest);

    if (customerId) {
      if (!byCustomerId.has(customerId)) byCustomerId.set(customerId, []);
      byCustomerId.get(customerId).push(order);
      continue;
    }

    if (isGuest) {
      const key = emailKey(order.customerEmail || order.customer_email || order.customer?.email);
      if (!key) continue;
      if (!guestOrdersByEmail.has(key)) guestOrdersByEmail.set(key, []);
      guestOrdersByEmail.get(key).push(order);
    }
  }

  const rows = [];
  const registeredEmails = new Set();

  for (const customer of customers) {
    const linked = byCustomerId.get(customer.id) || [];
    const summary = summarizeOrders(linked);
    const key = emailKey(customer.email);
    registeredEmails.add(key);

    // Guest orders sharing this email are reported as UNLINKED, never merged.
    const unlinkedGuestOrders = guestOrdersByEmail.get(key) || [];

    rows.push({
      kind: CUSTOMER_KIND.REGISTERED,
      id: customer.id,
      name: customer.fullName || '',
      email: customer.email || '',
      phone: customer.phone || '',
      status: customer.status || 'registered',
      registeredAt: customer.createdAt || null,
      registeredMs: timeOf(customer.createdAt),
      orderCount: summary.count,
      totalPaid: summary.totalPaid,
      lastOrderAt: summary.lastOrderAt,
      lastOrder: summary.lastOrder,
      unlinkedGuestOrderCount: unlinkedGuestOrders.length
    });
  }

  for (const [key, guestOrders] of guestOrdersByEmail) {
    // A guest who also holds an account is already represented by that account
    // row (with its unlinked count). Listing them twice would imply two people.
    if (registeredEmails.has(key)) continue;

    const summary = summarizeOrders(guestOrders);
    const newest = summary.lastOrder || guestOrders[0];

    rows.push({
      kind: CUSTOMER_KIND.GUEST,
      // Guests have no account id. The email key addresses the group, and is
      // prefixed so it can never be mistaken for a real customer id.
      id: `guest:${key}`,
      name: newest?.customerName || newest?.customer_name || newest?.customer?.fullName || '',
      email: newest?.customerEmail || newest?.customer_email || key,
      phone: newest?.customerPhone || newest?.customer_phone || '',
      status: 'guest',
      registeredAt: null,
      registeredMs: null,
      orderCount: summary.count,
      totalPaid: summary.totalPaid,
      lastOrderAt: summary.lastOrderAt,
      lastOrder: summary.lastOrder,
      unlinkedGuestOrderCount: 0
    });
  }

  return rows;
}

/**
 * Apply search, filters, sorting and pagination.
 *
 * @param {Array<Object>} rows
 * @param {Object} state { search, kind, status, sort, page }
 * @returns {{rows: Array<Object>, total: number, page: number, pageCount: number, counts: Object}}
 */
export function queryCustomers(rows, state = {}) {
  const {
    search = '',
    kind = 'all',
    status = 'all',
    sort = DEFAULT_CUSTOMER_SORT,
    page = 1,
    pageSize = CUSTOMERS_PAGE_SIZE
  } = state;

  const counts = {
    all: rows.length,
    registered: 0,
    guest: 0
  };
  for (const r of rows) counts[r.kind] += 1;

  let out = rows;

  if (kind !== 'all') out = out.filter(r => r.kind === kind);
  if (status !== 'all') out = out.filter(r => r.status === status);

  const q = String(search).trim().toLowerCase();
  if (q) {
    out = out.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.phone.toLowerCase().includes(q)
    );
  }

  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  const nullsLast = (a, b) => {
    // A customer who has never ordered sorts last on order-based sorts rather
    // than jumping to the top as a zero/epoch value.
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return null;
  };

  out = out.slice().sort((a, b) => {
    switch (sort) {
      case 'name-asc': return byName(a, b);
      case 'name-desc': return byName(b, a);
      case 'orders-desc': return (b.orderCount - a.orderCount) || byName(a, b);
      case 'spend-desc': return (b.totalPaid - a.totalPaid) || byName(a, b);
      case 'registered-desc': {
        const n = nullsLast(a.registeredMs, b.registeredMs);
        return n !== null ? n : (b.registeredMs - a.registeredMs) || byName(a, b);
      }
      case 'registered-asc': {
        const n = nullsLast(a.registeredMs, b.registeredMs);
        return n !== null ? n : (a.registeredMs - b.registeredMs) || byName(a, b);
      }
      case 'recent-order':
      default: {
        const n = nullsLast(a.lastOrderAt, b.lastOrderAt);
        return n !== null ? n : (b.lastOrderAt - a.lastOrderAt) || byName(a, b);
      }
    }
  });

  const total = out.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    rows: out.slice(start, start + pageSize),
    total,
    page: safePage,
    pageCount,
    counts
  };
}

/**
 * Resolve one customer row plus the detail a support agent needs.
 *
 * Order history is resolved by the authoritative link only:
 *  - a registered customer gets orders whose `customer_id` is theirs;
 *  - a guest group gets the guest orders carrying that email.
 * The two are never mixed. Orders that merely share a registered customer's
 * email are returned separately as `unlinkedGuestOrders`, explicitly unclaimed.
 *
 * @param {Object} input
 * @param {string} input.id Row id (`cust_…` or `guest:<email>`)
 * @param {Array<Object>} input.customers
 * @param {Array<Object>} input.orders
 * @param {Array<Object>} [input.addresses]
 * @returns {Object|null}
 */
export function buildCustomerDetail({ id, customers = [], orders = [], addresses = [] } = {}) {
  const rows = buildCustomerRows({ customers, orders });
  const row = rows.find(r => r.id === id);
  if (!row) return null;

  const isGuest = row.kind === CUSTOMER_KIND.GUEST;
  const key = emailKey(row.email);

  const linkedOrders = orders.filter(o => {
    const customerId = o.customerId ?? o.customer_id ?? null;
    if (isGuest) {
      const guestFlag = o.isGuest !== undefined ? Boolean(o.isGuest) : Boolean(o.is_guest);
      return !customerId && guestFlag &&
        emailKey(o.customerEmail || o.customer_email || o.customer?.email) === key;
    }
    return customerId === row.id;
  });

  const unlinkedGuestOrders = isGuest ? [] : orders.filter(o => {
    const customerId = o.customerId ?? o.customer_id ?? null;
    const guestFlag = o.isGuest !== undefined ? Boolean(o.isGuest) : Boolean(o.is_guest);
    return !customerId && guestFlag &&
      emailKey(o.customerEmail || o.customer_email || o.customer?.email) === key;
  });

  const byNewest = (a, b) =>
    (timeOf(b.createdAt || b.created_at) ?? 0) - (timeOf(a.createdAt || a.created_at) ?? 0);

  return {
    ...row,
    orders: linkedOrders.slice().sort(byNewest),
    unlinkedGuestOrders: unlinkedGuestOrders.slice().sort(byNewest),
    // A guest has no saved address book — only the delivery snapshot on each
    // order, which is shown with the order rather than as profile data.
    addresses: isGuest ? [] : addresses
  };
}

/* ------------------------------------------------------------------ render */

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/** Kind badge — the registered/guest distinction, stated plainly. */
function kindBadge(kind) {
  return kind === CUSTOMER_KIND.GUEST
    ? '<span class="admin-badge admin-cust-kind is-guest">Guest Customer</span>'
    : '<span class="admin-badge admin-cust-kind is-registered">Registered Customer</span>';
}

function statusBadge(status) {
  return `<span class="admin-badge badge-${escapeHtml(statusTone(status))}">${escapeHtml(statusLabel(status))}</span>`;
}

/** Link to a customer's detail view. */
export function customerDetailHref(root, id) {
  return `${root}customers/?id=${encodeURIComponent(id)}`;
}

/** Link to an order, matching the admin's existing order deep-link shape. */
export function orderHref(root, orderId) {
  return `${root}?view=orders&order=${encodeURIComponent(orderId)}`;
}

/**
 * Render the customer list body: filters, toolbar, table, cards, pagination.
 *
 * @param {Object} result Output of queryCustomers()
 * @param {Object} state Current query state
 * @param {string} root Admin root path
 * @returns {string}
 */
export function renderCustomerList(result, state, root) {
  const { rows, total, page, pageCount, counts } = result;

  const tabs = [
    ['all', 'All Customers', counts.all],
    ['registered', 'Registered', counts.registered],
    ['guest', 'Guests', counts.guest]
  ];

  const statusOptions = ['all', 'active', 'registered', 'pending_confirmation', 'suspended', 'guest'];

  const empty = counts.all === 0
    ? '<div class="admin-dash-empty" role="status">No customers yet.</div>'
    : '<div class="admin-dash-empty" role="status">No customers match this search or filter.</div>';

  return `
    <div class="admin-queue-bar" role="tablist" aria-label="Customer type">
      ${tabs.map(([id, label, count]) => `
        <button type="button" class="admin-queue-tab ${state.kind === id ? 'is-active' : ''}"
                data-kind="${id}" role="tab" aria-selected="${state.kind === id}">
          <span>${escapeHtml(label)}</span>
          <span class="admin-queue-count">${count}</span>
        </button>
      `).join('')}
    </div>

    <div class="admin-toolbar">
      <div class="admin-search-box">
        <span class="admin-search-icon">🔍</span>
        <input type="text" id="admin-cust-search" class="admin-search-input"
               placeholder="Search name, email or phone…"
               value="${escapeHtml(state.search)}" aria-label="Search customers">
      </div>

      <div class="admin-filter-group">
        <select id="admin-cust-status" class="admin-select" aria-label="Filter by account status">
          ${statusOptions.map(s => `
            <option value="${s}" ${state.status === s ? 'selected' : ''}>
              ${s === 'all' ? 'All statuses' : escapeHtml(statusLabel(s))}
            </option>
          `).join('')}
        </select>
        <select id="admin-cust-sort" class="admin-select" aria-label="Sort customers">
          ${CUSTOMER_SORTS.map(s => `
            <option value="${s.id}" ${state.sort === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>
          `).join('')}
        </select>
      </div>
    </div>

    <div class="admin-card">
      ${rows.length === 0 ? empty : `
        <div class="admin-table-wrap admin-cust-table-wrap">
          <table class="admin-table admin-cust-table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Contact</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col" class="admin-cust-hide-md">Registered</th>
                <th scope="col">Orders</th>
                <th scope="col" class="admin-cust-hide-md">Last Order</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>
                    <a class="admin-order-link" href="${escapeHtml(customerDetailHref(root, r.id))}">
                      ${escapeHtml(r.name || 'Unnamed customer')}
                    </a>
                  </td>
                  <td>
                    <div class="admin-cust-email">${escapeHtml(r.email)}</div>
                    <div class="admin-cust-phone">${escapeHtml(r.phone || 'No phone')}</div>
                  </td>
                  <td>${kindBadge(r.kind)}</td>
                  <td>${statusBadge(r.status)}</td>
                  <td class="admin-cust-hide-md">${escapeHtml(formatDate(r.registeredAt))}</td>
                  <td>
                    <span class="admin-stock-number">${r.orderCount}</span>
                    ${r.totalPaid > 0 ? `<div class="admin-cust-spend">${escapeHtml(formatNaira(r.totalPaid))}</div>` : ''}
                  </td>
                  <td class="admin-cust-hide-md">${escapeHtml(r.lastOrderAt ? formatDate(r.lastOrderAt) : 'Never')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="admin-cards-list admin-cust-cards">
          ${rows.map(r => `
            <a class="admin-cust-card" href="${escapeHtml(customerDetailHref(root, r.id))}">
              <div class="admin-cust-card-top">
                <span class="admin-cust-card-name">${escapeHtml(r.name || 'Unnamed customer')}</span>
                ${kindBadge(r.kind)}
              </div>
              <div class="admin-cust-email">${escapeHtml(r.email)}</div>
              <div class="admin-cust-phone">${escapeHtml(r.phone || 'No phone')}</div>
              <div class="admin-cust-card-meta">
                ${statusBadge(r.status)}
                <span>${r.orderCount} order${r.orderCount === 1 ? '' : 's'}</span>
                <span>${escapeHtml(r.lastOrderAt ? formatDate(r.lastOrderAt) : 'No orders')}</span>
              </div>
            </a>
          `).join('')}
        </div>
      `}
    </div>

    ${pageCount > 1 ? `
      <nav class="admin-pagination" aria-label="Customer list pages">
        <span class="admin-pagination-info">${total} customer${total === 1 ? '' : 's'}</span>
        <div class="admin-pagination-controls">
          <button type="button" class="btn-admin btn-admin-outline btn-admin-sm"
                  id="admin-cust-prev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
          <span class="admin-pagination-page">Page ${page} of ${pageCount}</span>
          <button type="button" class="btn-admin btn-admin-outline btn-admin-sm"
                  id="admin-cust-next" ${page >= pageCount ? 'disabled' : ''}>Next</button>
        </div>
      </nav>
    ` : `<p class="admin-inv-footnote">${total} customer${total === 1 ? '' : 's'}</p>`}
  `;
}

/**
 * Render one order row for the detail view's history.
 * @returns {string}
 */
function orderRow(order, root) {
  const id = order.id;
  const number = order.orderNumber || order.order_number || id;
  const amount = Number(
    order.productPaymentTotal ?? order.product_payment_total ?? order.total ?? 0
  ) || 0;
  return `
    <li class="admin-cust-order">
      <div class="admin-cust-order-top">
        <a class="admin-order-link" href="${escapeHtml(orderHref(root, id))}">${escapeHtml(number)}</a>
        <span class="admin-dash-amount">${escapeHtml(formatNaira(amount))}</span>
      </div>
      <div class="admin-cust-order-meta">
        <span>${escapeHtml(formatDate(order.createdAt || order.created_at))}</span>
        <span class="admin-badge badge-${escapeHtml(order.paymentStatus || order.payment_status || 'pending')}">
          ${escapeHtml(formatPaymentStatus(order.paymentStatus || order.payment_status))}
        </span>
        <span class="admin-badge badge-${escapeHtml(order.orderStatus || order.order_status || 'pending')}">
          ${escapeHtml(formatOrderStatus(order.orderStatus || order.order_status))}
        </span>
      </div>
    </li>
  `;
}

/**
 * Render the customer detail view.
 *
 * @param {Object} detail Output of buildCustomerDetail()
 * @param {string} root Admin root path
 * @returns {string}
 */
export function renderCustomerDetail(detail, root) {
  const isGuest = detail.kind === CUSTOMER_KIND.GUEST;

  const profileRows = [
    ['Name', detail.name || '—'],
    ['Email', detail.email || '—'],
    ['Phone', detail.phone || '—'],
    ['Account type', isGuest ? 'Guest Customer (no account)' : 'Registered Customer'],
    ['Registered', isGuest ? 'Never registered' : formatDateTime(detail.registeredAt)],
    ['Orders', String(detail.orderCount)],
    ['Settled spend', formatNaira(detail.totalPaid)],
    ['Last order', detail.lastOrderAt ? formatDateTime(detail.lastOrderAt) : 'Never']
  ];

  const addressBlock = isGuest
    ? `<div class="admin-dash-empty" role="status">
         Guest customers have no saved address book. The delivery address used is
         recorded on each individual order.
       </div>`
    : (detail.addresses.length === 0
        ? '<div class="admin-dash-empty" role="status">No saved addresses.</div>'
        : `<ul class="admin-cust-addresses">
            ${detail.addresses.map(a => `
              <li class="admin-cust-address">
                <div class="admin-cust-address-label">
                  ${escapeHtml(a.label || 'Address')}
                  ${a.isDefault ? '<span class="admin-badge badge-paid">Default</span>' : ''}
                </div>
                <div>${escapeHtml(a.recipientName || '')}</div>
                <div>${escapeHtml(a.streetAddress || '')}</div>
                <div>${escapeHtml([a.city, a.state, a.postalCode].filter(Boolean).join(', '))}</div>
                <div>${escapeHtml(a.country || '')}</div>
                ${a.phone ? `<div class="admin-cust-phone">${escapeHtml(a.phone)}</div>` : ''}
              </li>
            `).join('')}
          </ul>`);

  return `
    <div class="admin-cust-detail">
      <div class="admin-cust-detail-head">
        <a class="btn-admin btn-admin-outline btn-admin-sm" href="${escapeHtml(root)}customers/">← All customers</a>
      </div>

      <section class="admin-dash-section">
        <div class="admin-dash-section-head">
          <div>
            <h3 class="admin-dash-section-title">${escapeHtml(detail.name || 'Unnamed customer')}</h3>
            <p class="admin-dash-section-note">${escapeHtml(detail.email)}</p>
          </div>
          <div class="admin-cust-detail-badges">
            ${kindBadge(detail.kind)}
            ${statusBadge(detail.status)}
          </div>
        </div>

        <dl class="admin-detail-grid admin-cust-profile">
          ${profileRows.map(([k, v]) => `
            <div class="admin-detail-item">
              <dt class="admin-order-card-label">${escapeHtml(k)}</dt>
              <dd>${escapeHtml(String(v))}</dd>
            </div>
          `).join('')}
        </dl>

        <p class="admin-cust-privacy">
          Passwords, session tokens and password-reset tokens are never loaded by
          this screen. Account credentials are not part of a customer record.
        </p>
      </section>

      <div class="admin-dash-grid">
        <section class="admin-dash-section">
          <div class="admin-dash-section-head">
            <div>
              <h3 class="admin-dash-section-title">Order History</h3>
              <p class="admin-dash-section-note">
                ${isGuest
                  ? 'Guest orders placed with this email address'
                  : 'Orders linked to this account'}
              </p>
            </div>
          </div>
          ${detail.orders.length === 0
            ? '<div class="admin-dash-empty" role="status">No orders yet.</div>'
            : `<ul class="admin-cust-orders">${detail.orders.map(o => orderRow(o, root)).join('')}</ul>`}
        </section>

        <div class="admin-dash-column">
          <section class="admin-dash-section">
            <div class="admin-dash-section-head">
              <div><h3 class="admin-dash-section-title">Addresses</h3></div>
            </div>
            ${addressBlock}
          </section>

          ${!isGuest && detail.unlinkedGuestOrders.length > 0 ? `
            <section class="admin-dash-section">
              <div class="admin-dash-section-head">
                <div>
                  <h3 class="admin-dash-section-title">Unlinked Guest Orders</h3>
                  <p class="admin-dash-section-note">Same email address · not part of this account</p>
                </div>
              </div>
              <p class="admin-cust-privacy">
                ${detail.unlinkedGuestOrders.length} guest order${detail.unlinkedGuestOrders.length === 1 ? '' : 's'}
                use this email but ${detail.unlinkedGuestOrders.length === 1 ? 'is' : 'are'} not attached to the
                account. They are shown for support context only and are deliberately
                NOT counted in this customer's order history or spend — a guest order
                is claimed only through the customer's own conversion flow, which
                requires the order's security token.
              </p>
              <ul class="admin-cust-orders">${detail.unlinkedGuestOrders.map(o => orderRow(o, root)).join('')}</ul>
            </section>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}
