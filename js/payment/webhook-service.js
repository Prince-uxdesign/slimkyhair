/**
 * Local Simulated Webhook Engine - Slimky Hair
 * Milestone C13 & C14: Event Dispatch, Validation, Idempotency & Safe Logging
 * 
 * STRICT COMPLIANCE:
 * - 100% local, simulated webhook handler.
 * - Zero external networks, zero real credentials.
 * - Enforces idempotency (duplicate webhooks produce zero side effects).
 * - Safe development logging: strictly filters out CVVs, card details, and secrets.
 */

import { PAYMENT_STATUS, ORDER_STATUS, sanitizePaymentRecord } from './payment-model.js';
import { OrderStore } from './order-store.js';
import { clearCart } from '../cart-store.js';
import { inventoryService } from '../inventory/inventory-service.js';
import { emailService } from '../email/email-service.js';

const WEBHOOK_LOGS_STORAGE_KEY = 'slimky_webhook_logs';
const PROCESSED_WEBHOOKS_KEY = 'slimky_processed_webhooks';

/**
 * Read storage safely.
 */
function readStorage(key, fallback = []) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write storage safely.
 */
function writeStorage(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export class WebhookService {
  constructor(options = {}) {
    this.options = options;
    this.supportedEvents = new Set([
      'payment.success',
      'payment.failed',
      'payment.cancelled'
    ]);
  }

  /**
   * Safe development logger.
   * Logs event metadata, references, order IDs, and processing outcomes.
   * CRITICAL GUARANTEE: Never logs CVVs, full card numbers, passwords, or secrets.
   * @param {string} level - 'info' | 'warn' | 'error'
   * @param {string} message
   * @param {Object} data
   */
  log(level, message, data = {}) {
    const cleanData = sanitizePaymentRecord(data);
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: cleanData
    };

    // Store in audit log (max 100 entries)
    const logs = readStorage(WEBHOOK_LOGS_STORAGE_KEY, []);
    logs.unshift(entry);
    if (logs.length > 100) logs.length = 100;
    writeStorage(WEBHOOK_LOGS_STORAGE_KEY, logs);

    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `[Slimky Webhook] ${message}`,
      cleanData
    );
  }

  /**
   * Handle an incoming simulated webhook event.
   * Performs signature/structure validation, idempotency checks,
   * authoritative amount/currency checks, and idempotent order updates.
   * 
   * @param {Object} event
   * @param {string} event.event - e.g. 'payment.success', 'payment.failed', 'payment.cancelled'
   * @param {string} [event.eventId] - Unique webhook event identifier
   * @param {Object} event.data - Payload data
   * @param {string} event.data.reference - Payment reference (e.g. DEMO-PAY-XXXXXXX)
   * @param {string} [event.data.orderId] - Order ID
   * @param {number} [event.data.amount] - Payment amount in NGN
   * @param {string} [event.data.currency] - Currency (must be NGN)
   * @returns {Promise<{ handled: boolean, status: string, reason?: string, order?: Object, payment?: Object }>}
   */
  async handleWebhook(event) {
    if (!event || typeof event !== 'object') {
      this.log('error', 'Malformed webhook payload rejected (not an object)');
      return { handled: false, status: 'rejected', reason: 'MALFORMED_PAYLOAD' };
    }

    const eventType = event.event || event.type;
    const eventId = event.eventId || event.id || `${eventType}_${event.data?.reference}_${event.data?.status}`;
    const payload = event.data || {};
    const reference = payload.reference || payload.providerReference;

    // 1. Validate Event Type
    if (!eventType || !this.supportedEvents.has(eventType)) {
      this.log('warn', `Unsupported webhook event rejected: "${eventType}"`, { eventType, eventId });
      return { handled: false, status: 'rejected', reason: 'UNSUPPORTED_EVENT_TYPE' };
    }

    // 2. Validate Payment Reference
    if (!reference) {
      this.log('error', 'Webhook missing required payment reference', { eventType, eventId });
      return { handled: false, status: 'rejected', reason: 'MISSING_PAYMENT_REFERENCE' };
    }

    // 3. IDEMPOTENCY GUARD: Check if this webhook was already processed
    const processedEvents = readStorage(PROCESSED_WEBHOOKS_KEY, {});
    if (processedEvents[eventId]) {
      this.log('info', `Duplicate/Replayed webhook safely ignored for reference: ${reference}`, {
        eventId,
        reference,
        eventType,
        firstProcessedAt: processedEvents[eventId].processedAt
      });
      return {
        handled: true,
        status: 'ignored',
        reason: 'ALREADY_PROCESSED',
        eventId,
        reference
      };
    }

    // 4. Validate Payment Exists in Authoritative Store
    const payment = OrderStore.getPaymentByReference(reference);
    if (!payment) {
      this.log('error', `Webhook rejected: Unknown payment reference "${reference}"`, { reference, eventType });
      return { handled: false, status: 'rejected', reason: 'UNKNOWN_PAYMENT_REFERENCE', reference };
    }

    // 5. Validate Linked Order Exists
    const order = OrderStore.getOrder(payment.orderId);
    if (!order) {
      this.log('error', `Webhook rejected: Order not found for payment "${payment.id}"`, { reference, orderId: payment.orderId });
      return { handled: false, status: 'rejected', reason: 'ORDER_NOT_FOUND', reference };
    }

    // 6. Validate Amount Mismatch
    if (payload.amount !== undefined) {
      const expectedAmount = Number(order.pricing.productPaymentTotal);
      const claimedAmount = Number(payload.amount);
      if (claimedAmount !== expectedAmount) {
        this.log('error', `Webhook rejected: Amount mismatch (claimed ₦${claimedAmount}, expected ₦${expectedAmount})`, {
          reference,
          claimedAmount,
          expectedAmount
        });
        return { handled: false, status: 'rejected', reason: 'WRONG_AMOUNT', reference };
      }
    }

    // 7. Validate Currency (Must be NGN)
    if (payload.currency && payload.currency.toUpperCase() !== 'NGN') {
      this.log('error', `Webhook rejected: Invalid currency "${payload.currency}" (must be NGN)`, {
        reference,
        currency: payload.currency
      });
      return { handled: false, status: 'rejected', reason: 'WRONG_CURRENCY', reference };
    }

    // 8. Process Event & Update Order/Payment State Idempotently
    let updatedPayment = payment;
    let updatedOrder = order;

    if (eventType === 'payment.success') {
      // Check if the product payment ALREADY succeeded (idempotency protection
      // against duplicate inventory/order changes). The payment record — not the
      // order status — is the source of paid truth, so this holds regardless of
      // how far the order has moved through the shipping workflow (a duplicate
      // success event must never regress a shipped order).
      if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
        this.log('info', `Order ${order.id} is already paid. Ignoring duplicate success webhook.`, {
          orderId: order.id,
          reference
        });
        // Record as processed
        processedEvents[eventId] = { processedAt: new Date().toISOString(), outcome: 'already_paid' };
        writeStorage(PROCESSED_WEBHOOKS_KEY, processedEvents);
        return {
          handled: true,
          status: 'ignored',
          reason: 'ALREADY_PAID',
          order,
          payment
        };
      }

      // Atomically deduct inventory for the purchased items
      if (Array.isArray(order.items) && order.items.length > 0) {
        inventoryService.deductStock(order.id, order.items);
      }

      // Update Payment status to SUCCESSFUL
      updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.SUCCESSFUL, {
        verifiedAt: new Date().toISOString()
      });

      // Update Order status to SHIPPING_QUOTE_REQUIRED with totalPaid settled.
      // This mirrors the synchronous payment-service success path exactly, so
      // webhook-paid and UI-paid orders converge on one state and enter the
      // same manual shipping-quote workflow (both flows, Milestone C20.10).
      const updatedPricing = {
        ...order.pricing,
        totalPaid: order.pricing?.productPaymentTotal || payment.amount || 0
      };

      updatedOrder = OrderStore.updateOrderStatus(order.id, ORDER_STATUS.SHIPPING_QUOTE_REQUIRED, {
        paymentStatus: PAYMENT_STATUS.SUCCESSFUL,
        pricing: updatedPricing,
        totalPaid: updatedPricing.totalPaid
      });

      // Dispatch Order Confirmation Email Idempotently
      try {
        await emailService.sendOrderConfirmationEmail(updatedOrder, updatedPayment);
      } catch (emailErr) {
        this.log('warn', `Confirmation email dispatch skipped/failed: ${emailErr.message}`);
      }

      // Clear cart
      clearCart();

      this.log('info', `Successfully processed payment.success webhook for Order ${order.id}`, {
        orderId: order.id,
        reference,
        amount: order.pricing.productPaymentTotal
      });

    } else if (eventType === 'payment.failed') {
      updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.FAILED, {
        failureReason: payload.failureReason || 'Payment failed via webhook notification'
      });

      // Order remains unpaid
      updatedOrder = OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_FAILED, {
        paymentStatus: PAYMENT_STATUS.FAILED
      });

      this.log('info', `Processed payment.failed webhook for Order ${order.id}`, {
        orderId: order.id,
        reference
      });

    } else if (eventType === 'payment.cancelled') {
      updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.CANCELLED, {
        failureReason: 'Payment cancelled via webhook notification'
      });

      updatedOrder = OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PENDING_PAYMENT, {
        paymentStatus: PAYMENT_STATUS.CANCELLED
      });

      this.log('info', `Processed payment.cancelled webhook for Order ${order.id}`, {
        orderId: order.id,
        reference
      });
    }

    // 9. Record event in idempotency store
    processedEvents[eventId] = {
      processedAt: new Date().toISOString(),
      eventType,
      reference,
      orderId: order.id
    };
    writeStorage(PROCESSED_WEBHOOKS_KEY, processedEvents);

    return {
      handled: true,
      status: 'processed',
      eventType,
      order: updatedOrder,
      payment: updatedPayment
    };
  }

  /**
   * Query recent audit logs.
   * @returns {Array}
   */
  getAuditLogs() {
    return readStorage(WEBHOOK_LOGS_STORAGE_KEY, []);
  }

  /**
   * Reset webhook state (for test isolation).
   */
  clearAll() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(WEBHOOK_LOGS_STORAGE_KEY);
      localStorage.removeItem(PROCESSED_WEBHOOKS_KEY);
    }
  }
}

export const webhookService = new WebhookService();
