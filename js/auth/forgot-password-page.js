/**
 * Customer Forgot Password Page Controller - Slimky Hair
 * Milestone C19.4: Password Recovery
 */

import { customerService } from './customer-service.js';
import { initNavigation } from '../navigation.js';
import { initDrawers } from '../drawers.js';
import { syncWishlistUI } from '../wishlist-store.js';
import { isValidEmail } from '../utils/validators.js';

export class ForgotPasswordPage {
  constructor(options = {}) {
    if (options.rootPrefix !== undefined) {
      this.rootPrefix = options.rootPrefix;
    } else {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      this.rootPrefix = path.includes('/account/forgot-password/') ? '../../' : '../';
    }

    this.mount = document.querySelector('#forgot-page-mount');
    this.form = document.querySelector('#forgot-form');
    this.emailInput = document.querySelector('#forgot-email');
    this.emailError = document.querySelector('#forgot-email-error');
    this.generalError = document.querySelector('#forgot-general-error');
    this.submitBtn = document.querySelector('#forgot-submit-btn');

    if (this.form) {
      this.init();
    }
  }

  init() {
    this.bindLiveValidation();
    this.bindFormSubmission();

    // Global UI initializations
    initNavigation();
    initDrawers();
    syncWishlistUI();
  }

  bindLiveValidation() {
    if (this.emailInput) {
      this.emailInput.addEventListener('blur', () => this.validateEmail());
      this.emailInput.addEventListener('input', () => {
        if (this.emailInput.classList.contains('has-error')) {
          this.validateEmail();
        }
      });
    }
  }

  validateEmail() {
    if (!this.emailInput) return false;
    const value = this.emailInput.value.trim();

    if (!value) {
      this.showFieldError(this.emailInput, this.emailError, 'Please enter your email address.');
      return false;
    }

    if (!isValidEmail(value)) {
      this.showFieldError(this.emailInput, this.emailError, 'Please enter a valid email address (e.g., name@example.com).');
      return false;
    }

    this.clearFieldError(this.emailInput, this.emailError);
    return true;
  }

  showFieldError(inputEl, errorEl, message) {
    if (inputEl) {
      inputEl.classList.add('has-error');
      inputEl.setAttribute('aria-invalid', 'true');
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  clearFieldError(inputEl, errorEl) {
    if (inputEl) {
      inputEl.classList.remove('has-error');
      inputEl.removeAttribute('aria-invalid');
    }
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  showGeneralError(message) {
    if (!this.generalError) return;
    this.generalError.textContent = message;
    this.generalError.style.display = 'block';
    this.generalError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  clearGeneralError() {
    if (!this.generalError) return;
    this.generalError.textContent = '';
    this.generalError.style.display = 'none';
  }

  setLoadingState(isLoading) {
    if (!this.submitBtn) return;
    if (isLoading) {
      this.submitBtn.disabled = true;
      this.submitBtn.classList.add('is-loading');
      this.submitBtn.innerHTML = `
        <span class="btn-spinner" aria-hidden="true" style="display:inline-block; width:16px; height:16px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:auth-spin 0.6s linear infinite; margin-right:8px; vertical-align:middle;"></span>
        Sending Link...
      `;
    } else {
      this.submitBtn.disabled = false;
      this.submitBtn.classList.remove('is-loading');
      this.submitBtn.textContent = 'Send Reset Link';
    }
  }

  bindFormSubmission() {
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearGeneralError();

      const isEmailValid = this.validateEmail();
      if (!isEmailValid) {
        if (this.emailInput) this.emailInput.focus();
        return;
      }

      const email = this.emailInput.value.trim();
      this.setLoadingState(true);

      try {
        const result = await customerService.requestPasswordReset(email, this.rootPrefix);
        this.renderConfirmationState(email, result.message);
      } catch (err) {
        console.error('[ForgotPasswordPage] Error requesting password reset:', err);
        this.showGeneralError('An unexpected error occurred. Please check your connection and try again.');
        this.setLoadingState(false);
      }
    });
  }

  renderConfirmationState(email, message) {
    if (!this.mount) return;

    // Sanitize user email before inserting into HTML
    const sanitizedEmail = email.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));

    const loginUrl = `${this.rootPrefix}account/login/`;
    const forgotUrl = `${this.rootPrefix}account/forgot-password/`;

    this.mount.innerHTML = `
      <div class="auth-page-wrapper">
        <div class="auth-card" style="text-align: center;">
          
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: var(--color-bg-secondary, #F4F0EB); color: var(--color-text-primary, #1A1A1A); margin: 0 auto 20px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </div>

          <header class="auth-header">
            <h1 class="auth-title">Check your email</h1>
            <p class="auth-subtitle">
              ${message || "If an account exists for this email address, we've dispatched a secure password reset link."}
            </p>
          </header>

          <div style="background: var(--color-bg-secondary, #F4F0EB); padding: 14px 18px; border-radius: 8px; font-weight: 500; font-size: 0.9375rem; color: var(--color-text-primary, #1A1A1A); word-break: break-all; margin-bottom: 20px;">
            ${sanitizedEmail}
          </div>

          <p style="font-size: 0.875rem; color: var(--color-text-secondary, #666); line-height: 1.5; margin-bottom: 28px;">
            The reset link is active for <strong>1 hour</strong>. If you do not see our message shortly, please inspect your spam or junk folder.
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <a href="${loginUrl}" class="btn-primary auth-submit-btn" style="text-decoration: none; text-align: center; display: block; line-height: 48px; height: 48px; padding: 0;">
              Return to Sign In
            </a>
            <a href="${forgotUrl}" class="btn-outline" style="text-decoration: none; text-align: center; display: block; line-height: 46px; height: 48px; font-size: 0.875rem;">
              Send another link
            </a>
          </div>

        </div>
      </div>
    `;

    // Ensure focus moves to confirmation container for screen readers
    const confirmationHeading = this.mount.querySelector('h1');
    if (confirmationHeading) {
      confirmationHeading.setAttribute('tabindex', '-1');
      confirmationHeading.focus();
    }
  }
}

// Auto-bootstrap safely
if (typeof document !== 'undefined') {
  const bootstrap = () => new ForgotPasswordPage();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
