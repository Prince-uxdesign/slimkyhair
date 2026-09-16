/**
 * Wishlist Page Controller - Slimky Hair
 * 
 * Manages rendering of saved formulations from localStorage without requiring authentication.
 * Dynamically updates when items are added, removed, or cleared.
 */

import { CATALOG_PRODUCTS } from './catalog-data.js';
import { renderProductCardHTML, initCardInteractions, getRootPath } from './catalog-renderer.js';
import { 
  getWishlistProducts, 
  getWishlistCount, 
  removeFromWishlist, 
  syncWishlistUI,
  clearGuestWishlist
} from './wishlist-store.js';
import { customerService } from './auth/customer-service.js';

export class WishlistPage {
  constructor(options = {}) {
    this.rootPrefix = options.rootPrefix !== undefined ? options.rootPrefix : getRootPath();
    this.gridEl = document.querySelector('#wishlist-product-grid');
    this.emptyStateEl = document.querySelector('#wishlist-empty-state');
    this.toolbarEl = document.querySelector('#wishlist-toolbar');
    this.countDisplayEl = document.querySelector('#wishlist-count-display');
    this.clearBtn = document.querySelector('#wishlist-clear-btn');

    this.init();
  }

  init() {
    this.render();

    // Re-render when wishlist state changes across tabs or other components
    window.addEventListener('slimky:wishlist:updated', () => {
      this.render();
    });

    // Clear all items button
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to clear your saved formulations?')) {
          clearGuestWishlist();
          try {
            const customer = customerService.getCurrentCustomer();
            if (customer && customer.id) {
              customerService.saveCustomerWishlist(customer.id, []);
            }
          } catch (err) {}
          this.render();
        }
      });
    }

    // Initial global UI sync for header badges and controls
    syncWishlistUI(document);
  }

  render() {
    const savedProducts = getWishlistProducts(CATALOG_PRODUCTS);
    const count = savedProducts.length;

    // Update count display
    if (this.countDisplayEl) {
      this.countDisplayEl.textContent = `${count} ${count === 1 ? 'formulation' : 'formulations'}`;
    }

    if (count === 0) {
      // Empty state
      if (this.gridEl) {
        this.gridEl.style.display = 'none';
        this.gridEl.innerHTML = '';
      }
      if (this.toolbarEl) {
        this.toolbarEl.style.display = 'none';
      }
      if (this.emptyStateEl) {
        this.emptyStateEl.style.display = 'flex';
      }
    } else {
      // Products present
      if (this.emptyStateEl) {
        this.emptyStateEl.style.display = 'none';
      }
      if (this.toolbarEl) {
        this.toolbarEl.style.display = 'flex';
      }
      if (this.gridEl) {
        this.gridEl.style.display = 'grid';
        this.gridEl.innerHTML = savedProducts.map(product => {
          return renderProductCardHTML(product, { rootPrefix: this.rootPrefix });
        }).join('');

        // Attach interactions (Quick Add, Wishlist Toggle)
        initCardInteractions(this.gridEl, {
          onWishlistToggle: (productId, isSaved) => {
            // Re-render immediately when an item is removed from the wishlist page
            this.render();
          }
        });
      }
    }

    // Always update header badge indicators
    syncWishlistUI(document);
  }
}

// Auto-initialize if DOM is ready or on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new WishlistPage();
  });
} else {
  new WishlistPage();
}
