/**
 * Admin Analytics View — Slimky Hair (Phase A10)
 *
 * Pure presentation. Every figure rendered here comes from
 * buildAnalyticsSnapshot(); this file computes no business numbers of its own
 * (bucket labels arrive precomputed; the SVG maps them to coordinates only).
 *
 * Honest states throughout: an empty window renders words, never a fake
 * chart. The trend chart carries a text summary and a screen-reader table so
 * it stays useful where SVG is meaningless.
 */

import { formatNaira } from '../cart-store.js';
import { escapeHtml } from '../utils/html-format.js';
import { ANALYTICS_RANGE_PRESETS } from './analytics-service.js';

export function renderAnalyticsLoading() {
  return `<div class="admin-dash-empty" role="status">Loading analytics…</div>`;
}

export function renderAnalyticsError(err) {
  return `
    <div class="admin-dash-empty" role="alert">
      Could not load analytics: ${escapeHtml(err?.message || 'Unknown error')}
      <div style="margin-top: 12px;">
        <button type="button" id="admin-analytics-retry" class="btn-admin btn-admin-outline btn-admin-sm">Try Again</button>
      </div>
    </div>`;
}

function section(title, note, body) {
  return `
    <section class="admin-dash-section">
      <div class="admin-dash-section-head">
        <div>
          <h3 class="admin-dash-section-title">${escapeHtml(title)}</h3>
          ${note ? `<p class="admin-dash-section-note">${escapeHtml(note)}</p>` : ''}
        </div>
      </div>
      ${body}
    </section>`;
}

function metricCard({ label, value, hint, tone = '' }) {
  return `
    <div class="admin-metric-card ${tone ? `is-${tone}` : ''}">
      <span class="admin-metric-label">${escapeHtml(label)}</span>
      <span class="admin-metric-value">${escapeHtml(String(value))}</span>
      ${hint ? `<span class="admin-metric-hint">${escapeHtml(hint)}</span>` : ''}
    </div>`;
}

/**
 * Range toolbar: presets plus a custom from/to pair. Custom inputs submit
 * through the Apply button so partial dates never trigger a reload.
 */
export function renderAnalyticsToolbar(rangeId, custom) {
  return `
    <div class="admin-dash-toolbar admin-an-toolbar">
      <div class="admin-an-ranges" role="group" aria-label="Date range">
        ${ANALYTICS_RANGE_PRESETS.filter(p => p.id !== 'custom').map(p => `
          <button type="button" class="admin-range-btn ${rangeId === p.id ? 'is-active' : ''}"
                  data-range="${p.id}">${escapeHtml(p.label)}</button>`).join('')}
      </div>
      <form id="admin-an-custom-form" class="admin-an-custom">
        <label class="admin-visually-hidden" for="admin-an-from">From date</label>
        <input type="date" id="admin-an-from" class="admin-search-input admin-an-date"
               value="${escapeHtml(custom?.from || '')}" max="${escapeHtml(custom?.to || '')}" aria-label="Custom range start">
        <span aria-hidden="true">→</span>
        <label class="admin-visually-hidden" for="admin-an-to">To date</label>
        <input type="date" id="admin-an-to" class="admin-search-input admin-an-date"
               value="${escapeHtml(custom?.to || '')}" aria-label="Custom range end">
        <button type="submit" class="btn-admin btn-admin-outline btn-admin-sm">Apply</button>
      </form>
    </div>`;
}

function renderMetrics(snapshot) {
  const m = snapshot.metrics;
  const windowHint = snapshot.range.since !== null ? snapshot.range.label : 'All time';

  const revenueValue = m.mixedCurrency ? 'Mixed currencies' : formatNaira(m.totalRevenue);
  const revenueHint = m.mixedCurrency
    ? 'Settled payments span multiple currencies — not summed'
    : `${formatNaira(m.productRevenue)} product · ${formatNaira(m.shippingRevenue)} shipping`;

  return `<div class="admin-metric-grid">${[
    metricCard({ label: 'Revenue (Settled)', value: revenueValue, hint: `${revenueHint} · ${windowHint}`, tone: 'revenue' }),
    metricCard({
      label: 'Total Orders', value: m.totalOrders,
      hint: m.undatedOrders > 0 ? `${windowHint} · ${m.undatedOrders} undated excluded` : windowHint
    }),
    metricCard({
      label: 'Paid Orders', value: m.paidOrders,
      hint: m.totalOrders > 0 ? `${Math.round((m.paidOrders / m.totalOrders) * 100)}% of orders in range` : 'No orders in range',
      tone: 'paid'
    }),
    metricCard({
      label: 'Average Order Value', value: m.averageOrderValue === null ? '—' : formatNaira(Math.round(m.averageOrderValue)),
      hint: m.averageOrderValue === null ? 'No paid orders in range' : `Settled revenue ÷ ${m.paidOrders} paid order${m.paidOrders === 1 ? '' : 's'}`
    }),
    metricCard({
      label: 'Products Sold', value: m.productsSold,
      hint: 'Units from purchased line items only'
    }),
    metricCard({
      label: 'Customers', value: m.totalCustomers,
      hint: `${m.newCustomers} new in range · ${m.returningCustomers} returning (≥2 orders) · ${m.guestOrdersInRange} guest orders`
    })
  ].join('')}</div>`;
}

/**
 * SVG trend: revenue bars with an orders line overlay. Pure coordinate
 * mapping — no statistics. Returns '' when there is nothing real to plot,
 * letting the caller render the honest empty state instead.
 */
export function renderTrendSVG(series) {
  const data = Array.isArray(series) ? series : [];
  const hasActivity = data.some(d => d.orders > 0 || d.revenue > 0);
  if (data.length === 0 || !hasActivity) return '';

  const W = 720;
  const H = 260;
  const PAD = { top: 16, right: 12, bottom: 34, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxRevenue = Math.max(...data.map(d => d.revenue), 0);
  const maxOrders = Math.max(...data.map(d => d.orders), 0);
  const n = data.length;
  const slot = innerW / n;
  const barW = Math.max(4, Math.min(44, slot * 0.55));

  const x = (i) => PAD.left + slot * i + slot / 2;
  const yRev = (v) => maxRevenue > 0 ? PAD.top + innerH - (v / maxRevenue) * innerH : PAD.top + innerH;
  const yOrd = (v) => maxOrders > 0 ? PAD.top + innerH - (v / maxOrders) * innerH : PAD.top + innerH;

  const niceMax = (v) => {
    if (v <= 0) return 0;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / pow;
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return nice * pow;
  };
  const revTop = niceMax(maxRevenue);
  const ordTop = niceMax(maxOrders);

  const gridLines = [0, 0.5, 1].map(f => {
    const y = PAD.top + innerH - f * innerH;
    return `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" class="admin-an-grid" />`;
  }).join('');

  const bars = data.map((d, i) => {
    const bx = x(i) - barW / 2;
    const by = yRev(d.revenue);
    return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}"
      height="${(PAD.top + innerH - by).toFixed(1)}" rx="2" class="admin-an-bar">
      <title>${escapeHtml(d.label)}: ${d.orders} order${d.orders === 1 ? '' : 's'}</title></rect>`;
  }).join('');

  const linePts = data.map((d, i) => `${x(i).toFixed(1)},${yOrd(d.orders).toFixed(1)}`).join(' ');
  const dots = data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${yOrd(d.orders).toFixed(1)}"
    r="3" class="admin-an-dot"><title>${escapeHtml(d.label)}: ${d.orders} orders</title></circle>`).join('');

  // Label every k-th bucket so small screens stay legible.
  const every = Math.max(1, Math.ceil(n / 8));
  const labels = data.map((d, i) => i % every === 0
    ? `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="admin-an-tick">${escapeHtml(d.label)}</text>`
    : '').join('');

  const summary = data.map(d => `${d.label}: ${d.orders} orders`).join('; ');
  const tableRows = data.map(d => `<tr><td>${escapeHtml(d.label)}</td><td>${d.orders}</td></tr>`).join('');

  return `
    <div class="admin-an-chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="admin-an-chart" role="img"
           aria-label="Orders per period: ${escapeHtml(summary)}">
        <title>Orders and revenue trend</title>
        ${gridLines}
        <text x="${PAD.left - 8}" y="${PAD.top + 4}" text-anchor="end" class="admin-an-tick">${revTop >= 1000 ? `${Math.round(revTop / 1000)}k` : revTop}</text>
        <text x="${W - PAD.right + 2}" y="${PAD.top + 4}" class="admin-an-tick">${ordTop} orders</text>
        ${bars}
        <polyline points="${linePts}" fill="none" class="admin-an-line" />
        ${dots}
        ${labels}
      </svg>
      <div class="admin-an-legend" aria-hidden="true">
        <span><span class="admin-an-swatch is-bar"></span>Settled revenue</span>
        <span><span class="admin-an-swatch is-line"></span>Orders</span>
      </div>
      <table class="admin-visually-hidden">
        <caption>Orders per period</caption>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

function renderTrendSection(snapshot) {
  const svg = renderTrendSVG(snapshot.series);
  if (!svg) {
    return section(
      'Sales Trend',
      snapshot.range.label,
      `<div class="admin-dash-empty" role="status">No orders in this range — nothing to chart.</div>`
    );
  }
  return section('Sales Trend', `${snapshot.range.label} · bars show settled revenue, the line shows order counts`, svg);
}

function renderTopProducts(snapshot) {
  const rows = snapshot.topProducts;
  if (rows.length === 0) {
    return section(
      'Top Products',
      'By purchased quantity — never views or wishlists',
      `<div class="admin-dash-empty" role="status">No sales in this range.</div>`
    );
  }
  const body = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Product</th><th>Units Sold</th><th>Revenue</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><div style="font-weight: 600;">${escapeHtml(r.name)}</div></td>
              <td>${r.qty}</td>
              <td style="font-weight: 600;">${escapeHtml(formatNaira(r.revenue))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="admin-cards-list">
      ${rows.map(r => `
        <div class="admin-order-card">
          <div class="admin-order-card-header">
            <div style="font-weight: 700;">${escapeHtml(r.name)}</div>
          </div>
          <div class="admin-order-card-grid">
            <div><div class="admin-order-card-label">Units Sold</div><div>${r.qty}</div></div>
            <div><div class="admin-order-card-label">Revenue</div><div>${escapeHtml(formatNaira(r.revenue))}</div></div>
          </div>
        </div>`).join('')}
    </div>`;
  return section('Top Products', 'By purchased quantity — never views or wishlists', body);
}

function renderCustomerNotes(snapshot) {
  const m = snapshot.metrics;
  return section(
    'Customers',
    'Registered accounts only where identity is reliable',
    `<div class="admin-dash-empty" role="status" style="text-align: left;">
      ${m.totalCustomers} registered customers · ${m.newCustomers} new in range ·
      ${m.returningCustomers} returning (2+ linked orders ever) ·
      ${m.guestOrdersInRange} guest order${m.guestOrdersInRange === 1 ? '' : 's'} in range.
      Guest checkouts carry no stable identity and are excluded from
      returning-customer math by design.
    </div>`
  );
}

export function renderAnalytics(snapshot) {
  return `
    ${renderMetrics(snapshot)}
    <div class="admin-dash-grid">
      ${renderTrendSection(snapshot)}
      ${renderTopProducts(snapshot)}
    </div>
    ${renderCustomerNotes(snapshot)}
  `;
}
