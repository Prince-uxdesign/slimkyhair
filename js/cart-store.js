/**
 * Centralized Cart Data Architecture & Store - Slimky Hair E-Commerce (C1 / C2)
 * 
 * Single Source of Truth for all cart operations across:
 * - Homepage product cards
 * - Shop product catalog
 * - Category pages
 * - Search results
 * - Product detail pages (PDP)
 * - Cart Drawer
 * - Full Cart page
 * - Checkout
 * 
 * Features:
 * - Uniform Cart Item Model with discrete variant support
 * - Canonical pricing & stock validation (no blind reliance on UI attributes)
 * - Inventory guard preventing negative, zero, or over-stock quantities
 * - Duplicate item handling (increments quantity for identical product + variant)
 * - LocalStorage guest cart persistence with cross-tab reactivity
 * - Account synchronization interface ready for future database authentication
 * - Reusable calculations (subtotal, item count, free shipping eligibility)
 */

import { CATALOG_PRODUCTS } from './catalog-data.js';
import { DEMO_PRODUCTS } from './demo-cart-data.js';
import {
  getDevValidationScenario,
  fetchAuthoritativeProductCheck,
  setDevValidationScenario,
  clearDevValidationScenario,
  VALIDATION_SCENARIOS
} from './cart-validation-mock.js';
import { inventoryService } from './inventory/inventory-service.js';
import { trapOnElement, releaseTrapOnElement } from './focus-trap.js';

export const STORAGE_KEY = 'slimky_hair_cart';
export const FREE_SHIPPING_THRESHOLD = 50000; // ₦50,000

// Combine production and isolated demo products for canonical lookup
const ALL_CATALOG_SOURCES = [...CATALOG_PRODUCTS, ...DEMO_PRODUCTS];

/**
 * Generate a unique cart item identifier from product ID and variant ID.
 * Distinct variants of the same product receive distinct item keys.
 * 
 * @param {string} productId 
 * @param {string|null} variantId 
 * @returns {string} e.g. "prod-01:::SLM-OIL-050"
 */
export function generateCartItemKey(productId, variantId = null) {
  const cleanPid = String(productId || '').trim();
  const cleanVar = variantId ? String(variantId).trim() : 'default';
  return `${cleanPid}:::${cleanVar}`;
}

/**
 * Determine root prefix based on pathname depth for relative asset URLs
 * @returns {string}
 */
export function getCartRootPath() {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname;
  if (path.includes('/category/') || path.includes('/product/')) {
    const depth = path.split('/').filter(Boolean).length;
    if (depth >= 2) return '../../';
    if (depth === 1) return '../';
  } else if (
    path.includes('/shop/') || 
    path.includes('/search/') || 
    path.includes('/wishlist/') || 
    path.includes('/cart/') || 
    path.includes('/checkout/') || 
    path.includes('/privacy/') || 
    path.includes('/terms/') || 
    path.includes('/cookies/') || 
    path.includes('/shipping/') || 
    path.includes('/returns/') || 
    path.includes('/about/') || 
    path.includes('/faq/') || 
    path.includes('/contact/') || 
    path.includes('/product-safety/') || 
    path.includes('/hair-care/') || 
    path.includes('/404/')
  ) {
    return '../';
  }
  return '';
}

/**
 * Resolve relative image path safely
 *
 * Performance: every call site is a fixed-px thumbnail (cart drawer 76px,
 * cart page 72-84px, checkout 52px, order cards 44-52px). Serving the
 * pre-generated -480px derivative (~27-36KB) instead of the 896px original
 * (~590-635KB) cuts ~570KB per thumbnail with zero visual change — 480w
 * still oversamples a 84px box by 5x (15x at DPR3).
 * Falls back to the original for remote URLs or images without a derivative.
 * @param {string} img
 * @param {string} rootPrefix
 * @returns {string}
 */
export function resolveCartImagePath(img, rootPrefix = '') {
  if (!img) return '';
  if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('//') || img.startsWith('data:')) {
    return img;
  }
  let clean = img.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
  if (clean.startsWith('/')) {
    clean = clean.slice(1);
  }
  const thumb = clean.replace(/\.(jpe?g)$/i, '-480.$1');
  if (thumb !== clean && THUMB_DERIVATIVES.has(thumb)) {
    return `${rootPrefix}${thumb}`;
  }
  return `${rootPrefix}${clean}`;
}

/**
 * Local thumbnails with a verified -480px derivative on disk
 * (see scripts/optimize-images.py). Lookup is by path after root-prefix
 * stripping, so it works from any page depth.
 */
const THUMB_DERIVATIVES = new Set([
  'assets/placeholders/products/oil-dropper-bottle-480.jpg',
  'assets/placeholders/products/cream-jar-480.jpg',
  'assets/placeholders/products/shampoo-pump-bottle-480.jpg',
  'assets/placeholders/products/conditioner-bottle-480.jpg',
]);

/**
 * Format a numeric amount in Nigerian Naira (₦)
 * @param {number} amount 
 * @returns {string} e.g. "₦38,000"
 */
export function formatNaira(amount) {
  const val = Math.max(0, Math.round(Number(amount) || 0));
  return `₦${val.toLocaleString('en-NG')}`;
}

/**
 * Look up canonical product and variant from catalog or demo dataset.
 * Guarantees that prices, stock, and names come from the canonical truth.
 * 
 * @param {string|Object} productOrId 
 * @param {string|Object|null} variantOrId 
 * @returns {{ product: Object|null, variant: Object|null }}
 */
export function resolveCanonicalProduct(productOrId, variantOrId = null) {
  let productId = null;
  let targetProduct = null;

  if (typeof productOrId === 'string') {
    productId = productOrId;
  } else if (productOrId && typeof productOrId === 'object') {
    productId = productOrId.productId || productOrId.id || null;
    targetProduct = productOrId;
  }

  // 1. Match against canonical catalog & demo datasets
  let canonicalProduct = ALL_CATALOG_SOURCES.find(
    p => p.id === productId || p.slug === productId
  ) || null;

  // Fallback to provided product object if not found in catalog (e.g. ad-hoc mock)
  if (!canonicalProduct && targetProduct && targetProduct.name) {
    canonicalProduct = targetProduct;
  }

  if (!canonicalProduct) {
    return { product: null, variant: null };
  }

  // 2. Resolve variant
  let canonicalVariant = null;
  const variants = Array.isArray(canonicalProduct.variants) ? canonicalProduct.variants : [];

  if (variantOrId) {
    if (typeof variantOrId === 'string') {
      canonicalVariant = variants.find(
        v => (v.id && v.id === variantOrId) || v.sku === variantOrId || v.size === variantOrId
      ) || null;
    } else if (typeof variantOrId === 'object') {
      const vSku = variantOrId.sku;
      const vId = variantOrId.id;
      const vSize = variantOrId.size || variantOrId.name;
      canonicalVariant = variants.find(
        v => (vId && v.id === vId) || (vSku && v.sku === vSku) || (vSize && v.size === vSize)
      ) || variantOrId;
    }
  }

  // If no variant specified but product has variants, use default (first variant)
  if (!canonicalVariant && variants.length > 0) {
    canonicalVariant = variants[0];
  }

  return {
    product: canonicalProduct,
    variant: canonicalVariant
  };
}

/**
 * Standardize an item into the official Cart Item Model
 * 
 * @param {Object} raw 
 * @returns {Object} Normalized Cart Item Model
 */
export function normalizeCartItem(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const productId = String(raw.productId || raw.id || '').split(':::')[0].split('_')[0];
  const variantId = raw.variantId || (raw.sku && raw.sku !== 'default' ? raw.sku : null) || (raw.id && raw.id.includes(':::') ? raw.id.split(':::')[1] : null);

  // Attempt canonical resolution for pricing and stock integrity
  const { product, variant } = resolveCanonicalProduct(productId, variantId);

  const productName = (product && product.name) || raw.productName || raw.name || 'Botanical Formulation';
  const variantName = (variant && (variant.size || variant.name)) || raw.variantName || raw.size || null;
  const sku = (variant && variant.sku) || raw.sku || null;
  const slug = (product && product.slug) || raw.slug || (productId || 'shop');
  const descriptor = (product && product.descriptor) || raw.descriptor || (product && product.category) || 'Botanical Formulation';
  
  // Resolve image safely
  let productImage = '';
  if (product && product.images && product.images.packaging) {
    productImage = product.images.packaging;
  } else if (product && product.image) {
    productImage = product.image;
  } else if (raw.productImage || raw.image) {
    productImage = raw.productImage || raw.image;
  } else {
    productImage = 'assets/placeholders/products/oil-dropper-bottle.jpg';
  }

  // Unit price: preserve held raw.unitPrice if already specified to allow validation to detect price revisions
  let unitPrice = 0;
  if (typeof raw.unitPrice === 'number' && raw.unitPrice > 0) {
    unitPrice = raw.unitPrice;
  } else if (variant && typeof variant.priceValue === 'number') {
    unitPrice = variant.priceValue;
  } else if (product && typeof product.priceValue === 'number') {
    unitPrice = product.priceValue;
  } else if (typeof raw.priceValue === 'number') {
    unitPrice = raw.priceValue;
  } else if (raw.priceFormatted) {
    const parsed = parseInt(String(raw.priceFormatted).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed)) unitPrice = parsed;
  }

  // Stock inventory limits — Milestone C20.12: always prefer the LIVE inventory
  // record (tracked by sku) over the static catalog literal, so a deduction
  // made during checkout is immediately reflected back in the cart.
  let stock = null;
  if (sku) {
    const liveRecord = inventoryService.getSkuStock(sku);
    if (liveRecord && typeof liveRecord.stock === 'number') {
      stock = liveRecord.stock;
    }
  }
  if (stock === null) {
    if (variant && typeof variant.stock === 'number') {
      stock = variant.stock;
    } else if (product && typeof product.stock === 'number') {
      stock = product.stock;
    } else if (typeof raw.stock === 'number') {
      stock = raw.stock;
    }
  }

  // Quantity validation (positive integer >= 1)
  let quantity = parseInt(raw.quantity, 10);
  if (isNaN(quantity) || quantity < 1) quantity = 1;

  const subtotal = unitPrice * quantity;
  const itemKey = generateCartItemKey(productId, variantId || sku);

  return {
    id: itemKey,
    productId,
    variantId: variantId || sku || null,
    productName,
    variantName,
    productImage,
    sku,
    unitPrice,
    quantity,
    subtotal,
    stock,

    // Aliases and formatted helpers for backwards compatibility
    name: productName,
    size: variantName || 'Standard',
    image: productImage,
    priceValue: unitPrice,
    priceFormatted: formatNaira(unitPrice),
    subtotalFormatted: formatNaira(subtotal),
    slug,
    descriptor,
    maxQuantity: stock !== null ? stock : 99
  };
}

/**
 * Retrieve cart items from localStorage (Guest Cart)
 * Starts empty (`[]`) by default for unauthenticated guests.
 * 
 * @returns {Array} Array of Cart Item objects
 */
export function getCart() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    let hasDuplicates = false;
    const map = new Map();
    for (const entry of parsed) {
      const item = normalizeCartItem(entry);
      if (!item) continue;
      if (map.has(item.id)) {
        hasDuplicates = true;
        // Prevent duplicate items during hydration: merge quantities
        const existing = map.get(item.id);
        const mergedQty = existing.quantity + item.quantity;
        const maxStock = existing.stock !== null ? existing.stock : null;
        const safeQty = maxStock !== null ? Math.min(mergedQty, maxStock) : mergedQty;
        const subtotal = existing.unitPrice * safeQty;
        map.set(item.id, {
          ...existing,
          quantity: safeQty,
          subtotal,
          subtotalFormatted: formatNaira(subtotal)
        });
      } else {
        map.set(item.id, item);
      }
    }
    const result = Array.from(map.values());
    if (hasDuplicates) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      } catch (_) {}
    }
    return result;
  } catch (err) {
    console.warn('[CartStore] Error reading cart from localStorage:', err);
    return [];
  }
}

/**
 * Save cart items to localStorage and dispatch reactive update event
 * @param {Array} items 
 * @returns {Array}
 */
export function saveCart(items) {
  const safeItems = Array.isArray(items) 
    ? items.map(normalizeCartItem).filter(Boolean)
    : [];

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeItems));
    } catch (err) {
      console.warn('[CartStore] Error writing cart to localStorage:', err);
    }

    // Dispatch global event for real-time reactivity
    window.dispatchEvent(new CustomEvent('slimky:cart:updated', {
      detail: {
        cart: safeItems,
        count: getCartCount(safeItems),
        subtotal: getCartSubtotal(safeItems)
      }
    }));
  }

  return safeItems;
}

/**
 * Calculate total quantity across all items
 * @param {Array} items 
 * @returns {number}
 */
export function getCartCount(items = getCart()) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => total + (parseInt(item.quantity, 10) || 0), 0);
}

/**
 * Calculate cart subtotal from a single source of truth
 * @param {Array} items 
 * @returns {{ value: number, formatted: string }}
 */
export function getCartSubtotal(items = getCart()) {
  if (!Array.isArray(items)) {
    return { value: 0, formatted: formatNaira(0) };
  }
  const total = items.reduce((acc, item) => {
    const qty = parseInt(item.quantity, 10) || 0;
    const price = parseInt(item.unitPrice || item.priceValue, 10) || 0;
    return acc + (price * qty);
  }, 0);

  return {
    value: total,
    formatted: formatNaira(total)
  };
}

/**
 * Check whether a product (and optional variant) exists in the cart.
 * Supports checking by productId, variantId, SKU, or composite key.
 * 
 * @param {string} productId 
 * @param {string|null} [variantId] 
 * @returns {boolean}
 */
export function hasItem(productId, variantId = null) {
  if (!productId) return false;
  const cleanPid = String(productId).toLowerCase().trim();
  const cart = getCart();

  return cart.some(item => {
    const itemPid = String(item.productId || '').toLowerCase().trim();
    const itemId = String(item.id || '').toLowerCase().trim();

    if (itemId === cleanPid) return true;
    if (itemPid !== cleanPid) return false;
    if (!variantId) return true;

    const cleanVar = String(variantId).toLowerCase().trim();
    return (
      (item.variantId && String(item.variantId).toLowerCase().trim() === cleanVar) ||
      (item.sku && String(item.sku).toLowerCase().trim() === cleanVar) ||
      (item.variantName && String(item.variantName).toLowerCase().trim() === cleanVar) ||
      (itemId === `${itemPid}:::${cleanVar}`)
    );
  });
}

/**
 * Retrieve a specific cart item by key, SKU, or product ID
 * @param {string} itemKeyOrId 
 * @returns {Object|null}
 */
export function getItem(itemKeyOrId) {
  if (!itemKeyOrId) return null;
  const target = String(itemKeyOrId).toLowerCase().trim();
  const cart = getCart();

  return cart.find(i => 
    String(i.id).toLowerCase().trim() === target || 
    (i.sku && String(i.sku).toLowerCase().trim() === target) ||
    (i.variantId && String(i.variantId).toLowerCase().trim() === target) ||
    String(i.productId).toLowerCase().trim() === target
  ) || null;
}

/**
 * Add an item to the cart or increment its quantity if identical product + variant already exists.
 * 
 * Enforces:
 * - Variant separation: different variants become distinct cart lines.
 * - Inventory check: does not exceed available stock.
 * - Canonical price validation: never blindly trusts UI attributes.
 * 
 * @param {Object|string} productOrId 
 * @param {number} quantity 
 * @param {Object|string|null} [variantOrOptions] 
 * @returns {{ success: boolean, cart: Array, item: Object|null, message: string, stockLimitReached: boolean }}
 */
export function addItem(productOrId, quantity = 1, variantOrOptions = null) {
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return {
      success: false,
      cart: getCart(),
      item: null,
      message: 'Invalid quantity provided',
      stockLimitReached: false
    };
  }

  // Resolve canonical product and variant
  const { product, variant } = resolveCanonicalProduct(productOrId, variantOrOptions);

  if (!product) {
    console.warn('[CartStore] Could not resolve product:', productOrId);
    return {
      success: false,
      cart: getCart(),
      item: null,
      message: 'Product not found in catalog',
      stockLimitReached: false
    };
  }

  const variantId = variant ? (variant.id || variant.sku) : null;
  const productSku = variant ? variant.sku : product.sku;
  let stock = null;
  if (productSku) {
    const liveRecord = inventoryService.getSkuStock(productSku);
    if (liveRecord && typeof liveRecord.stock === 'number') stock = liveRecord.stock;
  }
  if (stock === null) {
    stock = variant && typeof variant.stock === 'number'
      ? variant.stock
      : (typeof product.stock === 'number' ? product.stock : null);
  }

  // Check out-of-stock condition
  if (stock !== null && stock <= 0) {
    return {
      success: false,
      cart: getCart(),
      item: null,
      message: 'Selected item is currently out of stock',
      stockLimitReached: true
    };
  }

  const itemKey = generateCartItemKey(product.id, variantId);
  const cart = getCart();
  const existingIndex = cart.findIndex(i => i.id === itemKey);

  let targetItem = null;
  let stockLimitReached = false;

  if (existingIndex > -1) {
    // Duplicate item: increment existing quantity
    const currentQty = cart[existingIndex].quantity;
    let newQty = currentQty + qty;

    if (stock !== null && newQty > stock) {
      newQty = stock;
      stockLimitReached = true;
    }

    cart[existingIndex].quantity = newQty;
    targetItem = normalizeCartItem(cart[existingIndex]);
    cart[existingIndex] = targetItem;
  } else {
    // New item: create normalized entry
    let addQty = qty;
    if (stock !== null && addQty > stock) {
      addQty = stock;
      stockLimitReached = true;
    }

    targetItem = normalizeCartItem({
      id: itemKey,
      productId: product.id,
      variantId,
      productName: product.name,
      variantName: variant ? (variant.size || variant.name) : null,
      productImage: (product.images && product.images.packaging) || product.image,
      sku: variant ? variant.sku : product.sku,
      unitPrice: variant ? variant.priceValue : product.priceValue,
      quantity: addQty,
      stock,
      slug: product.slug,
      descriptor: product.descriptor || product.category
    });

    cart.push(targetItem);
  }

  const updatedCart = saveCart(cart);

  return {
    success: true,
    cart: updatedCart,
    item: targetItem,
    message: stockLimitReached ? 'Added maximum available stock to bag' : 'Item added to shopping bag',
    stockLimitReached
  };
}

/**
 * Standard addToCart wrapper for backward compatibility across existing callers.
 * Returns the updated cart array directly.
 * 
 * @param {Object|string} productOrId 
 * @param {number} quantity 
 * @param {Object|string|null} [selectedVariant] 
 * @returns {Array} Updated cart items
 */
export function addToCart(productOrId, quantity = 1, selectedVariant = null) {
  const result = addItem(productOrId, quantity, selectedVariant);
  return result.cart;
}

/**
 * Set the exact quantity of an existing item in the cart.
 * If newQuantity <= 0, the item is removed.
 * If newQuantity exceeds stock, it is clamped to available inventory.
 * 
 * @param {string} itemKeyOrId 
 * @param {number} newQuantity 
 * @returns {Array} Updated cart
 */
export function setQuantity(itemKeyOrId, newQuantity) {
  const qty = parseInt(newQuantity, 10);
  const cart = getCart();

  if (isNaN(qty) || qty <= 0) {
    return removeItem(itemKeyOrId);
  }

  // Resolve through the same key/SKU/variant matching as getItem, so callers
  // passing a SKU (not just the exact line key) update the intended line
  // instead of silently no-opping.
  const resolved = getItem(itemKeyOrId);
  if (!resolved) return cart;
  const itemIndex = cart.findIndex(i => i.id === resolved.id);
  if (itemIndex > -1) {
    const item = cart[itemIndex];
    let clampedQty = qty;
    if (item.stock !== null && typeof item.stock === 'number' && clampedQty > item.stock) {
      clampedQty = item.stock;
    }
    item.quantity = clampedQty;
    cart[itemIndex] = normalizeCartItem(item);
    return saveCart(cart);
  }

  return cart;
}

/**
 * Standard updateCartQuantity alias for backwards compatibility
 * @param {string} itemId 
 * @param {number} newQuantity 
 * @returns {Array}
 */
export function updateCartQuantity(itemId, newQuantity) {
  return setQuantity(itemId, newQuantity);
}

/**
 * Increase the quantity of an existing item by step (default 1)
 * Respects available stock limit.
 * 
 * @param {string} itemKeyOrId 
 * @param {number} step 
 * @returns {Array}
 */
export function increaseQuantity(itemKeyOrId, step = 1) {
  const item = getItem(itemKeyOrId);
  if (!item) return getCart();
  const nextQty = item.quantity + Math.max(1, parseInt(step, 10) || 1);
  return setQuantity(itemKeyOrId, nextQty);
}

/**
 * Decrease the quantity of an existing item by step (default 1)
 * If quantity reaches 0, removes the item.
 * 
 * @param {string} itemKeyOrId 
 * @param {number} step 
 * @returns {Array}
 */
export function decreaseQuantity(itemKeyOrId, step = 1) {
  const item = getItem(itemKeyOrId);
  if (!item) return getCart();
  const nextQty = item.quantity - Math.max(1, parseInt(step, 10) || 1);
  return setQuantity(itemKeyOrId, nextQty);
}

/**
 * Remove an item completely from the cart
 * @param {string} itemKeyOrId 
 * @returns {Array} Updated cart
 */
export function removeItem(itemKeyOrId) {
  const cart = getCart();
  const resolved = getItem(itemKeyOrId);
  if (!resolved) return cart;
  const filtered = cart.filter(i => i.id !== resolved.id);
  return saveCart(filtered);
}

/**
 * Standard removeFromCart alias for backwards compatibility
 * @param {string} itemId 
 * @returns {Array}
 */
export function removeFromCart(itemId) {
  return removeItem(itemId);
}

/**
 * Update an existing cart item's fields (e.g. quantity or variant)
 * @param {string} itemKeyOrId 
 * @param {Object} updates 
 * @returns {Array}
 */
export function updateItem(itemKeyOrId, updates = {}) {
  const cart = getCart();
  const resolved = getItem(itemKeyOrId);
  if (!resolved) return cart;
  const index = cart.findIndex(i => i.id === resolved.id);
  if (index === -1) return cart;

  const current = cart[index];
  const merged = { ...current, ...updates };
  cart[index] = normalizeCartItem(merged);
  return saveCart(cart);
}

/**
 * Clear all items from the cart
 * @returns {Array} Empty array
 */
export function clearCart() {
  return saveCart([]);
}

/**
 * Validate all items in the cart against current catalog pricing and inventory.
 * Used before order creation or checkout navigation to ensure prices and stock remain accurate.
 * 
 * @param {Array} items 
 * @returns {{ valid: boolean, errors: Array, priceChanges: Array, stockIssues: Array, validatedItems: Array }}
 */
/**
 * Validate all items in the cart against authoritative product data and backend inventory.
 * Used before allowing checkout to ensure prices, stock, and availability remain accurate.
 * 
 * Supports:
 * - Detecting price changes
 * - Detecting out of stock items
 * - Detecting unavailable/discontinued products
 * - Detecting unavailable/discontinued variants
 * - Adjusting quantities when requested exceeds remaining inventory
 * - Distinguishing temporary network failure (non-destructive) vs genuine discontinuation
 * 
 * @param {Array} [items] Cart items to validate (defaults to getCart())
 * @param {Object} [options]
 * @param {string} [options.scenario] Dev scenario override ('product_exists', 'product_unavailable', etc.)
 * @returns {{
 *   valid: boolean,
 *   canProceedToCheckout: boolean,
 *   hasBlockingErrors: boolean,
 *   hasNetworkError: boolean,
 *   errors: Array,
 *   warnings: Array,
 *   notifications: Array,
 *   priceChanges: Array,
 *   stockIssues: Array,
 *   unavailableItems: Array,
 *   resolvedItems: Array
 * }}
 */
export function validateCart(items = getCart(), options = {}) {
  const scenario = options.scenario || getDevValidationScenario();
  const errors = [];
  const warnings = [];
  const notifications = [];
  const priceChanges = [];
  const stockIssues = [];
  const unavailableItems = [];
  const resolvedItems = [];
  let hasBlockingErrors = false;
  let hasNetworkError = false;

  // SCENARIO 6: Network Failure
  // Crucial requirement: Distinguish temporary backend / network failure from genuine discontinuation.
  // Never delete or alter valid cart items simply because a temporary network request fails.
  if (scenario === VALIDATION_SCENARIOS.NETWORK_FAILURE) {
    hasNetworkError = true;
    notifications.push({
      type: 'network_failure',
      severity: 'warning',
      blocking: false,
      message: 'Unable to verify live inventory due to a temporary network issue. Your cart has been safely preserved.'
    });

    return {
      valid: false,
      canProceedToCheckout: true,
      hasBlockingErrors: false,
      hasNetworkError: true,
      errors: [],
      warnings: [{ message: 'Network check temporarily unavailable' }],
      notifications,
      priceChanges: [],
      stockIssues: [],
      unavailableItems: [],
      resolvedItems: [...items],
      validatedItems: [...items]
    };
  }

  for (const item of items) {
    let canonical = null;

    // SCENARIO 2: Product Unavailable
    if (scenario === VALIDATION_SCENARIOS.PRODUCT_UNAVAILABLE) {
      canonical = { product: null, variant: null };
    } 
    // SCENARIO 3: Variant Unavailable
    else if (scenario === VALIDATION_SCENARIOS.VARIANT_UNAVAILABLE && (item.variantName?.includes('100') || item.variantId?.includes('100') || item.sku?.includes('100'))) {
      const base = resolveCanonicalProduct(item.productId, item.variantId);
      canonical = { product: base.product, variant: null };
    } else {
      canonical = resolveCanonicalProduct(item.productId, item.variantId);
    }

    const product = canonical.product;
    const variant = canonical.variant;

    // 1. Check Product Existence & Availability
    if (!product || product.isAvailable === false || product.status === 'discontinued' || product.status === 'unavailable') {
      hasBlockingErrors = true;
      const msg = `Product "${item.productName}" is no longer available and will be removed from your bag.`;
      errors.push({ itemKey: item.id, message: msg, type: 'product_unavailable' });
      unavailableItems.push(item);
      notifications.push({
        type: 'product_unavailable',
        severity: 'error',
        blocking: true,
        itemKey: item.id,
        productName: item.productName,
        message: msg,
        action: 'remove'
      });
      continue; // exclude from resolvedItems
    }

    // 2. Check Variant Existence & Availability
    if (item.variantId && item.variantId !== 'default' && (!variant || variant.isAvailable === false || variant.status === 'unavailable')) {
      hasBlockingErrors = true;
      const vName = item.variantName || item.size || item.variantId;
      const msg = `Variant "${vName}" of "${item.productName}" is no longer available.`;
      errors.push({ itemKey: item.id, message: msg, type: 'variant_unavailable' });
      unavailableItems.push(item);
      notifications.push({
        type: 'variant_unavailable',
        severity: 'error',
        blocking: true,
        itemKey: item.id,
        productName: item.productName,
        variantName: vName,
        message: msg,
        action: 'remove'
      });
      continue; // exclude from resolvedItems
    }

    // Authoritative Price Calculation
    let currentPrice = variant ? variant.priceValue : product.priceValue;
    // SCENARIO 4: Price Changed
    if (scenario === VALIDATION_SCENARIOS.PRICE_CHANGED) {
      currentPrice = 44000;
    }

    // Authoritative Stock Calculation — Milestone C20.12: check the LIVE
    // inventory ledger (post-deduction) first; only fall back to the static
    // catalog literal for SKUs that have never been tracked.
    const canonicalSku = variant ? variant.sku : product.sku;
    let currentStock = null;
    if (canonicalSku) {
      const liveRecord = inventoryService.getSkuStock(canonicalSku);
      if (liveRecord && typeof liveRecord.stock === 'number') {
        currentStock = liveRecord.stock;
      }
    }
    if (currentStock === null) {
      currentStock = variant && typeof variant.stock === 'number'
        ? variant.stock
        : (typeof product.stock === 'number' ? product.stock : null);
    }

    // SCENARIO: Out of Stock
    if (scenario === 'out_of_stock' || scenario === 'OUT_OF_STOCK' || scenario === VALIDATION_SCENARIOS.OUT_OF_STOCK) {
      currentStock = 0;
    }

    // SCENARIO 5: Stock Decreased
    if (scenario === VALIDATION_SCENARIOS.STOCK_DECREASED || scenario === 'stock_decreased') {
      currentStock = Math.max(1, Math.min(item.quantity - 1, 1));
    }

    // 3. Check Price Changes
    let finalPrice = item.unitPrice;
    if (typeof currentPrice === 'number' && currentPrice !== item.unitPrice) {
      hasBlockingErrors = true;
      const msg = `Price for "${item.productName}" (${item.variantName || item.size || 'Standard'}) changed from ${formatNaira(item.unitPrice)} to ${formatNaira(currentPrice)}.`;
      priceChanges.push({
        itemKey: item.id,
        oldPrice: item.unitPrice,
        newPrice: currentPrice,
        productName: item.productName
      });
      notifications.push({
        type: 'price_changed',
        severity: 'warning',
        blocking: true,
        itemKey: item.id,
        productName: item.productName,
        oldVal: item.unitPrice,
        newVal: currentPrice,
        message: msg,
        action: 'update_price'
      });
      finalPrice = currentPrice;
    }

    // 4. Check Stock Availability & Quantity Bounds
    let finalQty = item.quantity;
    if (currentStock === 0) {
      hasBlockingErrors = true;
      const msg = `"${item.productName}" (${item.variantName || item.size || 'Standard'}) is out of stock.`;
      errors.push({ itemKey: item.id, message: msg, type: 'out_of_stock' });
      stockIssues.push({ itemKey: item.id, requestedQty: item.quantity, availableStock: 0, productName: item.productName });
      notifications.push({
        type: 'out_of_stock',
        severity: 'error',
        blocking: true,
        itemKey: item.id,
        productName: item.productName,
        message: msg,
        action: 'remove'
      });
      continue;
    } else if (currentStock !== null && currentStock < item.quantity) {
      hasBlockingErrors = true;
      const msg = `Quantity for "${item.productName}" (${item.variantName || item.size || 'Standard'}) was adjusted from ${item.quantity} to ${currentStock} because only ${currentStock} remain in stock.`;
      stockIssues.push({
        itemKey: item.id,
        requestedQty: item.quantity,
        availableStock: currentStock,
        productName: item.productName
      });
      notifications.push({
        type: 'quantity_adjusted',
        severity: 'warning',
        blocking: true,
        itemKey: item.id,
        productName: item.productName,
        oldVal: item.quantity,
        newVal: currentStock,
        message: msg,
        action: 'adjust_qty'
      });
      finalQty = currentStock;
    }

    resolvedItems.push(normalizeCartItem({
      ...item,
      unitPrice: finalPrice,
      quantity: finalQty,
      stock: currentStock
    }));
  }

  const valid = !hasBlockingErrors && notifications.length === 0;
  const canProceedToCheckout = !hasBlockingErrors && resolvedItems.length > 0;

  return {
    valid,
    canProceedToCheckout,
    hasBlockingErrors,
    hasNetworkError,
    errors,
    warnings,
    notifications,
    priceChanges,
    stockIssues,
    unavailableItems,
    resolvedItems,
    validatedItems: resolvedItems
  };
}

/**
 * Safely apply resolved validation state to cart and storage.
 * Cleans up unavailable items, updates prices, and adjusts quantities.
 * 
 * @param {Object} validationResult 
 * @returns {Array} Updated cart items
 */
export function applyCartValidation(validationResult) {
  if (!validationResult || !Array.isArray(validationResult.resolvedItems)) {
    return getCart();
  }
  return saveCart(validationResult.resolvedItems);
}

/**
 * ACCOUNT SYNCHRONIZATION ARCHITECTURE (Future Authentication)
 * 
 * Interface for synchronizing local guest carts with remote database customer carts.
 * When authentication is implemented:
 * 1. Read guest items from localStorage.
 * 2. Send payload to remote API `POST /api/cart/merge`.
 * 3. Merge server-side: add guest items to existing customer items up to stock limits.
 * 4. Return canonical merged cart and update localStorage.
 * 
 * @param {string} userId 
 * @param {Object} [remoteApi] Optional API client
 * @returns {Promise<Array>} Merged cart
 */
export async function syncCartWithUserAccount(userId, remoteApi = null) {
  if (!userId) return getCart();
  const guestCart = getCart();

  if (remoteApi && typeof remoteApi.mergeCart === 'function') {
    try {
      const merged = await remoteApi.mergeCart(userId, guestCart);
      return saveCart(merged);
    } catch (err) {
      console.warn('[CartStore] Failed to sync cart with remote account:', err);
      return guestCart;
    }
  }

  // Fallback / interface demonstration
  return guestCart;
}

/**
 * Render the Cart Drawer HTML and wire up interactivity
 * @param {HTMLElement} [drawer] 
 */
export function renderCartDrawer(drawer = document.querySelector('#cart-drawer')) {
  if (!drawer) return;

  // Ensure accessible dialog attributes
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', 'Shopping Bag');

  const cart = getCart();
  const count = getCartCount(cart);
  const subtotal = getCartSubtotal(cart);
  const root = getCartRootPath();

  // 1. Update Title Count
  const titleCountEl = drawer.querySelector('.drawer-title .cart-count-val');
  if (titleCountEl) {
    titleCountEl.textContent = count;
  } else {
    const titleEl = drawer.querySelector('.drawer-title');
    if (titleEl) {
      titleEl.innerHTML = `Shopping Bag (<span class="cart-count-val">${count}</span>)`;
    }
  }

  // 2. Update Global Badges across page (header icon, mobile drawer, etc.)
  const globalBadges = document.querySelectorAll('.cart-count-val');
  globalBadges.forEach(b => {
    b.textContent = count;
  });

  // 3. Update Shipping Meter
  const shippingProgressText = drawer.querySelector('.shipping-progress-text');
  const shippingMeterFill = drawer.querySelector('.shipping-meter-fill');
  if (shippingProgressText && shippingMeterFill) {
    if (subtotal.value >= FREE_SHIPPING_THRESHOLD) {
      shippingProgressText.innerHTML = `You have unlocked <strong>complimentary shipping</strong> across Nigeria! 🎉`;
      shippingMeterFill.style.width = '100%';
    } else {
      const remaining = FREE_SHIPPING_THRESHOLD - subtotal.value;
      const pct = Math.max(5, Math.min(100, Math.round((subtotal.value / FREE_SHIPPING_THRESHOLD) * 100)));
      shippingProgressText.innerHTML = `Add <strong>₦${remaining.toLocaleString('en-NG')}</strong> to qualify for complimentary shipping`;
      shippingMeterFill.style.width = `${pct}%`;
    }
  }

  // 4. Update Drawer Body (Items List)
  const drawerBody = drawer.querySelector('.drawer-body');
  if (drawerBody) {
    let itemsContainer = drawerBody.querySelector('.cart-items-container');
    if (!itemsContainer) {
      const shippingBar = drawerBody.querySelector('.shipping-progress-bar');
      itemsContainer = document.createElement('div');
      itemsContainer.className = 'cart-items-container';

      if (shippingBar && shippingBar.nextSibling) {
        drawerBody.insertBefore(itemsContainer, shippingBar.nextSibling);
      } else {
        drawerBody.appendChild(itemsContainer);
      }

      // Remove legacy static item rows
      const legacyRows = drawerBody.querySelectorAll(':scope > .cart-item-row, :scope > #cart-empty-explore');
      legacyRows.forEach(r => r.remove());
    }

    if (cart.length === 0) {
      itemsContainer.innerHTML = `
        <div class="cart-empty-state" style="text-align: center; padding: 48px 16px;">
          <svg style="width: 48px; height: 48px; stroke: var(--color-brown-light); margin: 0 auto 16px; opacity: 0.6;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          <p style="font-family: var(--font-serif); font-size: 1.375rem; margin-bottom: 8px; color: var(--color-text-primary);">Your shopping bag is empty</p>
          <p style="font-size: 0.8125rem; color: var(--color-text-secondary); margin-bottom: 24px; line-height: 1.5;">Explore our curated botanical formulations to build your healthy hair routine.</p>
          <a href="${root}shop/" class="btn btn-outline btn-sm" id="cart-empty-explore" style="display: inline-block;">Continue Shopping</a>
        </div>
      `;

      itemsContainer.querySelector('#cart-empty-explore')?.addEventListener('click', () => {
        drawer.classList.remove('is-open');
        const backdrop = document.querySelector('.drawer-backdrop');
        if (backdrop) backdrop.classList.remove('is-active');
        document.body.classList.remove('drawer-open');
      });
    } else {
      itemsContainer.innerHTML = cart.map(item => {
        const itemImg = resolveCartImagePath(item.productImage || item.image, root);
        const isMaxStock = item.stock !== null && item.quantity >= item.stock;

        return `
          <div class="cart-item-row" data-cart-item-id="${item.id}" style="display: flex; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--color-border-subtle); align-items: flex-start;">
            <a href="${root}product/${item.slug}/" style="display: block; width: 76px; height: 96px; background: var(--bg-secondary); border-radius: var(--radius-xs); overflow: hidden; flex-shrink: 0;" tabindex="-1" aria-hidden="true">
              <img src="${itemImg}" alt="${item.productName || 'Slimky Hair product'}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy" decoding="async">
            </a>
            <div class="cart-item-info" style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 2px;">
                <h3 class="cart-item-title" style="font-family: var(--font-serif); font-size: 1.0625rem; font-weight: 500; margin: 0; line-height: 1.25;">
                  <a href="${root}product/${item.slug}/" style="color: inherit; text-decoration: none;">${item.productName}</a>
                </h3>
                <span style="font-weight: 600; font-size: 0.9375rem; color: var(--color-text-primary); white-space: nowrap;">${item.subtotalFormatted}</span>
              </div>
              <p class="cart-item-sub" style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 4px;">
                ${item.descriptor ? item.descriptor + ' · ' : ''}${item.variantName || item.size}
              </p>
              <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 8px;">
                ${item.priceFormatted} each
              </div>
              <div class="cart-item-qty" style="display: flex; align-items: center; margin-top: auto; gap: 8px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-xs); background: var(--bg-surface);">
                  <button type="button" class="qty-btn qty-minus" data-id="${item.id}" aria-label="Decrease quantity for ${item.productName}" style="min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; font-size: 1.125rem; color: var(--color-text-primary); touch-action: manipulation;">−</button>
                  <input 
                    type="number" 
                    class="qty-input" 
                    data-id="${item.id}" 
                    value="${item.quantity}" 
                    min="1" 
                    max="${item.stock !== null ? item.stock : 99}" 
                    aria-label="Quantity for ${item.productName}"
                    style="width: 40px; min-height: 44px; text-align: center; border: none; background: transparent; font-weight: 500; font-size: 0.9375rem; -moz-appearance: textfield; padding: 2px 0;"
                  >
                  <button 
                    type="button" 
                    class="qty-btn qty-plus" 
                    data-id="${item.id}" 
                    aria-label="Increase quantity for ${item.productName}"
                    style="min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; font-size: 1.125rem; color: var(--color-text-primary); touch-action: manipulation; ${isMaxStock ? 'opacity: 0.4; cursor: not-allowed;' : ''}"
                    ${isMaxStock ? 'disabled title="Maximum available stock reached"' : ''}
                  >+</button>
                </div>
                <button type="button" class="cart-remove-btn" data-id="${item.id}" aria-label="Remove ${item.productName} from shopping bag" style="font-size: 0.75rem; text-decoration: underline; color: var(--color-text-muted); background: none; border: none; cursor: pointer; padding: 10px 8px; min-height: 44px; display: inline-flex; align-items: center; margin-left: auto;">Remove</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Wire up Quantity Steppers, Direct Input, and Remove Buttons
      itemsContainer.querySelectorAll('.qty-minus').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const id = btn.getAttribute('data-id');
          decreaseQuantity(id);
        });
      });

      itemsContainer.querySelectorAll('.qty-plus').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const id = btn.getAttribute('data-id');
          increaseQuantity(id);
        });
      });

      itemsContainer.querySelectorAll('.qty-input').forEach(input => {
        input.addEventListener('change', () => {
          const id = input.getAttribute('data-id');
          let val = parseInt(input.value, 10);
          if (isNaN(val) || val <= 0) {
            val = 1;
          }
          setQuantity(id, val);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            input.blur();
          }
        });
      });

      itemsContainer.querySelectorAll('.cart-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const id = btn.getAttribute('data-id');
          removeItem(id);
        });
      });
    }
  }

  // 5. Update Drawer Footer (Subtotal & Actions: View Cart + Checkout)
  const drawerFooter = drawer.querySelector('.drawer-footer');
  if (drawerFooter) {
    if (cart.length === 0) {
      // Do not show checkout when the cart is empty
      drawerFooter.style.display = 'none';
    } else {
      drawerFooter.style.display = 'block';
      drawerFooter.innerHTML = `
        <div class="drawer-footer-pricing" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
          <span style="font-weight: 500; font-size: 1rem; color: var(--color-text-primary);">Estimated Subtotal</span>
          <span style="font-weight: 600; font-size: 1.125rem; color: var(--color-text-primary);">${subtotal.formatted}</span>
        </div>
        <p style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 16px; line-height: 1.4;">
          Taxes and delivery coordinated separately.
        </p>
        <div class="drawer-footer-actions" style="display: flex; flex-direction: column; gap: 10px;">
          <a href="${root}cart/" class="btn btn-outline btn-full" id="cart-drawer-view-cart-btn" style="display: flex; align-items: center; justify-content: center; text-decoration: none; min-height: 48px; font-weight: 500; font-size: 0.8125rem; letter-spacing: var(--tracking-wider); text-transform: uppercase;">
            View Cart
          </a>
          <a href="${root}checkout/" class="btn btn-primary btn-full" id="cart-drawer-checkout-btn" style="display: flex; align-items: center; justify-content: center; text-decoration: none; min-height: 52px; font-weight: 500; font-size: 0.875rem; letter-spacing: var(--tracking-wider); text-transform: uppercase;">
            Proceed to Checkout · ${subtotal.formatted}
          </a>
        </div>
      `;

      // Allow clicking "View Cart" to close the drawer
      drawerFooter.querySelector('#cart-drawer-view-cart-btn')?.addEventListener('click', () => {
        drawer.classList.remove('is-open');
        const backdrop = document.querySelector('.drawer-backdrop');
        if (backdrop) backdrop.classList.remove('is-active');
        document.body.classList.remove('drawer-open');
      });
    }
  }
}

/**
 * Synchronize all cart UI elements on the page
 */
export function syncCartUI() {
  const drawer = document.querySelector('#cart-drawer');
  if (drawer) {
    renderCartDrawer(drawer);
  } else {
    const count = getCartCount();
    document.querySelectorAll('.cart-count-val').forEach(b => {
      b.textContent = count;
    });
  }
}

/**
 * Open the cart drawer (standalone path used after add-to-cart).
 * Mirrors js/drawers.js trigger behavior: focus trap, aria-hidden, main
 * landmark inert, and focus return on close. Trap state is element-keyed
 * so both controllers stay in sync.
 */
export function openCartDrawer() {
  const cartDrawer = document.querySelector('#cart-drawer');
  const backdrop = document.querySelector('.drawer-backdrop');
  const mainContent = document.querySelector('main');
  if (cartDrawer) {
    syncCartUI();
    cartDrawer.classList.add('is-open');
    cartDrawer.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('is-active');
    document.body.classList.add('drawer-open');
    if (mainContent) mainContent.inert = true;
    trapOnElement(cartDrawer, {
      initialFocus: cartDrawer.querySelector('#cart-drawer-close')
    });
  }
}

/**
 * Close the cart drawer from cart-store render paths (View Cart /
 * Continue Shopping links). Releases the element-keyed trap and restores
 * focus to the opener.
 */
export function closeCartDrawer() {
  const cartDrawer = document.querySelector('#cart-drawer');
  const backdrop = document.querySelector('.drawer-backdrop');
  const mainContent = document.querySelector('main');
  if (cartDrawer) {
    cartDrawer.classList.remove('is-open');
    cartDrawer.setAttribute('aria-hidden', 'true');
  }
  if (backdrop) backdrop.classList.remove('is-active');
  document.body.classList.remove('drawer-open');
  if (mainContent) mainContent.inert = false;
  releaseTrapOnElement(cartDrawer);
}

/**
 * Initialize Cart reactivity on page load
 */
export function initCart() {
  syncCartUI();

  if (typeof window !== 'undefined') {
    // React to cart state updates across components
    window.addEventListener('slimky:cart:updated', () => {
      syncCartUI();
    });

    // React to cross-tab updates via localStorage
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        syncCartUI();
      }
    });
  }
}
