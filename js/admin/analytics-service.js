/**
 * Admin Analytics Aggregation Service — Slimky Hair (Phase A10)
 *
 * A useful, deliberately small first-party analytics view over REAL records.
 * Not a platform: eight metrics, one trend, one top-products table, three
 * customer figures. Anything that cannot be derived from a real field is not
 * reported; empty windows say so in words, never in fake charts.
 *
 * Single-system rules (shared with Phase A2):
 * - No second data layer. Reads go through OrderStore / customerService with
 *   the SAME date semantics (recordTime), paid definition (payment_status =
 *   successful), revenue rule (payments ledger, product vs shipping split)
 *   and undated-record policy as buildDashboardSnapshot(). The shared
 *   primitives are imported from dashboard-service.js, not re-implemented.
 * - READ-ONLY. Never writes orders, payments, stock or settings.
 * - One pass per collection. Orders, payments and customers are each read
 *   ONCE per snapshot and every figure folds out of that traversal.
 *   At Supabase migration each section becomes one server-side aggregate —
 *   the SQL is noted alongside, so the browser never fetches rows to count.
 * - Returning customers: registered accounts (customer_id link) with ≥2
 *   orders ever. Guest checkouts carry no stable identity and are excluded
 *   by design — documented on screen, not silently blended in.
 */

import { OrderStore } from '../payment/order-store.js';
import { adminService } from '../auth/admin-service.js';
import { customerService } from '../auth/customer-service.js';
import { PAYMENT_STATUS } from '../payment/payment-model.js';
import {
  DATE_RANGE_PRESETS,
  DEFAULT_RANGE_ID,
  recordTime,
  normalizeOrder,
  resolveDateRange
} from './dashboard-service.js';

export { DATE_RANGE_PRESETS, DEFAULT_RANGE_ID };

/**
 * Analytics range presets: the dashboard presets plus this calendar month.
 * Custom ranges arrive as {from, to} ISO date strings (inclusive, local days).
 */
export const ANALYTICS_RANGE_PRESETS = Object.freeze([
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom range' }
]);

export const DEFAULT_ANALYTICS_RANGE_ID = '30d';

/**
 * Resolve any analytics range into concrete bounds, reusing the dashboard
 * preset math so the two screens can never disagree about "last 30 days".
 *
 * @param {string} rangeId
 * @param {Object} [custom] {from: 'YYYY-MM-DD', to: 'YYYY-MM-DD'}
 * @returns {{id, label, since: number|null, until: number|null}}
 */
export function resolveAnalyticsRange(rangeId = DEFAULT_ANALYTICS_RANGE_ID, custom = null) {
  if (rangeId === 'month') {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { id: 'month', label: 'This month', since: start.getTime(), until: null };
  }
  if (rangeId === 'custom' && custom?.from && custom?.to) {
    const from = new Date(`${custom.from}T00:00:00`);
    const to = new Date(`${custom.to}T23:59:59.999`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return { id: 'custom', label: `${custom.from} → ${custom.to}`, since: from.getTime(), until: to.getTime() };
    }
    // Invalid custom input falls back to the default window rather than
    // silently showing everything (or nothing).
    return { ...resolveDateRange(DEFAULT_ANALYTICS_RANGE_ID), id: DEFAULT_ANALYTICS_RANGE_ID, until: null };
  }
  const base = resolveDateRange(rangeId);
  return { ...base, until: null };
}

/**
 * Pick series granularity from the window span so charts stay readable:
 * hourly for a single day, daily up to ~6 weeks, weekly up to ~4 months,
 * monthly beyond. Bucket counts stay small by construction (mobile-safe).
 */
export function pickGranularity(since, until) {
  const spanDays = since === null ? Infinity : Math.max(0, ((until ?? Date.now()) - since) / 86400000);
  if (spanDays <= 1.2) return 'hour';
  if (spanDays <= 45) return 'day';
  if (spanDays <= 125) return 'week';
  return 'month';
}

function bucketStart(ms, granularity) {
  const d = new Date(ms);
  if (granularity === 'hour') d.setMinutes(0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  if (granularity === 'week') {
    // Buckets start Monday (ISO week), so "last 7 days" style windows read cleanly.
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
  }
  if (granularity === 'month') d.setDate(1);
  return d.getTime();
}

function bucketLabel(startMs, granularity) {
  const d = new Date(startMs);
  if (granularity === 'hour') {
    return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  }
  if (granularity === 'month') {
    return d.toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });
  }
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short' });
}

/**
 * Build the complete analytics snapshot in one shot.
 *
 * Throws when the caller is not an authorized admin, so the view renders its
 * error state rather than silently showing zeros.
 *
 * @param {string|null} token Admin session token
 * @param {Object} [options] {rangeId, custom: {from, to}}
 * @returns {Object} Analytics snapshot
 */
export function buildAnalyticsSnapshot(token = null, options = {}) {
  if (!adminService.isAdminAuthorized(token)) {
    throw new Error('Unauthorized: Admin credentials required to read analytics data.');
  }

  const rangeId = options.rangeId || DEFAULT_ANALYTICS_RANGE_ID;
  const range = resolveAnalyticsRange(rangeId, options.custom || null);
  // `== null` deliberately: preset resolutions carry `until: null`, and any
  // future resolution that omits the key must mean "open-ended", never "empty".
  const inRange = (ms) =>
    (range.since == null || (ms !== null && ms >= range.since)) &&
    (range.until == null || (ms !== null && ms <= range.until));

  // ---------------------------------------------------------------- orders
  // SQL equivalent: SELECT date_trunc($gran, created_at), COUNT(*),
  //   SUM(product_payment_total) FROM orders WHERE created_at BETWEEN $1 AND $2
  //   GROUP BY 1 — plus a lateral items expansion for top products. One scan.
  const rawOrders = OrderStore.getAllOrders();
  if (!Array.isArray(rawOrders)) {
    throw new Error('Order store returned an unreadable value.');
  }

  let totalOrders = 0;
  let paidOrders = 0;
  let undatedOrders = 0;
  let productsSold = 0;
  const productAgg = new Map(); // productId -> {productId, name, qty, revenue}
  const ordersByCustomer = new Map(); // customer_id -> ever count (all time)
  const rangedOrders = [];

  for (const raw of rawOrders) {
    if (!raw || !raw.id) continue;
    const order = normalizeOrder(raw);

    // All-time customer linkage (returning-customer math needs no window).
    const cid = raw.customerId ?? raw.customer_id ?? null;
    if (cid) ordersByCustomer.set(cid, (ordersByCustomer.get(cid) || 0) + 1);

    if (order.createdMs === null && range.since !== null) {
      undatedOrders += 1;
      continue;
    }
    if (!inRange(order.createdMs)) continue;

    totalOrders += 1;
    rangedOrders.push(order);
    if (order.paymentStatus === PAYMENT_STATUS.SUCCESSFUL) paidOrders += 1;

    // Top products come ONLY from purchased line items — never from views,
    // carts or wishlists. Snapshot names survive later catalogue edits.
    const items = Array.isArray(raw.items) ? raw.items : [];
    for (const item of items) {
      const qty = Math.max(0, Number(item.quantity) || 0);
      if (qty === 0) continue;
      const pid = item.productId || item.product_id || 'unknown';
      const line = Number(item.lineSubtotal ?? item.line_subtotal ?? item.subtotal ?? (Number(item.unitPrice ?? item.unit_price ?? 0) * qty)) || 0;
      productsSold += qty;
      const entry = productAgg.get(pid) || {
        productId: pid,
        name: item.productName || item.product_name || item.name || 'Unknown product',
        qty: 0,
        revenue: 0
      };
      entry.qty += qty;
      entry.revenue += line;
      productAgg.set(pid, entry);
    }
  }

  const topProducts = [...productAgg.values()]
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, 10);

  // -------------------------------------------------------------- payments
  // SQL equivalent: SELECT SUM(amount) FROM payments WHERE status =
  // 'successful' AND created_at BETWEEN $1 AND $2; (purpose split for cards)
  const rawPayments = OrderStore.getAllPayments();
  let productRevenue = 0;
  let shippingRevenue = 0;
  const revenueCurrencies = new Set();
  if (Array.isArray(rawPayments)) {
    for (const payment of rawPayments) {
      if (!payment || payment.status !== PAYMENT_STATUS.SUCCESSFUL) continue;
      const ms = recordTime(payment);
      if (!inRange(ms)) continue;
      const amount = Number(payment.amount) || 0;
      revenueCurrencies.add((payment.currency || 'NGN').toUpperCase());
      if (payment.purpose === 'shipping') shippingRevenue += amount;
      else productRevenue += amount;
    }
  }
  const totalRevenue = productRevenue + shippingRevenue;

  // ------------------------------------------------------------- customers
  // SQL equivalents: SELECT COUNT(*) FROM customers (total);
  // SELECT COUNT(*) FROM customers WHERE created_at >= $1 (new);
  // returning = linked accounts with ≥2 orders ever (computed above).
  const customers = customerService.listAllCustomers();
  let newCustomers = 0;
  let returningCustomers = 0;
  for (const c of customers) {
    if ((ordersByCustomer.get(c.id) || 0) >= 2) returningCustomers += 1;
    // Uniform window rule (same as orders): a dated record inside
    // [since, until] counts. An unbounded window therefore counts every
    // dated account; undated accounts are excludable nowhere honestly.
    const ms = recordTime(c);
    if (ms !== null && (range.since === null || ms >= range.since) &&
        (range.until === null || ms <= range.until)) newCustomers += 1;
  }

  let guestOrdersInRange = 0;
  for (const order of rangedOrders) {
    if (order.isGuest) guestOrdersInRange += 1;
  }

  // ---------------------------------------------------------------- series
  // SQL equivalent: the same grouped scan as orders above, bucketed by
  // date_trunc($gran, created_at) — folded here out of the single traversal.
  const granularity = pickGranularity(range.since, range.until);
  const buckets = new Map();
  const seedBuckets = () => {
    // Seed empty buckets across the window so quiet days render as honest
    // zeros instead of gaps. Capped by granularity choice (mobile-safe).
    if (range.since === null) return; // all-time: only buckets with data
    const step = granularity === 'hour' ? 3600000
      : granularity === 'week' ? 7 * 86400000
      : granularity === 'month' ? 31 * 86400000
      : 86400000;
    // Month stepping by fixed 31d would drift; walk calendar months instead.
    if (granularity === 'month') {
      const d = new Date(range.since);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      const end = range.until ?? Date.now();
      let guard = 0;
      while (d.getTime() <= end && guard < 36) {
        buckets.set(d.getTime(), { orders: 0, revenue: 0 });
        d.setMonth(d.getMonth() + 1);
        guard += 1;
      }
      return;
    }
    let guard = 0;
    for (let t = bucketStart(range.since, granularity); t <= (range.until ?? Date.now()) && guard < 100; t += step, guard += 1) {
      buckets.set(t, { orders: 0, revenue: 0 });
    }
  };
  seedBuckets();

  // Revenue per bucket needs the ledger (settled money, same rule as cards).
  const paymentsByBucket = new Map();
  if (Array.isArray(rawPayments)) {
    for (const payment of rawPayments) {
      if (!payment || payment.status !== PAYMENT_STATUS.SUCCESSFUL) continue;
      const ms = recordTime(payment);
      if (!inRange(ms)) continue;
      const key = bucketStart(ms, granularity);
      paymentsByBucket.set(key, (paymentsByBucket.get(key) || 0) + (Number(payment.amount) || 0));
    }
  }
  for (const order of rangedOrders) {
    if (order.createdMs === null) continue;
    const key = bucketStart(order.createdMs, granularity);
    const bucket = buckets.get(key) || { orders: 0, revenue: 0 };
    bucket.orders += 1;
    buckets.set(key, bucket);
  }
  for (const [key, revenue] of paymentsByBucket) {
    const bucket = buckets.get(key) || { orders: 0, revenue: 0 };
    bucket.revenue += revenue;
    buckets.set(key, bucket);
  }

  const series = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startMs, v]) => ({
      startMs,
      label: bucketLabel(startMs, granularity),
      orders: v.orders,
      revenue: v.revenue
    }));

  return {
    generatedAt: new Date().toISOString(),
    range: { ...range, granularity },
    metrics: {
      totalOrders,
      paidOrders,
      undatedOrders,
      productRevenue,
      shippingRevenue,
      totalRevenue,
      averageOrderValue: paidOrders > 0 ? totalRevenue / paidOrders : null,
      revenueCurrency: revenueCurrencies.size === 1 ? [...revenueCurrencies][0] : null,
      mixedCurrency: revenueCurrencies.size > 1,
      productsSold,
      totalCustomers: customers.length,
      newCustomers,
      returningCustomers,
      guestOrdersInRange
    },
    series,
    topProducts
  };
}
