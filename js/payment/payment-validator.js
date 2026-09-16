/**
 * Authoritative Payment Validator - Slimky Hair
 * Milestone C10 & C11: Payment Security & Price Guard
 * 
 * SECURITY MANDATE:
 * Never trust payment amounts supplied directly by the frontend client.
 * This authoritative validator recalculates and enforces:
 * - Product existence & active status
 * - Variant existence & availability
 * - Stock / quantity limits
 * - Canonical catalog unit prices
 * - Canonical order product payment total
 * - Verified currency (NGN)
 */

import { CATALOG_PRODUCTS } from '../catalog-data.js';
import { inventoryService } from '../inventory/inventory-service.js';

export class PaymentValidationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PaymentValidationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Validate and authoritatively calculate payment total from catalog data.
 * @param {Object} params
 * @param {Array} params.items - Cart/Order items snapshot
 * @param {number} [params.claimedAmount] - Client-supplied amount (if present, checked for tampering)
 * @param {string} [params.claimedCurrency='NGN'] - Client-supplied currency
 * @param {string} [params.flow='nigeria_checkout']
 * @returns {Object} { valid: true, canonicalPricing, validatedItems }
 * @throws {PaymentValidationError} If any item is invalid, out of stock, or price is tampered
 */
export function validatePaymentRequest({
  items = [],
  claimedAmount = null,
  claimedCurrency = 'NGN',
  flow = 'nigeria_checkout'
} = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new PaymentValidationError(
      'Cannot process payment for an empty order.',
      'EMPTY_ORDER'
    );
  }

  if (claimedCurrency && claimedCurrency.toUpperCase() !== 'NGN') {
    throw new PaymentValidationError(
      `Unsupported currency "${claimedCurrency}". Only NGN is supported.`,
      'INVALID_CURRENCY',
      { currency: claimedCurrency }
    );
  }

  let canonicalSubtotal = 0;
  const validatedItems = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const productId = item.productId || item.id;
    const requestedQty = Number(item.quantity);

    if (!productId) {
      throw new PaymentValidationError(
        `Item at index ${index} is missing a valid product ID.`,
        'MISSING_PRODUCT_ID'
      );
    }

    if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
      throw new PaymentValidationError(
        `Invalid quantity for product "${item.productName || productId}". Must be a positive integer.`,
        'INVALID_QUANTITY',
        { productId, quantity: requestedQty }
      );
    }

    // 1. Authoritative Product Lookup
    const product = CATALOG_PRODUCTS.find(p => p.id === productId || p.slug === productId);
    if (!product || product.status === 'discontinued' || product.isAvailable === false) {
      throw new PaymentValidationError(
        `Product "${item.productName || productId}" is no longer available.`,
        'PRODUCT_UNAVAILABLE',
        { productId }
      );
    }

    // 2. Authoritative Variant & Price Lookup
    let authoritativePrice = 0;
    let authoritativeSku = '';
    let authoritativeVariantName = '';
    let authoritativeStock = null;

    if (Array.isArray(product.variants) && product.variants.length > 0) {
      const variantId = item.variantId || item.sku || item.size;
      const variant = product.variants.find(v =>
        (v.sku && v.sku === item.sku) ||
        (v.sku && v.sku === variantId) ||
        (v.size && v.size === item.variantName) ||
        (v.size && v.size === item.size)
      );

      if (!variant) {
        // Fail closed: never silently fall back to variants[0] — charging the
        // wrong variant's price is worse than rejecting an ambiguous item.
        throw new PaymentValidationError(
          `Variant for product "${product.name}" could not be verified.`,
          'VARIANT_UNAVAILABLE',
          { productId, variantId }
        );
      }

      // Check both static catalog stock and live dynamic inventory
      const liveStockRecord = inventoryService?.getSkuStock ? inventoryService.getSkuStock(variant.sku) : null;
      const effectiveStock = (liveStockRecord !== null && liveStockRecord !== undefined && typeof liveStockRecord.stock === 'number')
        ? liveStockRecord.stock
        : variant.stock;
      const effectiveAvailability = liveStockRecord?.availability || variant.availability;

      if (effectiveAvailability === 'Out of Stock' || effectiveStock === 0) {
        throw new PaymentValidationError(
          `Product "${product.name}" (${variant.size || variant.sku}) is currently out of stock.`,
          'OUT_OF_STOCK',
          { productId, sku: variant.sku }
        );
      }

      if (effectiveStock !== null && effectiveStock !== undefined && requestedQty > effectiveStock) {
        throw new PaymentValidationError(
          `Requested quantity (${requestedQty}) for "${product.name}" exceeds available inventory (${effectiveStock}).`,
          'STOCK_EXCEEDED',
          { productId, requestedQty, availableStock: effectiveStock }
        );
      }

      authoritativePrice = Number(variant.priceValue);
      authoritativeSku = variant.sku || '';
      authoritativeVariantName = variant.size || '';
      authoritativeStock = variant.stock;
    } else {
      // Single price fallback if product lacks explicit variants array
      authoritativePrice = Number(product.priceValue || 0);
      authoritativeSku = product.sku || '';
    }

    if (isNaN(authoritativePrice) || authoritativePrice <= 0) {
      throw new PaymentValidationError(
        `Invalid catalog pricing detected for product "${product.name}".`,
        'INVALID_CATALOG_PRICE',
        { productId }
      );
    }

    const canonicalLineTotal = authoritativePrice * requestedQty;
    canonicalSubtotal += canonicalLineTotal;

    validatedItems.push({
      productId: product.id,
      variantId: item.variantId || authoritativeSku,
      sku: authoritativeSku,
      productName: product.name,
      variantName: authoritativeVariantName,
      productImage: product.images?.packaging || item.productImage || '',
      unitPrice: authoritativePrice,
      quantity: requestedQty,
      lineTotal: canonicalLineTotal,
      stock: authoritativeStock
    });
  }

  // 3. Authoritative Order Total Rules (Nigeria & International: Product Payment Total == Subtotal)
  const canonicalProductPaymentTotal = canonicalSubtotal;

  // 4. Client Amount Tamper Verification
  if (claimedAmount !== null && claimedAmount !== undefined) {
    const numClaimed = Number(claimedAmount);
    if (Math.abs(numClaimed - canonicalProductPaymentTotal) > 0.01) {
      throw new PaymentValidationError(
        `Payment amount mismatch detected. Claimed: ₦${numClaimed.toLocaleString('en-NG')}, Authoritative: ₦${canonicalProductPaymentTotal.toLocaleString('en-NG')}.`,
        'AMOUNT_MISMATCH',
        { claimedAmount: numClaimed, canonicalProductPaymentTotal }
      );
    }
  }

  return {
    valid: true,
    canonicalPricing: {
      subtotal: canonicalSubtotal,
      subtotalFormatted: `₦${canonicalSubtotal.toLocaleString('en-NG')}`,
      shippingStatus: flow === 'nigeria_checkout' ? 'Calculated separately' : 'Quote required',
      shippingFee: null,
      productPaymentTotal: canonicalProductPaymentTotal,
      productPaymentTotalFormatted: `₦${canonicalProductPaymentTotal.toLocaleString('en-NG')}`,
      currency: 'NGN'
    },
    validatedItems
  };
}
