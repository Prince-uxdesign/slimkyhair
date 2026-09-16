/**
 * Full Shopping Cart Page Controller - Slimky Hair (C4 / C5)
 * 
 * Manages the dedicated /cart page experience.
 * Consumes the central cart state from cart-store.js.
 * Fully responsive: 2 columns on desktop, single column on mobile.
 * Features C5 Cart Integrity Layer:
 * - Pre-checkout validation against authoritative catalog & backend stock
 * - Informative change notifications (price changes, quantity adjustments, discontinued items)
 * - Safe resolution path for customer acceptance
 * - Checkout gating preventing checkout with invalid cart state
 * - Non-destructive network failure handling
 */

import {
  getCart,
  getCartSubtotal,
  getCartCount,
  setQuantity,
  increaseQuantity,
  decreaseQuantity,
  removeItem,
  clearCart,
  getCartRootPath,
  resolveCartImagePath,
  validateCart,
  applyCartValidation
} from './cart-store.js';

import { initNavigation } from './navigation.js';
import { initDrawers } from './drawers.js';
import { syncWishlistUI } from './wishlist-store.js';

export class CartPage {
  constructor(options = {}) {
    this.root = options.rootPrefix !== undefined ? options.rootPrefix : getCartRootPath();
    this.tableContainer = document.querySelector('#cart-page-items');
    this.emptyStateEl = document.querySelector('#cart-page-empty');
    this.contentWrapEl = document.querySelector('#cart-page-content');
    this.countHeaderEl = document.querySelector('#cart-page-count-header');
    this.subtotalDisplayEl = document.querySelector('#cart-page-subtotal');
    this.totalDisplayEl = document.querySelector('#cart-page-total');
    this.clearBtn = document.querySelector('#cart-page-clear-btn');
    this.checkoutBtn = document.querySelector('#cart-page-checkout-cta');

    this.currentValidation = null;

    this.init();
  }

  init() {
    this.render();

    // Re-render reactively upon any cart mutation across the app
    window.addEventListener('slimky:cart:updated', () => {
      this.render();
    });

    window.addEventListener('storage', (e) => {
      if (e.key === 'slimky_hair_cart') {
        this.render();
      }
    });

    // Clear cart action with user confirmation
    this.clearBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to clear your shopping bag?')) {
        clearCart();
      }
    });

    // Checkout Gate: validate cart before allowing checkout
    this.checkoutBtn?.addEventListener('click', (e) => {
      const cart = getCart();
      if (cart.length === 0) {
        e.preventDefault();
        return;
      }

      const validation = validateCart(cart);
      if (!validation.canProceedToCheckout) {
        e.preventDefault();
        this.render();
        const banner = document.querySelector('.cart-validation-banner');
        if (banner) {
          banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }

  render() {
    const cart = getCart();
    const count = getCartCount(cart);
    const subtotal = getCartSubtotal(cart);

    // Run C5 Cart Validation
    const validation = validateCart(cart);
    this.currentValidation = validation;

    // Update Header Count
    if (this.countHeaderEl) {
      this.countHeaderEl.textContent = `(${count} ${count === 1 ? 'item' : 'items'})`;
    }

    // Toggle Empty vs Content Views
    if (cart.length === 0) {
      if (this.contentWrapEl) this.contentWrapEl.style.display = 'none';
      if (this.emptyStateEl) this.emptyStateEl.style.display = 'flex';
      if (this.clearBtn) this.clearBtn.style.display = 'none';
      const oldBanner = document.querySelector('.cart-validation-banner');
      if (oldBanner) oldBanner.remove();
      return;
    }

    if (this.emptyStateEl) this.emptyStateEl.style.display = 'none';
    if (this.contentWrapEl) this.contentWrapEl.style.display = 'grid';
    if (this.clearBtn) this.clearBtn.style.display = 'inline-block';

    // Render / Update Validation Notification Banner
    let banner = document.querySelector('.cart-validation-banner');
    if (validation.notifications.length > 0) {
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'cart-validation-banner';
        banner.setAttribute('role', 'alert');
        banner.setAttribute('aria-live', 'polite');
        if (this.contentWrapEl && this.contentWrapEl.parentElement) {
          this.contentWrapEl.parentElement.insertBefore(banner, this.contentWrapEl);
        }
      }

      const bannerClass = validation.hasBlockingErrors 
        ? 'cart-validation-banner has-errors' 
        : (validation.hasNetworkError ? 'cart-validation-banner has-network-notice' : 'cart-validation-banner');
      banner.className = bannerClass;

      const titleText = validation.hasBlockingErrors 
        ? '⚠️ Important Updates to Your Bag' 
        : (validation.hasNetworkError ? 'ℹ️ Temporary Network Notice' : 'Notice');

      banner.innerHTML = `
        <div class="cart-validation-title">${titleText}</div>
        <ul class="cart-validation-list">
          ${validation.notifications.map(n => `<li>${n.message}</li>`).join('')}
        </ul>
        ${validation.hasBlockingErrors ? `
          <div class="cart-validation-actions">
            <button type="button" class="cart-validation-resolve-btn" id="cart-resolve-updates-btn">
              Accept Updates &amp; Proceed
            </button>
          </div>
        ` : ''}
      `;

      // Wire Resolution Action
      banner.querySelector('#cart-resolve-updates-btn')?.addEventListener('click', () => {
        applyCartValidation(this.currentValidation);
      });
    } else if (banner) {
      banner.remove();
    }

    // Render Order Summary Totals
    if (this.subtotalDisplayEl) {
      this.subtotalDisplayEl.textContent = subtotal.formatted;
    }
    if (this.totalDisplayEl) {
      this.totalDisplayEl.textContent = subtotal.formatted;
    }

    // Render Line Items
    if (this.tableContainer) {
      this.tableContainer.innerHTML = cart.map(item => {
        const rawImg = item.productImage || item.image;
        const itemImg = resolveCartImagePath(rawImg, this.root);
        const isMaxStock = item.stock !== null && item.quantity >= item.stock;
        const variantDisplay = item.variantName || item.size || 'Standard';

        // Check if item has specific validation issue
        const itemIssue = validation.notifications.find(n => n.itemKey === item.id);
        let rowClass = 'cart-item-row cart-page-row';
        if (itemIssue) {
          rowClass += itemIssue.severity === 'error' ? ' is-invalid' : ' has-warning';
        }

        return `
          <div class="${rowClass}" data-id="${item.id}" role="listitem">
            <!-- Product Media & Information -->
            <div class="cart-item-product">
              <a href="${this.root}product/${item.slug}/" class="cart-item-media" aria-label="${item.productName || 'Hair product'}">
                <img
                  src="${itemImg}"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'144\' height=\'180\'><rect width=\'144\' height=\'180\' fill=\'%23F4EFEA\'/><text x=\'72\' y=\'95\' font-family=\'serif\' font-size=\'28\' fill=\'%232C1E18\' text-anchor=\'middle\'>S</text></svg>';"
                >
              </a>
              <div class="cart-item-details">
                <h3 class="cart-item-title">
                  <a href="${this.root}product/${item.slug}/">${item.productName}</a>
                </h3>
                <div class="cart-item-variant">
                  Variant: <span class="cart-item-variant-pill">${variantDisplay}</span>
                </div>
                ${item.sku ? `<div class="cart-item-sku">SKU: ${item.sku}</div>` : ''}
                <div class="cart-item-mobile-price">
                  Unit Price: <strong>${item.priceFormatted}</strong>
                </div>
                ${itemIssue ? `
                  <div style="font-size: 0.75rem; color: ${itemIssue.severity === 'error' ? 'var(--color-error)' : 'var(--color-warning)'}; margin-top: 4px; font-weight: 500;">
                    ${itemIssue.message}
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Desktop Unit Price -->
            <div class="cart-item-price">
              ${item.priceFormatted}
            </div>

            <!-- Controls Wrap (Quantity & Subtotal) -->
            <div class="cart-item-controls-wrap">
              <div class="cart-item-quantity">
                <div class="cart-quantity-stepper" role="group" aria-label="Quantity selector for ${item.productName}">
                  <button 
                    type="button" 
                    class="cart-stepper-btn cart-page-minus" 
                    data-id="${item.id}" 
                    aria-label="Decrease quantity for ${item.productName}"
                  >−</button>
                  <input 
                    type="number" 
                    class="cart-qty-input cart-page-qty-input" 
                    data-id="${item.id}" 
                    value="${item.quantity}" 
                    min="1" 
                    max="${item.stock !== null ? item.stock : 99}" 
                    aria-label="Quantity for ${item.productName}"
                  >
                  <button 
                    type="button" 
                    class="cart-stepper-btn cart-page-plus" 
                    data-id="${item.id}" 
                    aria-label="Increase quantity for ${item.productName}"
                    ${isMaxStock ? 'disabled title="Maximum inventory reached"' : ''}
                  >+</button>
                </div>
                <button 
                  type="button" 
                  class="cart-item-remove-btn cart-page-remove-btn" 
                  data-id="${item.id}" 
                  aria-label="Remove ${item.productName} (${variantDisplay})"
                >Remove</button>
              </div>

              <!-- Item Subtotal -->
              <div class="cart-item-subtotal">
                <span class="cart-item-subtotal-label">Subtotal: </span>
                <span class="cart-item-subtotal-val">${item.subtotalFormatted}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Wire Stepper and Input Interactions
      this.tableContainer.querySelectorAll('.cart-page-minus').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          decreaseQuantity(id);
        });
      });

      this.tableContainer.querySelectorAll('.cart-page-plus').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          increaseQuantity(id);
        });
      });

      this.tableContainer.querySelectorAll('.cart-page-qty-input').forEach(input => {
        input.addEventListener('change', () => {
          const id = input.getAttribute('data-id');
          let val = parseInt(input.value, 10);
          if (isNaN(val) || val <= 0) val = 1;
          setQuantity(id, val);
        });
      });

      this.tableContainer.querySelectorAll('.cart-page-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          removeItem(id);
        });
      });
    }
  }
}

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initDrawers();
  syncWishlistUI(document);
  new CartPage();
});
