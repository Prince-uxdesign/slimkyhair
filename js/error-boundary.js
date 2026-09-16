/**
 * Global Error Boundary & Reusable Network/API Error Component
 * Slimky Hair
 * 
 * Provides:
 * 1. Reusable error UI component:
 *    - Heading: "Something Went Wrong"
 *    - Supporting text: "We couldn't load this information right now. Please try again."
 *    - Buttons: "Try Again", "Back to Shop"
 * 2. Global runtime error and unhandled rejection boundary:
 *    - Preserves header, navigation, and footer
 *    - Prevents one failed component from breaking the whole page
 *    - Sanitizes output to ensure no developer stack traces are exposed to customers
 *    - Accessible keyboard focus and ARIA alert roles
 */

/**
 * Generate HTML string for the standardized error component
 * @param {Object} options
 * @returns {string} HTML markup
 */
export function getErrorComponentHTML(options = {}) {
  const title = options.title || "Something Went Wrong";
  const message = options.message || "We couldn't load this information right now. Please try again.";
  const backToShopUrl = options.backToShopUrl || (options.rootPrefix !== undefined ? `${options.rootPrefix}shop/` : '/shop');
  const retryLabel = options.retryLabel || "Try Again";
  const shopLabel = options.shopLabel || "Back to Shop";

  return `
    <div class="slimky-error-boundary" role="alert" aria-live="polite" tabindex="-1">
      <div class="error-boundary-inner">
        <div class="error-boundary-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h2 class="error-boundary-title">${title}</h2>
        <p class="error-boundary-text">${message}</p>
        <div class="error-boundary-actions">
          <button type="button" class="btn btn-primary btn-error-retry">${retryLabel}</button>
          <a href="${backToShopUrl}" class="btn btn-outline btn-error-shop">${shopLabel}</a>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the error component into a container with event bindings and focus management
 * @param {HTMLElement} container - Target container to render error into
 * @param {Object} options - Custom error options and onRetry callback
 */
export function renderErrorInto(container, options = {}) {
  if (!container) return;

  container.innerHTML = getErrorComponentHTML(options);
  const errorBox = container.querySelector('.slimky-error-boundary');
  if (errorBox) {
    errorBox.focus();
  }

  const retryBtn = container.querySelector('.btn-error-retry');
  if (retryBtn && typeof options.onRetry === 'function') {
    retryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      retryBtn.textContent = 'Retrying...';
      retryBtn.disabled = true;
      try {
        options.onRetry();
      } catch (err) {
        console.error('[ErrorBoundary] Retry execution failed:', err);
        retryBtn.textContent = 'Try Again';
        retryBtn.disabled = false;
      }
    });
  } else if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

/**
 * Initialize global window-level error boundary
 * Catches unhandled runtime exceptions and promise rejections gracefully
 * @param {Object} options
 */
export function initGlobalErrorBoundary(options = {}) {
  const rootPrefix = options.rootPrefix !== undefined ? options.rootPrefix : '';
  const backToShopUrl = `${rootPrefix}shop/`;

  // Window error listener
  window.addEventListener('error', (event) => {
    // Suppress external cross-origin script noise
    if (!event.filename || event.filename.includes('extension') || event.filename.includes('inpage')) {
      return;
    }

    console.error('[GlobalErrorBoundary] Unhandled runtime error:', event.error || event.message);

    // If main content area exists and hasn't already fallen back, handle gracefully
    const mainContent = document.querySelector('#main-content, main');
    if (mainContent && !mainContent.querySelector('.slimky-error-boundary') && !mainContent.querySelector('.error-404-page')) {
      // Preserve Header and Footer, safely wrap main content
      renderErrorInto(mainContent, {
        rootPrefix,
        backToShopUrl,
        onRetry: () => {
          window.location.reload();
        }
      });
    }
  });

  // Unhandled promise rejection listener
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[GlobalErrorBoundary] Unhandled promise rejection:', event.reason);

    const mainContent = document.querySelector('#main-content, main');
    if (mainContent && !mainContent.querySelector('.slimky-error-boundary') && !mainContent.querySelector('.error-404-page')) {
      renderErrorInto(mainContent, {
        rootPrefix,
        backToShopUrl,
        onRetry: () => {
          window.location.reload();
        }
      });
    }
  });
}
