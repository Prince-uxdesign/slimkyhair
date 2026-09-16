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

const INVENTORY_STORAGE_KEY = 'slimky_inventory_stock';
const DEDUCTIONS_STORAGE_KEY = 'slimky_inventory_deductions';

/**
 * Single source of truth for the "Low Stock" cutoff used everywhere
 * stock is surfaced to customers or admins (PDP, product cards, cart, admin).
 * Milestone C20.12: Only ever show "Low Stock" against this real threshold —
 * never an arbitrary/guessed cutoff.
 */
export const LOW_STOCK_THRESHOLD = 8;

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
              availability: variant.availability || 'In Stock'
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
          availability: 'In Stock'
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
  setSkuStock(sku, newStock) {
    if (!sku) return;
    const stockMap = readStorage(INVENTORY_STORAGE_KEY, {});
    const val = Math.max(0, Number(newStock) || 0);
    if (!stockMap[sku]) {
      stockMap[sku] = { sku, stock: val, availability: val > 0 ? 'In Stock' : 'Out of Stock' };
    } else {
      stockMap[sku].stock = val;
      stockMap[sku].availability = val > 0 ? 'In Stock' : 'Out of Stock';
    }
    writeStorage(INVENTORY_STORAGE_KEY, stockMap);
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
        const prevStock = stockMap[sku].stock;
        const newStock = Math.max(0, prevStock - qty);
        stockMap[sku].stock = newStock;
        stockMap[sku].availability = newStock > 0 ? 'In Stock' : 'Out of Stock';

        deductedItems.push({
          sku,
          deductedQty: qty,
          prevStock,
          newStock
        });
      }
    }

    writeStorage(INVENTORY_STORAGE_KEY, stockMap);

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

    for (const item of items) {
      const sku = item.sku;
      const qty = Number(item.quantity || 1);
      if (sku && stockMap[sku]) {
        stockMap[sku].stock += qty;
        stockMap[sku].availability = 'In Stock';
      }
    }

    writeStorage(INVENTORY_STORAGE_KEY, stockMap);
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
  if (safeStock <= 0) {
    return { label: 'Out of Stock', className: 'out-of-stock', stock: safeStock };
  }
  if (safeStock <= LOW_STOCK_THRESHOLD) {
    return { label: `Low Stock · Only ${safeStock} left`, className: 'low-stock', stock: safeStock };
  }
  return { label: 'In Stock', className: 'in-stock', stock: safeStock };
}
