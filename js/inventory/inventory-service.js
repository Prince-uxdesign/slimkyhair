/**
 * Central Inventory Service - Slimky Hair
 * Milestone C18: Variant/SKU-Level Atomic Stock Deduction & Out-of-Stock Protection
 * 
 * Mandates:
 * - Inventory is deducted ONLY after successful verified payment.
 * - ZERO deduction on views, cart adds, checkout opens, failed payments, or cancellations.
 * - Operates strictly at the variant / SKU level (SKU -> Stock).
 * - Atomic transaction check prevents overselling the last unit.
 * - Idempotency guard prevents duplicate deductions on replayed webhooks.
 */

import { CATALOG_PRODUCTS } from '../catalog-data.js';
import { adminService } from '../auth/admin-service.js';
import { getSupabaseClient } from '../supabase-client.js';

const INVENTORY_STORAGE_KEY = 'slimky_inventory_stock';
const DEDUCTIONS_STORAGE_KEY = 'slimky_inventory_deductions';
const ADJUSTMENTS_STORAGE_KEY = 'slimky_inventory_adjustments';
const SETTINGS_STORAGE_KEY = 'slimky_inventory_settings';

/**
 * Default "Low Stock" cutoff.
 *
 * Milestone C20.12 made this the single source of truth; Phase A5 makes it
 * configurable without breaking that guarantee. Read the EFFECTIVE value with
 * getLowStockThreshold() — this constant is only the factory default used when
 * an operator has not set one.
 *
 * Nothing outside this module should compare a stock number against a literal.
 * Classify stock with getAvailabilityLabel() instead, so the PDP, product
 * cards, cart, admin list and dashboard can never drift apart.
 */
export const LOW_STOCK_THRESHOLD = 8;

/** Upper bound on a configured threshold — a guard against typos, not policy. */
export const MAX_LOW_STOCK_THRESHOLD = 1000;

/**
 * Reasons an adjustment can be recorded against. Free text is still accepted
 * in `note`, but every entry carries one of these so the history can be
 * filtered and totalled.
 */
export const ADJUSTMENT_REASONS = Object.freeze([
  { id: 'restock', label: 'Restock / delivery received' },
  { id: 'stock_count', label: 'Physical stock count correction' },
  { id: 'damaged', label: 'Damaged or expired' },
  { id: 'lost', label: 'Lost or unaccounted' },
  { id: 'returned', label: 'Customer return restocked' },
  { id: 'other', label: 'Other (explain in note)' }
]);

/** Audit sources, so order-driven movement is distinguishable from admin edits. */
export const ADJUSTMENT_SOURCE = Object.freeze({
  ADMIN: 'admin_adjustment',
  ORDER: 'order_deduction',
  RESTORE: 'order_restore',
  PRODUCT_SYNC: 'product_sync'
});

/**
 * Safely parse JSON from storage.
 */
function readStorage(key, fallback = {}) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`[InventoryService] Error reading ${key}:`, err);
    return fallback;
  }
}

/**
 * Safely write JSON to storage.
 */
function writeStorage(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[InventoryService] Error writing ${key}:`, err);
    return false;
  }
}

/**
 * Authorize an inventory write.
 *
 * Deliberately stricter than adminService.isAdminAuthorized() on its own:
 * that helper falls back to whatever admin session happens to be in
 * localStorage when no token is passed. localStorage is shared across the
 * whole origin, so that fallback would let ANY script on ANY page — a
 * storefront page, or anything injected into one — mutate stock silently
 * whenever an administrator happened to be signed in in the same browser.
 *
 * Inventory writes therefore demand an explicit session token. A caller that
 * cannot produce one is refused, regardless of ambient session state.
 *
 * @param {*} token
 * @returns {boolean}
 */
function isAuthorizedInventoryWriter(token) {
  if (typeof token !== 'string' || token.trim() === '') return false;
  return adminService.isAdminAuthorized(token);
}

/**
 * Effective low-stock cutoff: the operator's configured value, else the default.
 *
 * Read through a function rather than a constant so a threshold change takes
 * effect everywhere at once, with no module needing to be re-imported.
 *
 * @returns {number}
 */
export function getLowStockThreshold() {
  const settings = readStorage(SETTINGS_STORAGE_KEY, {});
  const configured = Number(settings?.lowStockThreshold);
  if (Number.isFinite(configured) && configured >= 0 && configured <= MAX_LOW_STOCK_THRESHOLD) {
    return Math.floor(configured);
  }
  return LOW_STOCK_THRESHOLD;
}

/**
 * Set the low-stock cutoff. Admin-only: this changes what every storefront
 * surface tells customers about availability.
 *
 * @param {number} value
 * @param {string|null} token Admin session token
 * @returns {{ success: boolean, threshold?: number, error?: string }}
 */
export function setLowStockThreshold(value, token = null) {
  if (!isAuthorizedInventoryWriter(token)) {
    return { success: false, error: 'Unauthorized: admin credentials required to change the low-stock threshold.' };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { success: false, error: 'Threshold must be zero or a positive whole number.' };
  }
  if (n > MAX_LOW_STOCK_THRESHOLD) {
    return { success: false, error: `Threshold cannot exceed ${MAX_LOW_STOCK_THRESHOLD}.` };
  }
  const settings = readStorage(SETTINGS_STORAGE_KEY, {});
  settings.lowStockThreshold = Math.floor(n);
  settings.updatedAt = new Date().toISOString();
  writeStorage(SETTINGS_STORAGE_KEY, settings);
  return { success: true, threshold: Math.floor(n) };
}

/**
 * Append one immutable entry to the stock movement ledger.
 *
 * Every write that changes a stock level goes through here — admin
 * adjustments, order deductions, restores and product-sync — so the history
 * explains the current number rather than only recording manual edits.
 *
 * @param {Object} entry
 * @returns {Object} the stored entry
 */
function recordAdjustment(entry) {
  const log = readStorage(ADJUSTMENTS_STORAGE_KEY, []);
  const list = Array.isArray(log) ? log : [];
  const previousQuantity = Number(entry.previousQuantity) || 0;
  const newQuantity = Number(entry.newQuantity) || 0;

  const record = {
    id: `adj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sku: entry.sku,
    productId: entry.productId || null,
    productName: entry.productName || '',
    variantName: entry.variantName || '',
    previousQuantity,
    newQuantity,
    // Signed delta: positive added stock, negative removed it.
    adjustment: newQuantity - previousQuantity,
    reason: entry.reason || null,
    note: entry.note || '',
    source: entry.source || ADJUSTMENT_SOURCE.ADMIN,
    orderId: entry.orderId || null,
    adminId: entry.adminId || null,
    adminEmail: entry.adminEmail || null,
    adminName: entry.adminName || null,
    createdAt: new Date().toISOString()
  };

  list.push(record);
  writeStorage(ADJUSTMENTS_STORAGE_KEY, list);
  return record;
}

/**
 * Read the stock movement ledger, newest first.
 *
 * @param {Object} [options]
 * @param {string} [options.sku] Limit to one SKU
 * @param {string} [options.source] Limit to one ADJUSTMENT_SOURCE
 * @param {number} [options.limit]
 * @returns {Array<Object>}
 */
export function getAdjustmentHistory(options = {}) {
  const log = readStorage(ADJUSTMENTS_STORAGE_KEY, []);
  let list = Array.isArray(log) ? log.slice() : [];

  if (options.sku) list = list.filter(e => e.sku === options.sku);
  if (options.source) list = list.filter(e => e.source === options.source);

  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return typeof options.limit === 'number' ? list.slice(0, options.limit) : list;
}

export class InventoryService {
  constructor() {
    this.initInventory();
  }

  /**
   * Populate default catalog inventory into persistent store if not present.
   */
  initInventory() {
    const stockMap = readStorage(INVENTORY_STORAGE_KEY, {});
    let hasNew = false;

    CATALOG_PRODUCTS.forEach(product => {
      if (Array.isArray(product.variants)) {
        product.variants.forEach(variant => {
          if (variant.sku && stockMap[variant.sku] === undefined) {
            stockMap[variant.sku] = {
              sku: variant.sku,
              productId: product.id,
              productName: product.name,
              variantName: variant.size || '',
              stock: variant.stock !== undefined ? variant.stock : 25,
              availability: variant.availability || 'In Stock',
              updatedAt: new Date().toISOString()
            };
            hasNew = true;
          }
        });
      } else if (product.sku && stockMap[product.sku] === undefined) {
        stockMap[product.sku] = {
          sku: product.sku,
          productId: product.id,
          productName: product.name,
          variantName: '',
          stock: 25,
          availability: 'In Stock',
          updatedAt: new Date().toISOString()
        };
        hasNew = true;
      }
    });

    if (hasNew) {
      writeStorage(INVENTORY_STORAGE_KEY, stockMap);
    }
  }

  /**
   * Get live stock data for a specific SKU.
   * @param {string} sku
   * @returns {Object|null}
   */
  getSkuStock(sku) {
    if (!sku) return null;
    const stockMap = readStorage(INVENTORY_STORAGE_KEY, {});
    return stockMap[sku] || null;
  }

  /**
   * Resolve the single, authoritative "live" stock number for a SKU.
   *
   * Milestone C20.12 — Inventory Synchronization:
   * All customer-facing surfaces (PDP, product cards, cart, checkout) and the
   * admin inventory view must read stock through this method rather than the
   * static catalog literal, so a deduction made anywhere is reflected everywhere.
   *
   * @param {string} sku
   * @param {number|null} [fallbackStock] - Static catalog stock to use only if this SKU has never been tracked yet.
   * @returns {number} Effective live stock (never negative)
   */
  getEffectiveStock(sku, fallbackStock = null) {
    const record = this.getSkuStock(sku);
    if (record && typeof record.stock === 'number') {
      return record.stock;
    }
    return typeof fallbackStock === 'number' ? Math.max(0, fallbackStock) : 0;
  }

  /**
   * Manually override or adjust stock for a SKU (useful for testing last-unit / out-of-stock scenarios).
   * @param {string} sku
   * @param {number} newStock
   */
  setSkuStock(sku, newStock, meta = {}) {
    if (!sku) return;
    const stockMap = readStorage(INVENTORY_STORAGE_KEY, {});
    const val = Math.max(0, Number(newStock) || 0);
    const now = new Date().toISOString();
    const previous = stockMap[sku] ? Number(stockMap[sku].stock) || 0 : 0;
    const existed = Boolean(stockMap[sku]);

    if (!stockMap[sku]) {
      // Phase A3: admin-created variants arrive here before they exist in the
      // shipped catalogue, so carry the product context through — otherwise the
      // admin inventory view would show an orphan SKU with no product name.
      stockMap[sku] = {
        sku,
        productId: meta.productId || '',
        productName: meta.productName || '',
        variantName: meta.variantName || '',
        stock: val,
        availability: val > 0 ? 'In Stock' : 'Out of Stock',
        updatedAt: now
      };
    } else {
      stockMap[sku].stock = val;
      stockMap[sku].availability = val > 0 ? 'In Stock' : 'Out of Stock';
      stockMap[sku].updatedAt = now;
      if (meta.productId) stockMap[sku].productId = meta.productId;
      if (meta.productName) stockMap[sku].productName = meta.productName;
      if (meta.variantName) stockMap[sku].variantName = meta.variantName;
    }
    writeStorage(INVENTORY_STORAGE_KEY, stockMap);

    // Record product-sync movement so the ledger explains every change in the
    // number, not only the ones an operator typed. A no-op write is not logged.
    if (!existed || previous !== val) {
      recordAdjustment({
        sku,
        productId: stockMap[sku].productId,
        productName: stockMap[sku].productName,
        variantName: stockMap[sku].variantName,
        previousQuantity: existed ? previous : 0,
        newQuantity: val,
        reason: existed ? 'stock_count' : 'restock',
        note: meta.note || (existed ? 'Stock set by product management' : 'SKU created by product management'),
        source: meta.source || ADJUSTMENT_SOURCE.PRODUCT_SYNC
      });
    }
  }

  /**
   * Adjust a SKU's stock deliberately, as an authenticated administrator.
   *
   * This is the ONLY entry point for manual stock changes. It is separate from
   * setSkuStock (used by product management to sync a variant's declared stock)
   * because an operator edit must carry a reason and an accountable identity.
   *
   * Guarantees:
   * - Requires a verified admin session. Customers and public visitors cannot
   *   reach it: there is no storefront code path that supplies a valid token,
   *   and an invalid one is refused here.
   * - Never writes a negative quantity.
   * - Writes an immutable ledger entry recording previous quantity, new
   *   quantity, signed adjustment, reason, timestamp and the admin responsible.
   * - Operates strictly at SKU (variant) level; sibling variants are untouched.
   *
   * @param {string} sku
   * @param {number} newQuantity Absolute target quantity
   * @param {Object} options
   * @param {string} options.token Admin session token
   * @param {string} options.reason One of ADJUSTMENT_REASONS ids
   * @param {string} [options.note] Free-text detail
   * @returns {Promise<{ success: boolean, record?: Object, entry?: Object, error?: string }>}
   */
  async adjustStock(sku, newQuantity, options = {}) {
    const { token = null, reason = null, note = '' } = options;

    if (!isAuthorizedInventoryWriter(token)) {
      return { success: false, error: 'Unauthorized: admin credentials are required to adjust inventory.' };
    }

    const admin = adminService.getCurrentAdmin();

    if (!sku) {
      return { success: false, error: 'A SKU is required.' };
    }

    const validReason = ADJUSTMENT_REASONS.some(r => r.id === reason);
    if (!validReason) {
      return { success: false, error: 'Select a reason for this adjustment.' };
    }
    if (reason === 'other' && !String(note).trim()) {
      return { success: false, error: 'Describe the adjustment in the note when choosing "Other".' };
    }

    const parsed = Number(newQuantity);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return { success: false, error: 'Quantity must be a whole number.' };
    }
    if (parsed < 0) {
      return { success: false, error: 'Quantity cannot be negative.' };
    }

    const stockMap = readStorage(INVENTORY_STORAGE_KEY, {});
    const existing = stockMap[sku];
    if (!existing) {
      return { success: false, error: `Unknown SKU: ${sku}` };
    }

    const previous = Math.max(0, Number(existing.stock) || 0);
    if (previous === parsed) {
      return { success: false, error: 'New quantity is the same as the current quantity.' };
    }

    const now = new Date().toISOString();
    const availability = parsed > 0 ? 'In Stock' : 'Out of Stock';

    // Phase 4: the real, RLS-protected write. This is the authoritative
    // mutation — admin-page.js already gates this dialog behind a
    // server-verified admin session (Phase 2), and inventory_admin_update /
    // inventory_admin_insert RLS policies independently re-check is_admin()
    // at the database, so this cannot be reached with a forged local flag.
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('inventory')
        .upsert(
          {
            sku,
            product_id: existing.productId || '',
            variant_id: existing.variantId || null,
            stock: parsed,
            availability,
            updated_at: now
          },
          { onConflict: 'sku' }
        );
      if (error) {
        return { success: false, error: `Backend update failed: ${error.message}` };
      }
    } catch (err) {
      return { success: false, error: `Backend update unavailable: ${err.message}` };
    }

    existing.stock = parsed;
    existing.availability = availability;
    existing.updatedAt = now;
    writeStorage(INVENTORY_STORAGE_KEY, stockMap);

    const entry = recordAdjustment({
      sku,
      productId: existing.productId,
      productName: existing.productName,
      variantName: existing.variantName,
      previousQuantity: previous,
      newQuantity: parsed,
      reason,
      note: String(note || '').trim(),
      source: ADJUSTMENT_SOURCE.ADMIN,
      adminId: admin?.adminId || admin?.id || null,
      adminEmail: admin?.email || null,
      adminName: admin?.fullName || admin?.email || null
    });

    return { success: true, record: { ...existing }, entry };
  }

  /**
   * Check stock availability across an array of order/cart items.
   * Does NOT mutate or deduct any inventory.
   * @param {Array} items
   * @returns {{ available: boolean, unavailableItem?: Object, reason?: string }}
   */
  checkStock(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
      return { available: true };
    }

    const stockMap = readStorage(INVENTORY_STORAGE_KEY, {});

    for (const item of items) {
      const sku = item.sku;
      const requestedQty = Number(item.quantity || 1);

      if (!sku) continue;

      const record = stockMap[sku];
      if (!record) {
        // If not tracked explicitly, treat as available fallback
        continue;
      }

      if (record.stock <= 0 || record.availability === 'Out of Stock') {
        return {
          available: false,
          unavailableItem: {
            productId: item.productId,
            productName: item.productName || record.productName,
            variantName: item.variantName || record.variantName,
            sku
          },
          reason: 'OUT_OF_STOCK'
        };
      }

      if (requestedQty > record.stock) {
        return {
          available: false,
          unavailableItem: {
            productId: item.productId,
            productName: item.productName || record.productName,
            variantName: item.variantName || record.variantName,
            sku,
            requestedQty,
            availableStock: record.stock
          },
          reason: 'STOCK_EXCEEDED'
        };
      }
    }

    return { available: true };
  }

  /**
   * Atomically deduct inventory for a verified order.
   * 
   * Strict Safety Rules:
   * 1. Check idempotency: If this orderId was already deducted, return without deducting again.
   * 2. Atomic Pre-Check: If ANY item lacks stock, ABORT transaction completely and deduct NOTHING.
   * 3. Deduct stock strictly from corresponding variant SKU.
   * 4. Update availability to 'Out of Stock' if stock drops to 0.
   * 5. Record deduction in idempotency registry.
   * 
   * @param {string} orderId
   * @param {Array} items
   * @returns {{ success: boolean, alreadyDeducted?: boolean, error?: string, unavailableItem?: Object }}
   */
  deductStock(orderId, items = []) {
    if (!orderId) {
      return { success: false, error: 'MISSING_ORDER_ID' };
    }

    // 1. Idempotency Check (Duplicate webhook / repeated call protection)
    const deductions = readStorage(DEDUCTIONS_STORAGE_KEY, {});
    if (deductions[orderId]) {
      return {
        success: true,
        alreadyDeducted: true,
        deductedAt: deductions[orderId].deductedAt
      };
    }

    // 2. Atomic Pre-Check: Validate ALL items before performing any mutations
    const preCheck = this.checkStock(items);
    if (!preCheck.available) {
      return {
        success: false,
        error: preCheck.reason || 'OUT_OF_STOCK',
        unavailableItem: preCheck.unavailableItem
      };
    }

    // 3. Perform atomic deduction
    const stockMap = readStorage(INVENTORY_STORAGE_KEY, {});
    const deductedItems = [];

    for (const item of items) {
      const sku = item.sku;
      const qty = Number(item.quantity || 1);
      if (!sku) continue;

      if (stockMap[sku]) {
        const prevStock = Math.max(0, Number(stockMap[sku].stock) || 0);
        // Math.max(0, ...) is the last line of defence: the atomic pre-check
        // above should already have rejected any order that would go negative.
        const newStock = Math.max(0, prevStock - qty);
        stockMap[sku].stock = newStock;
        stockMap[sku].availability = newStock > 0 ? 'In Stock' : 'Out of Stock';
        stockMap[sku].updatedAt = new Date().toISOString();

        deductedItems.push({
          sku,
          deductedQty: qty,
          prevStock,
          newStock
        });
      }
    }

    writeStorage(INVENTORY_STORAGE_KEY, stockMap);

    // Ledger: an order deduction is a stock movement like any other, so it
    // appears in the SKU's history alongside manual adjustments. Without this
    // the history would show an operator's edits but never why stock fell.
    for (const d of deductedItems) {
      const record = stockMap[d.sku] || {};
      recordAdjustment({
        sku: d.sku,
        productId: record.productId,
        productName: record.productName,
        variantName: record.variantName,
        previousQuantity: d.prevStock,
        newQuantity: d.newStock,
        reason: null,
        note: `Deducted ${d.deductedQty} on verified payment`,
        source: ADJUSTMENT_SOURCE.ORDER,
        orderId
      });
    }

    // 4. Record successful atomic deduction
    deductions[orderId] = {
      orderId,
      items: deductedItems,
      deductedAt: new Date().toISOString()
    };
    writeStorage(DEDUCTIONS_STORAGE_KEY, deductions);

    return {
      success: true,
      alreadyDeducted: false,
      deductedItems
    };
  }

  /**
   * Reverse/restore inventory stock if an order is cancelled or refunded.
   * @param {string} orderId
   * @param {Array} items
   * @returns {boolean}
   */
  restoreStock(orderId, items = []) {
    const deductions = readStorage(DEDUCTIONS_STORAGE_KEY, {});
    if (!deductions[orderId]) return false;

    const stockMap = readStorage(INVENTORY_STORAGE_KEY, {});

    const restored = [];
    for (const item of items) {
      const sku = item.sku;
      const qty = Number(item.quantity || 1);
      if (sku && stockMap[sku]) {
        const prevStock = Math.max(0, Number(stockMap[sku].stock) || 0);
        const newStock = prevStock + qty;
        stockMap[sku].stock = newStock;
        stockMap[sku].availability = 'In Stock';
        stockMap[sku].updatedAt = new Date().toISOString();
        restored.push({ sku, prevStock, newStock, qty });
      }
    }

    writeStorage(INVENTORY_STORAGE_KEY, stockMap);

    for (const r of restored) {
      const record = stockMap[r.sku] || {};
      recordAdjustment({
        sku: r.sku,
        productId: record.productId,
        productName: record.productName,
        variantName: record.variantName,
        previousQuantity: r.prevStock,
        newQuantity: r.newStock,
        reason: 'returned',
        note: `Restored ${r.qty} on order cancellation or refund`,
        source: ADJUSTMENT_SOURCE.RESTORE,
        orderId
      });
    }

    delete deductions[orderId];
    writeStorage(DEDUCTIONS_STORAGE_KEY, deductions);
    return true;
  }

  /**
   * Reset inventory back to default catalog stock (useful for automated test runs).
   */
  resetInventory() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(INVENTORY_STORAGE_KEY);
      localStorage.removeItem(DEDUCTIONS_STORAGE_KEY);
    }
    this.initInventory();
  }

  /**
   * List every tracked SKU record (admin inventory view).
   * @returns {Array<Object>}
   */
  listAllSkuRecords() {
    const stockMap = readStorage(INVENTORY_STORAGE_KEY, {});
    return Object.values(stockMap);
  }
}

export const inventoryService = new InventoryService();

/**
 * Standalone convenience wrapper around inventoryService.getEffectiveStock,
 * for modules that only need a single stock lookup (PDP, product cards, cart).
 * @param {string} sku
 * @param {number|null} [fallbackStock]
 * @returns {number}
 */
export function getEffectiveStock(sku, fallbackStock = null) {
  return inventoryService.getEffectiveStock(sku, fallbackStock);
}

/**
 * Derive the customer-facing availability label + style class for a stock count.
 * Shared by PDP, product cards, cart, checkout, and admin so the copy and
 * thresholds never drift apart across surfaces.
 *
 * @param {number} stock
 * @returns {{ label: string, className: 'in-stock'|'low-stock'|'out-of-stock', stock: number }}
 */
export function getAvailabilityLabel(stock) {
  const safeStock = Math.max(0, Number(stock) || 0);
  const threshold = getLowStockThreshold();
  if (safeStock <= 0) {
    return { label: 'Out of Stock', className: 'out-of-stock', stock: safeStock };
  }
  if (safeStock <= threshold) {
    return { label: `Low Stock · Only ${safeStock} left`, className: 'low-stock', stock: safeStock };
  }
  return { label: 'In Stock', className: 'in-stock', stock: safeStock };
}
