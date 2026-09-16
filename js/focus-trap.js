/**
 * Shared accessible focus management - Slimky Hair
 *
 * trapFocus(container): keeps Tab / Shift+Tab cycling inside an open
 * dialog, drawer, or modal; moves focus to an initial element; returns a
 * release() function that removes the trap and restores focus to whatever
 * was focused before the trap engaged (usually the trigger control).
 *
 * Callers remain responsible for their own visibility + aria-hidden / inert
 * toggling; this module only handles the keyboard trap and focus return.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

function getFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.offsetParent === null && el.tagName !== 'BODY') {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
    }
    return !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true';
  });
}

export function trapFocus(container, options = {}) {
  if (!container) return () => {};
  const previouslyFocused =
    options.previouslyFocused instanceof HTMLElement
      ? options.previouslyFocused
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable(container);
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeyDown);
  container._slimkyTrapHandler = onKeyDown;
  container._slimkyTrapOpener = previouslyFocused;

  const target =
    options.initialFocus instanceof HTMLElement
      ? options.initialFocus
      : getFocusable(container)[0] || null;
  if (target) {
    window.requestAnimationFrame(() => {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    });
  }

  let released = false;
  return function releaseFocusTrap() {
    if (released) return;
    released = true;
    detachTrap(container);
    focusOpener(container);
  };
}

/** Remove the trap listener without moving focus. */
export function detachTrap(container) {
  if (!container) return;
  if (container._slimkyTrapHandler) {
    container.removeEventListener('keydown', container._slimkyTrapHandler);
    container._slimkyTrapHandler = null;
  }
}

/** Return focus to the element focused before the trap engaged. */
export function focusOpener(container) {
  const opener = container ? container._slimkyTrapOpener : null;
  if (opener && document.contains(opener)) {
    try {
      opener.focus({ preventScroll: true });
    } catch {
      opener.focus();
    }
  }
  if (container) container._slimkyTrapOpener = null;
}

/**
 * Element-keyed variant for drawers controlled from more than one module
 * (the cart drawer is opened both by js/drawers.js trigger clicks and by
 * js/cart-store.js after add-to-cart). State lives on the element so any
 * controller can take over or release a trap it did not create.
 */
export function trapOnElement(el, options = {}) {
  if (!el) return;
  detachTrap(el);
  const opener =
    options.previouslyFocused instanceof HTMLElement
      ? options.previouslyFocused
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  el._slimkyTrapOpener = opener;
  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable(el);
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  el.addEventListener('keydown', onKeyDown);
  el._slimkyTrapHandler = onKeyDown;
  const target =
    options.initialFocus instanceof HTMLElement ? options.initialFocus : getFocusable(el)[0] || null;
  if (target) {
    window.requestAnimationFrame(() => {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    });
  }
}

/** Release an element-keyed trap; restores focus unless silent. */
export function releaseTrapOnElement(el, options = {}) {
  if (!el) return;
  detachTrap(el);
  if (options.silent !== true) focusOpener(el);
}
