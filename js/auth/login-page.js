/**
 * Customer Login Page Controller - Slimky Hair
 * Milestone C19.3: Customer Login, Sessions, Logout & Protected Routes
 */

import { customerService } from './customer-service.js';
import { initNavigation } from '../navigation.js';
import { initDrawers } from '../drawers.js';
import { syncWishlistUI } from '../wishlist-store.js';
import { isValidEmail } from '../utils/validators.js';

export class LoginPage {
  constructor(options = {}) {
    // Detect root prefix relative to current page location if not explicitly provided
    if (options.rootPrefix !== undefined) {
      this.rootPrefix = options.rootPrefix;
    } else {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      this.rootPrefix = path.includes('/account/login/') ? '../../' : '../';
    }

    this.form = document.querySelector('#login-form');
    this.emailInput = document.querySelector('#login-email');
    this.passwordInput = document.querySelector('#login-password');
    this.rememberInput = document.querySelector('#login-remember');
    this.submitBtn = document.querySelector('#login-submit-btn');
    this.generalError = document.querySelector('#login-general-error');
    this.modal = document.querySelector('#forgot-password-modal');

    // If already logged in, automatically redirect to account overview or redirect target
    if (customerService.isAuthenticated()) {
      this.redirectAuthenticatedUser();
      return;
    }

    if (this.form) {
      this.init();
    }
  }

  init() {
    this.bindDemoHelper();
    this.bindPasswordToggle();
    this.bindLiveValidation();
    this.bindFormSubmission();
    this.bindForgotPasswordModal();

    // Global UI initializations
    initNavigation();
    initDrawers();
    syncWishlistUI();
  }

  /**
   * Bind demo mode credential quick-fill button for QA testing.
   */
  bindDemoHelper() {
    const prefillBtn = document.querySelector('#login-fill-demo-btn');
    if (!prefillBtn) return;

    prefillBtn.addEventListener('click', () => {
      // Guarantee demo account exists in localStorage
      customerService.initDemoCustomer();

      if (this.emailInput) {
        this.emailInput.value = 'chioma.demo@slimkyhair.com';
        this.clearError('#login-email');
      }
      if (this.passwordInput) {
        this.passwordInput.value = 'Botanical2026!';
        this.clearError('#login-password');
      }
      if (this.rememberInput) {
        this.rememberInput.checked = true;
      }
      this.clearGeneralError();

      // Visual confirmation feedback on the button
      const originalHtml = prefillBtn.innerHTML;
      prefillBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Demo Credentials Filled!
      `;
      prefillBtn.classList.add('is-filled');

      // Focus the sign in button for immediate one-click submission
      if (this.submitBtn) {
        this.submitBtn.focus();
      }

      setTimeout(() => {
        prefillBtn.innerHTML = originalHtml;
        prefillBtn.classList.remove('is-filled');
      }, 2500);
    });
  }

  /**
   * Safely sanitize and redirect an authenticated user.
   */
  redirectAuthenticatedUser() {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    let target = params.get('redirect') || `${this.rootPrefix}account/`;

    // Security check against open redirects: target must not contain protocol or double slashes
    if (/^https?:\/\//i.test(target) || target.startsWith('//') || target.includes('\\')) {
      target = `${this.rootPrefix}account/`;
    }

    window.location.href = target;
  }

  /**
   * Bind accessible Show/Hide password toggle.
   */
  bindPasswordToggle() {
    const btn = document.querySelector('#toggle-login-password-btn');
    const input = this.passwordInput;
    if (!btn || !input) return;

    const eyeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeOffIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    btn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
      btn.innerHTML = isPassword ? eyeOffIcon : eyeIcon;
      input.focus();
    });
  }

  /**
   * Bind live input validation listeners.
   */
  bindLiveValidation() {
    if (this.emailInput) {
      this.emailInput.addEventListener('blur', () => this.validateEmail());
      this.emailInput.addEventListener('input', () => {
        if (this.emailInput.classList.contains('has-error')) {
          this.validateEmail();
        }
      });
    }

    if (this.passwordInput) {
      this.passwordInput.addEventListener('blur', () => this.validatePassword());
      this.passwordInput.addEventListener('input', () => {
        if (this.passwordInput.classList.contains('has-error')) {
          this.validatePassword();
        }
      });
    }
  }

  /**
   * Validate email format and presence.
   */
  validateEmail() {
    const val = this.emailInput ? this.emailInput.value.trim() : '';
    if (!val) {
      this.setError('#login-email', 'Email address is required.');
      return false;
    }
    if (!isValidEmail(val)) {
      this.setError('#login-email', 'Please enter a valid email address.');
      return false;
    }
    this.clearError('#login-email');
    return true;
  }

  /**
   * Validate password presence.
   */
  validatePassword() {
    const val = this.passwordInput ? this.passwordInput.value : '';
    if (!val) {
      this.setError('#login-password', 'Password is required.');
      return false;
    }
    this.clearError('#login-password');
    return true;
  }

  /**
   * Set field-specific error.
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
   * Clear field-specific error.
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
   * Show prominent general banner alert.
   */
  showGeneralError(message, isHtml = false) {
    if (!this.generalError) return;
    if (isHtml) {
      this.generalError.innerHTML = message;
    } else {
      this.generalError.textContent = message;
    }
    this.generalError.classList.add('is-visible');
    this.generalError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  clearGeneralError() {
    if (!this.generalError) return;
    this.generalError.innerHTML = '';
    this.generalError.classList.remove('is-visible');
  }

  /**
   * Bind form submission and authentication handler.
   */
  bindFormSubmission() {
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearGeneralError();

      const isEmailValid = this.validateEmail();
      const isPasswordValid = this.validatePassword();

      if (!isEmailValid || !isPasswordValid) {
        const firstInvalid = document.querySelector('.auth-input.has-error');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const originalBtnText = this.submitBtn ? this.submitBtn.innerHTML : 'Sign In';

      try {
        if (this.submitBtn) {
          this.submitBtn.disabled = true;
          this.submitBtn.innerHTML = `
            <span class="loading-spinner" style="width: 18px; height: 18px; border-width: 2px; margin: 0;" aria-hidden="true"></span>
            <span>Signing In...</span>
          `;
        }

        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;
        const rememberMe = this.rememberInput ? this.rememberInput.checked : true;

        // Authenticate user via unified CustomerService
        await customerService.loginCustomer({
          email,
          password,
          rememberMe
        });

        // Redirect after successful authentication
        this.redirectAuthenticatedUser();

      } catch (err) {
        console.warn('[LoginPage] Login rejected:', err.message);

        if (this.submitBtn) {
          this.submitBtn.disabled = false;
          this.submitBtn.innerHTML = originalBtnText;
        }

        const errMsg = err.message || 'Unable to sign in. Please verify your email and password.';

        // If unconfirmed account, offer a quick resend confirmation action
        if (errMsg.toLowerCase().includes('confirm your email')) {
          const email = this.emailInput.value.trim();
          this.showGeneralError(`
            <div>${errMsg}</div>
            <button type="button" id="login-resend-confirm-btn" style="background: none; border: none; padding: 0; margin-top: 6px; color: inherit; text-decoration: underline; font-weight: 600; cursor: pointer;">
              Resend confirmation email to ${email}
            </button>
            <div id="login-resend-feedback" style="display: none; font-size: 0.8125rem; margin-top: 4px;"></div>
          `, true);

          document.querySelector('#login-resend-confirm-btn')?.addEventListener('click', async (btnEvt) => {
            const resendBtn = btnEvt.currentTarget;
            const feedbackEl = document.querySelector('#login-resend-feedback');
            try {
              resendBtn.disabled = true;
              resendBtn.textContent = 'Sending...';
              await customerService.resendConfirmationEmail(email);
              if (feedbackEl) {
                feedbackEl.textContent = '✓ Confirmation email sent successfully!';
                feedbackEl.style.display = 'block';
              }
              resendBtn.textContent = 'Sent';
            } catch (resendErr) {
              if (feedbackEl) {
                feedbackEl.textContent = `Error: ${resendErr.message}`;
                feedbackEl.style.display = 'block';
              }
              resendBtn.disabled = false;
              resendBtn.textContent = 'Retry sending';
            }
          });

        } else {
          this.showGeneralError(errMsg);
        }

        this.passwordInput.focus();
      }
    });
  }

  /**
   * Bind informational Forgot Password modal.
   */
  bindForgotPasswordModal() {
    const forgotBtn = document.querySelector('button#forgot-password-btn');
    const closeBtn = document.querySelector('#close-forgot-modal-btn');
    const dismissBtn = document.querySelector('#dismiss-forgot-modal-btn');

    if (!this.modal) return;

    const openModal = () => {
      this.modal.style.display = 'flex';
      closeBtn?.focus();
    };

    const closeModal = () => {
      this.modal.style.display = 'none';
      forgotBtn?.focus();
    };

    forgotBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });

    closeBtn?.addEventListener('click', closeModal);
    dismissBtn?.addEventListener('click', closeModal);

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.style.display !== 'none') {
        closeModal();
      }
    });
  }
}

// Auto-bootstrap when script executes
if (typeof document !== 'undefined') {
  const init = () => {
    if (document.querySelector('#login-form') && !window.__slimkyLoginPage) {
      window.__slimkyLoginPage = new LoginPage();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
