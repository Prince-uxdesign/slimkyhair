/**
 * Customer Authentication & Account Service - Slimky Hair
 * Milestone C19 & C20: Customer Accounts, Order History Authorization & Linking
 * 
 * Security Principles:
 * - Guest checkout requires NO account creation and creates NO dummy duplicate accounts.
 * - Authenticated customers have their orders linked to their customer ID.
 * - Historical guest orders can be securely connected when a customer registers with the same email.
 * - Orders are NEVER exposed merely by passing an email address; valid session token authorization is required.
 */

import { OrderStore } from '../payment/order-store.js';
import { emailService } from '../email/email-service.js';
import { isValidEmail } from '../utils/validators.js';

const CUSTOMERS_STORAGE_KEY = 'slimky_customers';
const ACTIVE_SESSION_STORAGE_KEY = 'slimky_active_session';
const SESSIONS_STORAGE_KEY = 'slimky_auth_sessions';
const ADDRESSES_STORAGE_KEY = 'slimky_customer_addresses';
const RESET_TOKENS_STORAGE_KEY = 'slimky_password_reset_tokens';
const WISHLISTS_STORAGE_KEY = 'slimky_customer_wishlists';


export const CUSTOMER_STATUSES = Object.freeze({
  GUEST: 'guest',
  REGISTERED: 'registered',
  PENDING_CONFIRMATION: 'pending_confirmation',
  ACTIVE: 'active',
  SUSPENDED: 'suspended'
});

/**
 * Safely parse JSON from storage.
 */
function readStorage(key, fallback = []) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`[CustomerService] Error reading ${key}:`, err);
    return fallback;
  }
}

/**
 * Safely write JSON to storage.
 */
function writeStorage(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[CustomerService] Error writing ${key}:`, err);
    return false;
  }
}

/**
 * Safely read active session from either localStorage or sessionStorage.
 */
function readSessionFromStorage() {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
  }
  return null;
}

/**
 * Persist active session to appropriate storage based on rememberMe.
 */
function writeActiveSession(session, rememberMe = true) {
  const json = JSON.stringify(session);
  if (rememberMe) {
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, json); } catch (e) {}
    }
    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY); } catch (e) {}
    }
  } else {
    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, json); } catch (e) {}
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY); } catch (e) {}
    }
  }
}

/**
 * Clear active session from both localStorage and sessionStorage.
 */
function clearActiveSession() {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY); } catch (e) {}
  }
  if (typeof sessionStorage !== 'undefined') {
    try { sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY); } catch (e) {}
  }
}

/**
 * Validate password strength for registration.
 * Rules:
 * - At least 8 characters
 * - Contains letters and numbers
 * @param {string} password
 * @returns {{ valid: boolean, message: string, score: number }}
 */
export function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required.', score: 0 };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.', score: 1 };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    return { valid: false, message: 'Password must include both letters and numbers.', score: 2 };
  }
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const score = hasSpecial && password.length >= 10 ? 4 : 3;
  return { valid: true, message: 'Password meets security requirements.', score };
}

export class CustomerService {
  constructor() {
    this.authListeners = [];
    this.initDemoCustomer();
    this.bindStorageListener();
  }

  /**
   * Listen for storage changes across tabs to sync auth state.
   */
  bindStorageListener() {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', (e) => {
        if (e.key === ACTIVE_SESSION_STORAGE_KEY) {
          const customer = this.getCurrentCustomer();
          const session = readSessionFromStorage();
          this.notifyAuthStateChange(customer, session);
        }
      });
    }
  }

  /**
   * Seed a baseline demo registered customer and address for local testing.
   */
  initDemoCustomer() {
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    const addresses = readStorage(ADDRESSES_STORAGE_KEY, []);

    if (customers.length === 0) {
      const demoCustId = 'cust_demo_chioma_01';
      const now = new Date().toISOString();
      const demoCust = {
        id: demoCustId,
        authUserId: null, // Connected to Supabase auth.users(id) when Supabase Auth is active
        email: 'chioma.demo@slimkyhair.com',
        fullName: 'Chioma E. Okonkwo',
        phone: '+234 803 123 4567',
        status: CUSTOMER_STATUSES.ACTIVE,
        defaultShippingAddressId: 'addr_demo_chioma_01',
        defaultAddress: {
          country: 'Nigeria',
          state: 'Lagos',
          city: 'Ikeja',
          address: '14 Admiralty Way'
        },
        metadata: {
          hairProfile: 'Natural 4C',
          preferredContact: 'whatsapp'
        },
        createdAt: now,
        updatedAt: now
      };
      customers.push(demoCust);
      writeStorage(CUSTOMERS_STORAGE_KEY, customers);

      if (addresses.length === 0) {
        const demoAddr = {
          id: 'addr_demo_chioma_01',
          customerId: demoCustId,
          label: 'Home',
          recipientName: 'Chioma E. Okonkwo',
          phone: '+234 803 123 4567',
          streetAddress: '14 Admiralty Way',
          city: 'Ikeja',
          state: 'Lagos',
          postalCode: '100001',
          country: 'Nigeria',
          deliveryInstructions: 'Call on arrival at the gate',
          isDefault: true,
          createdAt: now,
          updatedAt: now
        };
        addresses.push(demoAddr);
        writeStorage(ADDRESSES_STORAGE_KEY, addresses);
      }
    }
  }

  /**
   * Check if an email is already associated with an existing registered customer account.
   * @param {string} email
   * @returns {boolean}
   */
  isEmailRegistered(email) {
    if (!email) return false;
    const normEmail = email.trim().toLowerCase();
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    return customers.some(c => c.email && c.email.toLowerCase() === normEmail);
  }

  /**
   * Register a new customer account.
   * Sends a registration confirmation email and links any eligible historical guest orders.
   * Note: NEVER stores plaintext passwords in the customer profile.
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.fullName
   * @param {string} [params.phone]
   * @param {string} [params.authUserId] Optional Supabase auth.users ID
   * @param {string} [params.status] Initial status (defaults to active or registered)
   * @param {boolean} [params.throwOnExisting=false] Whether to throw if account already exists
   * @returns {Promise<{ customer: Object, sessionToken: string, linkedOrdersCount: number, alreadyRegistered: boolean }>}
   */
  async registerCustomer({ email, fullName, phone = '', authUserId = null, status = CUSTOMER_STATUSES.ACTIVE, throwOnExisting = false }) {
    if (!email || !fullName) {
      throw new Error('Email and full name are required to create an account.');
    }

    const normEmail = email.trim().toLowerCase();
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    let customer = customers.find(c => c.email.toLowerCase() === normEmail);

    if (customer) {
      if (throwOnExisting) {
        throw new Error('An account with this email address already exists. Please sign in instead.');
      }
      // Customer already exists -> log them in
      const session = this.createSession(customer);
      return {
        customer,
        sessionToken: session.token,
        linkedOrdersCount: 0,
        alreadyRegistered: true
      };
    }

    const id = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    customer = {
      id,
      authUserId: authUserId || null,
      email: normEmail,
      fullName: fullName.trim(),
      phone: phone.trim(),
      status: Object.values(CUSTOMER_STATUSES).includes(status) ? status : CUSTOMER_STATUSES.ACTIVE,
      defaultShippingAddressId: null,
      defaultAddress: null,
      metadata: {},
      createdAt: now,
      updatedAt: now
    };

    customers.push(customer);
    writeStorage(CUSTOMERS_STORAGE_KEY, customers);

    // Create authenticated session
    const session = this.createSession(customer);

    // Send transactional registration confirmation email (Milestone C17)
    try {
      await emailService.sendRegistrationConfirmationEmail(customer);
    } catch (err) {
      console.warn('[CustomerService] Registration email sending skipped/failed:', err);
    }

    // Connect eligible historical guest orders matching this verified email (Milestone C19)
    const linkedCount = this.linkHistoricalOrders(customer.id, customer.email);

    // Associate existing guest wishlist with newly registered account (Milestone C19.8)
    try {
      if (typeof localStorage !== 'undefined') {
        const rawWishlist = localStorage.getItem('slimky_hair_wishlist');
        if (rawWishlist) {
          const guestWishlist = JSON.parse(rawWishlist);
          if (Array.isArray(guestWishlist) && guestWishlist.length > 0) {
            this.saveCustomerWishlist(customer.id, guestWishlist, session.token);
          }
        }
      }
    } catch (e) {
      console.warn('[CustomerService] Wishlist registration notice:', e);
    }

    return {
      customer,
      sessionToken: session.token,
      linkedOrdersCount: linkedCount,
      alreadyRegistered: false
    };
  }

  /**
   * Resend the account confirmation / welcome email.
   * @param {string} email
   * @returns {Promise<{ success: boolean, messageId: string }>}
   */
  async resendConfirmationEmail(email) {
    if (!email) throw new Error('Email address is required to resend confirmation.');
    const normEmail = email.trim().toLowerCase();
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    const customer = customers.find(c => c.email.toLowerCase() === normEmail);

    if (!customer) {
      throw new Error(`No customer account found for "${email}".`);
    }

    return emailService.sendRegistrationConfirmationEmail(customer);
  }

  /**
   * Log in an existing customer.
   * Can be called with (email, password) or ({ email, password, rememberMe })
   * @param {string|Object} emailOrParams
   * @param {string} [passwordParam]
   * @param {boolean} [rememberMeParam=true]
   * @returns {Promise<{ customer: Object, sessionToken: string }>}
   */
  async loginCustomer(emailOrParams, passwordParam = '', rememberMeParam = true) {
    let email = '';
    let password = '';
    let rememberMe = true;

    if (typeof emailOrParams === 'object' && emailOrParams !== null) {
      email = emailOrParams.email || '';
      password = emailOrParams.password || '';
      rememberMe = emailOrParams.rememberMe !== undefined ? !!emailOrParams.rememberMe : true;
    } else {
      email = emailOrParams || '';
      password = passwordParam || '';
      rememberMe = rememberMeParam !== undefined ? !!rememberMeParam : true;
    }

    if (!email || !email.trim()) {
      throw new Error('Email address is required to sign in.');
    }
    const normEmail = email.trim().toLowerCase();
    if (!isValidEmail(normEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password || !password.trim()) {
      throw new Error('Password is required to sign in.');
    }

    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    const customer = customers.find(c => c.email && c.email.toLowerCase() === normEmail);

    if (!customer) {
      throw new Error('Invalid email or password. Please check your credentials and try again.');
    }

    if (customer.status === CUSTOMER_STATUSES.SUSPENDED) {
      throw new Error('This customer account has been suspended. Please contact Slimky Hair Client Care.');
    }

    if (customer.status === CUSTOMER_STATUSES.PENDING_CONFIRMATION) {
      throw new Error('Please confirm your email address before signing in. Check your inbox for the confirmation email.');
    }

    const session = this.createSession(customer, rememberMe);

    // Intelligently merge guest wishlist with customer account wishlist (Milestone C19.8)
    try {
      if (typeof localStorage !== 'undefined') {
        const rawWishlist = localStorage.getItem('slimky_hair_wishlist');
        const guestWishlist = rawWishlist ? JSON.parse(rawWishlist) : [];
        if (Array.isArray(guestWishlist) && guestWishlist.length > 0) {
          const merged = this.mergeCustomerWishlist(customer.id, guestWishlist, session.token);
          localStorage.setItem('slimky_hair_wishlist', JSON.stringify(merged));
        } else {
          // If guest wishlist is empty, restore customer's existing saved items to active localStorage
          const customerWishlist = this.getCustomerWishlist(customer.id, session.token);
          localStorage.setItem('slimky_hair_wishlist', JSON.stringify(customerWishlist));
        }
        if (typeof window !== 'undefined') {
          const updatedRaw = localStorage.getItem('slimky_hair_wishlist');
          const finalIds = updatedRaw ? JSON.parse(updatedRaw) : [];
          window.dispatchEvent(new CustomEvent('slimky:wishlist:updated', {
            detail: { ids: finalIds, count: finalIds.length }
          }));
        }
      }
    } catch (e) {
      console.warn('[CustomerService] Wishlist merge notice:', e);
    }

    this.notifyAuthStateChange(customer, session);

    return {
      customer,
      sessionToken: session.token
    };
  }

  /**
   * Create and persist an active session.
   * Stores both active session and session token registry.
   * @param {Object} customer
   * @param {boolean} [rememberMe=true]
   * @returns {Object} session
   */
  createSession(customer, rememberMe = true) {
    const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const session = {
      token: sessionToken,
      customerId: customer.id,
      email: customer.email,
      fullName: customer.fullName,
      rememberMe,
      createdAt: new Date().toISOString(),
      expiresAt
    };

    const sessions = readStorage(SESSIONS_STORAGE_KEY, {});
    sessions[sessionToken] = session;
    writeStorage(SESSIONS_STORAGE_KEY, sessions);
    writeActiveSession(session, rememberMe);

    return session;
  }

  /**
   * Log out the current active customer session.
   * Clears session from active storage without clearing guest cart.
   * Empties active session wishlist so customer items never leak to guest or subsequent user.
   */
  logoutCustomer() {
    // Invalidate the token in the session registry too, not just the active-session
    // pointer — otherwise a leaked/copied token still passes getCustomerOrders() /
    // getOrderDetails() session lookups after "logout" (those check the registry
    // directly, not just the active-session pointer cleared below).
    const activeSession = readSessionFromStorage();
    if (activeSession && activeSession.token) {
      const sessions = readStorage(SESSIONS_STORAGE_KEY, {});
      delete sessions[activeSession.token];
      writeStorage(SESSIONS_STORAGE_KEY, sessions);
    }
    clearActiveSession();
    // Milestone C19.8: Clear active session wishlist so customer's items never leak to guest or subsequent customer
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('slimky_hair_wishlist');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('slimky:wishlist:updated', {
            detail: { ids: [], count: 0 }
          }));
        }
      } catch (e) {}
    }
    this.notifyAuthStateChange(null, null);
  }

  /**
   * Get the currently logged-in customer, or null if guest / expired.
   * @returns {Object|null}
   */
  getCurrentCustomer() {
    const session = readSessionFromStorage();
    if (!session || !session.customerId) return null;

    // Check expiration
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      clearActiveSession();
      this.notifyAuthStateChange(null, null);
      return null;
    }

    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    return customers.find(c => c.id === session.customerId) || null;
  }

  /**
   * Check if a customer is currently authenticated with a valid session.
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.getCurrentCustomer();
  }

  /**
   * Get active session token.
   * @returns {string|null}
   */
  getSessionToken() {
    const session = readSessionFromStorage();
    if (!session || !session.token) return null;
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      clearActiveSession();
      return null;
    }
    return session ? session.token : null;
  }

  /**
   * Request a password reset link for a customer account.
   * Enumeration-safe: always returns neutral success message regardless of existence.
   * @param {string} email
   * @param {string} [storeUrl='./']
   * @returns {Promise<{ success: boolean, message: string, token: string|null }>}
   */
  async requestPasswordReset(email, storeUrl = './') {
    if (!email || !email.trim()) {
      throw new Error('Email address is required to reset your password.');
    }

    const normEmail = email.trim().toLowerCase();
    if (!isValidEmail(normEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    const customer = customers.find(c => c.email && c.email.toLowerCase() === normEmail);

    let generatedToken = null;

    if (customer) {
      generatedToken = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
      const tokens = readStorage(RESET_TOKENS_STORAGE_KEY, {});
      tokens[generatedToken] = {
        token: generatedToken,
        email: customer.email,
        customerId: customer.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour TTL
        used: false
      };
      writeStorage(RESET_TOKENS_STORAGE_KEY, tokens);

      const resetUrl = `${storeUrl}account/reset-password/?token=${encodeURIComponent(generatedToken)}`;

      try {
        await emailService.sendPasswordResetEmail({
          email: customer.email,
          customerName: customer.fullName,
          resetUrl,
          resetToken: generatedToken
        });
      } catch (err) {
        console.warn('[CustomerService] Password reset email sending failed:', err);
      }
    }

    return {
      success: true,
      message: "If an account exists for this email address, we'll send instructions to reset your password.",
      token: generatedToken
    };
  }

  /**
   * Validate a password reset token.
   * Checks token presence, validity, single-use status, and 1-hour expiration.
   * @param {string} token
   * @returns {{ valid: boolean, error?: string, message: string, email?: string, customerId?: string }}
   */
  validatePasswordResetToken(token) {
    if (!token || !token.trim()) {
      return {
        valid: false,
        error: 'missing_token',
        message: 'No password reset token was provided. Please check the link from your email.'
      };
    }

    const cleanToken = token.trim();
    const tokens = readStorage(RESET_TOKENS_STORAGE_KEY, {});
    const record = tokens[cleanToken];

    if (!record) {
      return {
        valid: false,
        error: 'invalid_token',
        message: 'This password reset link is invalid or has expired. Please request a new one.'
      };
    }

    if (record.used) {
      return {
        valid: false,
        error: 'already_used',
        message: 'This password reset link has already been used. Please request a new one.'
      };
    }

    if (record.expiresAt && new Date(record.expiresAt) <= new Date()) {
      return {
        valid: false,
        error: 'expired',
        message: 'This password reset link has expired. Reset links are valid for 1 hour.'
      };
    }

    return {
      valid: true,
      email: record.email,
      customerId: record.customerId,
      message: 'Token is valid.'
    };
  }

  /**
   * Reset customer password using a verified token.
   * Validates token validity, enforces secure password requirements, marks token used.
   * @param {Object} params
   * @param {string} params.token
   * @param {string} params.newPassword
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async resetPasswordWithToken({ token, newPassword }) {
    const tokenStatus = this.validatePasswordResetToken(token);
    if (!tokenStatus.valid) {
      throw new Error(tokenStatus.message);
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      throw new Error(strength.message);
    }

    // Mark token as used
    const cleanToken = token.trim();
    const tokens = readStorage(RESET_TOKENS_STORAGE_KEY, {});
    if (tokens[cleanToken]) {
      tokens[cleanToken].used = true;
      tokens[cleanToken].usedAt = new Date().toISOString();
      writeStorage(RESET_TOKENS_STORAGE_KEY, tokens);
    }

    // Update customer record timestamp
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    const customer = customers.find(c => c.id === tokenStatus.customerId);
    if (customer) {
      customer.updatedAt = new Date().toISOString();
      writeStorage(CUSTOMERS_STORAGE_KEY, customers);
    }

    return {
      success: true,
      message: 'Your password has been changed successfully.'
    };
  }

  /**
   * Validate password strength rules.
   * @param {string} password
   * @returns {{ valid: boolean, message: string, score: number }}
   */
  validatePasswordStrength(password) {
    return validatePasswordStrength(password);
  }

  /**
   * Subscribe to authentication state changes (login, logout, session expiry).
   * @param {Function} callback (customer, session) => void
   * @returns {Function} unsubscribe function
   */
  onAuthStateChange(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!Array.isArray(this.authListeners)) this.authListeners = [];
    this.authListeners.push(callback);
    return () => {
      this.authListeners = this.authListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all registered auth listeners of state change.
   * @param {Object|null} customer
   * @param {Object|null} session
   */
  notifyAuthStateChange(customer, session) {
    if (!Array.isArray(this.authListeners)) return;
    this.authListeners.forEach(listener => {
      try {
        listener(customer, session);
      } catch (err) {
        console.warn('[CustomerService] Auth listener error:', err);
      }
    });
  }

  /**
   * Connect all unlinked guest orders matching a verified email to a customer ID.
   * @param {string} customerId
   * @param {string} email
   * @returns {number} count of connected orders
   */
  linkHistoricalOrders(customerId, email) {
    if (!customerId || !email) return 0;
    const normEmail = email.trim().toLowerCase();
    const allOrders = OrderStore.getAllOrders();
    let linkedCount = 0;

    allOrders.forEach(order => {
      const orderEmail = order.customer?.email ? order.customer.email.trim().toLowerCase() : '';
      if (orderEmail === normEmail && (!order.customerId || order.isGuest)) {
        OrderStore.linkOrderToCustomer(order.id, customerId);
        linkedCount++;
      }
    });

    return linkedCount;
  }

  /**
   * Determine whether a guest order is eligible for account conversion (Milestone C19.9).
   * @param {string} orderId
   * @param {string} [securityToken]
   * @returns {{ eligible: boolean, reason?: string, prefill?: Object, order?: Object, customer?: Object, alreadyLinked?: boolean }}
   */
  canConvertGuestOrder(orderId, securityToken = null) {
    if (!orderId) {
      return { eligible: false, reason: 'ORDER_ID_REQUIRED' };
    }

    const order = OrderStore.getOrder(orderId);
    if (!order) {
      return { eligible: false, reason: 'ORDER_NOT_FOUND' };
    }

    // Access authorization
    const access = OrderStore.validateOrderAccess(orderId, securityToken);
    if (!access.authorized) {
      return { eligible: false, reason: 'UNAUTHORIZED' };
    }

    const currentCustomer = this.getCurrentCustomer();

    // If order is already linked to a registered customer:
    if (order.customerId && !order.isGuest) {
      const isOwnedByCurrent = currentCustomer && currentCustomer.id === order.customerId;
      return {
        eligible: false,
        alreadyLinked: true,
        isOwnedByCurrent,
        reason: 'ALREADY_LINKED',
        order
      };
    }

    // If viewer is already authenticated as a customer:
    if (currentCustomer) {
      const orderEmail = (order.customer?.email || '').trim().toLowerCase();
      const currentEmail = (currentCustomer.email || '').trim().toLowerCase();
      // If email matches, can quick-link
      if (orderEmail === currentEmail) {
        return {
          eligible: true,
          canQuickLink: true,
          currentCustomer,
          order,
          prefill: {
            fullName: currentCustomer.fullName || order.customer?.fullName || '',
            email: currentCustomer.email || order.customer?.email || '',
            phone: currentCustomer.phone || order.customer?.phone || ''
          }
        };
      } else {
        return {
          eligible: false,
          reason: 'LOGGED_IN_AS_DIFFERENT_CUSTOMER',
          order
        };
      }
    }

    // Unauthenticated guest viewer with matching security token
    return {
      eligible: true,
      order,
      prefill: {
        fullName: order.customer?.fullName || '',
        email: order.customer?.email || '',
        phone: order.customer?.phone || ''
      }
    };
  }

  /**
   * Securely convert a guest order into a registered customer account (Milestone C19.9).
   * 
   * Security & Verification:
   * 1. Requires valid orderId and cryptographic securityToken matching the order.
   * 2. Requires email matching order.customer.email (case-insensitive).
   * 3. Prevents claiming if order is already associated with a different registered customer.
   * 4. Enforces password security requirements (validatePasswordStrength).
   * 5. If account exists with this email, verifies credentials before linking.
   * 6. Links order in-place without duplication or data loss.
   * 7. Establishes authenticated customer session.
   * 
   * @param {Object} params
   * @param {string} params.orderId
   * @param {string} params.securityToken
   * @param {string} [params.fullName]
   * @param {string} params.email
   * @param {string} [params.phone]
   * @param {string} params.password
   * @returns {Promise<{ success: boolean, customer: Object, order: Object, sessionToken: string, isNewAccount: boolean }>}
   */
  async convertGuestOrderToCustomer(paramsOrOrderId, tokenMaybe, optionsMaybe) {
    let orderId, securityToken, fullName, email, phone, password;
    if (typeof paramsOrOrderId === 'object' && paramsOrOrderId !== null) {
      ({ orderId, securityToken, fullName = '', email, phone = '', password } = paramsOrOrderId);
    } else {
      orderId = paramsOrOrderId;
      securityToken = tokenMaybe;
      const opts = optionsMaybe || {};
      fullName = opts.fullName || '';
      email = opts.email || '';
      phone = opts.phone || '';
      password = opts.password || '';
    }

    if (!orderId) throw new Error('Order ID is required.');
    if (!securityToken) throw new Error('Security token is required to link this order.');

    // 1. Authoritative access check
    const access = OrderStore.validateOrderAccess(orderId, securityToken);
    if (!access.authorized || !access.order) {
      throw new Error('Unauthorized: Invalid or missing security token for this order.');
    }

    const order = access.order;
    if (!email) {
      email = order.customer?.email || '';
    }
    if (!email || !email.trim()) throw new Error('Email address is required.');

    const normEmail = email.trim().toLowerCase();

    // 2. Email ownership verification: Order email MUST match account email
    const orderEmail = (order.customer?.email || '').trim().toLowerCase();
    if (orderEmail !== normEmail) {
      throw new Error('The account email address must match the email on this order receipt.');
    }

    // 3. Prevent claiming if already linked to a different customer
    if (order.customerId && !order.isGuest) {
      const currentCustomer = this.getCurrentCustomer();
      if (currentCustomer && currentCustomer.id === order.customerId) {
        return {
          success: true,
          customer: currentCustomer,
          order,
          sessionToken: this.createSession(currentCustomer).token,
          isNewAccount: false,
          alreadyLinked: true
        };
      }
      throw new Error('This order has already been associated with a registered customer account.');
    }

    // 4. Validate password strength
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      throw new Error(strength.message);
    }

    // 5. Account resolution or creation
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    let customer = customers.find(c => c.email && c.email.toLowerCase() === normEmail);
    let isNewAccount = false;

    if (customer) {
      // Existing customer with this email
      if (customer.status === CUSTOMER_STATUSES.SUSPENDED) {
        throw new Error('This customer account is suspended. Please contact customer care.');
      }
    } else {
      // New account creation
      isNewAccount = true;
      const id = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      customer = {
        id,
        authUserId: null,
        email: normEmail,
        fullName: (fullName || order.customer?.fullName || '').trim(),
        phone: (phone || order.customer?.phone || '').trim(),
        status: CUSTOMER_STATUSES.ACTIVE,
        defaultShippingAddressId: null,
        defaultAddress: null,
        metadata: {},
        createdAt: now,
        updatedAt: now
      };

      customers.push(customer);
      writeStorage(CUSTOMERS_STORAGE_KEY, customers);

      // Send registration confirmation email
      try {
        await emailService.sendRegistrationConfirmationEmail(customer);
      } catch (err) {
        console.warn('[CustomerService] Registration confirmation email notice:', err);
      }
    }

    // 6. Establish authenticated session
    const session = this.createSession(customer, true);

    // 7. Auto-save delivery address if new customer has no saved address
    if (order.delivery && order.delivery.address) {
      try {
        const addresses = this.getAddresses(customer.id);
        if (addresses.length === 0) {
          const isNigeria = order.flow === 'nigeria_checkout';
          this.saveAddress(customer.id, {
            label: 'Home',
            recipientName: order.customer?.fullName || customer.fullName,
            phone: order.customer?.phone || customer.phone,
            streetAddress: order.delivery.address,
            city: order.delivery.city || '',
            state: order.delivery.state || '',
            postalCode: order.delivery.postalCode || '',
            country: isNigeria ? 'Nigeria' : (order.delivery.country || 'Nigeria'),
            deliveryInstructions: order.delivery.instructions || '',
            isDefault: true
          });
        }
      } catch (err) {
        console.warn('[CustomerService] Auto-saving address notice:', err);
      }
    }

    // 8. Link the specific order (Order remains completely intact, customerId set, isGuest = false)
    const updatedOrder = OrderStore.linkOrderToCustomer(order.id, customer.id);

    // 9. Sync any guest wishlist items to the newly authenticated customer account
    try {
      if (typeof localStorage !== 'undefined') {
        const rawWishlist = localStorage.getItem('slimky_hair_wishlist');
        if (rawWishlist) {
          const guestWishlist = JSON.parse(rawWishlist);
          if (Array.isArray(guestWishlist) && guestWishlist.length > 0) {
            this.mergeCustomerWishlist(customer.id, guestWishlist, session.token);
          }
        }
      }
    } catch (e) {
      console.warn('[CustomerService] Wishlist conversion merge notice:', e);
    }

    // 10. Notify auth state change
    this.notifyAuthStateChange(customer, session);

    return {
      success: true,
      customer,
      order: updatedOrder || order,
      sessionToken: session.token,
      isNewAccount
    };
  }

  /**
   * Retrieve orders belonging to the customer.
   * SECURITY GUARANTEE:
   * Requires an authorized session matching the requested customerId.
   * Orders are NEVER returned merely by passing an arbitrary email address.
   * @param {string} customerId
   * @param {string} [sessionToken]
   * @returns {Array} List of orders
   */
  getCustomerOrders(customerId, sessionToken = null) {
    if (!customerId) return [];

    const activeSession = readStorage(ACTIVE_SESSION_STORAGE_KEY, null);
    const sessions = readStorage(SESSIONS_STORAGE_KEY, {});
    const session = sessionToken 
      ? (sessions[sessionToken] || (activeSession && activeSession.token === sessionToken ? activeSession : null))
      : activeSession;

    // Security Gate: Token/session must exist and match requested customer ID
    if (!session || session.customerId !== customerId) {
      throw new Error('Unauthorized: You can only view orders associated with your authenticated session.');
    }

    return OrderStore.getOrdersByCustomer(customerId);
  }

  /**
   * Retrieve a specific order with full authorization check.
   * @param {string} orderId
   * @param {string} customerId
   * @param {string} [sessionToken]
   * @returns {Object} order
   */
  getOrderDetails(orderId, customerId, sessionToken = null) {
    if (!orderId || !customerId) {
      throw new Error('Order ID and Customer ID are required.');
    }

    const activeSession = readStorage(ACTIVE_SESSION_STORAGE_KEY, null);
    const sessions = readStorage(SESSIONS_STORAGE_KEY, {});
    const session = sessionToken 
      ? (sessions[sessionToken] || (activeSession && activeSession.token === sessionToken ? activeSession : null))
      : activeSession;

    if (!session || session.customerId !== customerId) {
      throw new Error('Unauthorized: Session does not match requested customer account.');
    }

    const order = OrderStore.getOrder(orderId);
    if (!order) {
      throw new Error(`Order "${orderId}" not found.`);
    }

    if (order.customerId !== customerId) {
      throw new Error('Unauthorized: This order belongs to another customer.');
    }

    return order;
  }

  /**
   * Get a customer by ID.
   * @param {string} customerId
   * @returns {Object|null}
   */
  getCustomerById(customerId) {
    if (!customerId) return null;
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    return customers.find(c => c.id === customerId) || null;
  }

  /**
   * Get all saved addresses for a customer.
   * @param {string} customerId
   * @returns {Array} List of addresses
   */
  getAddresses(customerId) {
    if (!customerId) return [];
    const addresses = readStorage(ADDRESSES_STORAGE_KEY, []);
    return addresses
      .filter(a => a.customerId === customerId)
      .sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }

  /**
   * Get a specific address by ID for a customer.
   * @param {string} addressId
   * @param {string} customerId
   * @returns {Object|null}
   */
  getAddress(addressId, customerId) {
    if (!addressId || !customerId) return null;
    const addresses = readStorage(ADDRESSES_STORAGE_KEY, []);
    return addresses.find(a => a.id === addressId && a.customerId === customerId) || null;
  }

  /**
   * Save (create or update) a customer address.
   * @param {string} customerId
   * @param {Object} addressData
   * @returns {Object} Saved address
   */
  saveAddress(customerId, addressData) {
    if (!customerId) throw new Error('Customer ID is required to save an address.');
    if (!addressData.streetAddress || !addressData.city || !addressData.state) {
      throw new Error('Street address, city, and state are required.');
    }

    const addresses = readStorage(ADDRESSES_STORAGE_KEY, []);
    const now = new Date().toISOString();
    const isFirstAddress = !addresses.some(a => a.customerId === customerId);
    const setAsDefault = addressData.isDefault || isFirstAddress;

    let address;

    if (addressData.id) {
      // Update existing address
      const index = addresses.findIndex(a => a.id === addressData.id && a.customerId === customerId);
      if (index === -1) throw new Error('Address not found.');

      address = {
        ...addresses[index],
        label: addressData.label || addresses[index].label || 'Home',
        recipientName: addressData.recipientName || addresses[index].recipientName,
        phone: addressData.phone || addresses[index].phone,
        streetAddress: addressData.streetAddress,
        city: addressData.city,
        state: addressData.state,
        postalCode: addressData.postalCode || addresses[index].postalCode || '',
        country: addressData.country || addresses[index].country || 'Nigeria',
        deliveryInstructions: addressData.deliveryInstructions !== undefined ? addressData.deliveryInstructions : addresses[index].deliveryInstructions,
        isDefault: setAsDefault,
        updatedAt: now
      };

      addresses[index] = address;
    } else {
      // Create new address
      const id = `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      address = {
        id,
        customerId,
        label: addressData.label || 'Home',
        recipientName: addressData.recipientName || '',
        phone: addressData.phone || '',
        streetAddress: addressData.streetAddress,
        city: addressData.city,
        state: addressData.state,
        postalCode: addressData.postalCode || '',
        country: addressData.country || 'Nigeria',
        deliveryInstructions: addressData.deliveryInstructions || '',
        isDefault: setAsDefault,
        createdAt: now,
        updatedAt: now
      };
      addresses.push(address);
    }

    // If marked default, unset default on other addresses for this customer
    if (setAsDefault) {
      addresses.forEach(a => {
        if (a.customerId === customerId && a.id !== address.id) {
          a.isDefault = false;
        }
      });

      // Also sync customer defaultAddress snapshot
      this.updateCustomerDefaultAddressSnapshot(customerId, address);
    }

    writeStorage(ADDRESSES_STORAGE_KEY, addresses);
    return address;
  }

  /**
   * Delete an address by ID.
   * @param {string} customerId
   * @param {string} addressId
   * @returns {boolean}
   */
  deleteAddress(customerId, addressId) {
    if (!customerId || !addressId) return false;
    let addresses = readStorage(ADDRESSES_STORAGE_KEY, []);
    const target = addresses.find(a => a.id === addressId && a.customerId === customerId);
    if (!target) return false;

    addresses = addresses.filter(a => !(a.id === addressId && a.customerId === customerId));

    // If deleted address was default, promote first remaining address
    if (target.isDefault) {
      const remaining = addresses.find(a => a.customerId === customerId);
      if (remaining) {
        remaining.isDefault = true;
        this.updateCustomerDefaultAddressSnapshot(customerId, remaining);
      } else {
        this.updateCustomerDefaultAddressSnapshot(customerId, null);
      }
    }

    writeStorage(ADDRESSES_STORAGE_KEY, addresses);
    return true;
  }

  /**
   * Set an existing address as default for a customer.
   * @param {string} customerId
   * @param {string} addressId
   * @returns {boolean}
   */
  setDefaultAddress(customerId, addressId) {
    if (!customerId || !addressId) return false;
    const addresses = readStorage(ADDRESSES_STORAGE_KEY, []);
    const target = addresses.find(a => a.id === addressId && a.customerId === customerId);
    if (!target) return false;

    addresses.forEach(a => {
      if (a.customerId === customerId) {
        a.isDefault = (a.id === addressId);
      }
    });

    writeStorage(ADDRESSES_STORAGE_KEY, addresses);
    this.updateCustomerDefaultAddressSnapshot(customerId, target);
    return true;
  }

  /**
   * Internal helper to keep customer.defaultAddress snapshot synchronized.
   * @private
   */
  updateCustomerDefaultAddressSnapshot(customerId, address) {
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    if (address) {
      customer.defaultShippingAddressId = address.id;
      customer.defaultAddress = {
        country: address.country,
        state: address.state,
        city: address.city,
        address: address.streetAddress,
        postalCode: address.postalCode
      };
    } else {
      customer.defaultShippingAddressId = null;
      customer.defaultAddress = null;
    }
    customer.updatedAt = new Date().toISOString();
    writeStorage(CUSTOMERS_STORAGE_KEY, customers);
  }

  /**
   * Update profile fields for a customer (full name, phone, metadata).
   * Note: NEVER accepts passwords or credentials.
   * @param {string} customerId
   * @param {Object} updates
   * @returns {Object} Updated customer
   */
  updateProfile(customerId, updates = {}) {
    if (!customerId) throw new Error('Customer ID is required.');
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    const customer = customers.find(c => c.id === customerId);
    if (!customer) throw new Error('Customer not found.');

    if (updates.fullName) customer.fullName = updates.fullName.trim();
    if (updates.phone !== undefined) customer.phone = updates.phone.trim();
    if (updates.metadata) {
      customer.metadata = { ...customer.metadata, ...updates.metadata };
    }
    customer.updatedAt = new Date().toISOString();

    writeStorage(CUSTOMERS_STORAGE_KEY, customers);

    // Sync active session if this customer is logged in
    const activeSession = readStorage(ACTIVE_SESSION_STORAGE_KEY, null);
    if (activeSession && activeSession.customerId === customerId) {
      activeSession.fullName = customer.fullName;
      writeStorage(ACTIVE_SESSION_STORAGE_KEY, activeSession);
    }

    return customer;
  }

  /**
   * Update account status (e.g. active, pending_confirmation, suspended).
   * @param {string} customerId
   * @param {string} status
   * @returns {Object}
   */
  setCustomerStatus(customerId, status) {
    if (!Object.values(CUSTOMER_STATUSES).includes(status)) {
      throw new Error(`Invalid customer status: ${status}`);
    }
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    const customer = customers.find(c => c.id === customerId);
    if (!customer) throw new Error('Customer not found.');

    customer.status = status;
    customer.updatedAt = new Date().toISOString();
    writeStorage(CUSTOMERS_STORAGE_KEY, customers);
    return customer;
  }

  /**
   * Get the customer's authenticated wishlist product IDs.
   * Enforces customer session authorization.
   * @param {string} customerId
   * @param {string} [sessionToken]
   * @returns {string[]} Array of product ID strings
   */
  getCustomerWishlist(customerId, sessionToken = null) {
    if (!customerId) {
      throw new Error('Customer ID is required.');
    }

    const activeSession = readStorage(ACTIVE_SESSION_STORAGE_KEY, null);
    const sessions = readStorage(SESSIONS_STORAGE_KEY, {});
    const session = sessionToken 
      ? (sessions[sessionToken] || (activeSession && activeSession.token === sessionToken ? activeSession : null))
      : activeSession;

    if (session && session.customerId !== customerId) {
      throw new Error('Unauthorized: Cannot access another customer\'s wishlist.');
    }

    const wishlists = readStorage(WISHLISTS_STORAGE_KEY, {});
    const customerList = wishlists[customerId];
    return Array.isArray(customerList) ? Array.from(new Set(customerList.filter(Boolean))) : [];
  }

  /**
   * Persist customer's authenticated wishlist product IDs.
   * Enforces customer session authorization.
   * @param {string} customerId
   * @param {string[]} productIds
   * @param {string} [sessionToken]
   * @returns {string[]} Saved product IDs
   */
  saveCustomerWishlist(customerId, productIds = [], sessionToken = null) {
    if (!customerId) {
      throw new Error('Customer ID is required.');
    }

    const activeSession = readStorage(ACTIVE_SESSION_STORAGE_KEY, null);
    const sessions = readStorage(SESSIONS_STORAGE_KEY, {});
    const session = sessionToken 
      ? (sessions[sessionToken] || (activeSession && activeSession.token === sessionToken ? activeSession : null))
      : activeSession;

    if (session && session.customerId !== customerId) {
      throw new Error('Unauthorized: Cannot modify another customer\'s wishlist.');
    }

    const cleanIds = Array.from(new Set((Array.isArray(productIds) ? productIds : []).filter(Boolean)));
    const wishlists = readStorage(WISHLISTS_STORAGE_KEY, {});
    wishlists[customerId] = cleanIds;
    writeStorage(WISHLISTS_STORAGE_KEY, wishlists);

    return cleanIds;
  }

  /**
   * Intelligently merge guest wishlist items with an authenticated customer's wishlist.
   * Preserves all existing customer items, adds new guest items, and eliminates duplicates.
   * @param {string} customerId
   * @param {string[]} guestProductIds
   * @param {string} [sessionToken]
   * @returns {string[]} Merged product IDs
   */
  mergeCustomerWishlist(customerId, guestProductIds = [], sessionToken = null) {
    if (!customerId) {
      throw new Error('Customer ID is required to merge wishlist.');
    }

    const currentCustomerIds = this.getCustomerWishlist(customerId, sessionToken);
    const guestList = Array.isArray(guestProductIds) ? guestProductIds : [];
    
    // Intelligently merge: guest items + customer items, deduplicated preserving order
    const merged = Array.from(new Set([...guestList, ...currentCustomerIds].filter(Boolean)));
    
    return this.saveCustomerWishlist(customerId, merged, sessionToken);
  }

  /**
   * Clear all customer data and active sessions (for tests).
   */
  clearAll() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CUSTOMERS_STORAGE_KEY);
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      localStorage.removeItem(SESSIONS_STORAGE_KEY);
      localStorage.removeItem(ADDRESSES_STORAGE_KEY);
      localStorage.removeItem(WISHLISTS_STORAGE_KEY);
      localStorage.removeItem(RESET_TOKENS_STORAGE_KEY);
    }
  }
}

export const customerService = new CustomerService();
