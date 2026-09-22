/**
 * Order Sync to Supabase — Slimky Hair
 * Phase 3, Piece 1: persist a verified-paid order into the real backend.
 *
 * Called once, right after payment-service.js's processPayment() reaches a
 * verified SUCCESSFUL outcome. Posts the final order + payment objects to
 * the `sync-order` Edge Function (see supabase/functions/sync-order), which
 * resolves customer_id from the caller's own Supabase session (never from
 * this payload) and persists to orders/order_items/payments with a real,
 * atomic server-side stock deduction.
 *
 * Failure contract, matching email-service.js: NEVER throws, NEVER blocks
 * or fails an already-successful checkout. A sync failure just means this
 * order stays local-only (as it already was today) until the next attempt.
 */

import { customerService } from '../auth/customer-service.js';

const SYNC_LOG_KEY = 'slimky_order_sync_log';

function readEnv() {
  const env = (typeof window !== 'undefined' && window.__SLIMKY_ENV__) || {};
  return {
    SUPABASE_URL: (env.SUPABASE_URL && !String(env.SUPABASE_URL).includes('YOUR_PROJECT_REF'))
      ? env.SUPABASE_URL
      : 'https://irmxpsygbccmqtcpfmmb.supabase.co',
    SUPABASE_ANON_KEY: (env.SUPABASE_ANON_KEY && !String(env.SUPABASE_ANON_KEY).includes('YOUR_SUPABASE_ANON'))
      ? env.SUPABASE_ANON_KEY
      : 'sb_publishable_qRthPnH-P3aF-5Cv7-RHnQ_ekqDJrAj',
    APP_URL: env.APP_URL || 'https://slimkyhair.com/',
    ...env,
  };
}

function isConfigured(env) {
  return !!(
    env.SUPABASE_URL &&
    env.SUPABASE_ANON_KEY &&
    !env.SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
    !env.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON')
  );
}

function recordSyncAttempt(entry) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    const log = raw ? JSON.parse(raw) : [];
    log.unshift({ ...entry, at: new Date().toISOString() });
    if (log.length > 50) log.length = 50;
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(log));
  } catch { /* best-effort logging only */ }
}

/**
 * Post the final, verified-paid order + payment to the real backend.
 * @param {Object} order Canonical order record (createOrderRecord() shape — snake_case fields used)
 * @param {Object} payment Canonical payment record (createPaymentRecord() shape)
 * @returns {Promise<{ success: boolean, alreadySynced?: boolean, error?: string, notConfigured?: boolean }>}
 */
export async function syncOrderToBackend(order, payment) {
  const env = readEnv();

  if (!isConfigured(env)) {
    const result = { success: false, notConfigured: true };
    console.warn('[OrderSync] Skipped: Supabase is not configured (js/env.js).');
    return result;
  }

  const endpoint = `${env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/sync-order`;
  // The customer's own access token when signed in, so the function can
  // authoritatively resolve customer_id server-side; the anon key alone for
  // guest checkout (a legitimate, expected case — not an error).
  const accessToken = customerService.getSessionToken() || env.SUPABASE_ANON_KEY;

  const orderPayload = {
    id: order.id,
    order_number: order.orderNumber || order.order_number,
    checkout_id: order.checkoutId || order.checkout_id,
    security_token: order.securityToken || order.security_token,
    flow: order.flow,
    customer_name: order.customerName || order.customer_name,
    customer_email: order.customerEmail || order.customer_email,
    customer_phone: order.customerPhone || order.customer_phone,
    country: order.country,
    state: order.state,
    city: order.city,
    postal_code: order.postalCode ?? order.postal_code ?? null,
    street_address: order.streetAddress || order.street_address,
    delivery_instructions: order.deliveryInstructions ?? order.delivery_instructions ?? null,
    subtotal: order.subtotal,
    shipping_status: order.shippingStatus || order.shipping_status,
    shipping_amount: order.shippingAmount ?? order.shipping_amount ?? null,
    shipping_fee: order.shippingFee ?? order.shipping_fee ?? null,
    product_payment_total: order.productPaymentTotal ?? order.product_payment_total,
    total_paid: order.totalPaid ?? order.total_paid,
    currency: order.currency,
    order_status: order.orderStatus || order.order_status,
    payment_status: order.paymentStatus || order.payment_status,
    history: order.history || [],
    metadata: order.metadata || {},
    items: (order.items || []).map(item => ({
      product_id: item.productId || item.product_id,
      variant_id: item.variantId ?? item.variant_id ?? null,
      sku: item.sku,
      product_name: item.productName || item.product_name,
      variant_name: item.variantName ?? item.variant_name ?? null,
      product_image: item.productImage ?? item.product_image ?? null,
      unit_price: item.unitPrice ?? item.unit_price,
      quantity: item.quantity,
      line_subtotal: item.lineSubtotal ?? item.line_subtotal ?? item.subtotal,
      line_total: item.lineTotal ?? item.line_total ?? item.subtotal
    }))
  };

  const paymentPayload = payment ? {
    id: payment.id,
    provider: payment.provider,
    provider_reference: payment.providerReference || payment.provider_reference,
    amount: payment.amount,
    currency: payment.currency,
    payment_method: payment.paymentMethod || payment.payment_method,
    status: payment.status,
    purpose: payment.purpose || 'product',
    customer_email: payment.customerEmail || payment.customer_email,
    customer_phone: payment.customerPhone ?? payment.customer_phone ?? null,
    verified_at: payment.verifiedAt ?? payment.verified_at ?? null,
    metadata: payment.metadata || {}
  } : undefined;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: env.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ order: orderPayload, payment: paymentPayload })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const result = { success: false, error: data.error || `HTTP ${response.status}` };
      console.warn('[OrderSync] Backend sync failed for order', order.id, ':', result.error);
      recordSyncAttempt({ orderId: order.id, result });
      return result;
    }

    recordSyncAttempt({ orderId: order.id, result: data });
    return data;
  } catch (err) {
    const result = { success: false, error: err.message };
    console.warn('[OrderSync] Backend sync unreachable for order', order.id, ':', err.message);
    recordSyncAttempt({ orderId: order.id, result });
    return result;
  }
}
