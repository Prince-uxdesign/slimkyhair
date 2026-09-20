/**
 * Customer Reset Password Page Controller - Slimky Hair
 * Milestone C19.4: Password Recovery
 */

import { customerService, validatePasswordStrength } from './customer-service.js';
import { initNavigation } from '../navigation.js';
import { initDrawers } from '../drawers.js';
import { syncWishlistUI } from '../wishlist-store.js';

export class ResetPasswordPage {
  constructor(options = {}) {
    if (options.rootPrefix !== undefined) {
      this.rootPrefix = options.rootPrefix;
    } else {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      this.rootPrefix = path.includes('/account/reset-password/') ? '../../' : '../';
    }

    this.mount = document.querySelector('#reset-page-mount');
    this.form = document.querySelector('#reset-form');
    this.passwordInput = document.querySelector('#reset-password');
    this.confirmInput = document.querySelector('#reset-confirm-password');
    this.passwordError = document.querySelector('#reset-password-error');
    this.confirmError = document.querySelector('#reset-confirm-password-error');
    this.generalError = document.querySelector('#reset-general-error');
    this.submitBtn = document.querySelector('#reset-submit-btn');

    this.init();
  }

  async init() {
    // Supabase's client auto-exchanges the recovery link's token/code in the
    // URL for a temporary recovery session on construction (detectSessionInUrl:
    // true) — this checks that it actually succeeded before showing the form.
    let hasRecoverySession = false;
    try {
      const { getSupabaseClient } = await import('../supabase-client.js');
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      hasRecoverySession = !!data?.session;
    } catch (err) {
      console.warn('[ResetPasswordPage] Could not establish recovery session:', err.message);
    }

    if (!hasRecoverySession) {
      this.renderInvalidTokenState('This password reset link is invalid or has expired. Please request a new one.');
      return;
    }

    if (this.form) {
      this.bindPasswordToggles();
      this.bindLiveValidation();
      this.bindFormSubmission();
    }

    // Global UI initializations
    initNavigation();
    initDrawers();
    syncWishlistUI();
  }

  /**
   * Bind accessible Show/Hide password toggles for both password fields.
   */
  bindPasswordToggles() {
    const eyeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeOffIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    const pairs = [
      { btn: document.querySelector('#toggle-reset-password-btn'), input: this.passwordInput },
      { btn: document.querySelector('#toggle-reset-confirm-btn'), input: this.confirmInput }
    ];

    pairs.forEach(({ btn, input }) => {
      if (!btn || !input) return;
      btn.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        btn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
        btn.innerHTML = isPassword ? eyeOffIcon : eyeIcon;
        input.focus();
      });
    });
  }

  bindLiveValidation() {
    if (this.passwordInput) {
      this.passwordInput.addEventListener('blur', () => this.validatePassword());
      this.passwordInput.addEventListener('input', () => {
        if (this.passwordInput.classList.contains('has-error')) {
          this.validatePassword();
        }
        if (this.confirmInput && this.confirmInput.value.length > 0) {
          this.validateConfirmPassword();
        }
      });
    }

    if (this.confirmInput) {
      this.confirmInput.addEventListener('blur', () => this.validateConfirmPassword());
      this.confirmInput.addEventListener('input', () => {
        if (this.confirmInput.classList.contains('has-error')) {
          this.validateConfirmPassword();
        }
      });
    }
  }

  validatePassword() {
    if (!this.passwordInput) return false;
    const value = this.passwordInput.value;
    const check = customerService.validatePasswordStrength(value);

    if (!check.valid) {
      this.showFieldError(this.passwordInput, this.passwordError, check.message);
      return false;
    }

    this.clearFieldError(this.passwordInput, this.passwordError);
    return true;
  }

  validateConfirmPassword() {
    if (!this.confirmInput || !this.passwordInput) return false;
    const password = this.passwordInput.value;
    const confirm = this.confirmInput.value;

    if (!confirm) {
      this.showFieldError(this.confirmInput, this.confirmError, 'Please repeat your new password.');
      return false;
    }

    if (password !== confirm) {
      this.showFieldError(this.confirmInput, this.confirmError, 'Passwords do not match. Please verify.');
      return false;
    }

    this.clearFieldError(this.confirmInput, this.confirmError);
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
        Updating Password...
      `;
    } else {
      this.submitBtn.disabled = false;
      this.submitBtn.classList.remove('is-loading');
      this.submitBtn.textContent = 'Update Password';
    }
  }

  bindFormSubmission() {
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearGeneralError();

      const isPasswordValid = this.validatePassword();
      const isConfirmValid = this.validateConfirmPassword();

      if (!isPasswordValid || !isConfirmValid) {
        if (!isPasswordValid && this.passwordInput) {
          this.passwordInput.focus();
        } else if (this.confirmInput) {
          this.confirmInput.focus();
        }
        return;
      }

      const newPassword = this.passwordInput.value;
      this.setLoadingState(true);

      try {
        const result = await customerService.resetPasswordWithToken({ newPassword });
        if (result.success) {
          this.renderSuccessState();
        }
      } catch (err) {
        console.error('[ResetPasswordPage] Error during password reset:', err);
        const message = err.message || '';
        if (/invalid or has expired/i.test(message)) {
          this.renderInvalidTokenState(message);
        } else {
          this.showGeneralError(message || 'Failed to update password. Please try again.');
          this.setLoadingState(false);
        }
      }
    });
  }

  renderInvalidTokenState(errorMessage) {
    if (!this.mount) return;

    const forgotUrl = `${this.rootPrefix}account/forgot-password/`;
    const loginUrl = `${this.rootPrefix}account/login/`;

    this.mount.innerHTML = `
      <div class="auth-page-wrapper">
        <div class="auth-card" style="text-align: center;">
          
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: #FDF0EE; color: #B42318; margin: 0 auto 20px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>

          <header class="auth-header">
            <h1 class="auth-title">Reset link invalid or expired</h1>
            <p class="auth-subtitle">
              ${errorMessage || 'For your security, password reset links expire after 1 hour and can only be used once.'}
            </p>
          </header>

          <p style="font-size: 0.875rem; color: var(--color-text-secondary, #666); line-height: 1.5; margin-bottom: 28px;">
            Please request a fresh reset link below to securely create your new password.
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <a href="${forgotUrl}" class="btn-primary auth-submit-btn" style="text-decoration: none; text-align: center; display: block; line-height: 48px; height: 48px; padding: 0;">
              Request a new reset link
            </a>
            <a href="${loginUrl}" class="btn-outline" style="text-decoration: none; text-align: center; display: block; line-height: 46px; height: 48px; font-size: 0.875rem;">
              Return to Sign In
            </a>
          </div>

        </div>
      </div>
    `;

    const heading = this.mount.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  }

  renderSuccessState() {
    if (!this.mount) return;

    const loginUrl = `${this.rootPrefix}account/login/`;

    this.mount.innerHTML = `
      <div class="auth-page-wrapper">
        <div class="auth-card" style="text-align: center;">
          
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: #EBF3ED; color: #1E6B37; margin: 0 auto 20px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>

          <header class="auth-header">
            <h1 class="auth-title">Password updated</h1>
            <p class="auth-subtitle">
              Your password has been changed successfully.
            </p>
          </header>

          <p style="font-size: 0.875rem; color: var(--color-text-secondary, #666); line-height: 1.5; margin-bottom: 28px;">
            You can now sign in to your Slimky Hair account with your new credentials.
          </p>

          <a href="${loginUrl}" class="btn-primary auth-submit-btn" style="text-decoration: none; text-align: center; display: block; line-height: 48px; height: 48px; padding: 0;">
            Sign In
          </a>

        </div>
      </div>
    `;

    const heading = this.mount.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  }
}

// Auto-bootstrap safely
if (typeof document !== 'undefined') {
  const bootstrap = () => new ResetPasswordPage();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
