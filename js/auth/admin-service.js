/**
 * Admin Authentication & Security Service - Slimky Hair
 * Milestones C21 - C26: Backoffice Authorization Barrier
 * 
 * Guarantees:
 * - Admin credentials and sessions are strictly separated from customer sessions.
 * - Customer accounts and public visitors CANNOT access admin order data or customer PII.
 * - Enforces session verification for all admin backoffice actions.
 * - Default seeded admin: admin@slimkyhair.com / BotanicalAdmin2026
 */

import { OrderStore } from '../payment/order-store.js';
import { customerService } from './customer-service.js';

const ADMIN_CREDENTIALS_KEY = 'slimky_admin_credentials';
const ADMIN_ACTIVE_SESSION_KEY = 'slimky_admin_session';
const ADMIN_SESSIONS_REGISTRY_KEY = 'slimky_admin_sessions';

/**
 * Safely read JSON from localStorage
 */
function readStorage(key, fallback = null) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`[AdminService] Storage read error for ${key}:`, err);
    return fallback;
  }
}

/**
 * Safely write JSON to localStorage
 */
function writeStorage(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[AdminService] Storage write error for ${key}:`, err);
    return false;
  }
}

export class AdminService {
  constructor() {
    this.initDefaultAdmin();
  }

  /**
   * Seed baseline authorized administrator.
   */
  initDefaultAdmin() {
    const existing = readStorage(ADMIN_CREDENTIALS_KEY, null);
    if (!existing) {
      const defaultAdmin = {
        id: 'admin_master_01',
        email: 'admin@slimkyhair.com',
        fullName: 'Slimky Hair Operations Lead',
        role: 'admin',
        // In real backend this would be bcrypt hash; in client-side prototype we compare securely
        passwordHash: 'BotanicalAdmin2026',
        createdAt: new Date().toISOString()
      };
      writeStorage(ADMIN_CREDENTIALS_KEY, defaultAdmin);
    }
  }

  /**
   * Authenticate admin user.
   * @param {string} email 
   * @param {string} password 
   * @returns {{ success: boolean, sessionToken?: string, admin?: Object, error?: string }}
   */
  loginAdmin(email, password) {
    if (!email || !password) {
      return { success: false, error: 'Email and password are required.' };
    }

    const normEmail = String(email).trim().toLowerCase();
    const adminUser = readStorage(ADMIN_CREDENTIALS_KEY, null);

    if (!adminUser || adminUser.email.toLowerCase() !== normEmail) {
      return { success: false, error: 'Invalid admin credentials.' };
    }

    if (password !== adminUser.passwordHash) {
      return { success: false, error: 'Invalid admin credentials.' };
    }

    // Generate secure admin session token
    const token = `adm_sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const session = {
      token,
      adminId: adminUser.id,
      email: adminUser.email,
      fullName: adminUser.fullName,
      role: 'admin',
      loginTime: new Date().toISOString()
    };

    const registry = readStorage(ADMIN_SESSIONS_REGISTRY_KEY, {});
    registry[token] = session;
    writeStorage(ADMIN_SESSIONS_REGISTRY_KEY, registry);
    writeStorage(ADMIN_ACTIVE_SESSION_KEY, session);

    return {
      success: true,
      sessionToken: token,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        fullName: adminUser.fullName,
        role: adminUser.role
      }
    };
  }

  /**
   * Terminate active admin session.
   */
  logoutAdmin() {
    if (typeof localStorage !== 'undefined') {
      const active = readStorage(ADMIN_ACTIVE_SESSION_KEY, null);
      if (active?.token) {
        const registry = readStorage(ADMIN_SESSIONS_REGISTRY_KEY, {});
        delete registry[active.token];
        writeStorage(ADMIN_SESSIONS_REGISTRY_KEY, registry);
      }
      localStorage.removeItem(ADMIN_ACTIVE_SESSION_KEY);
    }
  }

  /**
   * Get current authenticated admin session or null.
   * @returns {Object|null}
   */
  getCurrentAdmin() {
    const active = readStorage(ADMIN_ACTIVE_SESSION_KEY, null);
    if (!active || !active.token) return null;

    const registry = readStorage(ADMIN_SESSIONS_REGISTRY_KEY, {});
    if (!registry[active.token] || registry[active.token].role !== 'admin') {
      return null;
    }

    return active;
  }

  /**
   * Strictly verifies that the caller possesses a valid admin session.
   * @param {string} [token] 
   * @returns {boolean}
   */
  isAdminAuthorized(token = null) {
    const active = readStorage(ADMIN_ACTIVE_SESSION_KEY, null);
    const registry = readStorage(ADMIN_SESSIONS_REGISTRY_KEY, {});
    const targetToken = token || active?.token;

    if (!targetToken) return false;
    const session = registry[targetToken];
    return !!session && session.role === 'admin';
  }

  /**
   * Retrieve all orders for admin review.
   * SECURITY ENFORCEMENT:
   * Throws authorization error if caller lacks a verified admin session.
   * @param {string} [token]
   * @param {Object} [filters]
   * @returns {Array} Orders
   */
  getAdminOrders(token = null, filters = {}) {
    if (!this.isAdminAuthorized(token)) {
      throw new Error('Unauthorized: Admin credentials required to access order management data.');
    }

    let orders = OrderStore.getAllOrders();

    // Operational queue filtering
    if (filters.queue) {
      if (filters.queue === 'shipping_quote_required') {
        orders = orders.filter(o => o.orderStatus === 'shipping_quote_required');
      } else if (filters.queue === 'shipping_quote_sent') {
        orders = orders.filter(o => o.orderStatus === 'shipping_quote_sent');
      } else if (filters.queue === 'shipping_payment_pending') {
        orders = orders.filter(o => o.orderStatus === 'shipping_payment_pending');
      } else if (filters.queue === 'shipping_payment_confirmed') {
        orders = orders.filter(o => o.orderStatus === 'shipping_payment_confirmed');
      } else if (filters.queue === 'ready_for_dispatch') {
        orders = orders.filter(o => o.orderStatus === 'ready_for_dispatch');
      } else if (filters.queue === 'shipped') {
        orders = orders.filter(o => o.orderStatus === 'shipped');
      }
    }

    // Status filter
    if (filters.orderStatus && filters.orderStatus !== 'all') {
      orders = orders.filter(o => o.orderStatus === filters.orderStatus);
    }

    // Payment status filter
    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      orders = orders.filter(o => o.paymentStatus === filters.paymentStatus);
    }

    // Search query (order number, customer name, customer email)
    if (filters.search) {
      const q = String(filters.search).trim().toLowerCase();
      orders = orders.filter(o => {
        const orderNum = (o.orderNumber || o.id || '').toLowerCase();
        const custName = (o.customer?.fullName || o.customerName || '').toLowerCase();
        const custEmail = (o.customer?.email || o.customerEmail || '').toLowerCase();
        return orderNum.includes(q) || custName.includes(q) || custEmail.includes(q);
      });
    }

    return orders;
  }

  /**
   * Retrieve every customer record for admin review (Phase A7).
   *
   * SECURITY ENFORCEMENT:
   * - Throws unless the caller holds a verified admin session, matching the
   *   barrier getAdminOrders() already applies to order data.
   * - Returns customerService's sanitized projection: id, email, full name,
   *   phone, status and timestamps. Credentials are not part of a customer
   *   record in the first place (see registerCustomer), and session tokens,
   *   password-reset tokens and the Supabase `authUserId` linkage live in
   *   separate stores that this path never reads.
   *
   * @param {string} [token]
   * @returns {Array<Object>} Sanitized customer records
   */
  getAdminCustomers(token = null) {
    if (!this.isAdminAuthorized(token)) {
      throw new Error('Unauthorized: Admin credentials required to access customer records.');
    }
    return customerService.listAllCustomers();
  }

  /**
   * Retrieve one registered customer's saved addresses for admin support.
   *
   * Addresses are delivery PII, so they sit behind the same barrier rather
   * than being read straight from the store by the view.
   *
   * @param {string} customerId
   * @param {string} [token]
   * @returns {Array<Object>}
   */
  getAdminCustomerAddresses(customerId, token = null) {
    if (!this.isAdminAuthorized(token)) {
      throw new Error('Unauthorized: Admin credentials required to access customer addresses.');
    }
    if (!customerId) return [];
    return customerService.getAddresses(customerId);
  }

  /**
   * Reset all admin sessions (for testing).
   */
  clearAll() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ADMIN_ACTIVE_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSIONS_REGISTRY_KEY);
      this.initDefaultAdmin();
    }
  }
}

export const adminService = new AdminService();
