/**
 * Persistent Order & Payment Store - Slimky Hair
 * Milestones C10 - C20: Relational Local Storage, Supabase Readiness & Customer Linking
 * 
 * Manages client-side persistence for orders and payments in localStorage,
 * matching 1:1 with the PostgreSQL/Supabase relational schema in database/schema.sql.
 */

import { sanitizePaymentRecord, validateOrderStatusTransition } from './payment-model.js';

const ORDERS_STORAGE_KEY = 'slimky_orders';
const PAYMENTS_STORAGE_KEY = 'slimky_payments';
const IDEMPOTENCY_STORAGE_KEY = 'slimky_idempotency_keys';

/**
 * Safely parse JSON from localStorage.
 */
function readStorage(key, fallback = []) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`[OrderStore] Error reading ${key} from storage:`, err);
    return fallback;
  }
}

/**
 * Safely write JSON to localStorage.
 */
function writeStorage(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[OrderStore] Error writing ${key} to storage:`, err);
    return false;
  }
}

export const OrderStore = {
  /**
   * Save or update an order record.
   * @param {Object} order
   * @returns {Object} saved order
   */
  saveOrder(order) {
    if (!order || !order.id) throw new Error('Order must contain an id');
    const orders = readStorage(ORDERS_STORAGE_KEY, []);
    const existingIndex = orders.findIndex(o => o.id === order.id);
    const now = new Date().toISOString();

    const orderRecord = {
      ...order,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      orders[existingIndex] = orderRecord;
    } else {
      orderRecord.createdAt = orderRecord.createdAt || now;
      orders.unshift(orderRecord);
    }

    writeStorage(ORDERS_STORAGE_KEY, orders);
    return orderRecord;
  },

  /**
   * Retrieve an order by its ID.
   * @param {string} orderId
   * @returns {Object|null}
   */
  getOrder(orderId) {
    const orders = readStorage(ORDERS_STORAGE_KEY, []);
    return orders.find(o => o.id === orderId || o.orderNumber === orderId) || null;
  },

  /**
   * Retrieve an order strictly by its human-friendly reference number.
   * @param {string} orderNumber
   * @returns {Object|null}
   */
  getOrderByNumber(orderNumber) {
    if (!orderNumber) return null;
    const orders = readStorage(ORDERS_STORAGE_KEY, []);
    return orders.find(o => o.orderNumber === orderNumber) || null;
  },

  /**
   * Update the order status directly.
   * @param {string} orderId
   * @param {string} newStatus
   * @param {Object} [extraFields]
   * @returns {Object|null}
   */
  updateOrderStatus(orderId, newStatus, extraFields = {}) {
    const order = this.getOrder(orderId);
    if (!order) return null;

    if (newStatus !== undefined) {
      order.orderStatus = newStatus;
    }
    Object.assign(order, extraFields);
    return this.saveOrder(order);
  },

  /**
   * Transition order status adhering to workflow state machine with audit history.
   * @param {string} orderId
   * @param {string} targetStatus
   * @param {Object} [metadata]
   * @returns {Object} updated order
   */
  transitionOrderStatus(orderId, targetStatus, metadata = {}) {
    const order = this.getOrder(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found for status transition.`);

    const currentStatus = order.orderStatus;
    const isValid = validateOrderStatusTransition(currentStatus, targetStatus, order.flow);
    if (!isValid) {
      throw new Error(`Invalid status transition from "${currentStatus}" to "${targetStatus}" for ${order.flow}.`);
    }

    const now = new Date().toISOString();
    order.orderStatus = targetStatus;
    order.history = order.history || [];
    order.history.push({
      from: currentStatus,
      to: targetStatus,
      timestamp: now,
      note: metadata.note || `Transitioned from ${currentStatus} to ${targetStatus}`,
      actor: metadata.actor || 'system'
    });

    if (metadata.pricing) {
      Object.assign(order.pricing, metadata.pricing);
    }

    return this.saveOrder(order);
  },

  /**
   * Link a historical or guest order to a customer account.
   * @param {string} orderId
   * @param {string} customerId
   * @returns {Object|null}
   */
  linkOrderToCustomer(orderId, customerId) {
    if (!orderId || !customerId) return null;
    const order = this.getOrder(orderId);
    if (!order) return null;

    order.customerId = customerId;
    order.isGuest = false;
    order.history = order.history || [];
    order.history.push({
      action: 'linked_to_customer',
      customerId,
      timestamp: new Date().toISOString(),
      note: `Guest order linked to registered customer ${customerId}`
    });

    return this.saveOrder(order);
  },

  /**
   * Authoritatively validate access to an order (URL token or customer session).
   * Prevents leaking another customer's order by guessing order IDs.
   * @param {string} orderId
   * @param {string} [token] - Security token from URL
   * @param {string} [authenticatedCustomerId] - Active customer ID from session
   * @returns {{ authorized: boolean, order: Object|null, reason?: string }}
   */
  validateOrderAccess(orderId, token = null, authenticatedCustomerId = null) {
    const order = this.getOrder(orderId);
    if (!order) {
      return { authorized: false, order: null, reason: 'ORDER_NOT_FOUND' };
    }

    // 1. Authorized via matching secret URL token (if token supplied, must match)
    if (token) {
      if (order.securityToken && token === order.securityToken) {
        return { authorized: true, order };
      }
      return { authorized: false, order: null, reason: 'INVALID_TOKEN' };
    }

    // 2. Authorized via authenticated customer ID (if customerId supplied, must match)
    if (authenticatedCustomerId) {
      if (order.customerId && authenticatedCustomerId === order.customerId) {
        return { authorized: true, order };
      }
      return { authorized: false, order: null, reason: 'CUSTOMER_MISMATCH' };
    }

    // 3. Fallback: Check active browser session storage
    if (typeof sessionStorage !== 'undefined') {
      const activeOrderToken = sessionStorage.getItem('slimky_active_order_token');
      const activeOrderId = sessionStorage.getItem('slimky_active_order_id');
      if (activeOrderToken && activeOrderToken === order.securityToken) {
        return { authorized: true, order };
      }
      if (activeOrderId && (activeOrderId === order.id || activeOrderId === order.orderNumber)) {
        return { authorized: true, order };
      }
    }

    // Denied: unauthorized access
    return { authorized: false, order: null, reason: 'ACCESS_DENIED' };
  },

  /**
   * Retrieve all orders for a specific authenticated customer.
   * @param {string} customerId
   * @returns {Array}
   */
  getOrdersByCustomer(customerId) {
    if (!customerId) return [];
    const orders = readStorage(ORDERS_STORAGE_KEY, []);
    return orders.filter(o => o.customerId === customerId);
  },

  /**
   * Retrieve all orders matching an email address.
   * @param {string} email
   * @returns {Array}
   */
  getOrdersByEmail(email) {
    if (!email) return [];
    const norm = String(email).trim().toLowerCase();
    const orders = readStorage(ORDERS_STORAGE_KEY, []);
    return orders.filter(o => o.customer?.email && o.customer.email.trim().toLowerCase() === norm);
  },

  /**
   * Save or update a payment record.
   * Strips CVV and masks card numbers before persisting.
   * @param {Object} payment
   * @returns {Object} saved payment
   */
  savePayment(payment) {
    if (!payment || !payment.id) throw new Error('Payment must contain an id');
    const sanitized = sanitizePaymentRecord(payment);
    const payments = readStorage(PAYMENTS_STORAGE_KEY, []);
    const existingIndex = payments.findIndex(p => p.id === sanitized.id);
    const now = new Date().toISOString();

    const paymentRecord = {
      ...sanitized,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      payments[existingIndex] = paymentRecord;
    } else {
      paymentRecord.createdAt = paymentRecord.createdAt || now;
      payments.unshift(paymentRecord);
    }

    writeStorage(PAYMENTS_STORAGE_KEY, payments);

    // If payment is linked to an order, keep order updated with latest payment.
    // Shipping payments are mirrored onto separate order fields so they never
    // clobber the (fully independent) product payment status.
    if (paymentRecord.orderId) {
      if (paymentRecord.purpose === 'shipping') {
        this.updateOrderStatus(paymentRecord.orderId, undefined, {
          shippingPaymentId: paymentRecord.id,
          shippingPaymentStatus: paymentRecord.status
        });
      } else {
        this.updateOrderStatus(paymentRecord.orderId, undefined, {
          latestPaymentId: paymentRecord.id,
          paymentId: paymentRecord.id,
          paymentStatus: paymentRecord.status
        });
      }
    }

    return paymentRecord;
  },

  /**
   * Retrieve all payment records.
   * @returns {Array<Object>}
   */
  getAllPayments() {
    return readStorage(PAYMENTS_STORAGE_KEY, []);
  },

  /**
   * Retrieve a payment by its ID.
   * @param {string} paymentId
   * @returns {Object|null}
   */
  getPayment(paymentId) {
    const payments = readStorage(PAYMENTS_STORAGE_KEY, []);
    return payments.find(p => p.id === paymentId) || null;
  },

  /**
   * Retrieve a payment by its provider reference.
   * @param {string} reference
   * @returns {Object|null}
   */
  getPaymentByReference(reference) {
    const payments = readStorage(PAYMENTS_STORAGE_KEY, []);
    return payments.find(p => p.providerReference === reference) || null;
  },

  /**
   * Update payment status and failure reason / verification timestamp.
   * @param {string} paymentId
   * @param {string} status
   * @param {Object} [details]
   * @returns {Object|null}
   */
  updatePaymentStatus(paymentId, status, details = {}) {
    const payment = this.getPayment(paymentId);
    if (!payment) return null;

    payment.status = status;
    if (details.failureReason !== undefined) payment.failureReason = details.failureReason;
    if (details.verifiedAt !== undefined) payment.verifiedAt = details.verifiedAt;
    if (details.metadata) payment.metadata = { ...payment.metadata, ...details.metadata };

    return this.savePayment(payment);
  },

  /**
   * Retrieve all orders for current device/session.
   * @returns {Array}
   */
  getAllOrders() {
    return readStorage(ORDERS_STORAGE_KEY, []);
  },

  /**
   * Retrieve latest created order.
   * @returns {Object|null}
   */
  getLatestOrder() {
    const orders = this.getAllOrders();
    return orders.length > 0 ? orders[0] : null;
  },

  /**
   * Check if an idempotency key has already been processed.
   * @param {string} key
   * @returns {boolean}
   */
  hasIdempotencyKey(key) {
    if (!key) return false;
    const store = readStorage(IDEMPOTENCY_STORAGE_KEY, {});
    return !!store[key];
  },

  /**
   * Get cached response for an idempotency key.
   * @param {string} key
   * @returns {Object|null}
   */
  getIdempotencyRecord(key) {
    if (!key) return null;
    const store = readStorage(IDEMPOTENCY_STORAGE_KEY, {});
    return store[key] || null;
  },

  /**
   * Record processed idempotency key with its outcome.
   * @param {string} key
   * @param {Object} outcome
   */
  recordIdempotencyKey(key, outcome) {
    if (!key) return;
    const store = readStorage(IDEMPOTENCY_STORAGE_KEY, {});
    store[key] = {
      outcome: sanitizePaymentRecord(outcome),
      recordedAt: new Date().toISOString()
    };
    writeStorage(IDEMPOTENCY_STORAGE_KEY, store);
  },

  /**
   * Safely recover any stale / in-flight 'processing' payments interrupted by page reload or navigation.
   * Prevents customer from being permanently locked out and guarantees orders do not become 'paid' without verification.
   * @returns {number} count of recovered transactions
   */
  recoverStaleProcessing() {
    const payments = readStorage(PAYMENTS_STORAGE_KEY, []);
    let recoveredCount = 0;

    payments.forEach(p => {
      if (p.status === 'processing') {
        p.status = 'failed';
        p.failureReason = 'Previous payment session was interrupted. You may safely retry.';
        p.updatedAt = new Date().toISOString();
        recoveredCount++;

        // Also ensure linked order is NOT marked paid
        if (p.orderId) {
          const order = this.getOrder(p.orderId);
          if (order) {
            if (p.purpose === 'shipping') {
              // Never touch the (independent) product payment/order status here.
              if (order.orderStatus === 'shipping_payment_pending') {
                order.shippingPaymentStatus = 'failed';
                this.saveOrder(order);
              }
            } else if (order.orderStatus !== 'paid') {
              order.orderStatus = 'pending_payment';
              order.paymentStatus = 'failed';
              this.saveOrder(order);
            }
          }
        }
      }
    });

    if (recoveredCount > 0) {
      writeStorage(PAYMENTS_STORAGE_KEY, payments);
    }
    return recoveredCount;
  },

  /**
   * Record a persistent internal note on the order (admin only, hidden from public).
   * @param {string} orderId 
   * @param {string} noteText 
   * @param {string} [author] 
   * @returns {Object} updated order
   */
  addInternalNote(orderId, noteText, author = 'Admin') {
    const order = this.getOrder(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);
    if (!noteText || !String(noteText).trim()) {
      throw new Error('Note text cannot be empty.');
    }

    order.metadata = order.metadata || {};
    order.metadata.internalNotes = order.metadata.internalNotes || [];
    const noteEntry = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: String(noteText).trim(),
      author: String(author || 'Admin'),
      createdAt: new Date().toISOString()
    };
    order.metadata.internalNotes.push(noteEntry);

    order.history = order.history || [];
    order.history.push({
      action: 'internal_note_added',
      author: noteEntry.author,
      timestamp: noteEntry.createdAt,
      note: `Internal note added by ${noteEntry.author}`
    });

    return this.saveOrder(order);
  },

  /**
   * Save or update Nigeria shipping details (manual entry, zero automated rates).
   * @param {string} orderId 
   * @param {Object} details 
   * @param {Object} [meta] 
   * @returns {Object} updated order
   */
  saveNigeriaShippingDetails(orderId, details = {}, meta = {}) {
    const order = this.getOrder(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);

    order.shippingDetails = {
      provider: details.provider || details.shippingProvider || 'Local Courier',
      deliveryMethod: details.deliveryMethod || 'Doorstep Delivery',
      shippingFee: typeof details.shippingFee === 'number' ? details.shippingFee : (parseFloat(details.shippingFee) || null),
      customerContactStatus: details.customerContactStatus || details.contactStatus || 'not_contacted',
      shippingNotes: details.shippingNotes || details.notes || '',
      updatedAt: new Date().toISOString()
    };

    if (order.shippingDetails.shippingFee !== null && !isNaN(order.shippingDetails.shippingFee)) {
      order.pricing = order.pricing || {};
      order.pricing.shippingFee = order.shippingDetails.shippingFee;
      order.pricing.shippingAmount = order.shippingDetails.shippingFee;
      order.pricing.shippingStatus = `Calculated (₦${order.shippingDetails.shippingFee.toLocaleString()})`;
    }

    order.history = order.history || [];
    order.history.push({
      action: 'nigeria_shipping_updated',
      actor: meta.actor || 'admin',
      timestamp: new Date().toISOString(),
      note: `Nigeria shipping recorded: Provider=${order.shippingDetails.provider}, Contact=${order.shippingDetails.customerContactStatus}`
    });

    return this.saveOrder(order);
  },

  /**
   * Save and dispatch a shipping quote (flow-agnostic: Nigeria or international).
   * @param {string} orderId
   * @param {Object} quoteData
   * @param {Object} [meta]
   * @returns {Object} updated order
   */
  updateShippingQuote(orderId, quoteData = {}, meta = {}) {
    const order = this.getOrder(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);

    const amount = typeof quoteData.amount === 'number' ? quoteData.amount : (parseFloat(quoteData.quoteAmount || quoteData.amount) || 0);
    const currency = quoteData.currency || 'NGN';
    const provider = quoteData.provider || 'DHL Express';
    const method = quoteData.method || 'Standard International Courier';
    const estimatedDelivery = quoteData.estimatedDelivery || quoteData.estimatedDays || '';
    const notes = quoteData.notes || '';
    const status = quoteData.status || 'sent';

    order.shippingQuote = {
      amount,
      quoteAmount: amount,
      currency,
      provider,
      method,
      estimatedDelivery,
      notes,
      status,
      quoteDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    order.pricing = order.pricing || {};
    order.pricing.shippingAmount = amount;
    order.pricing.shippingFee = amount;
    order.pricing.shippingStatus = `Quote Sent (${currency} ${amount.toLocaleString()})`;

    // Save quote data first so it is persisted
    this.saveOrder(order);

    // Automatically advance state from shipping_quote_required to shipping_quote_sent
    if (order.orderStatus === 'shipping_quote_required' && status === 'sent') {
      return this.transitionOrderStatus(order.id, 'shipping_quote_sent', {
        actor: meta.actor || 'admin',
        note: `Shipping quote of ${currency} ${amount} sent via ${provider}`
      });
    } else {
      order.history = order.history || [];
      order.history.push({
        action: 'shipping_quote_recorded',
        actor: meta.actor || 'admin',
        timestamp: new Date().toISOString(),
        note: `Shipping quote recorded: ${currency} ${amount} (${provider} - ${method})`
      });
      return this.saveOrder(order);
    }
  },

  /**
   * Record customer acceptance or rejection of international shipping quote.
   * @param {string} orderId 
   * @param {'accepted'|'rejected'} response 
   * @param {string} [notes] 
   * @param {Object} [meta] 
   * @returns {Object} updated order
   */
  recordCustomerQuoteResponse(orderId, response, notes = '', meta = {}) {
    const order = this.getOrder(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);
    if (!order.shippingQuote) throw new Error(`Order has no active shipping quote.`);

    const now = new Date().toISOString();
    if (response === 'accepted') {
      order.shippingQuote.status = 'accepted';
      order.shippingQuote.acceptedAt = now;
      order.shippingQuote.customerNotes = notes;
      this.saveOrder(order);
      return this.transitionOrderStatus(order.id, 'shipping_payment_pending', {
        actor: meta.actor || 'customer',
        note: `Customer accepted shipping quote. Awaiting shipping payment.`
      });
    } else if (response === 'rejected') {
      order.shippingQuote.status = 'rejected';
      order.shippingQuote.rejectedAt = now;
      order.shippingQuote.customerNotes = notes;
      this.saveOrder(order);
      return this.transitionOrderStatus(order.id, 'shipping_quote_required', {
        actor: meta.actor || 'customer',
        note: `Customer rejected quote (${notes || 'No reason provided'}). Revised quote required.`
      });
    } else {
      throw new Error(`Invalid quote response "${response}". Must be 'accepted' or 'rejected'.`);
    }
  },

  /**
   * Confirm that customer has completed shipping payment.
   * @param {string} orderId 
   * @param {Object} details 
   * @param {Object} [meta] 
   * @returns {Object} updated order
   */
  confirmShippingPayment(orderId, details = {}, meta = {}) {
    const order = this.getOrder(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);

    order.shippingPayment = {
      status: 'confirmed',
      reference: details.reference || `SHIP-PAY-${Date.now()}`,
      notes: details.notes || '',
      confirmedAt: new Date().toISOString(),
      confirmedBy: meta.actor || 'admin'
    };

    if (order.shippingQuote) {
      order.shippingQuote.status = 'paid';
    }

    if (order.pricing) {
      const quoteAmt = order.shippingQuote?.amount || order.pricing.shippingAmount || 0;
      order.pricing.totalPaid = (order.pricing.totalPaid || 0) + quoteAmt;
      order.pricing.shippingStatus = 'Shipping Paid';
    }

    this.saveOrder(order);

    if (order.orderStatus === 'shipping_payment_pending') {
      return this.transitionOrderStatus(order.id, 'ready_for_dispatch', {
        actor: meta.actor || 'admin',
        note: `Shipping payment confirmed (${order.shippingPayment.reference}). Order ready for dispatch.`
      });
    }

    return this.getOrder(orderId);
  },

  /**
   * Record a verified, real shipping payment (processed via the payment abstraction,
   * e.g. Slimky DemoPay) and advance the order to shipping_payment_confirmed.
   * Distinct from confirmShippingPayment, which is a manual admin-recorded confirmation
   * used for the international phone/quote workflow.
   * @param {string} orderId
   * @param {Object} payment - The verified, successful shipping payment record
   * @param {Object} [meta]
   * @returns {Object} updated order
   */
  recordShippingPaymentSuccess(orderId, payment, meta = {}) {
    const order = this.getOrder(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);

    const amount = Number(payment.amount) || 0;

    order.shippingPayment = {
      status: 'confirmed',
      paymentId: payment.id,
      reference: payment.providerReference,
      amount,
      confirmedAt: new Date().toISOString(),
      confirmedBy: meta.actor || 'customer'
    };

    if (order.shippingQuote) {
      order.shippingQuote.status = 'paid';
    }

    order.pricing = order.pricing || {};
    order.pricing.totalPaid = (order.pricing.totalPaid || 0) + amount;
    order.pricing.shippingStatus = 'Shipping Paid';

    this.saveOrder(order);

    if (order.orderStatus === 'shipping_payment_pending') {
      return this.transitionOrderStatus(order.id, 'shipping_payment_confirmed', {
        actor: meta.actor || 'customer',
        note: `Shipping payment confirmed via Demo Payment (${payment.providerReference}).`
      });
    }

    return this.getOrder(orderId);
  },

  /**
   * Mark order as shipped with actual carrier tracking information.
   * @param {string} orderId 
   * @param {Object} trackingData 
   * @param {Object} [meta] 
   * @returns {Object} updated order
   */
  markOrderShipped(orderId, trackingData = {}, meta = {}) {
    const order = this.getOrder(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);

    // Phase A6 §11 duplicate-action guard: dispatching twice must not append
    // a second "shipped" history entry. Refresh/retry after a successful
    // dispatch returns the existing order unchanged.
    if (order.orderStatus === 'shipped' || order.orderStatus === 'delivered') {
      return order;
    }

    if (!trackingData.trackingNumber || !String(trackingData.trackingNumber).trim()) {
      throw new Error('A valid carrier tracking number is required to mark order as shipped.');
    }

    order.tracking = {
      trackingNumber: String(trackingData.trackingNumber).trim(),
      carrier: trackingData.carrier || order.shippingQuote?.provider || order.shippingDetails?.provider || 'Carrier',
      trackingUrl: trackingData.trackingUrl || '',
      notes: trackingData.notes || '',
      dispatchedAt: new Date().toISOString()
    };

    order.shipping = {
      ...(order.shipping || {}),
      trackingNumber: order.tracking.trackingNumber,
      carrier: order.tracking.carrier,
      trackingUrl: order.tracking.trackingUrl,
      dispatchedAt: order.tracking.dispatchedAt
    };

    this.saveOrder(order);

    return this.transitionOrderStatus(order.id, 'shipped', {
      actor: meta.actor || 'admin',
      note: `Dispatched with ${order.tracking.carrier}. Tracking #${order.tracking.trackingNumber}`
    });
  },

  /**
   * Mark a shipped order as delivered (Milestone C20.9).
   * @param {string} orderId
   * @param {Object} [meta]
   * @returns {Object} updated order
   */
  markOrderDelivered(orderId, meta = {}) {
    const order = this.getOrder(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);

    // Phase A6 §11 duplicate-action guard: a delivered order is terminal.
    // Retry after a successful delivery returns the existing order unchanged.
    if (order.orderStatus === 'delivered') {
      return order;
    }

    order.delivery = order.delivery || {};
    order.delivery.deliveredAt = new Date().toISOString();
    this.saveOrder(order);

    return this.transitionOrderStatus(order.id, 'delivered', {
      actor: meta.actor || 'admin',
      note: 'Order marked as delivered.'
    });
  },

  /**
   * Clear all stored orders, payments, and idempotency records (for testing).
   */
  clearAll() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ORDERS_STORAGE_KEY);
      localStorage.removeItem(PAYMENTS_STORAGE_KEY);
      localStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
    }
  }
};
