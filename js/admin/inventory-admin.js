/**
 * Inventory Administration — shared view module (Phase A5)
 *
 * ONE implementation of the inventory admin, rendered by both entry points:
 * the `/admin` Inventory tab and the dedicated `/admin/inventory/` route.
 * There is no second inventory system and no second copy of this markup —
 * both routes drive the same controller in js/admin-page.js.
 *
 * Division of responsibility:
 * - inventory-service.js owns stock, the low-stock threshold and the audit
 *   ledger. It is the only module that writes a stock level.
 * - product-service.js / catalog-data.js own what products and variants exist.
 * - This module only presents them and collects operator intent.
 *
 * This module never writes stock itself: every adjustment goes through
 * inventoryService.adjustStock(), which enforces admin authorization, refuses
 * negative quantities and records who changed what, when and why.
 */

import { escapeHtml } from '../utils/html-format.js';
import {
  getAvailabilityLabel,
  getLowStockThreshold,
  getAdjustmentHistory,
  ADJUSTMENT_REASONS,
  ADJUSTMENT_SOURCE
} from '../inventory/inventory-service.js';

/** Sortable columns. `dir` is the direction applied on first click. */
export const INVENTORY_SORTS = Object.freeze([
  { id: 'product', label: 'Product A–Z', dir: 'asc' },
  { id: 'stock', label: 'Stock', dir: 'asc' },
  { id: 'updated', label: 'Last updated', dir: 'desc' },
  { id: 'sku', label: 'SKU', dir: 'asc' }
]);

export const DEFAULT_SORT = { key: 'product', dir: 'asc' };

/**
 * Apply search, availability filter and sort to the row set.
 *
 * Kept pure and exported so the behaviour can be tested directly, without
 * standing up the DOM.
 *
 * @param {Array<Object>} rows
 * @param {{search?: string, availability?: string, sort?: {key: string, dir: string}}} state
 * @returns {Array<Object>}
 */
export function applyInventoryQuery(rows, state = {}) {
  const { search = '', availability = 'all', sort = DEFAULT_SORT } = state;
  let out = Array.isArray(rows) ? rows.slice() : [];

  if (availability !== 'all') {
    out = out.filter(r => r.availability.className === availability);
  }

  const q = String(search).trim().toLowerCase();
  if (q) {
    out = out.filter(r =>
      (r.productName || '').toLowerCase().includes(q) ||
      (r.sku || '').toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q) ||
      (r.variantName || '').toLowerCase().includes(q)
    );
  }

  const dir = sort.dir === 'desc' ? -1 : 1;
  const byText = (a, b) => String(a || '').localeCompare(String(b || ''));

  out.sort((a, b) => {
    switch (sort.key) {
      case 'stock':
        // Tie-break by product so equal stock levels keep a stable, readable order.
        return (a.stock - b.stock) * dir || byText(a.productName, b.productName);
      case 'updated': {
        const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return (at - bt) * dir || byText(a.productName, b.productName);
      }
      case 'sku':
        return byText(a.sku, b.sku) * dir;
      case 'product':
      default:
        return (byText(a.productName, b.productName) || byText(a.variantName, b.variantName)) * dir;
    }
  });

  return out;
}

/**
 * Relative "last updated" label, falling back to an absolute date beyond a week.
 * @param {string|null} iso
 * @returns {string}
 */
export function formatLastUpdated(iso) {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'Never';

  const diff = Date.now() - then;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m} min${m === 1 ? '' : 's'} ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (diff < 7 * 86_400_000) {
    const d = Math.floor(diff / 86_400_000);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }
  return new Date(then).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Absolute timestamp for the audit trail, where precision matters. */
export function formatAuditTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/** Short human label for a ledger entry's origin. */
export function sourceLabel(source) {
  switch (source) {
    case ADJUSTMENT_SOURCE.ADMIN: return 'Admin adjustment';
    case ADJUSTMENT_SOURCE.ORDER: return 'Order deduction';
    case ADJUSTMENT_SOURCE.RESTORE: return 'Order restore';
    case ADJUSTMENT_SOURCE.PRODUCT_SYNC: return 'Product management';
    default: return 'Movement';
  }
}

/** Reason id -> label, for display. */
export function reasonLabel(reasonId) {
  return ADJUSTMENT_REASONS.find(r => r.id === reasonId)?.label || '';
}

/**
 * Availability filter tabs with live counts.
 * @param {Array<Object>} allRows
 * @param {string} active
 * @returns {string}
 */
function renderFilterTabs(allRows, active) {
  const counts = { all: allRows.length, 'in-stock': 0, 'low-stock': 0, 'out-of-stock': 0 };
  for (const r of allRows) counts[r.availability.className] += 1;

  const tabs = [
    ['all', 'All SKUs'],
    ['in-stock', 'In Stock'],
    ['low-stock', 'Low Stock'],
    ['out-of-stock', 'Out of Stock']
  ];

  return `
    <div class="admin-queue-bar" role="tablist" aria-label="Inventory Availability Filters">
      ${tabs.map(([id, label]) => `
        <button type="button" class="admin-queue-tab ${active === id ? 'is-active' : ''}"
                data-availability="${id}" role="tab" aria-selected="${active === id}">
          <span>${escapeHtml(label)}</span>
          <span class="admin-queue-count">${counts[id]}</span>
        </button>
      `).join('')}
    </div>
  `;
}

/**
 * Search box, sort control and the configurable low-stock threshold.
 * @returns {string}
 */
function renderToolbar(state) {
  const threshold = getLowStockThreshold();
  return `
    <div class="admin-toolbar">
      <div class="admin-search-box">
        <span class="admin-search-icon">🔍</span>
        <input type="text" id="admin-inventory-search-input" class="admin-search-input"
               placeholder="Search product, variant, SKU or category…"
               value="${escapeHtml(state.search)}"
               aria-label="Search inventory">
      </div>

      <div class="admin-filter-group">
        <label class="admin-inv-sort-label" for="admin-inventory-sort">Sort</label>
        <select id="admin-inventory-sort" class="admin-select" aria-label="Sort inventory">
          ${INVENTORY_SORTS.map(s => `
            <option value="${s.id}" ${state.sort.key === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>
          `).join('')}
        </select>
        <button type="button" id="admin-inventory-sort-dir" class="btn-admin btn-admin-outline btn-admin-sm"
                aria-label="Toggle sort direction, currently ${state.sort.dir === 'asc' ? 'ascending' : 'descending'}">
          ${state.sort.dir === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
        <button type="button" id="admin-inventory-threshold-btn" class="btn-admin btn-admin-outline btn-admin-sm">
          Low-stock: ${threshold}
        </button>
      </div>
    </div>
  `;
}

/** One table row. */
function renderRow(row) {
  return `
    <tr data-sku="${escapeHtml(row.sku)}">
      <td>
        <div class="admin-inv-product">${escapeHtml(row.productName)}</div>
        <div class="admin-inv-category">${escapeHtml(row.category)}</div>
      </td>
      <td class="admin-inv-hide-tablet">${escapeHtml(row.variantName)}</td>
      <td><code>${escapeHtml(row.sku)}</code></td>
      <td><span class="admin-stock-number">${row.stock}</span></td>
      <td>
        <span class="admin-badge admin-stock-badge-${escapeHtml(row.availability.className)}">${escapeHtml(row.availability.label.split(' · ')[0])}</span>
      </td>
      <td class="admin-inv-hide-tablet admin-inv-updated">${escapeHtml(formatLastUpdated(row.updatedAt))}</td>
      <td>
        <div class="admin-inv-actions">
          <button type="button" class="btn-admin btn-admin-primary btn-admin-sm inv-adjust-btn"
                  data-sku="${escapeHtml(row.sku)}">Adjust</button>
          <button type="button" class="btn-admin btn-admin-outline btn-admin-sm inv-history-btn"
                  data-sku="${escapeHtml(row.sku)}">History</button>
        </div>
      </td>
    </tr>
  `;
}

/** One mobile card. */
function renderCard(row) {
  return `
    <div class="admin-inventory-card" data-sku="${escapeHtml(row.sku)}">
      <div class="admin-order-card-header">
        <div>
          <span class="admin-inv-category">${escapeHtml(row.category)}</span>
          <div class="admin-inv-product admin-inv-product-lg">${escapeHtml(row.productName)}</div>
          <div class="admin-inv-variant-line">${escapeHtml(row.variantName)} · <code>${escapeHtml(row.sku)}</code></div>
        </div>
        <span class="admin-badge admin-stock-badge-${escapeHtml(row.availability.className)}">${escapeHtml(row.availability.label.split(' · ')[0])}</span>
      </div>

      <div class="admin-inventory-card-stock-row">
        <div>
          <div class="admin-order-card-label">Current Stock</div>
          <div class="admin-stock-number admin-stock-number-lg">${row.stock}</div>
        </div>
        <div>
          <div class="admin-order-card-label">Last Updated</div>
          <div class="admin-inv-updated">${escapeHtml(formatLastUpdated(row.updatedAt))}</div>
        </div>
      </div>

      <div class="admin-inv-actions admin-inv-actions-mobile">
        <button type="button" class="btn-admin btn-admin-primary btn-admin-sm inv-adjust-btn"
                data-sku="${escapeHtml(row.sku)}">Adjust Stock</button>
        <button type="button" class="btn-admin btn-admin-outline btn-admin-sm inv-history-btn"
                data-sku="${escapeHtml(row.sku)}">History</button>
      </div>
    </div>
  `;
}

/**
 * Render the inventory list body (filters, toolbar, table and cards).
 *
 * @param {Array<Object>} allRows Every managed SKU row
 * @param {Object} state { search, availability, sort }
 * @returns {string}
 */
export function renderInventoryBody(allRows, state) {
  const rows = applyInventoryQuery(allRows, state);
  const threshold = getLowStockThreshold();

  const empty = allRows.length === 0
    ? `<div class="admin-dash-empty" role="status">No inventory records yet.</div>`
    : `<div class="admin-dash-empty" role="status">No SKUs match this search or filter.</div>`;

  return `
    ${renderFilterTabs(allRows, state.availability)}
    ${renderToolbar(state)}

    <div class="admin-card">
      ${rows.length === 0 ? empty : `
        <div class="admin-table-wrap admin-inventory-table-wrap">
          <table class="admin-table admin-inventory-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" class="admin-inv-hide-tablet">Variant</th>
                <th scope="col">SKU</th>
                <th scope="col">Stock</th>
                <th scope="col">Status</th>
                <th scope="col" class="admin-inv-hide-tablet">Last Updated</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>${rows.map(renderRow).join('')}</tbody>
          </table>
        </div>
        <div class="admin-cards-list admin-inventory-cards-list">${rows.map(renderCard).join('')}</div>
      `}
    </div>

    <p class="admin-inv-footnote">
      Showing ${rows.length} of ${allRows.length} SKUs · Low-stock threshold ${threshold} units ·
      Stock is deducted automatically on verified payment, never on views, cart adds or wishlists.
    </p>
  `;
}

/**
 * Adjustment dialog for one SKU.
 * @param {Object} row
 * @returns {string}
 */
export function renderAdjustDialog(row) {
  return `
    <div class="admin-modal-header">
      <div>
        <h3>Adjust Stock</h3>
        <p class="admin-inv-dialog-sub">${escapeHtml(row.productName)} · ${escapeHtml(row.variantName)} · <code>${escapeHtml(row.sku)}</code></p>
      </div>
      <button type="button" class="admin-modal-close" id="inv-dialog-close" aria-label="Close">&times;</button>
    </div>

    <div class="admin-modal-body">
      <form id="inv-adjust-form" novalidate>
        <div id="inv-adjust-error" class="admin-inv-error" role="alert" hidden></div>

        <div class="admin-inv-current">
          <span class="admin-order-card-label">Current quantity</span>
          <span class="admin-stock-number admin-stock-number-lg" id="inv-current-qty">${row.stock}</span>
        </div>

        <div class="admin-inv-field">
          <label for="inv-new-qty">New quantity</label>
          <div class="admin-stock-adjust-group">
            <button type="button" class="admin-stock-step-btn" id="inv-qty-minus" aria-label="Decrease quantity">−</button>
            <input type="number" id="inv-new-qty" class="admin-stock-input" value="${row.stock}" min="0" step="1"
                   inputmode="numeric" aria-describedby="inv-delta">
            <button type="button" class="admin-stock-step-btn" id="inv-qty-plus" aria-label="Increase quantity">+</button>
          </div>
          <p class="admin-inv-delta" id="inv-delta" aria-live="polite">No change</p>
        </div>

        <div class="admin-inv-field">
          <label for="inv-reason">Reason</label>
          <select id="inv-reason" class="admin-select" required>
            <option value="">Select a reason…</option>
            ${ADJUSTMENT_REASONS.map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`).join('')}
          </select>
        </div>

        <div class="admin-inv-field">
          <label for="inv-note">Note <span class="admin-inv-optional">(required for "Other")</span></label>
          <textarea id="inv-note" class="admin-inv-textarea" rows="2"
                    placeholder="Anything a colleague would need to understand this change"></textarea>
        </div>

        <div class="admin-inv-dialog-actions">
          <button type="button" class="btn-admin btn-admin-outline" id="inv-adjust-cancel">Cancel</button>
          <button type="submit" class="btn-admin btn-admin-primary" id="inv-adjust-save">Save Adjustment</button>
        </div>
      </form>
    </div>
  `;
}

/**
 * Audit history dialog for one SKU.
 * @param {Object} row
 * @returns {string}
 */
export function renderHistoryDialog(row) {
  const entries = getAdjustmentHistory({ sku: row.sku });

  const body = entries.length === 0
    ? `<div class="admin-dash-empty" role="status">No stock movements recorded for this SKU yet.</div>`
    : `
      <ul class="admin-inv-history">
        ${entries.map(e => {
          const positive = e.adjustment > 0;
          // Only name a person when a person actually made the change. For
          // automatic movement the source line already says what did it, and
          // repeating it here read as a duplicate.
          const who = e.adminName || e.adminEmail || null;
          const reason = reasonLabel(e.reason);
          return `
            <li class="admin-inv-history-item">
              <div class="admin-inv-history-top">
                <span class="admin-inv-delta-badge ${positive ? 'is-up' : 'is-down'}">
                  ${positive ? '+' : ''}${e.adjustment}
                </span>
                <span class="admin-inv-history-qty">${e.previousQuantity} → ${e.newQuantity}</span>
                <span class="admin-inv-history-time">${escapeHtml(formatAuditTime(e.createdAt))}</span>
              </div>
              <div class="admin-inv-history-meta">
                <span class="admin-inv-history-source">${escapeHtml(sourceLabel(e.source))}</span>
                ${reason ? ` · ${escapeHtml(reason)}` : ''}
                ${e.orderId ? ` · Order ${escapeHtml(e.orderId)}` : ''}
              </div>
              ${who ? `<div class="admin-inv-history-who">${escapeHtml(who)}</div>` : ''}
              ${e.note ? `<div class="admin-inv-history-note">${escapeHtml(e.note)}</div>` : ''}
            </li>
          `;
        }).join('')}
      </ul>
    `;

  return `
    <div class="admin-modal-header">
      <div>
        <h3>Stock History</h3>
        <p class="admin-inv-dialog-sub">${escapeHtml(row.productName)} · ${escapeHtml(row.variantName)} · <code>${escapeHtml(row.sku)}</code></p>
      </div>
      <button type="button" class="admin-modal-close" id="inv-dialog-close" aria-label="Close">&times;</button>
    </div>
    <div class="admin-modal-body">
      <p class="admin-inv-history-intro">
        Every movement for this SKU — operator adjustments and automatic order
        deductions alike — newest first.
      </p>
      ${body}
    </div>
  `;
}

/**
 * Low-stock threshold dialog.
 * @returns {string}
 */
export function renderThresholdDialog() {
  const threshold = getLowStockThreshold();
  return `
    <div class="admin-modal-header">
      <div>
        <h3>Low-Stock Threshold</h3>
        <p class="admin-inv-dialog-sub">Applies everywhere stock is shown</p>
      </div>
      <button type="button" class="admin-modal-close" id="inv-dialog-close" aria-label="Close">&times;</button>
    </div>
    <div class="admin-modal-body">
      <form id="inv-threshold-form" novalidate>
        <div id="inv-threshold-error" class="admin-inv-error" role="alert" hidden></div>
        <p class="admin-inv-history-intro">
          A SKU at or below this quantity is flagged <strong>Low Stock</strong> on the
          storefront, in this list and on the dashboard. Zero is always
          <strong>Out of Stock</strong>.
        </p>
        <div class="admin-inv-field">
          <label for="inv-threshold-input">Threshold (units)</label>
          <input type="number" id="inv-threshold-input" class="admin-stock-input"
                 value="${threshold}" min="0" step="1" inputmode="numeric">
        </div>
        <div class="admin-inv-dialog-actions">
          <button type="button" class="btn-admin btn-admin-outline" id="inv-threshold-cancel">Cancel</button>
          <button type="submit" class="btn-admin btn-admin-primary">Save Threshold</button>
        </div>
      </form>
    </div>
  `;
}
