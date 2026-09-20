/**
 * Customer Authentication & Account Service - Slimky Hair
 * Milestone C19 & C20: Customer Accounts, Order History Authorization & Linking
 * Phase 1 (Backend Integration): Real Customer Identity
 *
 * Identity (register / login / logout / session / password reset) is backed
 * by real Supabase Auth — see js/supabase-client.js. This is the source of
 * truth; there is no local password store and no way to "log in" without a
 * real, server-verified credential.
 *
 * Everything else here (addresses, wishlists, order lookups/linking) still
 * reads/writes localStorage, keyed off the customer's id — which is now the
 * real Supabase auth.users UUID. Migrating those to the `customers` /
 * `customer_addresses` / `customer_wishlists` / `orders` tables is a later
 * phase; this file's job right now is making sure *who the customer is* can
 * never be spoofed or bypassed client-side.
 *
 * Security Principles:
 * - Guest checkout requires NO account creation and creates NO dummy duplicate accounts.
 * - Authenticated customers have their orders linked to their customer ID.
 * - Historical guest orders can be securely connected when a customer registers with the same email.
 * - Orders are NEVER exposed merely by passing an email address; valid session token authorization is required.
 */

import { OrderStore } from '../payment/order-store.js';
import { isValidEmail } from '../utils/validators.js';
import { getSupabaseClient } from '../supabase-client.js';

const CUSTOMERS_STORAGE_KEY = 'slimky_customers'; // demo-seed fixture data only now (see initDemoCustomer)
const ADDRESSES_STORAGE_KEY = 'slimky_customer_addresses';
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
 * The localStorage key supabase-js persists the session under, derived the
 * same way the SDK derives it: `sb-<project-ref>-auth-token`, where the ref
 * is the first label of the configured Supabase host. Computed from
 * window.__SLIMKY_ENV__ so it works without importing/constructing the
 * Supabase client itself (most pages only need to READ login state).
 * @returns {string|null}
 */
function getSupabaseStorageKey() {
  try {
    const url = (typeof window !== 'undefined' && window.__SLIMKY_ENV__ && window.__SLIMKY_ENV__.SUPABASE_URL) || '';
    const host = String(url).replace(/^https?:\/\//, '').split('/')[0];
    const ref = host.split('.')[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

/**
 * Synchronously read the Supabase session supabase-js already persisted to
 * localStorage. This is what lets getCurrentCustomer() stay a plain
 * synchronous call for the ~20 files across the site that use it for "is
 * someone logged in" UI, without every page needing to load the Supabase
 * client library and await a network round trip just to render a nav badge.
 *
 * This is optimistic: it trusts locally-stored data for UI purposes only.
 * Every operation that actually matters (reading another table via RLS,
 * mutating account state) goes through the real Supabase client and is
 * re-verified server-side regardless of what this returns.
 * @returns {Object|null} Supabase Session-shaped object, or null
 */
function readSupabaseSessionFromStorage() {
  const key = getSupabaseStorageKey();
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.access_token || !session.user) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Map a Supabase Auth user object onto the customer shape the rest of this
 * app (addresses, wishlists, order lookups, account UI) already expects.
 * @param {Object} user Supabase auth.users-shaped object
 * @returns {Object}
 */
function mapUserToCustomer(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    authUserId: user.id,
    email: user.email || '',
    fullName: meta.full_name || meta.fullName || '',
    phone: meta.phone || '',
    status: user.email_confirmed_at || user.confirmed_at ? CUSTOMER_STATUSES.ACTIVE : CUSTOMER_STATUSES.PENDING_CONFIRMATION,
    defaultShippingAddressId: null,
    defaultAddress: null,
    metadata: {},
    createdAt: user.created_at,
    updatedAt: user.updated_at || user.created_at
  };
}

/**
 * Map a `customer_addresses` row (snake_case DB columns) onto the camelCase
 * shape account-addresses.js / checkout.js already render.
 * @param {Object} row
 * @returns {Object}
 */
function mapAddressRow(row) {
  return {
    id: String(row.id),
    customerId: row.customer_id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    streetAddress: row.street_address,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code || '',
    country: row.country,
    deliveryInstructions: row.delivery_instructions || '',
    isDefault: !!row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Best-effort background mirror of a customer's wishlist into the real
 * `customer_wishlists` table (Phase 5). Never awaited by its caller, never
 * throws — the synchronous localStorage cache (WISHLISTS_STORAGE_KEY) stays
 * the source of truth for the site-wide synchronous read path
 * (js/wishlist-store.js is called from product-card click handlers on
 * every page; it cannot become async without rewriting rendering site-wide).
 * Silently does nothing on any page that hasn't loaded the Supabase vendor
 * library / env config — this only actually runs on pages that have them
 * (account, checkout, login/register).
 * @param {string} customerId
 * @param {string[]} productIds
 */
function pushWishlistToBackend(customerId, productIds) {
  (async () => {
    try {
      const supabase = getSupabaseClient();
      const { error: deleteError } = await supabase.from('customer_wishlists').delete().eq('customer_id', customerId);
      if (deleteError) {
        console.warn('[CustomerService] wishlist backend sync notice:', deleteError.message);
        return;
      }
      if (productIds.length > 0) {
        const rows = productIds.map(productId => ({ customer_id: customerId, product_id: productId }));
        const { error: insertError } = await supabase.from('customer_wishlists').insert(rows);
        if (insertError) console.warn('[CustomerService] wishlist backend sync notice:', insertError.message);
      }
    } catch {
      // Vendor library / env not loaded on this page, or network unavailable.
    }
  })();
}

/**
 * Best-effort pull of a customer's server-stored wishlist (e.g. saved from
 * another device/browser). Returns [] on any failure — callers merge this
 * with whatever the local cache already has, so a failed pull never loses
 * local data.
 * @param {string} customerId
 * @returns {Promise<string[]>}
 */
async function pullWishlistFromBackend(customerId) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('customer_wishlists').select('product_id').eq('customer_id', customerId);
    if (error) return [];
    return (data || []).map(r => r.product_id).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Decide whether demo fixture data may be seeded in this runtime (A12).
 *
 * - Explicit `localStorage slimky_demo_seed = "off"` always wins (operators).
 * - Explicit `window.__SLIMKY_SEED_DEMO__ === true` always seeds (CI/QA).
 * - Otherwise: seed on dev origins (localhost, loopback, .local, private LAN,
 *   file://, empty hostname) and in non-browser runtimes (Node test suites).
 *   Real production hosts never match, so a launch can never show fixture
 *   customers, addresses or orders as if they were business data.
 *
 * @returns {boolean}
 */
export function shouldSeedDemoData() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('slimky_demo_seed') === 'off') {
      return false;
    }
  } catch { /* storage unavailable — fall through to origin checks */ }
  if (typeof window !== 'undefined') {
    if (window.__SLIMKY_SEED_DEMO__ === true) return true;
    const host = String(window.location?.hostname || '').toLowerCase();
    if (host === '' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    if (host.endsWith('.local') || host.endsWith('.localhost')) return true;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return true;
    return false;
  }
  return true;
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
   * Listen for storage changes across tabs to sync auth state. Watches
   * Supabase's own persisted session key, so a login/logout/token refresh in
   * one tab is reflected in every other open tab on this origin.
   */
  bindStorageListener() {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', (e) => {
        const key = getSupabaseStorageKey();
        if (key && e.key === key) {
          const customer = this.getCurrentCustomer();
          this.notifyAuthStateChange(customer, null);
        }
      });
    }
  }

  /**
   * Seed baseline DEMO FIXTURE data for local testing — addresses and a
   * sample order only. This does NOT create a real, sign-in-able account:
   * customer identity is Supabase Auth now, and there is no local password
   * store to seed a matching login for. The "Fill Demo Credentials" helper
   * on the login page fills a placeholder email/password that will fail
   * against real Supabase Auth unless a matching user has been created
   * there (Supabase dashboard / seed script) — a known limitation carried
   * forward from the Phase 1 identity migration, not a regression to "fix"
   * by re-introducing a local password bypass.
   */
  initDemoCustomer() {
    if (!shouldSeedDemoData()) return;
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    const addresses = readStorage(ADDRESSES_STORAGE_KEY, []);
    const demoCustId = 'cust_demo_chioma_01';
    const now = new Date().toISOString();

    if (!customers.some(c => c.email && c.email.toLowerCase() === 'chioma.demo@slimkyhair.com')) {
      const demoCust = {
        id: demoCustId,
        authUserId: null,
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
    }

    if (!addresses.some(a => a.customerId === demoCustId)) {
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

    // Seed sample order for Chioma so QA testing immediately shows populated orders & tracking
    const orders = readStorage('slimky_orders', []);
    if (!orders.some(o => o.customerId === demoCustId)) {
      const demoOrder = {
        id: 'ORD-DEMO-CHIOMA-01',
        orderNumber: 'SLM-20260910-CH01',
        customerId: demoCustId,
        orderStatus: 'delivered',
        paymentStatus: 'successful',
        currency: 'NGN',
        subtotal: 76000,
        shippingFee: 3500,
        total: 79500,
        customer: {
          fullName: 'Chioma E. Okonkwo',
          email: 'chioma.demo@slimkyhair.com',
          phone: '+234 803 123 4567'
        },
        shippingAddress: {
          streetAddress: '14 Admiralty Way',
          city: 'Ikeja',
          state: 'Lagos',
          country: 'Nigeria',
          postalCode: '100001'
        },
        items: [
          {
            id: 'item-01',
            productId: 'prod-01',
            variantId: 'var-01-50',
            productName: 'Botanical Hydrating Shampoo',
            variantName: '50ml',
            unitPrice: 38000,
            quantity: 2,
            subtotal: 76000,
            sku: 'SLM-BHS-50'
          }
        ],
        tracking: {
          carrier: 'GIG Logistics',
          trackingNumber: 'GIG-LAG-982341',
          status: 'Delivered'
        },
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: now
      };
      orders.push(demoOrder);
      writeStorage('slimky_orders', orders);
    }
  }

  /**
   * Whether an email is already registered. Supabase Auth's signUp API is
   * deliberately enumeration-safe (an existing, confirmed email returns the
   * same shape as a new one — see registerCustomer), so this can no longer
   * be answered without attempting an actual auth operation. Kept as a
   * no-op returning false for API compatibility with existing callers (used
   * for an inline "email already in use" hint during live validation); the
   * authoritative check now happens at submission time in registerCustomer.
   * @param {string} email
   * @returns {boolean}
   */
  isEmailRegistered(_email) {
    return false;
  }

  /**
   * Register a new customer account via real Supabase Auth.
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.fullName
   * @param {string} params.password
   * @param {string} [params.phone]
   * @param {boolean} [params.throwOnExisting=false] Present for API compatibility; registration
   *   now always throws on an existing account since there is no local session to silently log into.
   * @returns {Promise<{ customer: Object, sessionToken: string|null, linkedOrdersCount: number, alreadyRegistered: boolean }>}
   */
  async registerCustomer({ email, fullName, phone = '', password }) {
    if (!email || !fullName) {
      throw new Error('Email and full name are required to create an account.');
    }
    if (!password) {
      throw new Error('Password is required to create an account.');
    }
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      throw new Error(strength.message);
    }

    const normEmail = email.trim().toLowerCase();
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.signUp({
      email: normEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone: phone.trim()
        }
      }
    });

    if (error) {
      throw new Error(error.message || 'Unable to create your account. Please try again.');
    }

    // Supabase's anti-enumeration behavior: signing up an email that already
    // has a confirmed account returns success with an empty `identities`
    // array rather than an error. This is the documented way to detect it.
    if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
      throw new Error('An account with this email address already exists. Please sign in instead.');
    }

    const customer = mapUserToCustomer(data.user);

    // Connect eligible historical guest orders matching this verified email (Milestone C19)
    const linkedCount = this.linkHistoricalOrders(customer.id, customer.email);

    // Associate existing guest wishlist with newly registered account (Milestone C19.8)
    try {
      if (typeof localStorage !== 'undefined') {
        const rawWishlist = localStorage.getItem('slimky_hair_wishlist');
        if (rawWishlist) {
          const guestWishlist = JSON.parse(rawWishlist);
          if (Array.isArray(guestWishlist) && guestWishlist.length > 0) {
            this.saveCustomerWishlist(customer.id, guestWishlist);
          }
        }
      }
    } catch (e) {
      console.warn('[CustomerService] Wishlist registration notice:', e);
    }

    return {
      customer,
      sessionToken: data.session?.access_token || null,
      linkedOrdersCount: linkedCount,
      alreadyRegistered: false
    };
  }

  /**
   * Resend the account confirmation email via Supabase Auth.
   * @param {string} email
   * @returns {Promise<{ success: boolean }>}
   */
  async resendConfirmationEmail(email) {
    if (!email) throw new Error('Email address is required to resend confirmation.');
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
    if (error) {
      throw new Error(error.message || 'Unable to resend confirmation email.');
    }
    return { success: true };
  }

  /**
   * Log in an existing customer via real Supabase Auth.
   * Can be called with (email, password) or ({ email, password, rememberMe })
   * @param {string|Object} emailOrParams
   * @param {string} [passwordParam]
   * @returns {Promise<{ customer: Object, sessionToken: string|null }>}
   */
  async loginCustomer(emailOrParams, passwordParam = '') {
    let email = '';
    let password = '';

    if (typeof emailOrParams === 'object' && emailOrParams !== null) {
      email = emailOrParams.email || '';
      password = emailOrParams.password || '';
    } else {
      email = emailOrParams || '';
      password = passwordParam || '';
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

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: normEmail, password });

    if (error) {
      if (/email not confirmed/i.test(error.message || '')) {
        throw new Error('Please confirm your email address before signing in. Check your inbox for the confirmation email.');
      }
      throw new Error('Invalid email or password. Please check your credentials and try again.');
    }

    const customer = mapUserToCustomer(data.user);

    // Phase 5: pull any wishlist items saved server-side (e.g. from another
    // device/browser) into this device's local cache first, so the guest
    // merge below sees the customer's full wishlist, not just whatever this
    // browser happened to have cached locally.
    try {
      const remoteIds = await pullWishlistFromBackend(customer.id);
      if (remoteIds.length > 0) {
        const localIds = this.getCustomerWishlist(customer.id);
        const merged = Array.from(new Set([...remoteIds, ...localIds]));
        if (merged.length !== localIds.length) {
          this.saveCustomerWishlist(customer.id, merged);
        }
      }
    } catch (e) {
      console.warn('[CustomerService] Wishlist backend pull notice:', e);
    }

    // Intelligently merge guest wishlist with customer account wishlist (Milestone C19.8)
    try {
      if (typeof localStorage !== 'undefined') {
        const rawWishlist = localStorage.getItem('slimky_hair_wishlist');
        const guestWishlist = rawWishlist ? JSON.parse(rawWishlist) : [];
        if (Array.isArray(guestWishlist) && guestWishlist.length > 0) {
          const merged = this.mergeCustomerWishlist(customer.id, guestWishlist);
          localStorage.setItem('slimky_hair_wishlist', JSON.stringify(merged));
        } else {
          // If guest wishlist is empty, restore customer's existing saved items to active localStorage
          const customerWishlist = this.getCustomerWishlist(customer.id);
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

    this.notifyAuthStateChange(customer, data.session);

    return {
      customer,
      sessionToken: data.session?.access_token || null
    };
  }

  /**
   * Log out the current active customer session via real Supabase Auth.
   * Also clears the active-session wishlist so items never leak to guest or
   * subsequent customer on a shared device.
   */
  async logoutCustomer() {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) console.warn('[CustomerService] Supabase sign-out error:', error);
    } catch (err) {
      // Vendor library / env not loaded on this page, or network unavailable.
      // Fall through and clear what we can locally so the UI still reflects logout.
      console.warn('[CustomerService] Sign-out request could not be sent:', err.message);
    }

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
   * Get the currently logged-in customer, or null if guest / no session.
   * Synchronous — see readSupabaseSessionFromStorage() for what this trusts
   * and why that's safe for UI purposes only.
   * @returns {Object|null}
   */
  getCurrentCustomer() {
    const session = readSupabaseSessionFromStorage();
    if (!session) return null;
    return mapUserToCustomer(session.user);
  }

  /**
   * Check if a customer is currently authenticated with a valid session.
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.getCurrentCustomer();
  }

  /**
   * Get the active session's access token, if any.
   * @returns {string|null}
   */
  getSessionToken() {
    const session = readSupabaseSessionFromStorage();
    return session?.access_token || null;
  }

  /**
   * Request a password reset email via real Supabase Auth.
   * Enumeration-safe: Supabase does not error for an unknown email, so this
   * always returns the same neutral success message.
   * @param {string} email
   * @param {string} [storeUrl='./'] Relative path to the site root, used to build the redirect URL.
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async requestPasswordReset(email, storeUrl = './') {
    if (!email || !email.trim()) {
      throw new Error('Email address is required to reset your password.');
    }
    const normEmail = email.trim().toLowerCase();
    if (!isValidEmail(normEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    const supabase = getSupabaseClient();
    let redirectTo;
    try {
      redirectTo = new URL(`${storeUrl}account/reset-password/`, window.location.href).toString();
    } catch {
      redirectTo = undefined;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(normEmail, redirectTo ? { redirectTo } : undefined);
    if (error) {
      // Do not leak whether the email exists; log for operators only.
      console.warn('[CustomerService] resetPasswordForEmail notice:', error.message);
    }

    return {
      success: true,
      message: "If an account exists for this email address, we'll send instructions to reset your password."
    };
  }

  /**
   * Complete a password reset. Must be called on the page the reset email's
   * link lands on — Supabase's client auto-detects the recovery token in
   * the URL (detectSessionInUrl: true) and establishes a temporary recovery
   * session before this runs; there is no separate token to pass in.
   * @param {Object} params
   * @param {string} params.newPassword
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async resetPasswordWithToken({ newPassword }) {
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      throw new Error(strength.message);
    }

    const supabase = getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      throw new Error('This password reset link is invalid or has expired. Please request a new one.');
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message || 'Failed to update password. Please try again.');
    }

    // Require a fresh sign-in with the new password rather than leaving the
    // one-time recovery session active.
    await supabase.auth.signOut();

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
   * 4. Enforces password security requirements.
   * 5. Resolves the account through real Supabase Auth: tries signing in with the
   *    supplied password first (covers "this email already has an account and this
   *    is really them"), and only creates a new account if that fails. This means a
   *    stranger cannot take over someone else's account merely by submitting their
   *    email on this form — they'd need the real password either way.
   * 6. Links order in-place without duplication or data loss.
   *
   * @param {Object} params
   * @param {string} params.orderId
   * @param {string} params.securityToken
   * @param {string} [params.fullName]
   * @param {string} params.email
   * @param {string} [params.phone]
   * @param {string} params.password
   * @returns {Promise<{ success: boolean, customer: Object, order: Object, sessionToken: string|null, isNewAccount: boolean }>}
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
          sessionToken: this.getSessionToken(),
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

    // 5. Resolve the account: try signing in first (this proves ownership of
    // an existing account), only creating a new one if that fails.
    const supabase = getSupabaseClient();
    let user = null;
    let isNewAccount = false;

    const signInAttempt = await supabase.auth.signInWithPassword({ email: normEmail, password });
    if (signInAttempt.data?.user) {
      user = signInAttempt.data.user;
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: normEmail,
        password,
        options: {
          data: {
            full_name: (fullName || order.customer?.fullName || '').trim(),
            phone: (phone || order.customer?.phone || '').trim()
          }
        }
      });
      if (error) {
        throw new Error(error.message || 'Unable to create your account.');
      }
      if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
        throw new Error('An account already exists with this email address, but that password doesn\'t match it. Please sign in first, then link this order from your account.');
      }
      user = data.user;
      isNewAccount = true;
    }

    const customer = mapUserToCustomer(user);

    // 6. Auto-save delivery address if new customer has no saved address
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

    // 7. Link the specific order (Order remains completely intact, customerId set, isGuest = false)
    const updatedOrder = OrderStore.linkOrderToCustomer(order.id, customer.id);

    // 8. Sync any guest wishlist items to the newly authenticated customer account
    try {
      // Pull server-stored items first (relevant when this resolved to an
      // EXISTING account via sign-in above) so the merge below can't wipe
      // them out — saveCustomerWishlist/mergeCustomerWishlist replace the
      // backend list wholesale on every write.
      const remoteIds = await pullWishlistFromBackend(customer.id);
      if (remoteIds.length > 0) {
        const localIds = this.getCustomerWishlist(customer.id);
        this.saveCustomerWishlist(customer.id, Array.from(new Set([...remoteIds, ...localIds])));
      }

      if (typeof localStorage !== 'undefined') {
        const rawWishlist = localStorage.getItem('slimky_hair_wishlist');
        if (rawWishlist) {
          const guestWishlist = JSON.parse(rawWishlist);
          if (Array.isArray(guestWishlist) && guestWishlist.length > 0) {
            this.mergeCustomerWishlist(customer.id, guestWishlist);
          }
        }
      }
    } catch (e) {
      console.warn('[CustomerService] Wishlist conversion merge notice:', e);
    }

    // 9. Notify auth state change
    this.notifyAuthStateChange(customer, signInAttempt.data?.session || null);

    return {
      success: true,
      customer,
      order: updatedOrder || order,
      sessionToken: this.getSessionToken(),
      isNewAccount
    };
  }

  /**
   * Retrieve orders belonging to the customer.
   * SECURITY GUARANTEE:
   * Requires the caller to BE that authenticated customer right now.
   * Orders are NEVER returned merely by passing an arbitrary email address.
   * @param {string} customerId
   * @returns {Array} List of orders
   */
  getCustomerOrders(customerId) {
    if (!customerId) return [];
    const current = this.getCurrentCustomer();
    if (!current || current.id !== customerId) {
      throw new Error('Unauthorized: You can only view orders associated with your authenticated session.');
    }
    return OrderStore.getOrdersByCustomer(customerId);
  }

  /**
   * Retrieve a specific order with full authorization check.
   * @param {string} orderId
   * @param {string} customerId
   * @returns {Object} order
   */
  getOrderDetails(orderId, customerId) {
    if (!orderId || !customerId) {
      throw new Error('Order ID and Customer ID are required.');
    }

    const current = this.getCurrentCustomer();
    if (!current || current.id !== customerId) {
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
   * Get a customer by ID. Only ever resolves the currently authenticated
   * customer (there is no local customer table to look up strangers in
   * anymore) — kept for API compatibility with existing callers.
   * @param {string} customerId
   * @returns {Object|null}
   */
  getCustomerById(customerId) {
    if (!customerId) return null;
    const current = this.getCurrentCustomer();
    return current && current.id === customerId ? current : null;
  }

  /**
   * List every registered customer record, stripped of any credential material.
   *
   * NOTE (Phase 1 gap): the customer directory now lives in Supabase Auth /
   * `profiles`, which this localStorage-only method cannot see. This is a
   * Phase 2 (admin backend integration) concern — the admin backoffice does
   * not yet query Supabase for the real customer list. Returns the demo
   * fixture only for now.
   * @returns {Array<Object>} Sanitized customer records
   */
  listAllCustomers() {
    const customers = readStorage(CUSTOMERS_STORAGE_KEY, []);
    if (!Array.isArray(customers)) return [];
    return customers.map(c => ({
      id: c.id,
      email: c.email,
      fullName: c.fullName,
      phone: c.phone,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));
  }

  /**
   * Get all saved addresses for a customer, from the real `customer_addresses`
   * table (Phase 5). RLS (addresses_customer_all) scopes rows to the caller's
   * own customer_id already; the WHERE clause here is belt-and-suspenders and
   * keeps the method's own contract explicit.
   * @param {string} customerId
   * @returns {Promise<Array>} List of addresses
   */
  async getAddresses(customerId) {
    if (!customerId) return [];
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[CustomerService] getAddresses failed:', error.message);
      return [];
    }
    return (data || []).map(mapAddressRow);
  }

  /**
   * Get a specific address by ID for a customer.
   * @param {string} addressId
   * @param {string} customerId
   * @returns {Promise<Object|null>}
   */
  async getAddress(addressId, customerId) {
    if (!addressId || !customerId) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('id', addressId)
      .eq('customer_id', customerId)
      .maybeSingle();
    if (error || !data) return null;
    return mapAddressRow(data);
  }

  /**
   * Save (create or update) a customer address.
   * @param {string} customerId
   * @param {Object} addressData
   * @returns {Promise<Object>} Saved address
   */
  async saveAddress(customerId, addressData) {
    if (!customerId) throw new Error('Customer ID is required to save an address.');
    if (!addressData.streetAddress || !addressData.city || !addressData.state) {
      throw new Error('Street address, city, and state are required.');
    }

    const supabase = getSupabaseClient();
    const existing = await this.getAddresses(customerId);
    const isFirstAddress = existing.length === 0;
    const setAsDefault = addressData.isDefault || isFirstAddress;

    // If this address will be default, unset default on the others first —
    // customer_addresses has no partial-unique-index enforcing "one default",
    // so this is a two-step best-effort sequence, not an atomic transaction.
    if (setAsDefault) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', customerId)
        .neq('id', addressData.id || 0);
    }

    const row = {
      customer_id: customerId,
      label: addressData.label || 'Home',
      recipient_name: addressData.recipientName || '',
      phone: addressData.phone || '',
      street_address: addressData.streetAddress,
      city: addressData.city,
      state: addressData.state,
      postal_code: addressData.postalCode || null,
      country: addressData.country || 'Nigeria',
      delivery_instructions: addressData.deliveryInstructions || null,
      is_default: setAsDefault
    };

    if (addressData.id) {
      const { data, error } = await supabase
        .from('customer_addresses')
        .update(row)
        .eq('id', addressData.id)
        .eq('customer_id', customerId)
        .select()
        .maybeSingle();
      if (error || !data) throw new Error(error?.message || 'Address not found.');
      return mapAddressRow(data);
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message || 'Unable to save address.');
    return mapAddressRow(data);
  }

  /**
   * Delete an address by ID.
   * @param {string} customerId
   * @param {string} addressId
   * @returns {Promise<boolean>}
   */
  async deleteAddress(customerId, addressId) {
    if (!customerId || !addressId) return false;
    const supabase = getSupabaseClient();

    const { data: target } = await supabase
      .from('customer_addresses')
      .select('is_default')
      .eq('id', addressId)
      .eq('customer_id', customerId)
      .maybeSingle();
    if (!target) return false;

    const { error } = await supabase
      .from('customer_addresses')
      .delete()
      .eq('id', addressId)
      .eq('customer_id', customerId);
    if (error) return false;

    if (target.is_default) {
      const { data: remaining } = await supabase
        .from('customer_addresses')
        .select('id')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (remaining) {
        await supabase.from('customer_addresses').update({ is_default: true }).eq('id', remaining.id);
      }
    }

    return true;
  }

  /**
   * Set an existing address as default for a customer.
   * @param {string} customerId
   * @param {string} addressId
   * @returns {Promise<boolean>}
   */
  async setDefaultAddress(customerId, addressId) {
    if (!customerId || !addressId) return false;
    const supabase = getSupabaseClient();

    const { data: target } = await supabase
      .from('customer_addresses')
      .select('id')
      .eq('id', addressId)
      .eq('customer_id', customerId)
      .maybeSingle();
    if (!target) return false;

    await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', customerId);
    const { error } = await supabase.from('customer_addresses').update({ is_default: true }).eq('id', addressId);
    return !error;
  }

  /**
   * Update profile fields (full name, phone) for the currently authenticated
   * customer, persisted to Supabase Auth user metadata.
   * @param {string} customerId Must match the currently authenticated customer.
   * @param {Object} updates
   * @returns {Promise<Object>} Updated customer
   */
  async updateProfile(customerId, updates = {}) {
    if (!customerId) throw new Error('Customer ID is required.');
    const current = this.getCurrentCustomer();
    if (!current || current.id !== customerId) {
      throw new Error('Unauthorized: You can only update your own profile.');
    }

    const metaPatch = {};
    if (updates.fullName) metaPatch.full_name = updates.fullName.trim();
    if (updates.phone !== undefined) metaPatch.phone = updates.phone.trim();

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.updateUser({ data: metaPatch });
    if (error) {
      throw new Error(error.message || 'Unable to update your profile.');
    }

    // Best-effort mirror into public.profiles so full_name/phone are
    // queryable from SQL without reaching into JWT metadata (see
    // supabase/migrations/20260920120000_profiles_phone.sql). RLS
    // (profiles_self_update) permits this: the row's own owner may update
    // its non-role, non-is_active columns.
    try {
      const profilePatch = {};
      if (metaPatch.full_name !== undefined) profilePatch.full_name = metaPatch.full_name;
      if (metaPatch.phone !== undefined) profilePatch.phone = metaPatch.phone;
      if (Object.keys(profilePatch).length > 0) {
        const { error: profileError } = await supabase.from('profiles').update(profilePatch).eq('id', customerId);
        if (profileError) console.warn('[CustomerService] profiles mirror update notice:', profileError.message);
      }
    } catch (err) {
      console.warn('[CustomerService] profiles mirror update notice:', err.message);
    }

    const customer = mapUserToCustomer(data.user);
    this.notifyAuthStateChange(customer, null);
    return customer;
  }

  /**
   * Get the customer's authenticated wishlist product IDs.
   * Enforces that the caller IS the currently authenticated customer.
   * @param {string} customerId
   * @returns {string[]} Array of product ID strings
   */
  getCustomerWishlist(customerId) {
    if (!customerId) {
      throw new Error('Customer ID is required.');
    }

    const current = this.getCurrentCustomer();
    if (current && current.id !== customerId) {
      throw new Error('Unauthorized: Cannot access another customer\'s wishlist.');
    }

    const wishlists = readStorage(WISHLISTS_STORAGE_KEY, {});
    const customerList = wishlists[customerId];
    return Array.isArray(customerList) ? Array.from(new Set(customerList.filter(Boolean))) : [];
  }

  /**
   * Persist customer's authenticated wishlist product IDs.
   * Enforces that the caller IS the currently authenticated customer.
   * @param {string} customerId
   * @param {string[]} productIds
   * @returns {string[]} Saved product IDs
   */
  saveCustomerWishlist(customerId, productIds = []) {
    if (!customerId) {
      throw new Error('Customer ID is required.');
    }

    const current = this.getCurrentCustomer();
    if (current && current.id !== customerId) {
      throw new Error('Unauthorized: Cannot modify another customer\'s wishlist.');
    }

    const cleanIds = Array.from(new Set((Array.isArray(productIds) ? productIds : []).filter(Boolean)));
    const wishlists = readStorage(WISHLISTS_STORAGE_KEY, {});
    wishlists[customerId] = cleanIds;
    writeStorage(WISHLISTS_STORAGE_KEY, wishlists);

    // Best-effort, fire-and-forget mirror to the real backend — this method
    // must stay synchronous (called from product-card click handlers
    // site-wide), so this is never awaited here. See pushWishlistToBackend.
    pushWishlistToBackend(customerId, cleanIds);

    return cleanIds;
  }

  /**
   * Intelligently merge guest wishlist items with an authenticated customer's wishlist.
   * Preserves all existing customer items, adds new guest items, and eliminates duplicates.
   * @param {string} customerId
   * @param {string[]} guestProductIds
   * @returns {string[]} Merged product IDs
   */
  mergeCustomerWishlist(customerId, guestProductIds = []) {
    if (!customerId) {
      throw new Error('Customer ID is required to merge wishlist.');
    }

    const currentCustomerIds = this.getCustomerWishlist(customerId);
    const guestList = Array.isArray(guestProductIds) ? guestProductIds : [];

    // Intelligently merge: guest items + customer items, deduplicated preserving order
    const merged = Array.from(new Set([...guestList, ...currentCustomerIds].filter(Boolean)));

    return this.saveCustomerWishlist(customerId, merged);
  }

  /**
   * Clear all locally-stored customer data (demo fixtures, addresses,
   * wishlists). Does NOT sign out of Supabase Auth — call logoutCustomer()
   * for that. Kept for tests / QA reset tooling.
   */
  clearAll() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CUSTOMERS_STORAGE_KEY);
      localStorage.removeItem(ADDRESSES_STORAGE_KEY);
      localStorage.removeItem(WISHLISTS_STORAGE_KEY);
    }
  }
}

export const customerService = new CustomerService();
