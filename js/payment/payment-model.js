/**
 * Payment & Order Data Models - Slimky Hair
 * Milestones C10 - C20: Payment Architecture, Orders & Customer Integration
 * 
 * Provides canonical status enums, record generators, test card dictionaries,
 * transition validators, and data structures for provider-agnostic processing.
 */

import { getSetting } from '../admin/settings-service.js';

// 1. Payment Status Enum (Strictly independent from Order Status)
export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
});

// 1b. Canonical Payment Lifecycle States (Milestone C20.6 - Single Source of Truth)
export const PAYMENT_LIFECYCLE_STATES = Object.freeze({
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  PROCESSING: 'processing',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

// 2. Order Status Enum (Tracks order lifecycle independently)
export const ORDER_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
  SHIPPING_QUOTE_REQUIRED: 'shipping_quote_required',
  SHIPPING_QUOTE_SENT: 'shipping_quote_sent',
  SHIPPING_PAYMENT_PENDING: 'shipping_payment_pending',
  SHIPPING_PAYMENT_CONFIRMED: 'shipping_payment_confirmed',
  READY_FOR_DISPATCH: 'ready_for_dispatch',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  PAYMENT_FAILED: 'payment_failed',
  CANCELLED: 'cancelled'
});

// 2b. Checkout Flows
export const CHECKOUT_FLOWS = Object.freeze({
  NIGERIA: 'nigeria_checkout',
  INTERNATIONAL: 'international_checkout'
});

// 3. Supported Payment Providers
export const PAYMENT_PROVIDERS = Object.freeze({
  DEMO: 'demo',               // Slimky DemoPay (Active for test mode)
  PAYSTACK: 'paystack',       // Future live provider integration point
  FLUTTERWAVE: 'flutterwave'  // Future live provider integration point
});

// 4. Supported Payment Methods
export const PAYMENT_METHODS = Object.freeze({
  DEMO_CARD: 'demo_card',
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer',
  USSD: 'ussd'
});

// 5. Development-Only Deterministic Test Cards (Slimky DemoPay)
export const DEMO_TEST_CARDS = Object.freeze({
  SUCCESS: {
    number: '4000000000000001',
    formatted: '4000 0000 0000 0001',
    label: 'Successful Test Card',
    expectedOutcome: PAYMENT_STATUS.SUCCESSFUL,
    cvv: '123',
    expiry: '12/28',
    description: 'Guarantees immediate successful payment approval'
  },
  DECLINED: {
    number: '4000000000000002',
    formatted: '4000 0000 0000 0002',
    label: 'Declined Test Card (Insufficient Funds / Issuer Decline)',
    expectedOutcome: PAYMENT_STATUS.DECLINED,
    cvv: '456',
    expiry: '10/27',
    failureReason: 'Transaction declined by card issuer (Insufficient Funds)',
    description: 'Simulates card issuer decline to test retry behavior'
  },
  FAILED: {
    number: '4000000000000003',
    formatted: '4000 0000 0000 0003',
    label: 'Failed Test Card (Processing System Error)',
    expectedOutcome: PAYMENT_STATUS.FAILED,
    cvv: '789',
    expiry: '05/29',
    failureReason: 'Simulated payment processing error occurred',
    description: 'Simulates a transaction processing failure to test non-destructive recovery'
  },
  PROCESSING: {
    number: '4000000000000004',
    formatted: '4000 0000 0000 0004',
    label: 'Slow Processing Test Card',
    expectedOutcome: PAYMENT_STATUS.PROCESSING,
    cvv: '000',
    expiry: '01/30',
    description: 'Simulates extended bank processing latency for UI loading checks'
  },
  TIMEOUT: {
    number: '4000000000000005',
    formatted: '4000 0000 0000 0005',
    label: 'Timeout / Simulated Network Failure Card',
    expectedOutcome: PAYMENT_STATUS.FAILED,
    cvv: '123',
    expiry: '12/28',
    failureReason: "We couldn't confirm your payment. Please try again.",
    description: 'Simulates a gateway connection timeout or network interruption'
  }
});

/**
 * Generate a unique fictional payment reference.
 * Example: DEMO-PAY-8F4K92L
 * @param {string} prefix
 * @returns {string}
 */
export function generatePaymentReference(prefix = 'DEMO-PAY') {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 7; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${rand}`;
}

/**
 * Generate a unique Order ID.
 * Example: ORD-20260911-7X9K2
 * @returns {string}
 */
export function generateOrderId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ORD-${dateStr}-${rand}`;
}

/**
 * Generate a human-friendly customer reference number.
 * Example: SLM-20260911-A8F2
 *
 * The prefix is operational configuration (Phase A9: order_number_prefix),
 * sanitized to letters/digits with an SLM fallback so a corrupt stored value
 * can never produce a malformed reference.
 * @returns {string}
 */
export function generateOrderNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const raw = String(getSetting('order_number_prefix') || 'SLM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const prefix = raw || 'SLM';
  return `${prefix}-${dateStr}-${rand}`;
}

/**
 * Generate a cryptographically secure token for order access without exposed predictable IDs.
 * @returns {string}
 */
export function generateOrderSecurityToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 24; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `sec_${Date.now()}_${rand}`;
}

/**
 * Factory for a canonical Payment Record.
 * @param {Object} params
 * @returns {Object}
 */
export function createPaymentRecord({
  id = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  orderId,
  orderReference,
  checkoutId,
  provider = PAYMENT_PROVIDERS.DEMO,
  providerReference = generatePaymentReference(),
  transactionReference,
  amount,
  currency = 'NGN',
  status = PAYMENT_STATUS.PENDING,
  paymentMethod = PAYMENT_METHODS.DEMO_CARD,
  purpose = 'product',
  customerEmail,
  customerPhone = '',
  customerName = '',
  failureReason = null,
  attemptNumber = 1,
  attempts = [],
  metadata = {}
}) {
  const now = new Date().toISOString();
  const txRef = transactionReference || providerReference;
  return {
    id,
    orderId,
    orderReference: orderReference || orderId,
    checkoutId,
    provider,
    providerReference: txRef,
    transactionReference: txRef,
    amount: Number(amount) || 0,
    currency: currency.toUpperCase(),
    status,
    paymentMethod,
    purpose,
    customerEmail,
    customerPhone,
    customerName,
    failureReason,
    attemptNumber: Number(attemptNumber) || 1,
    attempts: Array.isArray(attempts) ? attempts : [],
    metadata: { ...metadata },
    createdAt: now,
    updatedAt: now,
    verifiedAt: status === PAYMENT_STATUS.SUCCESSFUL ? now : null
  };
}

/**
 * Factory for a canonical Order Record.
 * @param {Object} params
 * @returns {Object}
 */
export function createOrderRecord({
  id = generateOrderId(),
  orderNumber = generateOrderNumber(),
  securityToken = generateOrderSecurityToken(),
  checkoutId,
  customerId = null,
  isGuest = undefined,
  flow = 'nigeria_checkout',
  customer,
  delivery,
  items = [],
  pricing,
  orderStatus = ORDER_STATUS.PENDING_PAYMENT,
  paymentId = null,
  paymentStatus = PAYMENT_STATUS.PENDING,
  totalPaid = 0,
  history = [],
  metadata = {}
}) {
  const now = new Date().toISOString();
  const guestFlag = isGuest !== undefined ? Boolean(isGuest) : (customerId === null || customerId === undefined);
  const resolvedCustomerId = guestFlag ? null : customerId;

  const custName = customer?.fullName || customer?.name || customer?.customerName || '';
  const custEmail = customer?.email || customer?.customerEmail || '';
  const custPhone = customer?.phone || customer?.customerPhone || '';

  const delCountry = delivery?.country || (flow === 'nigeria_checkout' ? 'Nigeria' : '');
  const delState = delivery?.state || delivery?.region || '';
  const delCity = delivery?.city || '';
  const delPostal = delivery?.postalCode || delivery?.postal_code || '';
  const delAddress = delivery?.address || delivery?.streetAddress || delivery?.street_address || '';
  const delInstructions = delivery?.instructions || delivery?.deliveryInstructions || delivery?.delivery_instructions || '';

  const subtotalVal = Number(pricing?.subtotal || 0);
  const shippingStatusVal = pricing?.shippingStatus || (flow === 'nigeria_checkout' ? 'Calculated separately' : 'Quote required');
  const shippingAmountVal = pricing?.shippingAmount !== undefined ? pricing.shippingAmount : (pricing?.shippingFee !== undefined ? pricing.shippingFee : null);
  const productPaymentTotalVal = Number(pricing?.productPaymentTotal || pricing?.total || pricing?.subtotal || 0);
  const currencyVal = (pricing?.currency || 'NGN').toUpperCase();
  const totalPaidVal = Number(totalPaid) || 0;

  const mappedItems = items.map(item => {
    const uPrice = Number(item.unitPrice !== undefined ? item.unitPrice : (item.unit_price !== undefined ? item.unit_price : (item.priceValue || item.price || 0)));
    const qty = Number(item.quantity || 1);
    const lSubtotal = Number(item.lineSubtotal !== undefined ? item.lineSubtotal : (item.line_subtotal !== undefined ? item.line_subtotal : (item.subtotal || item.lineTotal || (uPrice * qty))));
    const pId = item.productId || item.product_id || item.id;
    const vId = item.variantId !== undefined ? item.variantId : (item.variant_id !== undefined ? item.variant_id : null);
    const skuVal = item.sku || '';
    const pName = item.productName || item.product_name || item.name || '';
    const vName = item.variantName || item.variant_name || item.size || '';
    const pImage = item.productImage || item.product_image || item.image || '';

    return {
      productId: pId,
      variantId: vId,
      sku: skuVal,
      productName: pName,
      variantName: vName,
      productImage: pImage,
      unitPrice: uPrice,
      quantity: qty,
      subtotal: lSubtotal,
      lineSubtotal: lSubtotal,
      lineTotal: lSubtotal,

      // Supabase / snake_case accessors
      product_id: pId,
      variant_id: vId,
      product_name: pName,
      variant_name: vName,
      product_image: pImage,
      unit_price: uPrice,
      line_subtotal: lSubtotal,
      line_total: lSubtotal
    };
  });

  return {
    // 1. Order Identification
    id,
    orderNumber,
    order_number: orderNumber,
    securityToken,
    security_token: securityToken,
    checkoutId: checkoutId || `chk_${Date.now()}`,
    checkout_id: checkoutId || `chk_${Date.now()}`,
    flow,

    // 2. Customer Identification (Guest vs Signed-In)
    customerId: resolvedCustomerId,
    customer_id: resolvedCustomerId,
    isGuest: guestFlag,
    is_guest: guestFlag,

    // 3. Customer Snapshot (Fulfillment & Invoicing)
    customerName: custName,
    customer_name: custName,
    customerEmail: custEmail,
    customer_email: custEmail,
    customerPhone: custPhone,
    customer_phone: custPhone,

    // 4. Delivery Address Snapshot
    country: delCountry,
    state: delState,
    region: delState,
    city: delCity,
    postalCode: delPostal,
    postal_code: delPostal,
    address: delAddress,
    streetAddress: delAddress,
    street_address: delAddress,
    deliveryInstructions: delInstructions,
    delivery_instructions: delInstructions,

    // 5. Items Snapshot
    items: mappedItems,

    // 6. Pricing & Currency
    currency: currencyVal,
    subtotal: subtotalVal,
    shippingStatus: shippingStatusVal,
    shipping_status: shippingStatusVal,
    shippingAmount: shippingAmountVal,
    shipping_amount: shippingAmountVal,
    shippingFee: shippingAmountVal,
    shipping_fee: shippingAmountVal,
    total: productPaymentTotalVal,
    productPaymentTotal: productPaymentTotalVal,
    product_payment_total: productPaymentTotalVal,
    totalPaid: totalPaidVal,
    total_paid: totalPaidVal,

    // 7. Statuses (Decoupled)
    orderStatus,
    order_status: orderStatus,
    paymentStatus,
    payment_status: paymentStatus,
    paymentId,
    latest_payment_id: paymentId,

    // 8. Structured Nested Blocks (Backward Compatibility)
    customer: {
      fullName: custName,
      email: custEmail,
      phone: custPhone,
      customerId: resolvedCustomerId,
      isGuest: guestFlag
    },
    delivery: {
      country: delCountry,
      state: delState,
      city: delCity,
      postalCode: delPostal,
      address: delAddress,
      instructions: delInstructions
    },
    pricing: {
      subtotal: subtotalVal,
      shippingStatus: shippingStatusVal,
      shippingAmount: shippingAmountVal,
      shippingFee: shippingAmountVal,
      productPaymentTotal: productPaymentTotalVal,
      total: productPaymentTotalVal,
      totalPaid: totalPaidVal,
      currency: currencyVal
    },

    // 9. History & Audit Timestamps
    history: Array.isArray(history) && history.length > 0 ? history : [
      {
        status: orderStatus,
        timestamp: now,
        note: 'Order created in initial staged state'
      }
    ],
    metadata: { ...metadata },
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now
  };
}

/**
 * Validate whether a status transition is permitted according to workflow rules.
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @param {string} flow
 * @returns {boolean}
 */
export function validateOrderStatusTransition(currentStatus, targetStatus, flow = 'nigeria_checkout') {
  if (currentStatus === targetStatus) return true;

  // Terminal states cannot transition
  if (currentStatus === ORDER_STATUS.CANCELLED || currentStatus === ORDER_STATUS.DELIVERED) {
    return false;
  }

  // Any non-terminal state can be cancelled
  if (targetStatus === ORDER_STATUS.CANCELLED) {
    return true;
  }

  // Allowed transitions per workflow
  const validTransitionsNigeria = {
    [ORDER_STATUS.DRAFT]: [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.PAID, ORDER_STATUS.SHIPPING_QUOTE_REQUIRED, ORDER_STATUS.PAYMENT_FAILED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PAYMENT_FAILED]: [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PAID]: [ORDER_STATUS.SHIPPING_QUOTE_REQUIRED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPING_QUOTE_REQUIRED]: [ORDER_STATUS.SHIPPING_QUOTE_SENT, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPING_QUOTE_SENT]: [ORDER_STATUS.SHIPPING_PAYMENT_PENDING, ORDER_STATUS.SHIPPING_QUOTE_REQUIRED, ORDER_STATUS.CANCELLED],
    // Phase A6: both shipping-payment confirm paths must be legal. Verified
    // gateway payments land on SHIPPING_PAYMENT_CONFIRMED
    // (recordShippingPaymentSuccess), while the manual backoffice confirmation
    // advances straight to READY_FOR_DISPATCH (confirmShippingPayment).
    [ORDER_STATUS.SHIPPING_PAYMENT_PENDING]: [ORDER_STATUS.SHIPPING_PAYMENT_CONFIRMED, ORDER_STATUS.READY_FOR_DISPATCH, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPING_PAYMENT_CONFIRMED]: [ORDER_STATUS.READY_FOR_DISPATCH, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.READY_FOR_DISPATCH]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED]
  };

  const validTransitionsInternational = {
    [ORDER_STATUS.DRAFT]: [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.PAID, ORDER_STATUS.SHIPPING_QUOTE_REQUIRED, ORDER_STATUS.PAYMENT_FAILED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PAYMENT_FAILED]: [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PAID]: [ORDER_STATUS.SHIPPING_QUOTE_REQUIRED, ORDER_STATUS.READY_FOR_DISPATCH, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPING_QUOTE_REQUIRED]: [ORDER_STATUS.SHIPPING_QUOTE_SENT, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPING_QUOTE_SENT]: [ORDER_STATUS.SHIPPING_PAYMENT_PENDING, ORDER_STATUS.SHIPPING_QUOTE_REQUIRED, ORDER_STATUS.CANCELLED],
    // Phase A6: same dual-path guarantee as the Nigeria table — verified
    // payments land on SHIPPING_PAYMENT_CONFIRMED, manual confirmations on
    // READY_FOR_DISPATCH. Both must validate.
    [ORDER_STATUS.SHIPPING_PAYMENT_PENDING]: [ORDER_STATUS.SHIPPING_PAYMENT_CONFIRMED, ORDER_STATUS.READY_FOR_DISPATCH, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPING_PAYMENT_CONFIRMED]: [ORDER_STATUS.READY_FOR_DISPATCH, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.READY_FOR_DISPATCH]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED]
  };

  const table = flow === 'international_checkout' ? validTransitionsInternational : validTransitionsNigeria;
  const allowed = table[currentStatus] || [];
  return allowed.includes(targetStatus);
}

/**
 * Authoritative disclosure separating formulation / shipping fee from destination customs & import duties.
 */
export const CUSTOMS_IMPORT_DUTIES_NOTICE = Object.freeze({
  DISCLOSURE: 'Customs duties, import taxes, and international border handling fees are determined by destination country border authorities and are paid directly by the recipient upon arrival. They are not included in the botanical formulation purchase or carrier shipping fee.',
  SEPARATED: true
});

/**
 * Generate a unique idempotency key for payment/order requests.
 * @param {string} prefix
 * @returns {string}
 */
export function generateIdempotencyKey(prefix = 'idem') {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${Date.now()}_${rand}`;
}

/**
 * Sanitize payment record before storage or logging.
 * CRITICAL SECURITY GUARANTEE:
 * - Strictly deletes any CVV / CVC field.
 * - Masks or omits raw card numbers.
 * - Strips sensitive secrets or passwords.
 * @param {Object} paymentRecord
 * @returns {Object} Clean sanitized record
 */
export function sanitizePaymentRecord(paymentRecord) {
  if (!paymentRecord || typeof paymentRecord !== 'object') return paymentRecord;
  const clone = JSON.parse(JSON.stringify(paymentRecord));

  // Strip CVV / security codes if inadvertently present
  delete clone.cvv;
  delete clone.cvc;
  delete clone.securityCode;

  // Mask card number if present in record or metadata
  if (clone.cardNumber) {
    const raw = String(clone.cardNumber).replace(/\s+/g, '');
    clone.maskedCard = `**** **** **** ${raw.slice(-4)}`;
    delete clone.cardNumber;
  }

  if (clone.metadata?.cardDetails) {
    delete clone.metadata.cardDetails.cvv;
    delete clone.metadata.cardDetails.cvc;
    if (clone.metadata.cardDetails.cardNumber) {
      const raw = String(clone.metadata.cardDetails.cardNumber).replace(/\s+/g, '');
      clone.metadata.cardDetails.maskedCard = `**** **** **** ${raw.slice(-4)}`;
      delete clone.metadata.cardDetails.cardNumber;
    }
  }

  return clone;
}

/**
 * Environment safety guard for Demo Payment operations.
 * Strictly prohibits demo payment execution in production unless explicitly enabled.
 * @param {Object} [options]
 * @returns {boolean}
 */
export function isDemoPaymentAllowed(options = {}) {
  // 1. Explicit programmatic override in arguments
  if (typeof options.allowDemo !== 'undefined') {
    return Boolean(options.allowDemo);
  }

  // 2. Node / build environment check
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.SLIMKY_ALLOW_DEMO_PAYMENT === 'false') return false;
    if (process.env.SLIMKY_ALLOW_DEMO_PAYMENT === 'true') return true;
    if (process.env.NODE_ENV === 'production' && !process.env.SLIMKY_ALLOW_DEMO_PAYMENT) return false;
  }

  // 3. Browser runtime environment check
  if (typeof window !== 'undefined') {
    if (window.__SLIMKY_ALLOW_DEMO_PAYMENT__ === false) return false;
    if (window.__SLIMKY_ALLOW_DEMO_PAYMENT__ === true) return true;
    if (window.__SLIMKY_ENV__ === 'production' && !window.__SLIMKY_ALLOW_DEMO_PAYMENT__) return false;

    // Guard against running in non-local production domains without override
    const hostname = window.location?.hostname || '';
    const isLocal = !hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
    if (!isLocal && window.__SLIMKY_ENV__ === 'production') {
      return false;
    }
  }

  return true;
}
