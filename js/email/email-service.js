/**
 * Transactional Email Client - Slimky Hair
 * Milestone C20.9: Server-Side Transactional Email Notifications
 *
 * Architecture: Storefront (this file) -> Supabase Edge Function -> Resend -> Customer.
 *
 * This module NEVER renders HTML, NEVER holds a provider API key, and NEVER
 * talks to Resend directly. It only assembles the minimal data needed for an
 * email and posts it to the `send-transactional-email` Edge Function, which
 * renders the template and dispatches it server-side (see supabase/functions/).
 *
 * Idempotency (duplicate refresh / payment retry / webhook retry protection)
 * is enforced server-side against the `email_log` table via `dedupKey` — see
 * supabase/functions/_shared/idempotency.ts.
 *
 * Failure contract: every public method here resolves (never rejects) with
 * `{ success: boolean, ... }`. A failed or unreachable Edge Function must
 * never fail the surrounding order/payment/account flow (requirement 8).
 */

const DISPATCH_LOG_KEY = 'slimky_email_dispatch_log';

function readEnv() {
  return (typeof window !== 'undefined' && window.__SLIMKY_ENV__) || {};
}

function isConfigured(env) {
  return !!(
    env.SUPABASE_URL &&
    env.SUPABASE_ANON_KEY &&
    !env.SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
    !env.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON')
  );
}

function readStorage(key, fallback = []) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`[EmailService] Error reading ${key}:`, err);
    return fallback;
  }
}

function writeStorage(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[EmailService] Error writing ${key}:`, err);
    return false;
  }
}

/** Strip an order/customer object down to plain JSON-safe data before it leaves the browser. */
function toJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export class EmailService {
  constructor() {
    this.providerName = 'resend-via-edge-function';
  }

  /**
   * Record a local, client-visible mirror of a dispatch attempt (for admin
   * debugging only — the authoritative record lives in Supabase `email_log`).
   */
  recordDispatchAttempt(entry) {
    const log = readStorage(DISPATCH_LOG_KEY, []);
    log.unshift({ ...entry, at: new Date().toISOString() });
    if (log.length > 100) log.length = 100;
    writeStorage(DISPATCH_LOG_KEY, log);
  }

  /**
   * Post a render+send request to the server-side Edge Function.
   * Never throws — always resolves with a result object.
   * @param {string} type - one of the email types in supabase/functions/_shared/emails/render.ts
   * @param {Object} params
   * @param {string} params.recipient
   * @param {string} params.dedupKey
   * @param {string} [params.orderId]
   * @param {Object} params.payload
   * @returns {Promise<{ success: boolean, alreadySent?: boolean, messageId?: string, error?: string, notConfigured?: boolean }>}
   */
  async dispatch(type, { recipient, dedupKey, orderId = null, payload }) {
    const env = readEnv();

    if (!isConfigured(env)) {
      const result = { success: false, notConfigured: true, message: 'Supabase email endpoint is not configured (js/env.js).' };
      console.warn(`[EmailService] Skipped "${type}" for ${recipient}: Supabase env is not configured.`);
      this.recordDispatchAttempt({ type, recipient, dedupKey, orderId, result });
      return result;
    }

    const endpoint = `${env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/send-transactional-email`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          apikey: env.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ type, recipient, dedupKey, orderId, payload: toJsonSafe(payload) }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok && !data.queuedForRetry) {
        const result = { success: false, error: data.error || `HTTP ${response.status}` };
        this.recordDispatchAttempt({ type, recipient, dedupKey, orderId, result });
        return result;
      }

      this.recordDispatchAttempt({ type, recipient, dedupKey, orderId, result: data });
      return data;
    } catch (err) {
      // Network failure, CORS misconfiguration, offline, etc. Never throw —
      // the caller's order/payment/account action must still succeed.
      const result = { success: false, error: err.message };
      console.warn(`[EmailService] Dispatch failed for "${type}" (queued server-side retry sweep will not see this one — network error before reaching the server):`, err);
      this.recordDispatchAttempt({ type, recipient, dedupKey, orderId, result });
      return result;
    }
  }

  /**
   * Send an Order Confirmation Email (also serves as payment confirmation —
   * an order only exists in this flow once payment is verified).
   * @param {Object} order
   * @param {Object} [payment] - unused directly (kept for call-site compatibility); order.pricing already reflects verified payment.
   * @param {Object} [options]
   */
  async sendOrderConfirmationEmail(order, payment = null, options = {}) {
    if (!order || !order.customer?.email) {
      throw new Error('Order with valid customer email required to send confirmation');
    }
    if (order.orderStatus === 'payment_failed' || order.orderStatus === 'draft') {
      throw new Error('Cannot send confirmation email for failed or unverified order');
    }

    return this.dispatch('order_confirmation', {
      recipient: order.customer.email,
      dedupKey: `order_confirmation:${order.id}`,
      orderId: order.id,
      payload: { ...order, storeUrl: options.storeUrl || readEnv().APP_URL || './' },
    });
  }

  /**
   * Send a Customer Account Registration (welcome) Email.
   * @param {Object} customer
   * @param {Object} [options]
   */
  async sendRegistrationConfirmationEmail(customer, options = {}) {
    if (!customer || !customer.email) {
      throw new Error('Customer with valid email required to send registration email');
    }

    return this.dispatch('registration_confirmation', {
      recipient: customer.email,
      dedupKey: `registration_confirmation:${customer.email.toLowerCase()}`,
      payload: {
        customerName: customer.fullName || customer.name || 'Valued Customer',
        email: customer.email,
        storeUrl: options.storeUrl || readEnv().APP_URL || './',
      },
    });
  }

  /**
   * Dispatch a transactional Password Reset email.
   * @param {Object} params
   * @param {string} params.email
   * @param {string} [params.customerName]
   * @param {string} params.resetUrl
   * @param {string} [params.resetToken]
   */
  async sendPasswordResetEmail({ email, customerName = 'Valued Customer', resetUrl, resetToken = null }) {
    if (!email || !resetUrl) {
      throw new Error('Recipient email and reset URL are required to send password reset');
    }

    return this.dispatch('password_reset', {
      recipient: email,
      dedupKey: resetToken ? `password_reset:${resetToken}` : `password_reset:${email.toLowerCase()}:${Date.now()}`,
      payload: { customerName, email, resetUrl },
    });
  }

  /**
   * Dispatch an International Shipping Quote notification.
   * @param {Object} order
   * @param {Object} [quote]
   */
  async sendShippingQuoteEmail(order, quote = {}) {
    if (!order || !order.customer?.email) {
      throw new Error('Order with valid customer email required to send shipping quote');
    }
    const amount = quote.amount || quote.quoteAmount || 0;

    return this.dispatch('shipping_quote', {
      recipient: order.customer.email,
      dedupKey: `shipping_quote:${order.id}:${amount}`,
      orderId: order.id,
      payload: { order: { ...order, storeUrl: readEnv().APP_URL || './' }, quote },
    });
  }

  /**
   * Dispatch a Shipping Payment Required notification (customer accepted quote).
   * @param {Object} order
   * @param {Object} quote
   */
  async sendShippingPaymentRequiredEmail(order, quote = {}) {
    if (!order || !order.customer?.email) {
      throw new Error('Order with valid customer email required to send shipping payment request');
    }

    return this.dispatch('shipping_payment_required', {
      recipient: order.customer.email,
      dedupKey: `shipping_payment_required:${order.id}`,
      orderId: order.id,
      payload: { order: { ...order, storeUrl: readEnv().APP_URL || './' }, quote },
    });
  }

  /**
   * Dispatch a Shipping Payment Confirmed notification.
   * @param {Object} order
   * @param {Object} [payment]
   */
  async sendShippingPaymentConfirmedEmail(order, payment = {}) {
    if (!order || !order.customer?.email) {
      throw new Error('Order with valid customer email required to send shipping payment confirmation');
    }

    return this.dispatch('shipping_payment_confirmed', {
      recipient: order.customer.email,
      dedupKey: `shipping_payment_confirmed:${order.id}:${payment.reference || 'default'}`,
      orderId: order.id,
      payload: { order: { ...order, storeUrl: readEnv().APP_URL || './' }, payment },
    });
  }

  /**
   * Dispatch an Order Dispatch / Tracking notification.
   * @param {Object} order
   * @param {Object} [tracking]
   */
  async sendDispatchNotificationEmail(order, tracking = {}) {
    if (!order || !order.customer?.email) {
      throw new Error('Order with valid customer email required to send dispatch notification');
    }
    const trackingNumber = tracking.trackingNumber || 'N/A';

    return this.dispatch('order_shipped', {
      recipient: order.customer.email,
      dedupKey: `order_shipped:${order.id}:${trackingNumber}`,
      orderId: order.id,
      payload: { order: { ...order, storeUrl: readEnv().APP_URL || './' }, tracking },
    });
  }

  /**
   * Dispatch an Order Delivered notification.
   * @param {Object} order
   */
  async sendOrderDeliveredEmail(order) {
    if (!order || !order.customer?.email) {
      throw new Error('Order with valid customer email required to send delivery notification');
    }

    return this.dispatch('order_delivered', {
      recipient: order.customer.email,
      dedupKey: `order_delivered:${order.id}`,
      orderId: order.id,
      payload: { ...order, storeUrl: readEnv().APP_URL || './' },
    });
  }

  /**
   * Retrieve the local client-side dispatch attempt log (debugging only —
   * the authoritative record lives in Supabase's `email_log` table).
   */
  getOutbox() {
    return readStorage(DISPATCH_LOG_KEY, []);
  }

  /** Clear the local dispatch attempt log (for testing). */
  clearAll() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DISPATCH_LOG_KEY);
    }
  }
}

export const emailService = new EmailService();
