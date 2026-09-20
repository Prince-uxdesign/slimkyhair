/**
 * Admin Authentication & Security Service - Slimky Hair
 * Milestones C21 - C26: Backoffice Authorization Barrier
 * Phase 2 (Backend Integration): Real Admin Identity
 *
 * Admin identity is real Supabase Auth, exactly like customer identity
 * (js/auth/customer-service.js). Admin PRIVILEGE is a separate question,
 * answered only by the database: the `current_admin()` RPC (SECURITY INVOKER,
 * defined in supabase/migrations/20260920043100_admin_authorization.sql)
 * returns the caller's own profile row ONLY if role IN ('admin','staff') AND
 * is_active. There is no local credential store, no hardcoded password, and
 * no way to become an admin by editing anything that ships to the browser —
 * role is granted exclusively via service_role/SQL (see that migration's
 * `prevent_client_role_change` trigger).
 *
 * IMPORTANT — what Phase 2 does and does not cover:
 * The identity/role check below is real and server-verified. The DATA this
 * dashboard reads (orders, customers, inventory, settings) still comes from
 * the same localStorage stores the rest of the site uses pre-backend-
 * integration — that migrates in later phases. Until then, the admin RLS
 * policies on those tables are correctly written but not yet the thing
 * actually gating this dashboard's reads; getCurrentAdmin()/isAdminAuthorized()
 * are the real gate today.
 */

import { OrderStore } from '../payment/order-store.js';
import { customerService } from './customer-service.js';
import { SETTING_DEFS, getAllSettings, saveSettings } from '../admin/settings-service.js';
import { getSupabaseClient } from '../supabase-client.js';

export class AdminService {
  constructor() {
    // In-memory only — never persisted. Populated exclusively by a
    // server-verified current_admin() RPC call (login or restoreSession),
    // so it can't be forged by writing to localStorage/sessionStorage.
    this._verifiedAdmin = null;
  }

  /**
   * Map a current_admin() RPC row + the live Supabase session onto the shape
   * the rest of this file / admin-page.js already expects.
   * @private
   */
  _cacheVerifiedAdmin(row, session) {
    this._verifiedAdmin = {
      id: row.id,
      email: row.email,
      fullName: row.full_name || row.email,
      role: row.role,
      // Kept for API compatibility with existing call sites that pass
      // admin.token around; authorization no longer depends on it, but it's
      // still the real Supabase access token, useful for logging/debugging.
      token: session?.access_token || null
    };
    return this._verifiedAdmin;
  }

  /**
   * Call the server to find out whether the current Supabase session belongs
   * to an active admin/staff user, and cache the result. Must be awaited
   * once at admin dashboard bootstrap (see admin-page.js init()) before any
   * admin view renders — this is what makes a hard refresh, a revoked
   * account, or a role downgrade take effect immediately rather than
   * trusting stale local state.
   * @returns {Promise<Object|null>} the verified admin, or null
   */
  async restoreSession() {
    this._verifiedAdmin = null;
    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return null;

      const { data, error } = await supabase.rpc('current_admin');
      if (error) {
        console.warn('[AdminService] current_admin() check failed:', error.message);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;

      return this._cacheVerifiedAdmin(row, sessionData.session);
    } catch (err) {
      console.warn('[AdminService] Session verification unavailable:', err.message);
      return null;
    }
  }

  /**
   * Authenticate an admin user via real Supabase Auth, then verify
   * admin/staff privilege server-side. A valid Supabase account that is NOT
   * an admin/staff (e.g. an ordinary customer) is signed back out immediately
   * — this form grants no privilege by itself, only the database can.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ success: boolean, admin?: Object, error?: string }>}
   */
  async loginAdmin(email, password) {
    if (!email || !password) {
      return { success: false, error: 'Email and password are required.' };
    }

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch (err) {
      return { success: false, error: err.message };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password
    });

    if (error) {
      return { success: false, error: 'Invalid admin credentials.' };
    }

    const { data: adminRows, error: rpcError } = await supabase.rpc('current_admin');
    if (rpcError) {
      await supabase.auth.signOut();
      return { success: false, error: 'Unable to verify backoffice access right now. Please try again.' };
    }

    const row = Array.isArray(adminRows) ? adminRows[0] : adminRows;
    if (!row) {
      // Valid Supabase account, but not an admin/staff row (or inactive).
      // Do not leave this session signed in on the admin origin.
      await supabase.auth.signOut();
      return { success: false, error: 'This account does not have backoffice access.' };
    }

    const admin = this._cacheVerifiedAdmin(row, data.session);
    return { success: true, admin };
  }

  /**
   * Terminate the active admin session (real Supabase sign-out).
   */
  async logoutAdmin() {
    this._verifiedAdmin = null;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) console.warn('[AdminService] Sign-out error:', error.message);
    } catch (err) {
      console.warn('[AdminService] Sign-out request could not be sent:', err.message);
    }
  }

  /**
   * Get the current verified admin session, or null. Synchronous — backed by
   * the in-memory cache restoreSession()/loginAdmin() populate. Returns null
   * (never stale "true") before restoreSession() has resolved, so a page
   * that renders before verification completes shows the login screen, not
   * admin data — see admin-page.js's async init().
   * @returns {Object|null}
   */
  getCurrentAdmin() {
    return this._verifiedAdmin;
  }

  /**
   * Strictly verifies that the caller holds a server-verified admin session.
   * The `token` parameter is accepted for call-site compatibility but no
   * longer consulted: authorization is the in-memory result of a real
   * current_admin() RPC call, which cannot be forged client-side.
   * @returns {boolean}
   */
  isAdminAuthorized() {
    return !!this._verifiedAdmin;
  }

  /**
   * Retrieve all orders for admin review.
   * SECURITY ENFORCEMENT:
   * Throws authorization error if caller lacks a verified admin session.
   * @param {*} [_token] Unused — kept for call-site compatibility.
   * @param {Object} [filters]
   * @returns {Array} Orders
   */
  getAdminOrders(_token = null, filters = {}) {
    if (!this.isAdminAuthorized()) {
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
   * @param {*} [_token] Unused — kept for call-site compatibility.
   * @returns {Array<Object>} Sanitized customer records
   */
  getAdminCustomers(_token = null) {
    if (!this.isAdminAuthorized()) {
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
   * @param {*} [_token] Unused — kept for call-site compatibility.
   * @returns {Array<Object>}
   */
  getAdminCustomerAddresses(customerId, _token = null) {
    if (!this.isAdminAuthorized()) {
      throw new Error('Unauthorized: Admin credentials required to access customer addresses.');
    }
    if (!customerId) return [];
    return customerService.getAddresses(customerId);
  }

  /**
   * Reset in-memory admin verification (for testing). Does not sign out of
   * Supabase Auth — call logoutAdmin() for that.
   */
  clearAll() {
    this._verifiedAdmin = null;
  }

  /**
   * Read backoffice settings for the settings screen (Phase A9).
   * Throws unless the caller holds a verified admin session.
   * @param {*} [_token] Unused — kept for call-site compatibility.
   * @returns {{definitions: Array, values: Object}}
   */
  getAdminSettings(_token = null) {
    if (!this.isAdminAuthorized()) {
      throw new Error('Unauthorized: Admin credentials required to access store settings.');
    }
    return { definitions: SETTING_DEFS, values: getAllSettings() };
  }

  /**
   * Validate + persist a settings patch (Phase A9). Secret-like keys and
   * invalid values are refused by the settings service; nothing is written
   * unless every entry passes.
   * @param {Object} patch
   * @param {*} [_token] Unused — kept for call-site compatibility.
   * @returns {{success: boolean, errors?: Object, saved?: Object}}
   */
  updateAdminSettings(patch = {}, _token = null) {
    if (!this.isAdminAuthorized()) {
      throw new Error('Unauthorized: Admin credentials required to change store settings.');
    }
    const admin = this.getCurrentAdmin();
    return saveSettings(patch, { actorEmail: admin?.email || 'admin' });
  }

  /**
   * Update the signed-in admin's own display name, persisted to Supabase
   * Auth user metadata (and mirrored into public.profiles.full_name, which
   * profiles_self_update RLS permits the row's own owner to change).
   *
   * Only `fullName` is writable. `role`, `email`, `id` and credential
   * material are explicitly ignored even if submitted, so authorization can
   * never be escalated through this form. Password rotation is out of scope
   * here — use Supabase Auth's own password-change/reset flow.
   *
   * @param {Object} profile {fullName}
   * @param {*} [_token] Unused — kept for call-site compatibility.
   * @returns {Promise<{success: boolean, admin?: Object, error?: string}>}
   */
  async updateAdminProfile(profile = {}, _token = null) {
    if (!this.isAdminAuthorized()) {
      throw new Error('Unauthorized: Admin credentials required to update admin profile.');
    }
    const fullName = String(profile.fullName || '').trim();
    if (fullName.length < 2 || fullName.length > 80) {
      return { success: false, error: 'Display name must be 2–80 characters.' };
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (error) {
      return { success: false, error: error.message || 'Unable to update admin profile.' };
    }

    try {
      await supabase.from('profiles').update({ full_name: fullName }).eq('id', this._verifiedAdmin.id);
    } catch (err) {
      console.warn('[AdminService] profiles mirror update notice:', err.message);
    }

    this._verifiedAdmin.fullName = fullName;
    return { success: true, admin: this._verifiedAdmin };
  }
}

export const adminService = new AdminService();
