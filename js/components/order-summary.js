/**
 * Reusable Order Summary Component - Slimky Hair (C9)
 * 
 * Single source of truth for order itemization, pricing, and shipping communication.
 * Shared across:
 * - Checkout (/checkout)
 * - Order Confirmation / Handoff
 * - Customer Order History
 * - Admin Order View
 */

import {
  formatNaira,
  resolveCartImagePath,
  getCartRootPath,
  getCartSubtotal
} from '../cart-store.js';

export const ORDER_SUMMARY_MODES = {
  CHECKOUT: 'checkout',
  CONFIRMATION: 'confirmation',
  HISTORY: 'history',
  ADMIN: 'admin'
};

/**
 * Computes canonical pricing for any set of items.
 * Single source of truth guaranteeing consistent math across all components.
 * 
 * @param {Array} items - List of cart or order items
 * @param {Object} [shippingConfig] - { isNigeria, shippingStatus, shippingFee }
 * @returns {Object} Canonical totals and formatted strings
 */
export function calculateOrderPricing(items = [], shippingConfig = {}) {
  const isNigeria = shippingConfig.isNigeria !== false;
  
  // Single source calculation
  let subtotalValue = 0;
  let totalQuantity = 0;

  const normalizedItems = (items || []).map(item => {
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    const unitPrice = typeof item.unitPrice === 'number' 
      ? item.unitPrice 
      : (typeof item.priceValue === 'number' ? item.priceValue : 0);
    const lineSubtotal = unitPrice * qty;

    subtotalValue += lineSubtotal;
    totalQuantity += qty;

    return {
      itemKey: item.itemKey || item.id || item.productId,
      productId: item.productId,
      variantId: item.variantId || null,
      productName: item.productName || 'Botanical Hair Formulation',
      variantName: item.variantName || item.size || 'Standard Formulation',
      productImage: item.productImage || item.image || '',
      sku: item.sku || null,
      unitPrice,
      unitPriceFormatted: item.unitPriceFormatted || item.priceFormatted || formatNaira(unitPrice),
      quantity: qty,
      subtotal: lineSubtotal,
      subtotalFormatted: item.subtotalFormatted || formatNaira(lineSubtotal)
    };
  });

  const subtotalFormatted = formatNaira(subtotalValue);

  // Shipping Status & Rules:
  // Nigeria: Subtotal + Shipping calculated separately = Product payment total (Do NOT add shipping)
  // International: Subtotal + Shipping quote required = Product payment total (Do NOT invent shipping)
  const shippingStatus = shippingConfig.shippingStatus || (
    isNigeria ? 'Shipping: Calculated separately' : 'Shipping: Quote required'
  );

  const shippingNote = isNigeria
    ? 'The product total is what you will pay through the product payment flow. After payment is verified, Slimky will contact you directly with the delivery fee.'
    : 'Shipping quote required. The customer pays for the products first. The shipping amount is handled separately after Slimky obtains the actual shipping quote.';

  // In both Nigeria and International MVP flows, online payment collects the Product Payment Total.
  // Shipping fee is strictly separate / quote required.
  const productPaymentTotalValue = subtotalValue;
  const productPaymentTotalFormatted = subtotalFormatted;

  return {
    items: normalizedItems,
    count: totalQuantity,
    itemCount: normalizedItems.length,
    subtotal: subtotalValue,
    subtotalFormatted,
    shippingStatus,
    shippingNote,
    shippingFee: shippingConfig.shippingFee || null,
    totalLabel: 'Product Payment Total',
    productPaymentTotal: productPaymentTotalValue,
    productPaymentTotalFormatted,
    isNigeria
  };
}

/**
 * Reusable Order Summary Component
 */
export class OrderSummaryComponent {
  /**
   * @param {Object} config
   * @param {HTMLElement|string} [config.container] - Target container element or selector
   * @param {Array} [config.items] - Cart or order items
   * @param {string} [config.mode] - 'checkout' | 'confirmation' | 'history' | 'admin'
   * @param {boolean} [config.isNigeria] - Country flag for shipping rules
   * @param {string} [config.rootPrefix] - Relative root path prefix
   * @param {Object} [config.orderMeta] - Optional metadata (orderId, customer, date) for confirmation/history
   */
  constructor(config = {}) {
    this.container = typeof config.container === 'string' 
      ? document.querySelector(config.container) 
      : config.container;
    this.mode = config.mode || ORDER_SUMMARY_MODES.CHECKOUT;
    this.items = config.items || [];
    this.isNigeria = config.isNigeria !== undefined ? config.isNigeria : true;
    this.root = config.rootPrefix !== undefined ? config.rootPrefix : getCartRootPath();
    this.orderMeta = config.orderMeta || null;
    this.isCollapsible = config.isCollapsible !== undefined ? config.isCollapsible : true;
    this.isExpanded = false;
  }

  /**
   * Set or update items and re-render
   * @param {Array} items 
   * @param {boolean} [isNigeria]
   */
  update(items, isNigeria = this.isNigeria) {
    this.items = items;
    this.isNigeria = isNigeria;
    this.render();
  }

  /**
   * Generates the semantic HTML markup for the order summary
   * @returns {string} HTML markup
   */
  getHtml() {
    const pricing = calculateOrderPricing(this.items, { isNigeria: this.isNigeria });

    if (this.mode === ORDER_SUMMARY_MODES.CONFIRMATION || this.mode === ORDER_SUMMARY_MODES.HISTORY) {
      return this._renderConfirmationHtml(pricing);
    }

    if (this.mode === ORDER_SUMMARY_MODES.ADMIN) {
      return this._renderAdminHtml(pricing);
    }

    return this._renderCheckoutHtml(pricing);
  }

  /**
   * Checkout mode sidebar summary
   */
  _renderCheckoutHtml(pricing) {
    const itemsHtml = pricing.items.map(item => {
      const itemImg = resolveCartImagePath(item.productImage, this.root);
      return `
        <div class="checkout-item-line" data-item-key="${item.itemKey}">
          <div class="checkout-item-media">
            <img src="${itemImg}" alt="${item.productName || 'Slimky Hair product'}" loading="lazy" decoding="async">
          </div>
          <div class="checkout-item-details">
            <div class="checkout-item-name" title="${item.productName}">${item.productName}</div>
            <div class="checkout-item-meta">
              <span>${item.variantName}</span> · <span>Qty: ${item.quantity}</span>
            </div>
            <div class="checkout-item-meta" style="margin-top: 2px;">
              <span>Unit: ${item.unitPriceFormatted}</span>
            </div>
          </div>
          <div class="checkout-item-subtotal">
            ${item.subtotalFormatted}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="checkout-summary-card" data-order-summary-mode="checkout">
        <!-- Mobile Toggle Header (Visible on Mobile) -->
        <button 
          type="button" 
          id="checkout-summary-toggle" 
          class="checkout-summary-toggle" 
          aria-expanded="${this.isExpanded ? 'true' : 'false'}" 
          aria-controls="checkout-summary-content"
        >
          <span class="checkout-summary-title" style="font-size: 1.125rem;">
            Order Summary (<span id="checkout-summary-count">${pricing.count}</span>)
          </span>
          <span style="display: flex; align-items: center; gap: 8px;">
            <span id="checkout-summary-mobile-total" style="font-weight: 600; color: var(--color-text-primary);">${pricing.productPaymentTotalFormatted}</span>
            <svg class="checkout-summary-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform: ${this.isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.2s ease;">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </button>

        <!-- Collapsible Summary Content -->
        <div id="checkout-summary-content" class="checkout-summary-content ${this.isExpanded ? 'is-expanded' : ''}">
          <h2 class="checkout-summary-title" style="display: none; font-size: 1.25rem; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border-subtle);">
            Order Summary
          </h2>

          <!-- Items List -->
          <div id="checkout-items-list" class="checkout-items-list" role="list">
            ${itemsHtml}
          </div>

          <!-- Subtotal Row -->
          <div class="checkout-summary-row">
            <span>Subtotal</span>
            <span id="checkout-subtotal" class="checkout-summary-subtotal">${pricing.subtotalFormatted}</span>
          </div>

          <!-- Shipping Info Box -->
          <div class="checkout-shipping-box">
            <div class="checkout-shipping-heading">Shipping & Delivery</div>
            <div id="checkout-shipping-status" class="checkout-shipping-status">${pricing.shippingStatus}</div>
            <div id="checkout-shipping-note" class="checkout-shipping-note">
              ${pricing.shippingNote}
            </div>
          </div>

          <!-- Total Row -->
          <div class="checkout-summary-total">
            <span class="checkout-total-label" id="checkout-total-label">${pricing.totalLabel}</span>
            <span id="checkout-total" class="checkout-total-amount">${pricing.productPaymentTotalFormatted}</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); margin: -10px 0 16px;">
            ${pricing.isNigeria ? 'Product total only. Shipping fee calculated separately after payment.' : 'Product total only. Shipping quote required and settled separately.'}
          </div>

          <!-- Trust Signals -->
          <div style="font-size: 0.75rem; color: var(--color-text-muted); line-height: 1.5; border-top: 1px solid var(--color-border-subtle); padding-top: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span style="color: var(--color-sage-muted);">✔</span>
              <span>Direct from Lagos Botanical Formulation Lab</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: var(--color-sage-muted);">✔</span>
              <span>Carefully packed in tamper-evident sustainable glass</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Confirmation / Staged Order Recap mode
   */
  _renderConfirmationHtml(pricing) {
    const meta = this.orderMeta || {};
    const itemsRows = pricing.items.map(item => `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--color-border-subtle); font-size: 0.875rem;">
        <div>
          <div style="font-weight: 500; color: var(--color-text-primary);">${item.productName}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-secondary);">${item.variantName} · Qty: ${item.quantity} · ${item.unitPriceFormatted} each</div>
        </div>
        <div style="font-weight: 600; color: var(--color-text-primary);">${item.subtotalFormatted}</div>
      </div>
    `).join('');

    return `
      <div class="checkout-summary-recap" data-order-summary-mode="confirmation">
        <div style="font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 12px; border-bottom: 1px solid var(--color-border-subtle); padding-bottom: 6px; display: flex; justify-content: space-between;">
          <span>Staged Order ${meta.orderId ? `(Ref: ${meta.orderId})` : ''}</span>
          <span style="color: var(--color-brown-deep); font-weight: 600;">Status: Unpaid</span>
        </div>

        ${meta.customer ? `
          <div style="font-size: 0.875rem; line-height: 1.6; color: var(--color-text-primary); margin-bottom: 12px;">
            <div><strong>Recipient:</strong> ${meta.customer.fullName || ''}</div>
            <div><strong>Email:</strong> ${meta.customer.email || ''}</div>
            <div><strong>Phone / WhatsApp:</strong> ${meta.customer.phone || ''}</div>
            ${meta.deliveryAddress ? `<div><strong>Delivery Address:</strong> ${meta.deliveryAddress}</div>` : ''}
            ${meta.instructions ? `<div><strong>Notes:</strong> "${meta.instructions}"</div>` : ''}
          </div>
        ` : ''}

        <div class="checkout-recap-items" style="margin-bottom: 12px;">
          ${itemsRows}
        </div>

        <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: baseline; font-size: 0.875rem;">
          <span style="color: var(--color-text-secondary);">Subtotal (${pricing.count} items):</span>
          <span style="font-weight: 600; color: var(--color-text-primary);">${pricing.subtotalFormatted}</span>
        </div>

        <div style="margin-top: 6px; display: flex; justify-content: space-between; align-items: baseline; font-size: 0.875rem;">
          <span style="color: var(--color-text-secondary);">Shipping:</span>
          <span style="font-size: 0.8125rem; font-weight: 500; color: var(--color-brown-deep);">${pricing.isNigeria ? 'Calculated separately' : 'Quote required'}</span>
        </div>

        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-border-subtle); display: flex; justify-content: space-between; align-items: baseline;">
          <span style="font-size: 1rem; font-weight: 600; color: var(--color-text-primary);">${pricing.totalLabel}:</span>
          <span style="font-family: var(--font-serif); font-size: 1.5rem; font-weight: 600; color: var(--color-text-primary);">${pricing.productPaymentTotalFormatted}</span>
        </div>
      </div>
    `;
  }

  /**
   * Admin Backoffice Order mode
   */
  _renderAdminHtml(pricing) {
    const meta = this.orderMeta || {};
    return `
      <div class="admin-order-summary" style="border: 1px solid var(--color-border-subtle); padding: 16px; border-radius: var(--radius-sm); background: var(--bg-surface);">
        <h4 style="margin: 0 0 12px; font-size: 1rem;">Order Itemization ${meta.orderId ? `(#${meta.orderId})` : ''}</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8125rem;">
          <thead>
            <tr style="border-bottom: 1px solid var(--color-border-subtle); text-align: left;">
              <th style="padding: 6px 0;">Item</th>
              <th style="padding: 6px 8px; text-align: center;">Qty</th>
              <th style="padding: 6px 8px; text-align: right;">Unit</th>
              <th style="padding: 6px 0; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${pricing.items.map(item => `
              <tr style="border-bottom: 1px solid var(--color-border-subtle);">
                <td style="padding: 8px 0;">
                  <strong>${item.productName}</strong><br>
                  <span style="color: var(--color-text-muted);">${item.variantName} ${item.sku ? `(${item.sku})` : ''}</span>
                </td>
                <td style="padding: 8px; text-align: center;">${item.quantity}</td>
                <td style="padding: 8px; text-align: right;">${item.unitPriceFormatted}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600;">${item.subtotalFormatted}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 8px 0; text-align: right;">Subtotal:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600;">${pricing.subtotalFormatted}</td>
            </tr>
            <tr>
              <td colspan="3" style="padding: 4px 0; text-align: right; color: var(--color-text-muted);">Shipping:</td>
              <td style="padding: 4px 0; text-align: right; color: var(--color-brown-deep);">${pricing.shippingStatus}</td>
            </tr>
            <tr style="font-size: 0.9375rem; font-weight: 700; border-top: 1px solid var(--color-border-subtle);">
              <td colspan="3" style="padding: 8px 0; text-align: right;">Product Total:</td>
              <td style="padding: 8px 0; text-align: right;">${pricing.productPaymentTotalFormatted}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  /**
   * Render or update into this.container
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = this.getHtml();
    this.bindEvents();
  }

  /**
   * Bind mobile collapse events
   */
  bindEvents() {
    if (!this.container) return;
    const toggle = this.container.querySelector('#checkout-summary-toggle');
    const content = this.container.querySelector('#checkout-summary-content');

    if (toggle && content) {
      toggle.addEventListener('click', () => {
        this.isExpanded = !this.isExpanded;
        content.classList.toggle('is-expanded', this.isExpanded);
        toggle.setAttribute('aria-expanded', this.isExpanded ? 'true' : 'false');
        const chevron = toggle.querySelector('.checkout-summary-chevron');
        if (chevron) {
          chevron.style.transform = this.isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      });
    }
  }
}
