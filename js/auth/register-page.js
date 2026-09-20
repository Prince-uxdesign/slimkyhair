/**
 * Customer Registration Page Controller - Slimky Hair
 * Milestone C19.2: Customer Registration, Accessible Password UX & Email Confirmation
 */

import { customerService, validatePasswordStrength } from './customer-service.js';
import { initNavigation } from '../navigation.js';
import { initDrawers } from '../drawers.js';
import { syncWishlistUI } from '../wishlist-store.js';
import { isValidEmail } from '../utils/validators.js';
import { escapeHtml } from '../utils/html-format.js';

export class RegisterPage {
  constructor(options = {}) {
    this.rootPrefix = options.rootPrefix !== undefined ? options.rootPrefix : '../../';
    this.form = document.querySelector('#register-form');
    this.container = document.querySelector('#register-page-mount');
    
    if (this.form) {
      this.init();
    }
  }

  init() {
    this.bindPasswordToggles();
    this.bindLiveValidation();
    this.bindFormSubmission();

    // Global UI initializations
    initNavigation();
    initDrawers();
    syncWishlistUI();
  }

  /**
   * Bind accessible Show/Hide password toggles for password and confirm password inputs.
   */
  bindPasswordToggles() {
    const eyeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeOffIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    const setupToggle = (btnId, inputId) => {
      const btn = document.querySelector(btnId);
      const input = document.querySelector(inputId);
      if (!btn || !input) return;

      btn.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        btn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
        btn.innerHTML = isPassword ? eyeOffIcon : eyeIcon;
        input.focus();
      });
    };

    setupToggle('#toggle-password-btn', '#reg-password');
    setupToggle('#toggle-confirm-password-btn', '#reg-confirm-password');
  }

  /**
   * Bind real-time blur and input listeners for immediate, polite feedback.
   */
  bindLiveValidation() {
    const fields = [
      { id: '#reg-name', validator: () => this.validateName() },
      { id: '#reg-email', validator: () => this.validateEmail() },
      { id: '#reg-phone', validator: () => this.validatePhone() },
      { id: '#reg-password', validator: () => this.validatePassword() },
      { id: '#reg-confirm-password', validator: () => this.validateConfirmPassword() },
      { id: '#reg-terms', validator: () => this.validateTerms() }
    ];

    fields.forEach(({ id, validator }) => {
      const el = document.querySelector(id);
      if (!el) return;

      el.addEventListener('blur', () => validator());
      el.addEventListener('input', () => {
        // If field already had an error, clear or re-validate as user types
        const errorEl = document.querySelector(`${id}-error`);
        if (errorEl && errorEl.classList.contains('is-visible')) {
          validator();
        }
      });
    });
  }

  /**
   * Validate full name.
   */
  validateName() {
    const el = document.querySelector('#reg-name');
    const val = el ? el.value.trim() : '';

    if (!val) {
      this.setError('#reg-name', 'Full name is required.');
      return false;
    }
    if (val.length < 2) {
      this.setError('#reg-name', 'Please enter your full name (at least 2 characters).');
      return false;
    }
    this.clearError('#reg-name');
    return true;
  }

  /**
   * Validate email address and detect existing account.
   */
  validateEmail() {
    const el = document.querySelector('#reg-email');
    const val = el ? el.value.trim() : '';

    if (!val) {
      this.setError('#reg-email', 'Email address is required.');
      return false;
    }

    if (!isValidEmail(val)) {
      this.setError('#reg-email', 'Please enter a valid email address.');
      return false;
    }

    // Check for existing account
    if (customerService.isEmailRegistered(val)) {
      this.setError('#reg-email', 'An account with this email already exists. Please sign in instead.');
      return false;
    }

    this.clearError('#reg-email');
    return true;
  }

  /**
   * Validate phone / WhatsApp number preserving international formatting.
   */
  validatePhone() {
    const el = document.querySelector('#reg-phone');
    const val = el ? el.value.trim() : '';

    if (!val) {
      this.setError('#reg-phone', 'Phone or WhatsApp number is required for delivery coordination.');
      return false;
    }

    // Must have at least 8 digits after removing spaces/symbols
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length < 8 || digitsOnly.length > 15) {
      this.setError('#reg-phone', 'Please enter a valid phone number (including country/area code).');
      return false;
    }

    this.clearError('#reg-phone');
    return true;
  }

  /**
   * Validate password requirements.
   */
  validatePassword() {
    const el = document.querySelector('#reg-password');
    const val = el ? el.value : '';

    const strength = validatePasswordStrength(val);
    if (!strength.valid) {
      this.setError('#reg-password', strength.message);
      return false;
    }

    this.clearError('#reg-password');

    // If confirm password already has text, recheck match
    const confirmEl = document.querySelector('#reg-confirm-password');
    if (confirmEl && confirmEl.value) {
      this.validateConfirmPassword();
    }

    return true;
  }

  /**
   * Validate confirm password match.
   */
  validateConfirmPassword() {
    const password = document.querySelector('#reg-password')?.value || '';
    const confirmEl = document.querySelector('#reg-confirm-password');
    const confirmVal = confirmEl ? confirmEl.value : '';

    if (!confirmVal) {
      this.setError('#reg-confirm-password', 'Please confirm your password.');
      return false;
    }
    if (password !== confirmVal) {
      this.setError('#reg-confirm-password', 'Passwords do not match.');
      return false;
    }

    this.clearError('#reg-confirm-password');
    return true;
  }

  /**
   * Validate terms & privacy acknowledgement.
   */
  validateTerms() {
    const el = document.querySelector('#reg-terms');
    if (!el || !el.checked) {
      this.setError('#reg-terms', 'You must agree to the Terms of Service and Privacy Policy.');
      return false;
    }
    this.clearError('#reg-terms');
    return true;
  }

  /**
   * Set field error.
   */
  setError(fieldSelector, message) {
    const input = document.querySelector(fieldSelector);
    const errorEl = document.querySelector(`${fieldSelector}-error`);

    if (input) {
      input.classList.add('has-error');
      input.setAttribute('aria-invalid', 'true');
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    }
  }

  /**
   * Clear field error.
   */
  clearError(fieldSelector) {
    const input = document.querySelector(fieldSelector);
    const errorEl = document.querySelector(`${fieldSelector}-error`);

    if (input) {
      input.classList.remove('has-error');
      input.removeAttribute('aria-invalid');
    }
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('is-visible');
    }
  }

  /**
   * Handle form submission.
   */
  bindFormSubmission() {
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isNameValid = this.validateName();
      const isEmailValid = this.validateEmail();
      const isPhoneValid = this.validatePhone();
      const isPasswordValid = this.validatePassword();
      const isConfirmValid = this.validateConfirmPassword();
      const isTermsValid = this.validateTerms();

      const allValid = isNameValid && isEmailValid && isPhoneValid && isPasswordValid && isConfirmValid && isTermsValid;

      if (!allValid) {
        // Focus first invalid element
        const firstInvalid = document.querySelector('.auth-input.has-error, input[type="checkbox"].has-error');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const submitBtn = document.querySelector('#register-submit-btn');
      const originalText = submitBtn ? submitBtn.innerHTML : 'Create Account';

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `
            <span class="loading-spinner" style="width: 18px; height: 18px; border-width: 2px; margin: 0;" aria-hidden="true"></span>
            <span>Creating Account...</span>
          `;
        }

        const fullName = document.querySelector('#reg-name').value.trim();
        const email = document.querySelector('#reg-email').value.trim();
        const phone = document.querySelector('#reg-phone').value.trim();
        const password = document.querySelector('#reg-password').value;

        // Register customer through unified customer service
        const regResult = await customerService.registerCustomer({
          fullName,
          email,
          phone,
          password
        });

        // Transition to confirmation state
        this.renderConfirmationState(regResult.customer);

      } catch (err) {
        console.error('[RegisterPage] Registration failed:', err);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }

        const topError = document.querySelector('#register-general-error');
        if (topError) {
          topError.textContent = err.message || 'Unable to complete registration. Please try again.';
          topError.classList.add('is-visible');
        } else {
          alert(err.message || 'Registration failed. Please check your entries and try again.');
        }
      }
    });
  }

  /**
   * Render the post-registration "Check your email" confirmation card.
   * @param {Object} customer
   */
  renderConfirmationState(customer) {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="auth-page-wrapper">
        <div class="auth-confirmation-card" id="registration-confirmation-view">
          
          <div class="auth-confirmation-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </div>

          <h1 class="auth-confirmation-title">Check your email</h1>
          
          <p class="auth-confirmation-desc">
            Welcome, <strong>${escapeHtml(customer.fullName)}</strong>. We've sent an account confirmation notification and receipt to:
          </p>

          <div class="auth-email-badge">${escapeHtml(customer.email)}</div>

          <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: 28px; line-height: 1.5;">
            Please check your inbox (and spam/promotions folder) to confirm your email address. You can explore our botanical formulations right away.
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
            <a href="${this.rootPrefix}shop/" class="btn-primary" style="height: 48px; justify-content: center; text-decoration: none;">
              Explore Formulations
            </a>
            <a href="${this.rootPrefix}account/" class="btn-outline btn-sm" style="min-height: 44px; justify-content: center; text-decoration: none;">
              Go to Account Overview
            </a>
          </div>

          <div class="auth-resend-wrapper">
            <span>Didn't receive the email? </span>
            <button type="button" id="resend-confirmation-btn" class="auth-resend-btn" data-email="${escapeHtml(customer.email)}">
              Resend confirmation email
            </button>
            <div id="resend-feedback" class="auth-resend-feedback" role="status"></div>
          </div>

        </div>
      </div>
    `;

    // Resend confirmation listener
    document.querySelector('#resend-confirmation-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const email = btn.getAttribute('data-email');
      const feedback = document.querySelector('#resend-feedback');
      if (!email) return;

      try {
        btn.disabled = true;
        btn.textContent = 'Sending...';

        await customerService.resendConfirmationEmail(email);

        if (feedback) {
          feedback.textContent = `✓ Confirmation email resent to ${email}`;
          feedback.classList.add('is-visible');
        }
        btn.textContent = 'Email resent';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = 'Resend confirmation email';
        }, 5000);
      } catch (err) {
        if (feedback) {
          feedback.textContent = `Error: ${err.message || 'Could not resend email.'}`;
          feedback.style.color = '#D92D20';
          feedback.classList.add('is-visible');
        }
        btn.disabled = false;
        btn.textContent = 'Resend confirmation email';
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Auto-instantiate if on registration page
if (typeof document !== 'undefined') {
  const init = () => {
    if (document.querySelector('#register-form') && !window.__slimkyRegisterPage) {
      window.__slimkyRegisterPage = new RegisterPage();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

