/**
 * Checkout Validation Engine — Milestone C20.4
 * Single, authoritative, and reusable checkout validation system immediately before payment.
 * 
 * Reuses:
 * - C5 Cart validation (validateCart, calculateOrderPricing)
 * - C20.1 Checkout architecture
 * - C20.2 Customer information
 * - C20.3 Saved addresses
 * - Product/variant/inventory canonical architecture
 */

import { validateCart } from './cart-store.js';
import { calculateOrderPricing } from './components/order-summary.js';

/**
 * Standard Email Regex matching W3C and common RFC-5322 patterns
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sensible International Phone Validation
 * Requires:
 * - Between 7 and 15 digits (ITU-T E.164 recommendation)
 * - May include leading '+'
 * - May include optional separators: spaces, hyphens, periods, parentheses
 * - Rejects letters and arbitrary symbols
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  // Ensure only valid telephone characters are used (+, 0-9, space, -, (, ), .)
  if (!/^\+?[\d\s().-]{7,25}$/.test(trimmed)) {
    return false;
  }
  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Validate customer contact information.
 * @param {Object} customer
 * @param {string} customer.fullName
 * @param {string} customer.email
 * @param {string} customer.phone
 * @returns {{ isValid: boolean, errors: Object }}
 */
export function validateCustomerInfo({ fullName, email, phone } = {}) {
  const errors = {};

  const nameVal = (fullName || '').trim();
  if (!nameVal) {
    errors['fullname'] = 'Please enter your full name.';
  } else if (nameVal.length < 2) {
    errors['fullname'] = 'Please enter a valid full name (at least 2 characters).';
  }

  const emailVal = (email || '').trim();
  if (!emailVal) {
    errors['email'] = 'Email address is required for order verification and dispatch updates.';
  } else if (!EMAIL_REGEX.test(emailVal)) {
    errors['email'] = 'Please enter a valid email address (e.g. name@example.com).';
  }

  const phoneVal = (phone || '').trim();
  if (!phoneVal) {
    errors['phone'] = 'Phone / WhatsApp number is required for courier dispatch.';
  } else if (!isValidPhone(phoneVal)) {
    errors['phone'] = 'Please enter a valid contact phone number (7 to 15 digits, international formats supported).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validate delivery destination address (Nigeria vs International).
 * @param {Object} delivery
 * @param {string} delivery.country
 * @param {string} [delivery.state]
 * @param {string} [delivery.city]
 * @param {string} [delivery.address]
 * @param {string} [delivery.postalCode]
 * @returns {{ isValid: boolean, errors: Object, isNigeria: boolean }}
 */
export function validateDeliveryAddress({ country, state, city, address, postalCode } = {}) {
  const errors = {};
  const countryVal = (country || '').trim();
  const isNigeria = countryVal.toLowerCase() === 'nigeria';

  if (!countryVal) {
    errors['country'] = 'Please select your destination country.';
    return { isValid: false, errors, isNigeria: false };
  }

  if (isNigeria) {
    // Nigeria Fields
    const stateVal = (state || '').trim();
    if (!stateVal) {
      errors['ng-state'] = 'Please select your delivery state in Nigeria.';
    }

    const cityVal = (city || '').trim();
    if (!cityVal || cityVal.length < 2) {
      errors['ng-city'] = 'Please enter your city or local area in Nigeria.';
    }

    const addressVal = (address || '').trim();
    if (!addressVal || addressVal.length < 5) {
      errors['ng-address'] = 'Please enter your complete delivery street address (minimum 5 characters).';
    }
  } else {
    // International Fields
    const stateVal = (state || '').trim();
    if (!stateVal || stateVal.length < 2) {
      errors['intl-state'] = 'Please specify your state, province, or region.';
    }

    const cityVal = (city || '').trim();
    if (!cityVal || cityVal.length < 2) {
      errors['intl-city'] = 'Please enter your city.';
    }

    const postalVal = (postalCode || '').trim();
    if (!postalVal || postalVal.length < 2) {
      errors['intl-postal'] = 'Postal / ZIP code is required for international routing.';
    }

    const addressVal = (address || '').trim();
    if (!addressVal || addressVal.length < 5) {
      errors['intl-address'] = 'Please enter your full international street address (minimum 5 characters).';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    isNigeria
  };
}

/**
 * Validate Cart Items against authoritative catalog inventory & pricing (C5 reuse).
 * @param {Array} cart
 * @param {Object} [options]
 * @returns {Object} validateCart result
 */
export function validateCartItems(cart, options = {}) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return {
      valid: false,
      canProceedToCheckout: false,
      hasBlockingErrors: true,
      hasNetworkError: false,
      errors: [{ message: 'Your shopping bag is empty. Please add items to proceed.', type: 'empty_cart' }],
      warnings: [],
      notifications: [{
        type: 'empty_cart',
        severity: 'error',
        blocking: true,
        message: 'Your shopping bag is empty.'
      }],
      priceChanges: [],
      stockIssues: [],
      unavailableItems: [],
      resolvedItems: []
    };
  }

  return validateCart(cart, options);
}

/**
 * Authoritatively validate Order Pricing & Totals.
 * Rules:
 * - Subtotal strictly equals Product Payment Total.
 * - Shipping remains separate (quoted post-payment via WhatsApp/phone).
 * - No invented shipping fees.
 * - No unauthorized coupons/discounts.
 * @param {Array} cart
 * @param {string} country
 * @param {number|null} [clientExpectedTotal=null]
 * @returns {{ isValid: boolean, error: string|null, pricing: Object }}
 */
export function validateOrderTotal(cart, country = 'Nigeria', clientExpectedTotal = null) {
  const isNigeria = (country || 'Nigeria').trim().toLowerCase() === 'nigeria';
  const pricing = calculateOrderPricing(cart, { isNigeria });

  if (pricing.productPaymentTotal <= 0 && cart.length > 0) {
    return {
      isValid: false,
      error: 'Invalid order total calculated. Order total must be greater than zero.',
      pricing
    };
  }

  // Authoritative total check
  if (clientExpectedTotal !== null && typeof clientExpectedTotal === 'number') {
    if (Math.round(clientExpectedTotal) !== Math.round(pricing.productPaymentTotal)) {
      return {
        isValid: false,
        error: `Order total discrepancy detected. Calculated: ₦${pricing.productPaymentTotal.toLocaleString()}, expected: ₦${clientExpectedTotal.toLocaleString()}.`,
        pricing
      };
    }
  }

  // Invariant: Subtotal equals Product Payment Total
  if (pricing.subtotal !== pricing.productPaymentTotal) {
    return {
      isValid: false,
      error: 'Product payment amount must equal the subtotal of verified cart items.',
      pricing
    };
  }

  return {
    isValid: true,
    error: null,
    pricing
  };
}

/**
 * Unified Pre-submission Checkout Validation Pipeline.
 * Performs end-to-end checks across:
 * - Cart non-emptiness & item existence/availability/stock/pricing
 * - Customer contact fields
 * - Delivery address fields
 * - Order totals & shipping invariants
 * 
 * @param {Object} params
 * @param {Array} params.cart
 * @param {Object} params.customer
 * @param {Object} params.delivery
 * @param {Object} [params.options]
 * @returns {Object} Complete validation report
 */
export function validateFullCheckout({ cart, customer, delivery, options = {} } = {}) {
  const allFieldErrors = {};

  // 1. Cart Validation
  const cartResult = validateCartItems(cart, options);

  // 2. Customer Validation
  const customerResult = validateCustomerInfo(customer);
  Object.assign(allFieldErrors, customerResult.errors);

  // 3. Delivery Address Validation
  const deliveryResult = validateDeliveryAddress(delivery);
  Object.assign(allFieldErrors, deliveryResult.errors);

  // 4. Order Total Validation
  const totalResult = cart.length > 0 
    ? validateOrderTotal(cart, delivery?.country || 'Nigeria')
    : { isValid: false, error: 'Cart is empty', pricing: null };

  const isFormValid = Object.keys(allFieldErrors).length === 0;
  const isCartValid = cartResult.canProceedToCheckout && !cartResult.hasBlockingErrors;
  const isTotalValid = totalResult.isValid;

  // Determine first invalid field name for auto-focus management
  const fieldOrder = [
    'fullname', 'email', 'phone', 'country',
    'ng-state', 'ng-city', 'ng-address',
    'intl-state', 'intl-city', 'intl-postal', 'intl-address'
  ];
  const firstInvalidField = fieldOrder.find(f => allFieldErrors[f]) || Object.keys(allFieldErrors)[0] || null;

  return {
    isValid: isFormValid && isCartValid && isTotalValid,
    isFormValid,
    isCartValid,
    isTotalValid,
    errors: allFieldErrors,
    firstInvalidField,
    cartValidation: cartResult,
    pricing: totalResult.pricing,
    totalError: totalResult.error
  };
}
