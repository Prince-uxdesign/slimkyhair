import { initCart, syncCartUI } from './cart-store.js';
import { trapOnElement, releaseTrapOnElement } from './focus-trap.js';

export function initDrawers() {
  const backdrop = document.querySelector('.drawer-backdrop');
  const mainContent = document.querySelector('main');

  // Initialize centralized cart store and reactive drawer rendering
  initCart();

  // Search Drawer Elements
  const searchTriggers = document.querySelectorAll('.trigger-search');
  const searchDrawer = document.querySelector('#search-drawer');
  const searchClose = document.querySelector('#search-drawer-close');
  const searchInput = document.querySelector('#search-input');

  // Cart Drawer Elements
  const cartTriggers = document.querySelectorAll('.trigger-cart');
  const cartDrawer = document.querySelector('#cart-drawer');
  const cartClose = document.querySelector('#cart-drawer-close');

  // Focus traps live on the drawer elements themselves (see
  // js/focus-trap.js): the cart drawer is also opened by js/cart-store.js
  // after add-to-cart, so any controller can release a trap it did not
  // create. Releases restore focus to the control that opened the drawer.
  function setDrawerHidden(drawer, hidden) {
    if (drawer) drawer.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  }

  // Open Search Drawer
  function openSearchDrawer(trigger = null) {
    const opener = trigger instanceof HTMLElement ? trigger : document.activeElement;
    closeAllDrawers(true);
    searchDrawer?.classList.add('is-open');
    backdrop?.classList.add('is-active');
    document.body.classList.add('drawer-open');
    if (mainContent) mainContent.inert = true;
    setDrawerHidden(searchDrawer, false);
    searchTriggers.forEach(t => t.setAttribute('aria-expanded', 'true'));
    if (searchDrawer) {
      trapOnElement(searchDrawer, { initialFocus: searchInput, previouslyFocused: opener });
    } else {
      searchInput?.focus();
    }
  }

  function closeSearchDrawer() {
    searchDrawer?.classList.remove('is-open');
    setDrawerHidden(searchDrawer, true);
    searchTriggers.forEach(t => t.setAttribute('aria-expanded', 'false'));
    releaseTrapOnElement(searchDrawer);
    checkBackdropState();
  }

  // Open Cart Drawer
  function openCartDrawer(trigger = null) {
    const opener = trigger instanceof HTMLElement ? trigger : document.activeElement;
    closeAllDrawers(true);
    syncCartUI();
    cartDrawer?.classList.add('is-open');
    backdrop?.classList.add('is-active');
    document.body.classList.add('drawer-open');
    if (mainContent) mainContent.inert = true;
    setDrawerHidden(cartDrawer, false);
    cartTriggers.forEach(t => t.setAttribute('aria-expanded', 'true'));
    if (cartDrawer) {
      trapOnElement(cartDrawer, { initialFocus: cartClose, previouslyFocused: opener });
    } else {
      cartClose?.focus();
    }
  }

  function closeCartDrawer() {
    cartDrawer?.classList.remove('is-open');
    setDrawerHidden(cartDrawer, true);
    cartTriggers.forEach(t => t.setAttribute('aria-expanded', 'false'));
    releaseTrapOnElement(cartDrawer);
    checkBackdropState();
  }

  // Close all active drawers. Silent when another drawer immediately takes
  // over (open paths), focus-restoring on real dismiss (backdrop/Escape).
  function closeAllDrawers(silent = false) {
    const mobileDrawer = document.querySelector('#mobile-drawer');
    mobileDrawer?.classList.remove('is-open');
    searchDrawer?.classList.remove('is-open');
    cartDrawer?.classList.remove('is-open');
    backdrop?.classList.remove('is-active');
    document.body.classList.remove('drawer-open');
    if (mainContent) mainContent.inert = false;
    releaseTrapOnElement(searchDrawer, { silent });
    releaseTrapOnElement(cartDrawer, { silent });
    releaseTrapOnElement(mobileDrawer, { silent });
  }

  function checkBackdropState() {
    const isAnyOpen = 
      document.querySelector('#mobile-drawer')?.classList.contains('is-open') ||
      searchDrawer?.classList.contains('is-open') ||
      cartDrawer?.classList.contains('is-open');

    if (!isAnyOpen) {
      backdrop?.classList.remove('is-active');
      document.body.classList.remove('drawer-open');
      if (mainContent) mainContent.inert = false;
    }
  }

  // Attach search triggers
  searchTriggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openSearchDrawer(e.currentTarget);
    });
  });

  searchClose?.addEventListener('click', closeSearchDrawer);

  // Attach cart triggers
  cartTriggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openCartDrawer(e.currentTarget);
    });
  });

  cartClose?.addEventListener('click', closeCartDrawer);

  // Click on backdrop dismisses any active drawer
  backdrop?.addEventListener('click', () => {
    closeAllDrawers();
  });

  // Global Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDrawers();
    }
  });

  // Search tag suggestions click handling -> Redirect to dedicated search page
  const searchTags = document.querySelectorAll('.search-tag-item');
  searchTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const q = tag.textContent.trim();
      if (q) {
        const isSub = window.location.pathname.includes('/shop/') || window.location.pathname.includes('/category/') || window.location.pathname.includes('/product/') || window.location.pathname.includes('/search/');
        const root = isSub ? '../' : '';
        window.location.href = `${root}search/?q=${encodeURIComponent(q)}`;
      }
    });
  });

  // Search input enter key handling
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (q) {
        const isSub = window.location.pathname.includes('/shop/') || window.location.pathname.includes('/category/') || window.location.pathname.includes('/product/') || window.location.pathname.includes('/search/');
        const root = isSub ? '../' : '';
        window.location.href = `${root}search/?q=${encodeURIComponent(q)}`;
      }
    }
  });

  // Checkout Preview Simulator
  const checkoutBtn = document.querySelector('#cart-drawer .drawer-footer .btn-primary');
  checkoutBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (checkoutBtn.disabled) return;
    const originalText = checkoutBtn.textContent;
    checkoutBtn.textContent = 'Store Launching Soon · Catalog Preview Active';
    setTimeout(() => {
      checkoutBtn.textContent = originalText;
    }, 3000);
  });

  return {
    openSearch: openSearchDrawer,
    closeSearch: closeSearchDrawer,
    openCart: openCartDrawer,
    closeCart: closeCartDrawer,
    closeAll: closeAllDrawers
  };
}
