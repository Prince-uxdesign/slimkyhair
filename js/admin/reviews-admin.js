/**
 * Review Administration — shared query & presentation module (Phase A8)
 *
 * ONE presentation of review moderation, rendered by the `/admin/reviews/`
 * route through the controller in js/admin-page.js. There is no second review
 * system: js/reviews/review-service.js owns records, states and writes; this
 * module only selects, sorts, paginates and presents. It never mutates a
 * review and never touches the catalogue.
 *
 * Everything here is exported so it can be tested without standing up the DOM.
 */

import { escapeHtml } from '../utils/html-format.js';
import { REVIEW_STATUS, REVIEW_ACTIONS } from '../reviews/review-service.js';

/** Rows per page in the admin review list. */
export const REVIEWS_PAGE_SIZE = 10;

export const REVIEW_SORTS = Object.freeze([
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'rating-desc', label: 'Rating (high to low)' },
  { id: 'rating-asc', label: 'Rating (low to high)' },
  { id: 'product-asc', label: 'Product (A–Z)' }
]);

export const DEFAULT_REVIEW_SORT = 'newest';

const STATUS_LABEL = Object.freeze({
  [REVIEW_STATUS.PENDING]: 'Pending',
  [REVIEW_STATUS.APPROVED]: 'Approved',
  [REVIEW_STATUS.REJECTED]: 'Rejected',
  [REVIEW_STATUS.HIDDEN]: 'Hidden'
});

export function reviewStatusLabel(status) {
  return STATUS_LABEL[status] || String(status || 'Unknown');
}

/** Moderator actions offered for a review in the given state. */
export function actionsFor(status) {
  switch (status) {
    case REVIEW_STATUS.PENDING: return [REVIEW_ACTIONS.APPROVE, REVIEW_ACTIONS.REJECT];
    case REVIEW_STATUS.APPROVED: return [REVIEW_ACTIONS.HIDE, REVIEW_ACTIONS.REJECT];
    case REVIEW_STATUS.REJECTED: return [REVIEW_ACTIONS.APPROVE, REVIEW_ACTIONS.REOPEN];
    case REVIEW_STATUS.HIDDEN: return [REVIEW_ACTIONS.APPROVE, REVIEW_ACTIONS.REOPEN];
    default: return [];
  }
}

const ACTION_LABEL = Object.freeze({
  [REVIEW_ACTIONS.APPROVE]: 'Approve',
  [REVIEW_ACTIONS.REJECT]: 'Reject',
  [REVIEW_ACTIONS.HIDE]: 'Hide',
  [REVIEW_ACTIONS.REOPEN]: 'Reopen'
});

/**
 * Join submissions with catalogue product info for display. Unknown product
 * ids (e.g. a product archived after submission) render honestly instead of
 * vanishing — moderation history must survive catalogue edits.
 */
export function buildReviewRows({ reviews = [], productsById = {} } = {}) {
  return (Array.isArray(reviews) ? reviews : []).map(r => {
    const product = productsById[r.productId] || null;
    return {
      ...r,
      productName: product?.name || 'Unknown product',
      productSlug: product?.slug || null,
      productMissing: !product
    };
  });
}

function rowTime(row) {
  const ms = new Date(row.createdAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function queryReviews(rows, state = {}) {
  const {
    search = '',
    status = 'all',
    rating = 'all',
    sort = DEFAULT_REVIEW_SORT,
    page = 1,
    pageSize = REVIEWS_PAGE_SIZE
  } = state;

  const counts = { all: rows.length, pending: 0, approved: 0, rejected: 0, hidden: 0 };
  for (const r of rows) {
    if (counts[r.status] !== undefined) counts[r.status] += 1;
  }

  let out = rows;
  if (status !== 'all') out = out.filter(r => r.status === status);
  if (rating !== 'all') out = out.filter(r => Number(r.rating) === Number(rating));

  const q = String(search).trim().toLowerCase();
  if (q) {
    out = out.filter(r =>
      String(r.text || '').toLowerCase().includes(q) ||
      String(r.title || '').toLowerCase().includes(q) ||
      String(r.author || '').toLowerCase().includes(q) ||
      String(r.productName || '').toLowerCase().includes(q));
  }

  out = out.slice().sort((a, b) => {
    switch (sort) {
      case 'oldest': return rowTime(a) - rowTime(b);
      case 'rating-desc': return Number(b.rating) - Number(a.rating) || rowTime(b) - rowTime(a);
      case 'rating-asc': return Number(a.rating) - Number(b.rating) || rowTime(b) - rowTime(a);
      case 'product-asc': return String(a.productName).localeCompare(String(b.productName)) || rowTime(b) - rowTime(a);
      case 'newest':
      default: return rowTime(b) - rowTime(a);
    }
  });

  const total = out.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (safePage - 1) * pageSize;

  return { rows: out.slice(start, start + pageSize), total, page: safePage, pageCount, counts };
}

export function formatReviewDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

function stars(rating) {
  const n = Math.round(Number(rating) || 0);
  return '★'.repeat(Math.min(5, Math.max(0, n))) + '☆'.repeat(5 - Math.min(5, Math.max(0, n)));
}

function actionButtons(row) {
  return actionsFor(row.status).map(action => `
    <button type="button" class="btn-admin btn-admin-outline btn-admin-sm admin-rev-action"
            data-action="${action}" data-review-id="${escapeHtml(row.id)}">
      ${ACTION_LABEL[action]}
    </button>`).join('');
}

function historyDetails(row) {
  const history = Array.isArray(row.history) ? row.history : [];
  if (history.length === 0) return '';
  return `
    <details class="admin-rev-history">
      <summary>Moderation history (${history.length})</summary>
      <ul>
        ${history.map(h => `
          <li>
            <strong>${escapeHtml(h.from ? `${h.from} → ${h.to}` : String(h.to || 'recorded'))}</strong>
            ${h.note ? ` — ${escapeHtml(h.note)}` : ''}
            <span class="admin-rev-history-meta">${escapeHtml(h.actor || '')} · ${escapeHtml(formatReviewDate(h.timestamp))}</span>
          </li>`).join('')}
      </ul>
    </details>`;
}

/**
 * Render the review moderation list: status tabs, toolbar, table, cards,
 * pagination. Uses the shared admin table/card/pagination primitives.
 */
export function renderReviewsList(result, state, root) {
  const { rows, total, page, pageCount, counts } = result;

  const tabs = [
    ['all', 'All Reviews', counts.all],
    [REVIEW_STATUS.PENDING, 'Pending', counts.pending],
    [REVIEW_STATUS.APPROVED, 'Approved', counts.approved],
    [REVIEW_STATUS.REJECTED, 'Rejected', counts.rejected],
    [REVIEW_STATUS.HIDDEN, 'Hidden', counts.hidden]
  ];

  const empty = counts.all === 0
    ? '<div class="admin-dash-empty" role="status">No reviews yet. Customer submissions will appear here for moderation.</div>'
    : '<div class="admin-dash-empty" role="status">No reviews match this search or filter.</div>';

  return `
    <div class="admin-queue-bar" role="tablist" aria-label="Review moderation status">
      ${tabs.map(([id, label, count]) => `
        <button type="button" class="admin-queue-tab ${state.status === id ? 'is-active' : ''}"
                data-status="${id}" role="tab" aria-selected="${state.status === id}">
          <span>${escapeHtml(label)}</span>
          <span class="admin-queue-count">${count}</span>
        </button>`).join('')}
    </div>

    <div class="admin-toolbar">
      <div class="admin-search-box">
        <span class="admin-search-icon">🔍</span>
        <input type="text" id="admin-rev-search" class="admin-search-input"
               placeholder="Search review text, author or product…"
               value="${escapeHtml(state.search)}" aria-label="Search reviews">
      </div>
      <div class="admin-filter-group">
        <select id="admin-rev-rating" class="admin-select" aria-label="Filter by rating">
          <option value="all" ${state.rating === 'all' ? 'selected' : ''}>All ratings</option>
          ${[5, 4, 3, 2, 1].map(n => `
            <option value="${n}" ${String(state.rating) === String(n) ? 'selected' : ''}>${n} star${n === 1 ? '' : 's'}</option>`).join('')}
        </select>
        <select id="admin-rev-sort" class="admin-select" aria-label="Sort reviews">
          ${REVIEW_SORTS.map(s => `
            <option value="${s.id}" ${state.sort === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="admin-card">
      ${rows.length === 0 ? empty : `
        <div class="admin-table-wrap admin-rev-table-wrap">
          <table class="admin-table admin-rev-table">
            <thead>
              <tr>
                <th scope="col">Review</th>
                <th scope="col">Product</th>
                <th scope="col">Rating</th>
                <th scope="col" class="admin-rev-hide-md">Customer</th>
                <th scope="col" class="admin-rev-hide-md">Date</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td class="admin-rev-text-cell">
                    ${r.title ? `<div class="admin-rev-title">${escapeHtml(r.title)}</div>` : ''}
                    <div class="admin-rev-text">${escapeHtml(r.text)}</div>
                    ${historyDetails(r)}
                  </td>
                  <td>
                    <div style="font-weight: 600;">${escapeHtml(r.productName)}</div>
                    ${r.productMissing ? '<div class="admin-cust-phone">Product no longer in catalogue</div>' : ''}
                  </td>
                  <td style="white-space: nowrap;" aria-label="${Number(r.rating)} out of 5 stars">${stars(r.rating)}</td>
                  <td class="admin-rev-hide-md">
                    <div style="font-weight: 600;">${escapeHtml(r.author)}</div>
                    ${r.customerEmail ? `<div class="admin-cust-phone">${escapeHtml(r.customerEmail)}</div>` : ''}
                  </td>
                  <td class="admin-rev-hide-md">${escapeHtml(formatReviewDate(r.createdAt))}</td>
                  <td><span class="admin-badge badge-${escapeHtml(r.status)}">${escapeHtml(reviewStatusLabel(r.status))}</span></td>
                  <td><div class="admin-rev-actions">${actionButtons(r)}</div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="admin-cards-list admin-rev-cards">
          ${rows.map(r => `
            <article class="admin-cust-card">
              <div class="admin-cust-card-top">
                <span class="admin-cust-card-name">${escapeHtml(r.productName)}</span>
                <span class="admin-badge badge-${escapeHtml(r.status)}">${escapeHtml(reviewStatusLabel(r.status))}</span>
              </div>
              ${r.title ? `<div class="admin-rev-title">${escapeHtml(r.title)}</div>` : ''}
              <div class="admin-rev-text">${escapeHtml(r.text)}</div>
              <div class="admin-cust-card-meta">
                <span aria-label="${Number(r.rating)} out of 5 stars">${stars(r.rating)}</span>
                <span>${escapeHtml(r.author)}</span>
                <span>${escapeHtml(formatReviewDate(r.createdAt))}</span>
              </div>
              ${historyDetails(r)}
              <div class="admin-rev-actions">${actionButtons(r)}</div>
            </article>`).join('')}
        </div>
      `}
    </div>

    ${pageCount > 1 ? `
      <nav class="admin-pagination" aria-label="Review list pages">
        <span class="admin-pagination-info">${total} review${total === 1 ? '' : 's'}</span>
        <div class="admin-pagination-controls">
          <button type="button" class="btn-admin btn-admin-outline btn-admin-sm"
                  id="admin-rev-prev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
          <span class="admin-pagination-page">Page ${page} of ${pageCount}</span>
          <button type="button" class="btn-admin btn-admin-outline btn-admin-sm"
                  id="admin-rev-next" ${page >= pageCount ? 'disabled' : ''}>Next</button>
        </div>
      </nav>` : `<p class="admin-inv-footnote">${total} review${total === 1 ? '' : 's'}</p>`}
  `;
}

export { escapeHtml, REVIEW_STATUS, REVIEW_ACTIONS };
