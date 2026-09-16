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
