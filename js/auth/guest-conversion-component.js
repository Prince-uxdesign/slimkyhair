/**
 * Guest-to-Account Conversion Component - Slimky Hair
 * Milestone C19.9: Post-Purchase Guest Account Creation & Order Linking
 * 
 * Guarantees:
 * - Strictly optional post-purchase invitation: never forces account creation during or after checkout.
 * - Prefills order details (Name, Email, Phone) while requiring customer to establish their password.
 * - Links the specific order in-place without order duplication or altering order numbers/totals.
 * - Graceful dismissal on "Maybe Later" with sessionStorage persistence.
 * - Responsive mobile-first design with generous touch targets (>= 44px) and zero horizontal overflow.
 */

import { customerService, validatePasswordStrength } from './customer-service.js';

export class GuestConversionCard {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.mountElement - Container where the card is rendered
   * @param {Object} options.order - Order object
   * @param {string} options.securityToken - Cryptographic order security token
   * @param {string} [options.rootPrefix='./'] - Relative path prefix for assets/links
   * @param {Function} [options.onConverted] - Callback fired on successful conversion
   * @param {Function} [options.onDismissed] - Callback fired on dismissal
   */
  constructor(options = {}) {
    this.mountElement = options.mountElement;
    this.order = options.order;
    this.securityToken = options.securityToken || this.order?.securityToken;
    this.rootPrefix = options.rootPrefix !== undefined ? options.rootPrefix : './';
    this.onConverted = options.onConverted || (() => {});
    this.onDismissed = options.onDismissed || (() => {});

    this.state = 'prompt'; // 'prompt' | 'form' | 'success' | 'dismissed'
    this.error = null;
    this.loading = false;
    this.showPassword = false;

    this.init();
  }

  init() {
    if (!this.mountElement || !this.order) return;

    // Check if dismissed previously in this browser session
    const declinedKey = `slimky_declined_conversion_${this.order.id}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(declinedKey)) {
      this.state = 'dismissed';
      return;
    }

    // Verify eligibility
    const eligibility = customerService.canConvertGuestOrder(this.order.id, this.securityToken);

    if (!eligibility.eligible) {
      // If already linked, show a discreet account badge if owned by the viewing customer
      if (eligibility.alreadyLinked && eligibility.isOwnedByCurrent) {
        this.renderAlreadyLinkedBanner();
      }
      return;
    }

    this.render();
  }

  render() {
    if (!this.mountElement) return;

    if (this.state === 'dismissed') {
      this.mountElement.innerHTML = '';
      this.mountElement.style.display = 'none';
      return;
    }

    this.mountElement.style.display = 'block';

    if (this.state === 'prompt') {
      this.renderPromptView();
    } else if (this.state === 'form') {
      this.renderFormView();
    } else if (this.state === 'success') {
      this.renderSuccessView();
    }
  }

  renderPromptView() {
    this.mountElement.innerHTML = `
      <section class="order-guest-conversion-card" id="guest-conversion-card" aria-label="Optional Account Creation">
        <div class="conversion-card-header">
          <div class="conversion-card-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            Optional Customer Account
          </div>
          <h2 class="conversion-card-title">Make your next order easier</h2>
          <p class="conversion-card-subtitle">
            Create a Slimky Hair account using the details from this order.
          </p>
        </div>

        <div class="conversion-benefits-grid">
          <div class="conversion-benefit-item">
            <span class="conversion-benefit-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="conversion-benefit-text">View your orders</span>
          </div>
          <div class="conversion-benefit-item">
            <span class="conversion-benefit-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="conversion-benefit-text">Save your information</span>
          </div>
          <div class="conversion-benefit-item">
            <span class="conversion-benefit-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="conversion-benefit-text">Save favourite products</span>
          </div>
          <div class="conversion-benefit-item">
            <span class="conversion-benefit-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="conversion-benefit-text">Faster checkout next time</span>
          </div>
        </div>

        <div class="conversion-card-actions">
          <button type="button" class="btn btn-primary conversion-cta-btn" id="conversion-open-form-btn">
            Create Account
          </button>
          <button type="button" class="btn btn-outline conversion-secondary-btn" id="conversion-dismiss-btn">
            Maybe Later
          </button>
        </div>
      </section>
    `;

    // Bind Actions
    this.mountElement.querySelector('#conversion-open-form-btn')?.addEventListener('click', () => {
      this.state = 'form';
      this.error = null;
      this.render();
      setTimeout(() => {
        this.mountElement.querySelector('#conversion-password')?.focus();
      }, 100);
    });

    this.mountElement.querySelector('#conversion-dismiss-btn')?.addEventListener('click', () => {
      this.handleDismiss();
    });
  }

  renderFormView() {
    const fullName = this.order.customer?.fullName || '';
    const email = this.order.customer?.email || '';
    const phone = this.order.customer?.phone || '';

    this.mountElement.innerHTML = `
      <section class="order-guest-conversion-card" id="guest-conversion-card" aria-label="Create Your Account">
        <div class="conversion-card-header">
          <div class="conversion-card-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Complete Registration
          </div>
          <h2 class="conversion-card-title">Establish Your Password</h2>
          <p class="conversion-card-subtitle">
            Your details from order <strong>#${this.order.orderNumber || this.order.id}</strong> are prefilled below.
          </p>
        </div>

        ${this.error ? `
          <div class="conversion-alert-error" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>${this.error}</span>
          </div>
        ` : ''}

        <form id="conversion-registration-form" class="conversion-form-grid" novalidate>
          <div class="conversion-form-group">
            <label for="conversion-full-name" class="conversion-label">Full Name</label>
            <input 
              type="text" 
              id="conversion-full-name" 
              class="conversion-input" 
              value="${this.escapeHtml(fullName)}" 
              required
              autocomplete="name"
            >
          </div>

          <div class="conversion-form-group">
            <label for="conversion-email" class="conversion-label">
              Email Address 
              <span class="conversion-label-verified">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Verified for this order
              </span>
            </label>
            <input 
              type="email" 
              id="conversion-email" 
              class="conversion-input conversion-input-readonly" 
              value="${this.escapeHtml(email)}" 
              readonly
              autocomplete="email"
              title="Must match order receipt email to link this order"
            >
          </div>

          <div class="conversion-form-group">
            <label for="conversion-phone" class="conversion-label">Phone / WhatsApp</label>
            <input 
              type="tel" 
              id="conversion-phone" 
              class="conversion-input" 
              value="${this.escapeHtml(phone)}" 
              autocomplete="tel"
            >
          </div>

          <div class="conversion-form-group">
            <label for="conversion-password" class="conversion-label">Create Password</label>
            <div class="conversion-password-wrapper">
              <input 
                type="${this.showPassword ? 'text' : 'password'}" 
                id="conversion-password" 
                class="conversion-input" 
                placeholder="At least 8 characters with letters & numbers"
                required
                autocomplete="new-password"
              >
              <button 
                type="button" 
                class="conversion-password-toggle" 
                id="conversion-toggle-pwd-btn"
                aria-label="${this.showPassword ? 'Hide password' : 'Show password'}"
              >
                ${this.showPassword ? `
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ` : `
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="7" r="3"></circle>
                  </svg>
                `}
              </button>
            </div>
            <div class="conversion-input-hint" id="conversion-pwd-hint">
              Must include at least 8 characters, combining letters and numbers.
            </div>
          </div>

          <div class="conversion-card-actions">
            <button 
              type="submit" 
              class="btn btn-primary conversion-cta-btn" 
              id="conversion-submit-btn"
              ${this.loading ? 'disabled' : ''}
            >
              ${this.loading ? `
                <span class="conversion-spinner" aria-hidden="true"></span>
                Creating Account & Linking Order...
              ` : `
                Create Account & Save Order
              `}
            </button>
            <button type="button" class="btn btn-outline conversion-secondary-btn" id="conversion-cancel-btn">
              Cancel
            </button>
          </div>
        </form>
      </section>
    `;

    // Bind Password Toggle
    this.mountElement.querySelector('#conversion-toggle-pwd-btn')?.addEventListener('click', () => {
      this.showPassword = !this.showPassword;
      this.renderFormView();
    });

    // Bind Cancel / Back
    this.mountElement.querySelector('#conversion-cancel-btn')?.addEventListener('click', () => {
      this.state = 'prompt';
      this.error = null;
      this.render();
    });

    // Bind Form Submit
    this.mountElement.querySelector('#conversion-registration-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleFormSubmit();
    });
  }

  async handleFormSubmit() {
    const fullNameInput = this.mountElement.querySelector('#conversion-full-name');
    const phoneInput = this.mountElement.querySelector('#conversion-phone');
    const passwordInput = this.mountElement.querySelector('#conversion-password');

    const fullName = fullNameInput ? fullNameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const email = (this.order.customer?.email || '').trim();

    if (!fullName) {
      this.error = 'Full name is required.';
      this.renderFormView();
      return;
    }

    // Client-side password validation check
    const validation = validatePasswordStrength(password);
    if (!validation.valid) {
      this.error = validation.message;
      this.renderFormView();
      return;
    }

    this.loading = true;
    this.error = null;
    this.renderFormView();

    try {
      const result = await customerService.convertGuestOrderToCustomer({
        orderId: this.order.id,
        securityToken: this.securityToken,
        fullName,
        email,
        phone,
        password
      });

      this.loading = false;
      this.state = 'success';
      this.render();
      this.onConverted(result);
    } catch (err) {
      this.loading = false;
      this.error = err.message || 'Unable to create account. Your order remains safely placed.';
      this.renderFormView();
    }
  }

  renderSuccessView() {
    const orderNumber = this.order.orderNumber || this.order.id;

    this.mountElement.innerHTML = `
      <section class="order-guest-conversion-card conversion-card-success" id="guest-conversion-card" aria-label="Account Created">
        <div class="conversion-success-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <div class="conversion-card-header">
          <div class="conversion-card-badge conversion-badge-success">
            Account Created · Order Saved
          </div>
          <h2 class="conversion-card-title">Welcome to Slimky Hair</h2>
          <p class="conversion-card-subtitle">
            Order <strong>#${orderNumber}</strong> is now securely saved in your customer account.
          </p>
        </div>

        <div class="conversion-success-links">
          <a href="${this.rootPrefix}account/orders/" class="btn-primary conversion-cta-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            View in Your Orders
          </a>

          <a href="${this.rootPrefix}account/" class="btn-outline conversion-secondary-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">
            Go to Account Dashboard
          </a>

          <a href="${this.rootPrefix}shop/" class="btn-text-secondary" style="margin-top: 6px; font-size: 0.875rem; text-decoration: none;">
            Continue Shopping
          </a>
        </div>
      </section>
    `;
  }

  renderAlreadyLinkedBanner() {
    this.mountElement.innerHTML = `
      <section class="order-guest-conversion-card conversion-card-saved" aria-label="Saved in Account">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="color: var(--color-sage-dark, #2A3830); display: flex; align-items: center;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </span>
            <span style="font-size: 0.9375rem; color: var(--color-text-primary, #2A2421); font-weight: 500;">
              This order is saved in your Slimky Hair account.
            </span>
          </div>
          <a href="${this.rootPrefix}account/orders/" class="btn-outline btn-sm" style="text-decoration: none; padding: 6px 14px; font-size: 0.8125rem;">
            View in Orders
          </a>
        </div>
      </section>
    `;
  }

  handleDismiss() {
    this.state = 'dismissed';
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(`slimky_declined_conversion_${this.order.id}`, 'true');
      } catch (e) {}
    }

    const card = this.mountElement.querySelector('#guest-conversion-card');
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
      card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      setTimeout(() => {
        this.mountElement.innerHTML = '';
        this.mountElement.style.display = 'none';
        this.onDismissed();
      }, 260);
    } else {
      this.mountElement.innerHTML = '';
      this.mountElement.style.display = 'none';
      this.onDismissed();
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
