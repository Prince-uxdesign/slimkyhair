/**
 * Navigation Module
 * Slimky Hair
 * 
 * Handles sticky header effects, mobile slide-out drawer, focus management and keyboard traps.
 */

import { syncWishlistUI } from './wishlist-store.js';
import { initGlobalErrorBoundary } from './error-boundary.js';
import { initConsent } from './consent.js';
import { trapOnElement, releaseTrapOnElement } from './focus-trap.js';

export function initNavigation() {
  // Responsible cookie consent (site-wide: every entry point calls initNavigation).
  // Essential store flows never depend on optional consent; optional analytics
  // only initialises after an explicit opt-in via js/consent.js.
  try {
    initConsent();
  } catch (err) {
    console.warn('[Navigation] Consent initialization notice:', err);
  }
  const header = document.querySelector('.site-header, .header.sticky-header');
  const mobileToggle = document.querySelector('.mobile-menu-toggle');
  const mobileDrawer = document.querySelector('#mobile-drawer');
  const mobileDrawerClose = document.querySelector('#mobile-drawer-close');
  const backdrop = document.querySelector('.drawer-backdrop');
  const mainContent = document.querySelector('main');

  // Initialize Global Error Boundary
  try {
    initGlobalErrorBoundary();
  } catch (err) {
    console.warn('[Navigation] Error boundary initialization notice:', err);
  }

  // Synchronize Wishlist states and badges automatically
  try {
    syncWishlistUI(document);
    window.addEventListener('slimky:wishlist:updated', () => {
      syncWishlistUI(document);
    });
  } catch (err) {
    console.warn('[Navigation] Wishlist auto-sync notice:', err);
  }

  // Synchronize Account nav links automatically (Sign In vs My Account)
  try {
    syncAccountNavLinks(document);
    window.addEventListener('storage', (e) => {
      if (e.key === 'slimky_active_session') syncAccountNavLinks(document);
    });
    window.addEventListener('slimky:auth:changed', () => {
      syncAccountNavLinks(document);
    });
  } catch (err) {
    console.warn('[Navigation] Account auto-sync notice:', err);
  }

  // Sticky header scroll detection
  if (header) {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        header.classList.add('is-scrolled');
      } else {
        header.classList.remove('is-scrolled');
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  // Open mobile drawer (trap state lives on the element so
  // js/drawers.js close-all can release it without leaking listeners).
  function openMobileDrawer() {
    if (!mobileDrawer) return;
    const opener = document.activeElement;
    mobileDrawer.classList.add('is-open');
    mobileDrawer.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('is-active');
    document.body.classList.add('drawer-open');
    mobileToggle?.setAttribute('aria-expanded', 'true');
    if (mainContent) mainContent.inert = true;
    trapOnElement(mobileDrawer, { initialFocus: mobileDrawerClose, previouslyFocused: opener });
  }

  // Close mobile drawer
  function closeMobileDrawer() {
    if (!mobileDrawer) return;
    mobileDrawer.classList.remove('is-open');
    mobileDrawer.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.classList.remove('is-active');
    document.body.classList.remove('drawer-open');
    mobileToggle?.setAttribute('aria-expanded', 'false');
    if (mainContent) mainContent.inert = false;
    releaseTrapOnElement(mobileDrawer);
  }

  // Event Listeners
  mobileToggle?.addEventListener('click', openMobileDrawer);
  mobileDrawerClose?.addEventListener('click', closeMobileDrawer);

  // Close drawer on internal nav link click (smooth jump)
  const mobileNavLinks = mobileDrawer?.querySelectorAll('a');
  mobileNavLinks?.forEach(link => {
    link.addEventListener('click', () => {
      closeMobileDrawer();
    });
  });

  // Global Escape key dismiss
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (mobileDrawer?.classList.contains('is-open')) {
        closeMobileDrawer();
      }
    }
  });

  // Mobile footer accordions (site-wide: every entry calls initNavigation,
  // so cart/shop/wishlist/checkout/account all get the toggle even though
  // only index loads js/main.js). Preserves existing footer design.
  try {
    initFooterAccordions(document);
  } catch (err) {
    console.warn('[Navigation] Footer accordion notice:', err);
  }

  // Keyboard skip link (site-wide single-point fix: no page ships one).
  try {
    initSkipLink(document);
  } catch (err) {
    console.warn('[Navigation] Skip link notice:', err);
  }

  return {
    open: openMobileDrawer,
    close: closeMobileDrawer
  };
}

/**
 * Inject a "Skip to main content" link as the first focusable element.
 * Targets the page's <main> landmark (assigning an id when missing).
 */
export function initSkipLink(scope = document) {
  if (scope.querySelector('.skip-link')) return;
  const main = scope.querySelector('main');
  if (!main) return;
  if (!main.id) main.id = 'main-content';
  main.setAttribute('tabindex', '-1');
  const link = scope.createElement('a');
  link.href = `#${main.id}`;
  link.className = 'skip-link';
  link.textContent = 'Skip to main content';
  scope.body.insertBefore(link, scope.body.firstChild);
}

export function initFooterAccordions(scope = document) {
  // Footer section headings ship as <h3>, skipping a level (page h1 -> h3
  // with no h2 in main). Promote to <h2> once so the outline is valid on
  // every page without editing each template.
  scope.querySelectorAll('.site-footer h3.footer-heading').forEach((h3) => {
    const h2 = scope.createElement('h2');
    Array.from(h3.attributes).forEach((attr) => h2.setAttribute(attr.name, attr.value));
    while (h3.firstChild) h2.appendChild(h3.firstChild);
    h3.replaceWith(h2);
  });

  const mobileQuery = window.matchMedia
    ? window.matchMedia('(max-width: 640px)')
    : { matches: window.innerWidth <= 640, addEventListener: null };

  const headings = scope.querySelectorAll('.site-footer .footer-col:not(.footer-col-brand) .footer-heading');

  const applyMode = () => {
    headings.forEach((heading) => {
      const col = heading.closest('.footer-col');
      const links = col ? col.querySelector('.footer-links') : null;
      if (!links) return;
      let btn = heading.querySelector(':scope > .footer-heading-btn');

      if (mobileQuery.matches) {
        // Mobile: accessible disclosure. The heading keeps its outline
        // role; a real <button> inside carries the name, state, and
        // keyboard behavior (previous role="button"-on-heading pattern
        // destroyed heading semantics for screen readers).
        if (!btn) {
          btn = scope.createElement('button');
          btn.type = 'button';
          btn.className = 'footer-heading-btn';
          while (heading.firstChild) btn.appendChild(heading.firstChild);
          heading.appendChild(btn);
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const isOpen = col.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          });
        }
        btn.setAttribute('aria-expanded', col.classList.contains('is-open') ? 'true' : 'false');
        btn.setAttribute('aria-controls', links.id || '');
        if (!links.id) links.id = `footer-links-${Math.random().toString(36).slice(2, 8)}`;
        btn.setAttribute('aria-controls', links.id);
      } else if (btn) {
        // Desktop: headings are static text; unwrap the mobile button so
        // there is no dead control in the tab order.
        while (btn.firstChild) heading.insertBefore(btn.firstChild, btn);
        btn.remove();
        heading.removeAttribute('aria-expanded');
      }
    });
  };

  applyMode();
  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', applyMode);
  }
}

/**
 * Synchronize header and mobile navigation account links based on authentication state.
 * Displays clean visual logged-in status (pulsing emerald dot on icon, 'Hi, [FirstName]' pill on desktop,
 * and mobile drawer session card) without breaking header layout or dropping unstyled menus.
 */
export function syncAccountNavLinks(scope = document) {
  try {
    let customer = null;
    if (typeof localStorage !== 'undefined') {
      const rawSession = localStorage.getItem('slimky_active_session');
      if (rawSession) {
        try {
          const session = JSON.parse(rawSession);
          if (session && session.expiresAt && new Date(session.expiresAt) > new Date()) {
            const rawCustomers = localStorage.getItem('slimky_customers');
            const customers = rawCustomers ? JSON.parse(rawCustomers) : [];
            customer = customers.find(c => c.id === session.customerId) || null;
          }
        } catch (e) {}
      }
    }

    const path = typeof window !== 'undefined' && window.location ? window.location.pathname : '';
    let rootPrefix = '';
    if (path.includes('/product/') || path.includes('/account/') || path.includes('/category/')) {
      rootPrefix = '../../';
    } else if (path.includes('/track-order/') || path.includes('/cart/') || path.includes('/shop/') || path.includes('/wishlist/') || path.includes('/about/') || path.includes('/faq/') || path.includes('/contact/') || path.includes('/search/') || path.includes('/privacy/') || path.includes('/terms/') || path.includes('/cookies/') || path.includes('/returns/') || path.includes('/shipping/') || path.includes('/checkout/') || path.includes('/order-confirmation/')) {
      rootPrefix = '../';
    }

    // Clean up any rogue .nav-account-dropdown or .nav-account-wrapper that may have existed
    scope.querySelectorAll('.nav-account-dropdown').forEach(el => el.remove());
    scope.querySelectorAll('.nav-account-wrapper').forEach(wrapper => {
      while (wrapper.firstChild) {
        wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
      }
      wrapper.remove();
    });

    // Ensure header-actions has an account link if missing
    const headerActions = scope.querySelectorAll('.header-actions');
    headerActions.forEach(actions => {
      let link = actions.querySelector('.nav-account-link');
      if (!link) {
        link = document.createElement('a');
        link.className = 'btn-icon nav-account-link';
        link.setAttribute('aria-label', 'My Account');
        link.setAttribute('title', 'My Account');
        link.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span class="nav-account-active-dot" style="display: none;" aria-hidden="true"></span>
          <span class="nav-account-name" style="display: none;"></span>
        `;
        const ref = actions.querySelector('.trigger-cart') || actions.querySelector('.mobile-menu-toggle');
        if (ref) {
          actions.insertBefore(link, ref);
        } else {
          actions.appendChild(link);
        }
      }
    });

    const accountLinks = scope.querySelectorAll('.nav-account-link, a[aria-label="My Account"], a[href*="#account"]');
    
    accountLinks.forEach(link => {
      const isMobileMeta = link.classList.contains('mobile-nav-meta-link') || link.closest('.mobile-nav-meta');

      if (customer) {
        const fullName = customer.fullName || 'Customer';
        const firstName = fullName.trim().split(/\s+/)[0] || 'Account';

        link.classList.add('is-authenticated');
        link.classList.remove('is-guest');
        link.href = `${rootPrefix}account/`;
        link.setAttribute('aria-label', `Signed in as ${fullName} (My Account)`);
        link.setAttribute('title', `Signed in as ${fullName} (My Account)`);

        if (isMobileMeta) {
          link.innerHTML = `
            <span class="nav-account-status-dot-inline" aria-hidden="true"></span>
            <span class="nav-account-text">Signed in as <strong>${fullName}</strong></span>
          `;
        } else {
          link.classList.add('is-authenticated');
          link.classList.remove('is-guest');
          link.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span class="nav-account-active-dot" aria-label="Active session"></span>
            <span class="nav-account-name">Hi, ${firstName}</span>
          `;
        }
      } else {
        // Guest / Logged out state
        link.classList.remove('is-authenticated');
        link.classList.add('is-guest');
        link.href = `${rootPrefix}account/login/`;
        link.setAttribute('aria-label', 'Sign In');
        link.setAttribute('title', 'Sign In');

        if (isMobileMeta) {
          link.innerHTML = `
            <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span class="nav-account-text">Account Sign In</span>
          `;
        } else {
          link.classList.remove('is-authenticated');
          link.classList.add('is-guest');
          link.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span class="nav-account-active-dot" style="display: none;" aria-hidden="true"></span>
            <span class="nav-account-name" style="display: none;"></span>
          `;
        }
      }
    });

    // Synchronize Mobile Slide-out Drawer active session card
    const mobileDrawer = scope.querySelector('#mobile-drawer');
    if (mobileDrawer) {
      const drawerBody = mobileDrawer.querySelector('.drawer-body');
      let drawerCard = mobileDrawer.querySelector('#mobile-drawer-account-card');

      if (customer) {
        const fullName = customer.fullName || 'Customer';
        const initials = (fullName.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('') || 'U').toUpperCase();

        if (!drawerCard && drawerBody) {
          drawerCard = document.createElement('div');
          drawerCard.id = 'mobile-drawer-account-card';
          drawerCard.className = 'mobile-drawer-account-card';
          drawerBody.insertBefore(drawerCard, drawerBody.firstChild);
        }

        if (drawerCard) {
          if (drawerCard.style) drawerCard.style.display = 'block';
          drawerCard.innerHTML = `
            <div class="mobile-drawer-account-header">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: #2C1E18; color: #FAF8F5; font-size: 0.6875rem; font-weight: 600; display: flex; align-items: center; justify-content: center; position: relative;" aria-hidden="true">
                <span>${initials}</span>
                <span class="nav-account-active-dot" style="top: -2px; right: -2px;"></span>
              </div>
              <div class="mobile-drawer-account-user">
                <span class="mobile-drawer-account-badge">
                  <span class="nav-account-status-dot-inline"></span> Logged In
                </span>
                <strong class="mobile-drawer-account-name">${fullName}</strong>
                <span class="mobile-drawer-account-email">${customer.email || ''}</span>
              </div>
            </div>
            <div class="mobile-drawer-account-actions">
              <a href="${rootPrefix}account/" class="btn-primary btn-sm">My Account</a>
              <button type="button" class="btn-outline btn-sm mobile-drawer-logout-btn">Sign Out</button>
            </div>
          `;

          const drawerLogout = drawerCard.querySelector('.mobile-drawer-logout-btn');
          if (drawerLogout) {
            drawerLogout.addEventListener('click', (e) => {
              e.preventDefault();
              if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('slimky_active_session');
              }
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('slimky:auth:changed', { detail: { isAuthenticated: false } }));
              }
              syncAccountNavLinks(scope);
              if (window.location && window.location.pathname.includes('/account/') && !window.location.pathname.includes('/account/login/')) {
                window.location.href = `${rootPrefix}account/login/`;
              }
            });
          }
        }
      } else if (drawerCard) {
        drawerCard.remove();
      }
    }

  } catch (err) {
    console.warn('[Navigation] Account nav sync notice:', err);
  }
}
