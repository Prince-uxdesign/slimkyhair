/**
 * Customer Account Wishlist Controller - Slimky Hair
 * Milestone C19.8: Wishlist + Customer Account Connection
 */

import { CATALOG_PRODUCTS } from './catalog-data.js';
import { renderProductCardHTML, initCardInteractions, getRootPath } from './catalog-renderer.js';
import { getWishlistProducts, getWishlistCount, syncWishlistUI } from './wishlist-store.js';
import { customerService } from './auth/customer-service.js';
import { initAccountShell } from './account-shell.js';

export class AccountWishlist {
  constructor(options = {}) {
    if (options.rootPrefix !== undefined) {
      this.rootPrefix = options.rootPrefix;
    } else {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      this.rootPrefix = path.includes('/account/') ? (path.includes('/account/wishlist/') ? '../../' : '../') : './';
    }

    this.customer = customerService.getCurrentCustomer();

    // Guard: strictly require authentication
    if (!this.customer) {
      if (typeof window !== 'undefined' && window.location) {
        const target = window.location.pathname + window.location.search;
        window.location.href = `${this.rootPrefix}account/login/?redirect=${encodeURIComponent(target)}`;
      }
      return;
    }

    this.mountEl = document.querySelector('#account-wishlist-mount');
    this.init();
  }

  init() {
    // Initialize common shell navigation with 'wishlist' active
    initAccountShell({
      activeNav: 'wishlist',
      rootPrefix: this.rootPrefix,
      authRequired: true
    });

    this.render();

    // Re-render when wishlist state updates across tabs or interactions
    window.addEventListener('slimky:wishlist:updated', () => {
      this.render();
    });

    syncWishlistUI(document);
  }

  render() {
    if (!this.mountEl) return;

    const savedProducts = getWishlistProducts(CATALOG_PRODUCTS);
    const count = savedProducts.length;

    if (count === 0) {
      this.mountEl.innerHTML = `
        <header class="addresses-header-actions">
          <div>
            <h1 class="account-panel-title">Saved Wishlist</h1>
            <p class="account-panel-desc">Your curated botanical formulations saved for routine replenishments and future purchases.</p>
          </div>
        </header>

        <div class="dashboard-empty-state" style="margin-top: 24px; padding: 48px 24px;">
          <div class="dashboard-empty-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </div>
          <h2 class="dashboard-empty-title" style="font-size: 1.35rem; margin-bottom: 8px;">Your wishlist is empty</h2>
          <p class="dashboard-empty-desc" style="max-width: 440px; margin: 0 auto 24px auto;">
            Save products you love and come back to them later.
          </p>
          <div>
            <a href="${this.rootPrefix}shop/" class="btn-primary" style="display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 24px; text-decoration: none;">
              Explore Products
            </a>
          </div>
        </div>
      `;
    } else {
      const cardsHtml = savedProducts.map(product => {
        return renderProductCardHTML(product, { rootPrefix: this.rootPrefix });
      }).join('');

      this.mountEl.innerHTML = `
        <header class="addresses-header-actions" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 class="account-panel-title">Saved Wishlist</h1>
            <p class="account-panel-desc">Your curated botanical formulations saved for routine replenishments and future purchases.</p>
          </div>
          <span class="account-status-badge status-active" style="font-size: 0.8125rem;">
            ${count} ${count === 1 ? 'Formulation' : 'Formulations'} Saved
          </span>
        </header>

        <div class="account-wishlist-grid" id="account-wishlist-grid" aria-label="Saved Formulations Grid">
          ${cardsHtml}
        </div>
      `;

      // Attach card interactions (Quick Add to Cart and Wishlist Toggle)
      const gridEl = this.mountEl.querySelector('#account-wishlist-grid');
      if (gridEl) {
        initCardInteractions(gridEl, {
          onWishlistToggle: () => {
            this.render();
          }
        });
      }
    }

    syncWishlistUI(document);
  }
}

// Auto-initialize if DOM is ready or on DOMContentLoaded
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new AccountWishlist();
    });
  } else {
    new AccountWishlist();
  }
}
