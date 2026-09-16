/**
 * Shared form-validation helpers.
 * Consolidates the email pattern that was previously copy-pasted (with a
 * couple of drifting variants) across customer-service.js, login-page.js,
 * register-page.js, forgot-password-page.js, and contact-page.js.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_PATTERN.test(email.trim());
}
