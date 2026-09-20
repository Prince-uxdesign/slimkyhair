/**
 * Admin Dashboard Aggregation Service - Slimky Hair
 * Phase A2: Dashboard Overview
 *
 * Single aggregation point for every figure shown on /admin (Overview).
 *
 * Design rules this module is bound by:
 * - Every number is derived from real persisted application records
 *   (orders, payments, customers, inventory, catalog). Nothing is invented,
 *   estimated, or padded to make the dashboard look populated.
 * - If a figure cannot be derived from a real field, it is not reported.
 * - READ-ONLY. This module never writes an order, a payment, or a stock level.
 *   In particular it never deducts inventory.
 * - One pass per dataset. The store is read once per collection and every
 *   metric is folded out of that single traversal, rather than re-filtering the
 *   same array once per card.
 *
 * Data source note:
 * The storefront's persistence layer (OrderStore / customerService /
 * inventoryService) is the application's live data and is modelled 1:1 on
 * database/schema.sql — `orders`, `payments`, `customers`, `inventory`. Every
 * field read below exists in that schema. When the Supabase backend is wired
 * up, this file is the single place that changes: `buildDashboardSnapshot`
 * keeps its shape and its reads become SQL aggregates (the per-metric SQL each
 * figure corresponds to is noted alongside it).
 */

import { OrderStore } from '../payment/order-store.js';
import { adminService } from '../auth/admin-service.js';
import { customerService } from '../auth/customer-service.js';
import { inventoryService, getAvailabilityLabel, getLowStockThreshold } from '../inventory/inventory-service.js';
import { CATALOG_PRODUCTS } from '../catalog-data.js';
import { ORDER_STATUS, PAYMENT_STATUS } from '../payment/payment-model.js';

/**
 * Canonical order-status display order and labels for the Overview.
 *
 * These are the project's established `order_status` enum values (see
 * database/schema.sql and ORDER_STATUS in payment-model.js). No status name is
 * invented here and none is renamed — the labels are the same wording already
 * used in the Orders queue bar.
 */
export const DASHBOARD_STATUS_SEQUENCE = Object.freeze([
  { status: ORDER_STATUS.PENDING_PAYMENT, label: 'Pending Payment', tone: 'pending' },
  { status: ORDER_STATUS.PAID, label: 'Paid', tone: 'paid' },
  { status: ORDER_STATUS.SHIPPING_QUOTE_REQUIRED, label: 'Shipping Quote Required', tone: 'quote' },
  { status: ORDER_STATUS.SHIPPING_QUOTE_SENT, label: 'Shipping Quote Sent', tone: 'quote' },
  { status: ORDER_STATUS.SHIPPING_PAYMENT_PENDING, label: 'Shipping Payment Pending', tone: 'quote' },
  { status: ORDER_STATUS.SHIPPING_PAYMENT_CONFIRMED, label: 'Shipping Paid', tone: 'quote' },
  { status: ORDER_STATUS.READY_FOR_DISPATCH, label: 'Ready for Dispatch', tone: 'dispatch' },
  { status: ORDER_STATUS.SHIPPED, label: 'Shipped', tone: 'dispatch' },
  { status: ORDER_STATUS.DELIVERED, label: 'Delivered', tone: 'paid' },
  { status: ORDER_STATUS.PAYMENT_FAILED, label: 'Payment Failed', tone: 'failed' },
  { status: ORDER_STATUS.CANCELLED, label: 'Cancelled', tone: 'failed' },
  { status: ORDER_STATUS.DRAFT, label: 'Draft', tone: 'pending' }
]);

/**
 * Date range presets offered by the Overview filter.
 * `days: null` means "no lower bound" (all time).
 */
export const DATE_RANGE_PRESETS = Object.freeze([
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null }
]);

export const DEFAULT_RANGE_ID = '30d';

/**
 * Resolve a preset id into an inclusive lower-bound timestamp.
 *
 * @param {string} rangeId
 * @returns {{ id: string, label: string, since: number|null }}
 */
export function resolveDateRange(rangeId = DEFAULT_RANGE_ID) {
  const preset = DATE_RANGE_PRESETS.find(p => p.id === rangeId)
    || DATE_RANGE_PRESETS.find(p => p.id === DEFAULT_RANGE_ID);

  if (preset.days === null) {
    return { id: preset.id, label: preset.label, since: null };
  }

  if (preset.days === 0) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { id: preset.id, label: preset.label, since: start.getTime() };
  }

  return {
    id: preset.id,
    label: preset.label,
    since: Date.now() - preset.days * 24 * 60 * 60 * 1000
  };
}

/**
 * Parse a record timestamp to epoch ms, tolerating the snake_case alias the
 * schema-parity records carry alongside the camelCase field.
 *
 * Exported for Phase A10: analytics folds the same collections with the same
 * date semantics rather than inventing a second clock.
 *
 * @param {Object} record
 * @returns {number|null} epoch ms, or null when the record carries no usable date
 */
export function recordTime(record) {
  const raw = record?.createdAt || record?.created_at || null;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Normalize one order record into the flat shape the Overview renders.
 * Reads the camelCase field first and falls back to the snake_case schema
 * alias, so the same code works against a Supabase row unchanged.
 *
 * Exported for Phase A10 for the same reason as recordTime above.
 *
 * @param {Object} order
 * @returns {Object}
 */
export function normalizeOrder(order) {
  const createdMs = recordTime(order);
  return {
    id: order.id,
    orderNumber: order.orderNumber || order.order_number || order.id,
    customerName: order.customerName || order.customer_name || order.customer?.fullName || '',
    customerEmail: order.customerEmail || order.customer_email || order.customer?.email || '',
    isGuest: order.isGuest !== undefined ? Boolean(order.isGuest) : Boolean(order.is_guest),
    orderStatus: order.orderStatus || order.order_status || null,
    paymentStatus: order.paymentStatus || order.payment_status || null,
    currency: order.currency || 'NGN',
    // The authoritative amount the customer was charged for product, per schema
    // (orders.product_payment_total). `total` is the same value on legacy records.
    amount: Number(
      order.productPaymentTotal
      ?? order.product_payment_total
      ?? order.total
      ?? order.pricing?.productPaymentTotal
      ?? 0
    ) || 0,
    createdAt: order.createdAt || order.created_at || null,
    createdMs
  };
}

const RECENT_ORDERS_LIMIT = 8;

/**
 * Build the complete dashboard snapshot in one shot.
 *
 * Throws when the caller is not an authorized admin, so the view renders its
 * error state rather than silently showing zeros.
 *
 * @param {string|null} token Admin session token
 * @param {Object} [options]
 * @param {string} [options.rangeId] One of DATE_RANGE_PRESETS ids
 * @returns {Object} Dashboard snapshot
 */
export function buildDashboardSnapshot(token = null, options = {}) {
  if (!adminService.isAdminAuthorized(token)) {
    throw new Error('Unauthorized: Admin credentials required to read dashboard data.');
  }

  const range = resolveDateRange(options.rangeId || DEFAULT_RANGE_ID);
  const inRange = (ms) => range.since === null || (ms !== null && ms >= range.since);

  // ---------------------------------------------------------------- orders
  // SQL equivalent: one grouped scan of `orders` filtered on created_at,
  // rather than one query per card.
  const rawOrders = OrderStore.getAllOrders();
  if (!Array.isArray(rawOrders)) {
    throw new Error('Order store returned an unreadable value.');
  }

  const statusCounts = Object.create(null);
  let totalOrders = 0;
  let paidOrders = 0;
  let undatedOrders = 0;
  const rangedOrders = [];

  for (const raw of rawOrders) {
    if (!raw || !raw.id) continue;
    const order = normalizeOrder(raw);

    // An order with no parseable created_at cannot honestly be placed in a
    // date window. Count it so the figure is not silently wrong, but keep it
    // out of the windowed totals.
    if (order.createdMs === null && range.since !== null) {
      undatedOrders += 1;
      continue;
    }
    if (!inRange(order.createdMs)) continue;

    totalOrders += 1;
    rangedOrders.push(order);

    if (order.orderStatus) {
      statusCounts[order.orderStatus] = (statusCounts[order.orderStatus] || 0) + 1;
    }

    // "Paid" means the product payment was actually captured — the payment
    // status, not the fulfillment status, per the schema's decoupled columns.
    if (order.paymentStatus === PAYMENT_STATUS.SUCCESSFUL) {
      paidOrders += 1;
    }
  }

  // Recent orders: newest first. Undated records sort last rather than being
  // dropped, so nothing real disappears from the operator's view.
  const recentOrders = rangedOrders
    .slice()
    .sort((a, b) => (b.createdMs ?? -Infinity) - (a.createdMs ?? -Infinity))
    .slice(0, RECENT_ORDERS_LIMIT);

  // -------------------------------------------------------------- payments
  // SQL equivalent: SELECT purpose, SUM(amount) FROM payments
  //                 WHERE status = 'successful' AND created_at >= $1
  //                 GROUP BY purpose;
  //
  // Revenue is taken from the payments ledger, not from order totals, because
  // the ledger is what actually settled. Product and shipping money are kept
  // apart exactly as the schema keeps them apart (payments.purpose).
  const rawPayments = OrderStore.getAllPayments();
  let productRevenue = 0;
  let shippingRevenue = 0;
  let successfulPayments = 0;
  const revenueCurrencies = new Set();

  if (Array.isArray(rawPayments)) {
    for (const payment of rawPayments) {
      if (!payment || payment.status !== PAYMENT_STATUS.SUCCESSFUL) continue;

      const ms = recordTime(payment);
      if (range.since !== null && (ms === null || ms < range.since)) continue;

      const amount = Number(payment.amount) || 0;
      successfulPayments += 1;
      revenueCurrencies.add((payment.currency || 'NGN').toUpperCase());

      if (payment.purpose === 'shipping') {
        shippingRevenue += amount;
      } else {
        productRevenue += amount;
      }
    }
  }

  // ------------------------------------------------------------- customers
  // SQL equivalent: SELECT COUNT(*) FROM customers;  (+ a windowed count)
  const customers = customerService.listAllCustomers();
  let newCustomers = 0;
  for (const customer of customers) {
    const ms = recordTime(customer);
    if (range.since === null) continue;
    if (ms !== null && ms >= range.since) newCustomers += 1;
  }

  // Guest orders in window, so the operator can read the customer figure
  // correctly: registered accounts are not the same as people who ordered.
  let guestOrdersInRange = 0;
  for (const order of rangedOrders) {
    if (order.isGuest) guestOrdersInRange += 1;
  }

  // ------------------------------------------------- products & inventory
  // Point-in-time, never date-filtered: stock is a current level, not an event.
  const totalProducts = Array.isArray(CATALOG_PRODUCTS) ? CATALOG_PRODUCTS.length : 0;

  const skuRecords = inventoryService.listAllSkuRecords();
  const lowStock = [];
  const outOfStock = [];
  const lowStockProductIds = new Set();
  let trackedSkus = 0;

  if (Array.isArray(skuRecords)) {
    for (const record of skuRecords) {
      if (!record || !record.sku) continue;
      trackedSkus += 1;

      const stock = Math.max(0, Number(record.stock) || 0);
      const entry = {
        sku: record.sku,
        productId: record.productId || null,
        productName: record.productName || record.sku,
        variantName: record.variantName || '',
        stock
      };

      // Classify with the shared helper so the dashboard can never disagree
      // with the admin inventory list or the storefront about what "low" means.
      const availability = getAvailabilityLabel(stock);
      if (availability.className === 'out-of-stock') {
        outOfStock.push(entry);
        if (entry.productId) lowStockProductIds.add(entry.productId);
      } else if (availability.className === 'low-stock') {
        lowStock.push(entry);
        if (entry.productId) lowStockProductIds.add(entry.productId);
      }
    }
  }

  // Scarcest first — that is the queue an operator actually works down.
  const byStockAsc = (a, b) => a.stock - b.stock || a.productName.localeCompare(b.productName);
  lowStock.sort(byStockAsc);
  outOfStock.sort(byStockAsc);

  // ---------------------------------------------------------- status list
  const statusBreakdown = DASHBOARD_STATUS_SEQUENCE
    .map(entry => ({ ...entry, count: statusCounts[entry.status] || 0 }))
    .filter(entry => entry.count > 0);

  return {
    generatedAt: new Date().toISOString(),
    range,
    metrics: {
      totalOrders,
      paidOrders,
      undatedOrders,
      productRevenue,
      shippingRevenue,
      totalRevenue: productRevenue + shippingRevenue,
      successfulPayments,
      // Only claim a single currency when the settled payments really are all
      // in one. Mixed-currency totals would be meaningless added together.
      revenueCurrency: revenueCurrencies.size === 1 ? [...revenueCurrencies][0] : null,
      mixedCurrency: revenueCurrencies.size > 1,
      totalCustomers: customers.length,
      newCustomers,
      guestOrdersInRange,
      totalProducts,
      trackedSkus,
      lowStockSkus: lowStock.length,
      outOfStockSkus: outOfStock.length,
      affectedProducts: lowStockProductIds.size
    },
    recentOrders,
    statusBreakdown,
    totalStatusCounted: totalOrders,
    inventory: {
      lowStock,
      outOfStock,
      threshold: getLowStockThreshold()
    }
  };
}
