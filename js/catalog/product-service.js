/**
 * Admin Product Management Service - Slimky Hair
 * Phase A3: Product CRUD, publication lifecycle, variants & archiving
 *
 * Guarantees:
 * - No product reaches the catalogue without passing validateProduct().
 * - Variant price/SKU/stock live ONLY on the variant record. Inventory levels
 *   are mirrored into the existing inventory service (the SKU stock authority)
 *   rather than duplicated as a second source of truth.
 * - A product referenced by any historical order is NEVER hard-deleted. It is
 *   archived, preserving the order_items snapshot that fulfilment relies on.
 */

// Importing catalog-data guarantees hydrateCatalog() has already run.
import { CATALOG_PRODUCTS } from '../catalog-data.js';
import {
  getFullCatalog,
  getCategories,
  isSeedProduct,
  persistProduct,
  tombstoneProduct,
  resetOverlay
} from './catalog-overlay.js';
import {
  PRODUCT_STATUS,
  PRODUCT_STATUS_ORDER,
  getStatusLabel,
  normalizeProduct,
  validateProduct,
  resolveStatus,
  slugify
} from './product-model.js';
import { OrderStore } from '../payment/order-store.js';
import { inventoryService } from '../inventory/inventory-service.js';

/* ------------------------------------------------------------------ */
/* Id generation                                                       */
/* ------------------------------------------------------------------ */

function generateProductId(existingIds) {
  // Seed ids follow prod-01..prod-16; continue that sequence.
  let max = 0;
  existingIds.forEach(id => {
    const match = /^prod-(\d+)$/.exec(id);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  const next = String(max + 1).padStart(2, '0');
  return `prod-${next}`;
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export class ProductService {
  /** Full catalogue (all statuses) for admin surfaces. */
  getAllProducts() {
    return getFullCatalog();
  }

  getProduct(id) {
    if (!id) return null;
    return getFullCatalog().find(p => p.id === id) || null;
  }

  getProductBySlug(slug) {
    if (!slug) return null;
    return getFullCatalog().find(p => p.slug === slug) || null;
  }

  getCategories() {
    return getCategories();
  }

  /* ---------------- Order-history awareness ---------------- */

  /**
   * How many historical orders reference this product (by id or by any of its
   * SKUs). Drives the delete-vs-archive decision and is surfaced in the UI so
   * an admin can see WHY a product cannot be deleted.
   *
   * @param {string} id
   * @returns {{ orderCount: number, unitsSold: number, orderNumbers: Array<string> }}
   */
  getOrderUsage(id) {
    const product = this.getProduct(id);
    if (!product) return { orderCount: 0, unitsSold: 0, orderNumbers: [] };

    const skus = new Set((product.variants || []).map(v => String(v.sku || '').toUpperCase()).filter(Boolean));
    let orders = [];
    try {
      orders = OrderStore.getAllOrders() || [];
    } catch (err) {
      console.warn('[ProductService] Unable to read order history:', err);
      return { orderCount: 0, unitsSold: 0, orderNumbers: [] };
    }

    const matched = [];
    let unitsSold = 0;

    orders.forEach(order => {
      const items = Array.isArray(order.items) ? order.items : [];
      const hit = items.filter(item =>
        item.productId === product.id ||
        item.id === product.id ||
        (item.sku && skus.has(String(item.sku).toUpperCase()))
      );
      if (hit.length > 0) {
        matched.push(order.orderNumber || order.id);
        hit.forEach(item => { unitsSold += Number(item.quantity) || 0; });
      }
    });

    return { orderCount: matched.length, unitsSold, orderNumbers: matched };
  }

  /** A product is deletable only when nothing historical depends on it. */
  canHardDelete(id) {
    const usage = this.getOrderUsage(id);
    if (usage.orderCount > 0) {
      return {
        allowed: false,
        reason: `This product appears on ${usage.orderCount} historical order${usage.orderCount === 1 ? '' : 's'}. Deleting it would break those order records — archive it instead.`,
        usage
      };
    }
    if (isSeedProduct(id)) {
      return {
        allowed: false,
        reason: 'This is a shipped catalogue product. Archive it rather than deleting, so historical references stay resolvable.',
        usage
      };
    }
    return { allowed: true, reason: '', usage };
  }

  /* ---------------- Mutations ---------------- */

  /**
   * Validate and create a product.
   * @param {Object} draft
   * @returns {{ success: boolean, product?: Object, errors?: Object }}
   */
  createProduct(draft) {
    const all = getFullCatalog();
    const prepared = { ...draft, slug: slugify(draft.slug || draft.name) };
    const { valid, errors } = validateProduct(prepared, { allProducts: all, currentId: null });
    if (!valid) return { success: false, errors };

    const id = generateProductId(all.map(p => p.id));
    const category = this.getCategories().find(c => c.slug === prepared.categorySlug);
    const record = normalizeProduct({
      ...prepared,
      id,
      category: category ? category.name : prepared.category
    });

    const persisted = persistProduct(record);
    if (!persisted) {
      return { success: false, errors: { _form: 'Unable to save the product to storage. Check available browser storage and try again.' } };
    }
    this.syncVariantInventory(record);
    return { success: true, product: record };
  }

  /**
   * Validate and update an existing product.
   * @param {string} id
   * @param {Object} draft
   * @returns {{ success: boolean, product?: Object, errors?: Object }}
   */
  updateProduct(id, draft) {
    const existing = this.getProduct(id);
    if (!existing) return { success: false, errors: { _form: 'Product not found.' } };

    const all = getFullCatalog();
    const prepared = { ...draft, id, slug: slugify(draft.slug || draft.name) };
    const { valid, errors } = validateProduct(prepared, { allProducts: all, currentId: id });
    if (!valid) return { success: false, errors };

    const category = this.getCategories().find(c => c.slug === prepared.categorySlug);
    const record = normalizeProduct({
      ...prepared,
      category: category ? category.name : prepared.category
    }, existing);

    const persisted = persistProduct(record);
    if (!persisted) {
      return { success: false, errors: { _form: 'Unable to save changes to storage. Check available browser storage and try again.' } };
    }
    this.syncVariantInventory(record);
    return { success: true, product: record };
  }

  /**
   * Move a product to a new publication status without re-validating the whole
   * record — except when promoting INTO a customer-visible status, which must
   * still meet the full compliance bar.
   *
   * @param {string} id
   * @param {string} status
   * @returns {{ success: boolean, product?: Object, errors?: Object }}
   */
  setStatus(id, status) {
    const existing = this.getProduct(id);
    if (!existing) return { success: false, errors: { _form: 'Product not found.' } };
    if (!PRODUCT_STATUS_ORDER.includes(status)) {
      return { success: false, errors: { status: 'Unknown publication status.' } };
    }

    const candidate = { ...existing, status };
    if (status === PRODUCT_STATUS.PUBLISHED || status === PRODUCT_STATUS.READY_FOR_PUBLICATION) {
      const { valid, errors } = validateProduct(candidate, {
        allProducts: getFullCatalog(),
        currentId: id
      });
      if (!valid) {
        return {
          success: false,
          errors: {
            ...errors,
            _form: `"${existing.name}" is missing required information for ${getStatusLabel(status)}. Open the product and complete the highlighted fields.`
          }
        };
      }
    }

    const record = normalizeProduct(candidate, existing);
    persistProduct(record);
    return { success: true, product: record };
  }

  /**
   * Archive (deactivate) a product. This is the safe deletion path: the record
   * is retained so order items, wishlists and reorder flows still resolve, and
   * it simply stops being customer-visible.
   */
  archiveProduct(id) {
    return this.setStatus(id, PRODUCT_STATUS.ARCHIVED);
  }

  /** Bring an archived product back as a Draft for review before republishing. */
  restoreProduct(id) {
    return this.setStatus(id, PRODUCT_STATUS.DRAFT);
  }

  /**
   * Permanently remove a product. Refuses when order history exists.
   * @returns {{ success: boolean, errors?: Object }}
   */
  deleteProduct(id) {
    const check = this.canHardDelete(id);
    if (!check.allowed) return { success: false, errors: { _form: check.reason } };
    const ok = tombstoneProduct(id);
    return ok ? { success: true } : { success: false, errors: { _form: 'Unable to delete the product from storage.' } };
  }

  /** Discard every admin change and restore the shipped catalogue. */
  resetCatalog() {
    resetOverlay();
  }

  /* ---------------- Inventory bridge ---------------- */

  /**
   * Mirror variant stock into the inventory service, which owns SKU stock for
   * checkout and the admin inventory view. Variant.stock stays the seed value
   * the product form set; the inventory service remains the live authority, so
   * stock is never edited in two competing places.
   */
  syncVariantInventory(product) {
    if (!inventoryService || typeof inventoryService.setSkuStock !== 'function') return;
    (product.variants || []).forEach(variant => {
      if (!variant.sku) return;
      try {
        inventoryService.setSkuStock(variant.sku, variant.stock, {
          productId: product.id,
          productName: product.name,
          variantName: variant.size || ''
        });
      } catch (err) {
        console.warn(`[ProductService] Unable to sync inventory for ${variant.sku}:`, err);
      }
    });
  }

  /* ---------------- Querying (list view) ---------------- */

  /**
   * Search / filter / sort / paginate the admin product list.
   *
   * @param {Object} options
   * @param {string} [options.search]
   * @param {string} [options.status] 'all' or a PRODUCT_STATUS value
   * @param {string} [options.category] 'all' or a category slug
   * @param {string} [options.sort] see SORT_OPTIONS
   * @param {number} [options.page] 1-based
   * @param {number} [options.pageSize]
   * @returns {{ rows, total, page, pageCount, pageSize, statusCounts }}
   */
  queryProducts(options = {}) {
    const {
      search = '',
      status = 'all',
      category = 'all',
      sort = 'updated-desc',
      page = 1,
      pageSize = 10
    } = options;

    const all = getFullCatalog().map(p => this.decorateRow(p));

    const statusCounts = { all: all.length };
    PRODUCT_STATUS_ORDER.forEach(s => {
      statusCounts[s] = all.filter(p => p.status === s).length;
    });

    let rows = all;

    if (status !== 'all') rows = rows.filter(p => p.status === status);
    if (category !== 'all') rows = rows.filter(p => p.categorySlug === category);

    const term = String(search || '').trim().toLowerCase();
    if (term) {
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.slug.toLowerCase().includes(term) ||
        String(p.category).toLowerCase().includes(term) ||
        String(p.productType).toLowerCase().includes(term) ||
        (p.variants || []).some(v => String(v.sku || '').toLowerCase().includes(term))
      );
    }

    rows = this.sortRows(rows, sort);

    const total = rows.length;
    const safePageSize = Math.max(1, Number(pageSize) || 10);
    const pageCount = Math.max(1, Math.ceil(total / safePageSize));
    const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
    const start = (safePage - 1) * safePageSize;

    return {
      rows: rows.slice(start, start + safePageSize),
      total,
      page: safePage,
      pageCount,
      pageSize: safePageSize,
      statusCounts
    };
  }

  /**
   * Attach derived list-view fields: price range and live inventory summary.
   * Inventory reads through inventoryService so the number matches the admin
   * inventory screen and checkout exactly.
   */
  decorateRow(product) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const prices = variants.map(v => Number(v.priceValue) || 0).filter(v => v > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;

    let totalStock = 0;
    let outOfStockVariants = 0;
    variants.forEach(variant => {
      const live = (inventoryService && typeof inventoryService.getEffectiveStock === 'function')
        ? inventoryService.getEffectiveStock(variant.sku, variant.stock)
        : variant.stock;
      const stock = Math.max(0, Number(live) || 0);
      totalStock += stock;
      if (stock <= 0) outOfStockVariants += 1;
    });

    return {
      ...product,
      status: resolveStatus(product),
      statusLabel: getStatusLabel(resolveStatus(product)),
      variantCount: variants.length,
      minPrice,
      maxPrice,
      totalStock,
      outOfStockVariants,
      updatedAt: product.updatedAt || product.createdAt || ''
    };
  }

  sortRows(rows, sort) {
    const copy = rows.slice();
    const byName = (a, b) => a.name.localeCompare(b.name);
    const time = value => {
      const t = Date.parse(value);
      return Number.isFinite(t) ? t : 0;
    };

    switch (sort) {
      case 'name-asc': return copy.sort(byName);
      case 'name-desc': return copy.sort((a, b) => byName(b, a));
      case 'price-asc': return copy.sort((a, b) => a.minPrice - b.minPrice || byName(a, b));
      case 'price-desc': return copy.sort((a, b) => b.minPrice - a.minPrice || byName(a, b));
      case 'stock-asc': return copy.sort((a, b) => a.totalStock - b.totalStock || byName(a, b));
      case 'stock-desc': return copy.sort((a, b) => b.totalStock - a.totalStock || byName(a, b));
      case 'updated-asc': return copy.sort((a, b) => time(a.updatedAt) - time(b.updatedAt) || byName(a, b));
      case 'updated-desc':
      default:
        return copy.sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || byName(a, b));
    }
  }
}

export const SORT_OPTIONS = [
  { value: 'updated-desc', label: 'Last updated (newest)' },
  { value: 'updated-asc', label: 'Last updated (oldest)' },
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'price-asc', label: 'Price (low to high)' },
  { value: 'price-desc', label: 'Price (high to low)' },
  { value: 'stock-desc', label: 'Inventory (highest)' },
  { value: 'stock-asc', label: 'Inventory (lowest)' }
];

export const productService = new ProductService();

// Re-exported so admin views import one module for model + service.
export { PRODUCT_STATUS, PRODUCT_STATUS_ORDER, getStatusLabel, CATALOG_PRODUCTS };
