/**
 * Centralized Wishlist Store - Slimky Hair
 * 
 * MVP Specifications:
 * - Operates entirely client-side without requiring user authentication.
 * - Persists product IDs in browser localStorage (`slimky_hair_wishlist`).
 * - Emits custom window events (`slimky:wishlist:updated`) for real-time reactivity across pages.
 * - Gracefully handles removed/invalid product IDs against the catalog.
 * - Architected to cleanly plug into future authenticated cloud sync (e.g. Supabase / PostgreSQL).
 */

import { CATALOG_PRODUCTS } from './catalog-data.js';
import { customerService } from './auth/customer-service.js';

const STORAGE_KEY = 'slimky_hair_wishlist';

/**
 * Retrieve raw list of saved product IDs from localStorage
 * @returns {string[]} Array of product ID strings
 */
export function getWishlistIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[WishlistStore] Could not read from localStorage:', err);
    return [];
  }
}

/**
 * Save array of product IDs to localStorage and dispatch update event.
 * If a customer is authenticated, also syncs to their customer account wishlist.
 * @param {string[]} ids
 */
function saveWishlistIds(ids) {
  try {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    
    // Milestone C19.8: If customer is authenticated, persist to account store
    try {
      const customer = customerService.getCurrentCustomer();
      if (customer && customer.id) {
        customerService.saveCustomerWishlist(customer.id, unique);
      }
    } catch (e) {
      console.warn('[WishlistStore] Account sync notice:', e);
    }

    // Dispatch reactive event for all active listeners
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('slimky:wishlist:updated', {
        detail: {
          ids: unique,
          count: unique.length
        }
      }));
    }
    return unique;
  } catch (err) {
    console.warn('[WishlistStore] Could not write to localStorage:', err);
    return ids;
  }
}

/**
 * Check if a product is saved in the wishlist
 * @param {string} productId
 * @returns {boolean}
 */
export function isInWishlist(productId) {
  if (!productId) return false;
  const ids = getWishlistIds();
  return ids.includes(String(productId));
}

/**
 * Add a product to the wishlist
 * @param {string} productId
 * @returns {boolean} true if added
 */
export function addToWishlist(productId) {
  if (!productId) return false;
  const idStr = String(productId);
  const ids = getWishlistIds();
  if (!ids.includes(idStr)) {
    ids.push(idStr);
    saveWishlistIds(ids);
  }
  return true;
}

/**
 * Remove a product from the wishlist
 * @param {string} productId
 * @returns {boolean} true if removed
 */
export function removeFromWishlist(productId) {
  if (!productId) return false;
  const idStr = String(productId);
  const ids = getWishlistIds();
  const filtered = ids.filter(id => id !== idStr);
  saveWishlistIds(filtered);
  return true;
}

/**
 * Toggle a product in the wishlist
 * @param {string} productId
 * @returns {{ saved: boolean, count: number }}
 */
export function toggleWishlist(productId) {
  if (!productId) return { saved: false, count: 0 };
  const idStr = String(productId);
  const currentlySaved = isInWishlist(idStr);
  
  if (currentlySaved) {
    removeFromWishlist(idStr);
    const updatedIds = getWishlistIds();
    return { saved: false, count: updatedIds.length };
  } else {
    addToWishlist(idStr);
    const updatedIds = getWishlistIds();
    return { saved: true, count: updatedIds.length };
  }
}

/**
 * Retrieve full product objects for all saved wishlist IDs
 * Filters out any obsolete or non-existent IDs gracefully.
 * @param {Array} catalog - Defaults to CATALOG_PRODUCTS
 * @returns {Array} Array of matched product objects
 */
export function getWishlistProducts(catalog = CATALOG_PRODUCTS) {
  const ids = getWishlistIds();
  if (!ids.length) return [];

  // Map IDs to catalog products preserving saved order
  const validProducts = [];
  const validIds = [];

  ids.forEach(id => {
    const product = catalog.find(p => String(p.id) === String(id) || p.slug === String(id));
    if (product) {
      validProducts.push(product);
      validIds.push(String(product.id));
    }
  });

  // If some IDs were invalid, clean them up in storage
  if (validIds.length !== ids.length) {
    saveWishlistIds(validIds);
  }

  return validProducts;
}

/**
 * Get total number of valid saved items
 * @returns {number}
 */
export function getWishlistCount() {
  return getWishlistIds().length;
}

/**
 * Synchronize all wishlist button states in the DOM with the store
 * @param {HTMLElement} rootContainer - Root element to query within
 */
export function syncWishlistUI(rootContainer = null) {
  const root = rootContainer || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.querySelectorAll !== 'function') return;

  const savedIds = new Set(getWishlistIds());

  // 1. Sync card buttons
  const cardButtons = root.querySelectorAll('.product-card-wishlist');
  cardButtons.forEach(btn => {
    const pid = String(btn.getAttribute('data-product-id') || '');
    const isSaved = savedIds.has(pid);
    const svg = btn.querySelector('svg');
    const productName = btn.closest('.product-card')?.querySelector('.product-card-title a')?.textContent.trim() || 'product';

    btn.setAttribute('data-saved', isSaved ? 'true' : 'false');
    btn.setAttribute('aria-label', isSaved ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`);
    
    if (isSaved) {
      btn.classList.add('is-active');
      btn.style.color = '#8F3B3B';
      if (svg) svg.style.fill = '#8F3B3B';
    } else {
      btn.classList.remove('is-active');
      btn.style.color = '';
      if (svg) svg.style.fill = 'none';
    }
  });

  // 2. Sync PDP buttons
  const pdpButtons = root.querySelectorAll('#pdp-btn-wishlist, .pdp-wishlist-action');
  pdpButtons.forEach(btn => {
    const pid = String(btn.getAttribute('data-product-id') || '');
    const isSaved = savedIds.has(pid);
    const textSpan = btn.querySelector('span') || btn;
    const svg = btn.querySelector('svg');

    btn.setAttribute('data-saved', isSaved ? 'true' : 'false');
    btn.setAttribute('aria-label', isSaved ? 'Remove from wishlist' : 'Add to wishlist');

    if (isSaved) {
      btn.classList.add('is-active');
      if (svg) svg.style.fill = '#8F3B3B';
      if (btn.querySelector('span')) {
        btn.querySelector('span').textContent = 'Saved in Wishlist';
      }
    } else {
      btn.classList.remove('is-active');
      if (svg) svg.style.fill = 'none';
      if (btn.querySelector('span')) {
        btn.querySelector('span').textContent = 'Add to Wishlist';
      }
    }
  });

  // 3. Update header badge indicators
  const badges = root.querySelectorAll('.wishlist-count-badge');
  const count = savedIds.size;
  badges.forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  });
}

/**
 * Synchronize wishlist with an authenticated customer account.
 * Merges active guest localStorage items with remote/stored customer wishlist,
 * preserves customer items, eliminates duplicates, and updates active UI.
 * @param {Object|string} [customerOrId] - Customer object or customer ID
 * @returns {string[]} Unified product IDs
 */
export function syncWishlistWithUserAccount(customerOrId = null) {
  let customer = null;
  if (customerOrId && typeof customerOrId === 'object' && customerOrId.id) {
    customer = customerOrId;
  } else if (typeof customerOrId === 'string') {
    customer = customerService.getCustomerById(customerOrId);
  } else {
    customer = customerService.getCurrentCustomer();
  }

  if (!customer || !customer.id) {
    return getWishlistIds();
  }

  try {
    const currentLocalIds = getWishlistIds();
    const merged = customerService.mergeCustomerWishlist(customer.id, currentLocalIds);
    saveWishlistIds(merged);
    return merged;
  } catch (err) {
    console.warn('[WishlistStore] Could not sync with user account:', err);
    return getWishlistIds();
  }
}

/**
 * Clear the local active wishlist (used on logout or explicit guest reset).
 */
export function clearGuestWishlist() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('slimky:wishlist:updated', {
        detail: { ids: [], count: 0 }
      }));
    }
    syncWishlistUI();
    return true;
  } catch (e) {
    console.warn('[WishlistStore] Error clearing wishlist:', e);
    return false;
  }
}

// Automatically subscribe to customer authentication state changes
if (typeof customerService !== 'undefined' && typeof customerService.onAuthStateChange === 'function') {
  customerService.onAuthStateChange((customer) => {
    if (customer) {
      // User logged in: sync guest items into customer account
      syncWishlistWithUserAccount(customer);
    } else {
      // User logged out: clear UI badges and active states
      syncWishlistUI();
    }
  });
}

