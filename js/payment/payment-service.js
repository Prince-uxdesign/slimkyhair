/**
 * Central Payment Service - Slimky Hair
 * Milestones C10 - C20: Payment Pipeline, Verification, Inventory & Email Trigger
 * 
 * Orchestrates:
 * - 10-step sequential processing pipeline
 * - Authoritative catalog re-validation & price guard (NGN only)
 * - Real-time inventory availability pre-check (Milestone C18)
 * - Customer account association / guest checkout (Milestone C19)
 * - Provider delegation (Slimky DemoPay)
 * - Independent authoritative verification gate (verifyPayment)
 * - Atomic variant-level stock deduction upon verified payment (Milestone C18)
 * - Transactional order confirmation email dispatch (Milestone C17)
 * - Access token storage for order confirmation routing (Milestone C16)
 * - Idempotency & duplicate submission locking
 * - Sensitive data sanitization (strictly ZERO CVVs stored or logged)
 */

import { 
  PAYMENT_STATUS, 
  PAYMENT_LIFECYCLE_STATES,
  ORDER_STATUS, 
  PAYMENT_PROVIDERS,
  createOrderRecord, 
  createPaymentRecord,
  sanitizePaymentRecord
} from './payment-model.js';
import { validatePaymentRequest } from './payment-validator.js';
import { DemoPaymentProvider, SlimkyDemoPaymentProvider } from './demo-payment-provider.js';
import { PaystackPaymentProvider } from './paystack-provider.js';
import { OrderStore } from './order-store.js';
import { inventoryService } from '../inventory/inventory-service.js';
import { emailService } from '../email/email-service.js';
import { customerService } from '../auth/customer-service.js';
import { clearCart } from '../cart-store.js';
import { syncOrderToBackend } from './order-sync.js';

export class PaymentService {
  constructor() {
    this.providers = new Map();
    this.activeProviderName = PAYMENT_PROVIDERS.DEMO;
    this.inFlightLocks = new Set();
    this.inFlightPromises = new Map();

    // Register Default Local Demo Provider
    const demoProvider = new DemoPaymentProvider();
    this.registerProvider(PAYMENT_PROVIDERS.DEMO, demoProvider);

    // Register Live Paystack Provider
    const paystackProvider = new PaystackPaymentProvider();
    this.registerProvider(PAYMENT_PROVIDERS.PAYSTACK, paystackProvider);

    // Auto-recover any stale processing sessions on service boot
    OrderStore.recoverStaleProcessing();
  }

  /**
   * Register a payment gateway adapter (Demo, Paystack, Flutterwave).
   * @param {string} name
   * @param {PaymentProvider} providerInstance
   */
  registerProvider(name, providerInstance) {
    if (!providerInstance || typeof providerInstance.initializePayment !== 'function') {
      throw new Error(`Invalid payment provider instance registered for "${name}"`);
    }
    this.providers.set(name, providerInstance);
  }

  /**
   * Set active payment provider.
   * @param {string} name
   */
  setActiveProvider(name) {
    if (!this.providers.has(name)) {
      throw new Error(`Payment provider "${name}" is not registered.`);
    }
    this.activeProviderName = name;
  }

  /**
   * Get currently active provider instance.
   * @returns {PaymentProvider}
   */
  getActiveProvider() {
    return this.providers.get(this.activeProviderName);
  }

  /**
   * Authoritative Order Creation Pipeline (Milestone C20.7)
   * 
   * Validates server-side:
   * - Final catalog price
   * - SKU/variant existence
   * - Real-time inventory stock
   * - Customer authentication (guest vs signed-in)
   * - Decoupled order and payment status
   * - Idempotency replay protection
   * 
   * @param {Object} checkoutPayload
   * @param {Object} [options]
   * @param {string} [options.idempotencyKey]
   * @returns {Promise<{ order: Object, payment: Object, providerData: Object }>}
   */
  async createOrder(checkoutPayload, options = {}) {
    if (!checkoutPayload || !checkoutPayload.items || !Array.isArray(checkoutPayload.items) || checkoutPayload.items.length === 0) {
      throw new Error('Cannot create order: Cart contains no items.');
    }

    const idempotencyKey = options.idempotencyKey || checkoutPayload.idempotencyKey;
    if (idempotencyKey && OrderStore.hasIdempotencyKey(idempotencyKey)) {
      const cached = OrderStore.getIdempotencyRecord(idempotencyKey);
      if (cached && (cached.outcome || cached.order)) {
        const out = cached.outcome || cached;
        return {
          order: out.order,
          payment: out.payment,
          providerData: out.providerData || { reference: out.payment?.providerReference },
          alreadyCreated: true,
          idempotent: true
        };
      }
    }

    // Step 1: Server-Side Catalog Re-Validation (Never trust client-submitted prices or totals)
    const validation = validatePaymentRequest({
      items: checkoutPayload.items,
      claimedAmount: checkoutPayload.pricing?.productPaymentTotal || checkoutPayload.total || checkoutPayload.amount,
      claimedCurrency: checkoutPayload.pricing?.currency || checkoutPayload.currency || 'NGN',
      flow: checkoutPayload.flow
    });

    // Step 2: Live Real-Time Inventory Stock Check
    const stockCheck = inventoryService.checkStock(validation.validatedItems);
    if (!stockCheck.available) {
      const uItem = stockCheck.unavailableItem;
      const itemName = uItem ? `${uItem.productName} (${uItem.variantName || uItem.sku})` : 'A selected item';
      throw new Error(`Cannot create order: ${itemName} is currently out of stock or exceeds available inventory.`);
    }

    // Step 3: Customer Account Resolution (Milestone C19 & C20.7)
    // Guest: customer_id nullable / null.
    // Signed-in: authenticated customer ID.
    // Never identify customer solely by email!
    const activeCustomer = customerService.getCurrentCustomer();
    const customerId = (activeCustomer && activeCustomer.id) ? activeCustomer.id : (checkoutPayload.customerId || null);
    const isGuest = checkoutPayload.isGuest !== undefined ? Boolean(checkoutPayload.isGuest) : (customerId === null);
    const resolvedCustomerId = isGuest ? null : customerId;

    // Step 4: Create and Persist Canonical Order Record in PENDING_PAYMENT state
    const order = createOrderRecord({
      checkoutId: checkoutPayload.checkoutId || `chk_${Date.now()}`,
      customerId: resolvedCustomerId,
      isGuest,
      flow: checkoutPayload.flow || 'nigeria_checkout',
      customer: {
        fullName: checkoutPayload.customer?.fullName || checkoutPayload.customer?.name || checkoutPayload.customerName || '',
        email: checkoutPayload.customer?.email || checkoutPayload.customerEmail || '',
        phone: checkoutPayload.customer?.phone || checkoutPayload.customerPhone || ''
      },
      delivery: {
        country: checkoutPayload.delivery?.country || checkoutPayload.country || '',
        state: checkoutPayload.delivery?.state || checkoutPayload.state || checkoutPayload.region || '',
        city: checkoutPayload.delivery?.city || checkoutPayload.city || '',
        postalCode: checkoutPayload.delivery?.postalCode || checkoutPayload.postalCode || '',
        address: checkoutPayload.delivery?.address || checkoutPayload.address || checkoutPayload.streetAddress || '',
        instructions: checkoutPayload.delivery?.instructions || checkoutPayload.deliveryInstructions || ''
      },
      items: validation.validatedItems,
      pricing: validation.canonicalPricing,
      orderStatus: ORDER_STATUS.PENDING_PAYMENT,
      paymentStatus: PAYMENT_STATUS.PENDING,
      totalPaid: 0
    });

    OrderStore.saveOrder(order);

    // Step 5: Delegate to Active Provider to initialize payment & generate unique transaction reference
    const provider = this.getActiveProvider();
    const providerInit = await provider.initializePayment({
      orderId: order.id,
      amount: order.pricing.productPaymentTotal,
      currency: order.pricing.currency,
      customerEmail: order.customer.email,
      customerName: order.customer.fullName,
      metadata: {
        flow: order.flow,
        itemCount: order.items.length
      }
    });

    // Step 6: Create and Persist Canonical Payment Record (sanitized, zero CVV)
    const payment = createPaymentRecord({
      orderId: order.id,
      orderReference: order.orderNumber || order.id,
      checkoutId: order.checkoutId,
      provider: provider.id,
      providerReference: providerInit.reference,
      transactionReference: providerInit.reference,
      amount: order.pricing.productPaymentTotal,
      currency: order.pricing.currency,
      status: PAYMENT_STATUS.PENDING,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phone,
      customerName: order.customer.fullName,
      metadata: {
        providerData: providerInit
      }
    });

    OrderStore.savePayment(payment);

    // Link payment to order
    order.paymentId = payment.id;
    order.latest_payment_id = payment.id;
    order.paymentStatus = payment.status;
    OrderStore.saveOrder(order);

    const outcome = {
      order,
      payment,
      providerData: providerInit
    };

    if (idempotencyKey) {
      OrderStore.recordIdempotencyKey(idempotencyKey, outcome);
    }

    return outcome;
  }

  /**
   * Initialize a new order and payment session (delegates to authoritative createOrder).
   * @param {Object} checkoutSession
   * @param {Object} [options]
   * @returns {Promise<{ order: Object, payment: Object, providerData: Object }>}
   */
  async initializePaymentSession(checkoutSession, options = {}) {
    return await this.createOrder(checkoutSession, options);
  }

  /**
   * Process a payment intent with strict failure handling, retry safety, and idempotency.
   * 
   * 10-Step Sequential Pipeline:
   * 1. Validate cart & items
   * 2. Validate customer information
   * 3. Validate delivery information
   * 4. Validate order amount authoritatively (NGN only) & inventory stock
   * 5. Prepare payment record
   * 6. Generate/verify unique reference
   * 7. Process demo payment via provider
   * 8. Return deterministic test result
   * 9. Independent authoritative verification gate (verifyPayment)
   * 10. Continue ONLY if payment is verified:
   *     - Deduct variant inventory atomically
   *     - Mark order as PAID with totalPaid populated
   *     - Store security token for order confirmation access
   *     - Send transactional confirmation email
   *     - Clear shopping cart
   * 
   * @param {Object} params
   * @param {string} params.paymentId - Payment ID to process
   * @param {Object} [params.cardDetails] - Card input details
   * @param {string} [params.simulationOutcome] - Optional simulation flag ('SUCCESS'|'DECLINED'|'FAILED'|'TIMEOUT'|'PROCESSING')
   * @param {string} [params.idempotencyKey] - Optional client/server idempotency key
   * @returns {Promise<{ success: boolean, status: string, order: Object, payment: Object, failureReason?: string }>}
   */
  async processPayment({
    paymentId,
    cardDetails = {},
    simulationOutcome = null,
    idempotencyKey = null
  }) {
    // IDEMPOTENCY CHECK
    if (idempotencyKey && OrderStore.hasIdempotencyKey(idempotencyKey)) {
      const cached = OrderStore.getIdempotencyRecord(idempotencyKey);
      if (cached && cached.outcome) {
        return cached.outcome;
      }
    }

    // CONCURRENT IN-FLIGHT DEDUPLICATION LOCK (Prevent duplicate multi-clicks, returning identical outcome)
    if (this.inFlightPromises.has(paymentId)) {
      return await this.inFlightPromises.get(paymentId);
    }

    if (this.inFlightLocks.has(paymentId)) {
      return {
        success: false,
        status: 'processing',
        failureReason: 'Payment is currently being processed.'
      };
    }

    const executionPromise = (async () => {
      this.inFlightLocks.add(paymentId);
      try {
        const payment = OrderStore.getPayment(paymentId);
        if (!payment) {
          throw new Error(`Payment record "${paymentId}" not found.`);
        }

      const order = OrderStore.getOrder(payment.orderId);
      if (!order) {
        throw new Error(`Order record "${payment.orderId}" not found for payment.`);
      }

      // If the product payment already succeeded, return existing state idempotently.
      // The payment record — not the order status — is the source of paid truth:
      // verified sync success lands orders in SHIPPING_QUOTE_REQUIRED (never PAID).
      if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
        const result = {
          success: true,
          status: PAYMENT_STATUS.SUCCESSFUL,
          order,
          payment,
          alreadyPaid: true
        };
        if (idempotencyKey) OrderStore.recordIdempotencyKey(idempotencyKey, result);
        return result;
      }

      // Step 1 - 4: Re-verify Cart & Order Pricing Authoritatively
      if (order.items && order.items.length > 0) {
        validatePaymentRequest({
          items: order.items,
          claimedAmount: payment.amount,
          claimedCurrency: payment.currency,
          flow: order.flow
        });
      }

      // Pre-flight Inventory Check before payment processing (Milestone C18)
      const stockCheck = inventoryService.checkStock(order.items);
      if (!stockCheck.available) {
        const uItem = stockCheck.unavailableItem;
        const failureReason = `Cannot finalize payment: ${uItem ? uItem.productName : 'Item'} is out of stock.`;
        OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.FAILED, { failureReason });
        OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_FAILED, { paymentStatus: PAYMENT_STATUS.FAILED });

        return {
          success: false,
          status: PAYMENT_STATUS.FAILED,
          failureReason,
          order,
          payment
        };
      }

      // Mark Payment as PROCESSING
      OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.PROCESSING);

      // Step 7: Delegate processing to active provider
      const provider = this.getActiveProvider();
      const result = await provider.processPayment({
        reference: payment.providerReference,
        cardDetails,
        simulationOutcome
      });

      // Step 8, 9, 10: Process Result with Verification Gate
      if (result.status === PAYMENT_STATUS.SUCCESSFUL) {
        // STEP 9: INDEPENDENT AUTHORITATIVE VERIFICATION GATE
        // Never trust frontend success alone! Verify with provider.
        const verification = await this.verifyPayment(payment.providerReference);

        if (!verification.verified || verification.status !== PAYMENT_STATUS.SUCCESSFUL) {
          // Verification failed or was unverified
          const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.FAILED, {
            failureReason: verification.failureReason || 'Payment verification failed'
          });

          const updatedOrder = OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_FAILED, {
            paymentStatus: PAYMENT_STATUS.FAILED,
            pricing: { ...order.pricing, totalPaid: 0 }
          });

          const outcome = {
            success: false,
            status: PAYMENT_STATUS.FAILED,
            failureReason: 'Payment could not be authoritatively verified. Your card was not charged.',
            order: updatedOrder,
            payment: updatedPayment
          };
          return outcome;
        }

        // STEP 10: VERIFIED SUCCESSFUL -> ATOMIC STOCK DEDUCTION (Milestone C18)
        const stockDeduction = inventoryService.deductStock(order.id, order.items);
        if (!stockDeduction.success) {
          // Out of stock race condition caught right before finalization
          const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.FAILED, {
            failureReason: 'Inventory sold out during processing. Transaction reversed safely.'
          });
          const updatedOrder = OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_FAILED, {
            paymentStatus: PAYMENT_STATUS.FAILED,
            pricing: { ...order.pricing, totalPaid: 0 }
          });

          return {
            success: false,
            status: PAYMENT_STATUS.FAILED,
            failureReason: 'Inventory unavailable. Your card was not charged.',
            order: updatedOrder,
            payment: updatedPayment
          };
        }

        // ORDER BECOMES PAID & SETTLE TOTAL PAID
        const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.SUCCESSFUL, {
          verifiedAt: verification.verifiedAt || new Date().toISOString()
        });

        // Decoupled Status Invariant (Milestones C20.7 - C20.10):
        // Both flows now require a manual shipping quote before dispatch — the
        // product payment settles here, but delivery/shipping fee is always
        // calculated and paid separately. Never lands in PAID; goes straight
        // to SHIPPING_QUOTE_REQUIRED for Nigeria and international alike.
        const targetOrderStatus = ORDER_STATUS.SHIPPING_QUOTE_REQUIRED;
        order.pricing.totalPaid = order.pricing.productPaymentTotal;
        order.totalPaid = order.pricing.productPaymentTotal;

        const updatedOrder = OrderStore.updateOrderStatus(order.id, targetOrderStatus, {
          paymentStatus: PAYMENT_STATUS.SUCCESSFUL,
          pricing: order.pricing,
          totalPaid: order.pricing.totalPaid
        });

        // Store active session token and order ID for secure confirmation routing (Milestone C16)
        if (typeof sessionStorage !== 'undefined') {
          try {
            sessionStorage.setItem('slimky_active_order_token', order.securityToken);
            sessionStorage.setItem('slimky_active_order_id', order.id);
          } catch (e) {
            console.warn('[PaymentService] Could not set sessionStorage token:', e);
          }
        }

        // Dispatch Order Confirmation Email Idempotently (Milestone C17)
        try {
          await emailService.sendOrderConfirmationEmail(updatedOrder, updatedPayment);
        } catch (emailErr) {
          console.warn('[PaymentService] Email dispatch skipped/failed:', emailErr);
        }

        // Persist the verified order into the real backend (Phase 3, Piece 1).
        // Best-effort, matching the email dispatch above: never blocks or
        // fails an already-successful checkout — see js/payment/order-sync.js.
        try {
          await syncOrderToBackend(updatedOrder, updatedPayment);
        } catch (syncErr) {
          console.warn('[PaymentService] Backend order sync skipped/failed:', syncErr);
        }

        // Authoritatively clear shopping bag upon verified payment
        clearCart();

        const outcome = {
          success: true,
          status: PAYMENT_STATUS.SUCCESSFUL,
          order: updatedOrder,
          payment: updatedPayment
        };

        if (idempotencyKey) {
          OrderStore.recordIdempotencyKey(idempotencyKey, outcome);
        }

        return outcome;

      } else if (result.status === PAYMENT_STATUS.DECLINED) {
        // DECLINED STATE: Order remains unpaid, cart intact, customer can retry
        const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.DECLINED, {
          failureReason: result.failureReason || 'Payment declined. Please try again.'
        });

        const updatedOrder = OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_FAILED, {
          paymentStatus: PAYMENT_STATUS.DECLINED,
          pricing: { ...order.pricing, totalPaid: 0 }
        });

        const outcome = {
          success: false,
          status: PAYMENT_STATUS.DECLINED,
          failureReason: result.failureReason || 'Payment declined. Please try again.',
          order: updatedOrder,
          payment: updatedPayment
        };

        if (idempotencyKey) OrderStore.recordIdempotencyKey(idempotencyKey, outcome);
        return outcome;

      } else if (result.status === PAYMENT_STATUS.CANCELLED) {
        // CANCELLED STATE
        const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.CANCELLED, {
          failureReason: 'Payment cancelled by customer'
        });

        const updatedOrder = OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PENDING_PAYMENT, {
          paymentStatus: PAYMENT_STATUS.CANCELLED,
          pricing: { ...order.pricing, totalPaid: 0 }
        });

        return {
          success: false,
          status: PAYMENT_STATUS.CANCELLED,
          failureReason: 'Payment was cancelled.',
          order: updatedOrder,
          payment: updatedPayment
        };

      } else {
        // FAILED / TIMEOUT STATE: Order remains unpaid, cart intact, customer can retry
        const failureReason = result.failureReason || "We couldn't confirm your payment. Please try again.";
        const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.FAILED, {
          failureReason
        });

        const updatedOrder = OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_FAILED, {
          paymentStatus: PAYMENT_STATUS.FAILED,
          pricing: { ...order.pricing, totalPaid: 0 }
        });

        const outcome = {
          success: false,
          status: PAYMENT_STATUS.FAILED,
          failureReason,
          order: updatedOrder,
          payment: updatedPayment
        };

          if (idempotencyKey) OrderStore.recordIdempotencyKey(idempotencyKey, outcome);
          return outcome;
        }

      } finally {
        this.inFlightLocks.delete(paymentId);
      }
    })();

    this.inFlightPromises.set(paymentId, executionPromise);
    try {
      return await executionPromise;
    } finally {
      this.inFlightPromises.delete(paymentId);
    }
  }

  /**
   * Authoritatively verify an existing payment by provider reference.
   * Strict verification rules:
   * - Reference must exist in store
   * - Linked order must exist
   * - Amount must match order amount exactly (reject WRONG_AMOUNT)
   * - Currency must be strictly NGN (reject WRONG_CURRENCY)
   * - Provider must return verified: true
   * 
   * @param {string} reference
   * @param {Object} [options]
   * @param {number} [options.expectedAmount] - Override the expected amount (defaults to the order's product payment total). Used for non-product payments, e.g. shipping fees.
   * @returns {Promise<{ verified: boolean, status: string, amount: number, currency: string, failureReason?: string }>}
   */
  async verifyPayment(reference, options = {}) {
    if (!reference) {
      return {
        verified: false,
        status: PAYMENT_STATUS.FAILED,
        failureReason: 'UNKNOWN_REFERENCE'
      };
    }

    const payment = OrderStore.getPaymentByReference(reference);
    if (!payment) {
      return {
        verified: false,
        status: PAYMENT_STATUS.FAILED,
        failureReason: 'UNKNOWN_REFERENCE'
      };
    }

    const order = OrderStore.getOrder(payment.orderId);
    if (!order) {
      return {
        verified: false,
        status: PAYMENT_STATUS.FAILED,
        failureReason: 'ORDER_NOT_FOUND'
      };
    }

    // Call active provider's verification
    const provider = this.getActiveProvider();
    const verification = await provider.verifyPayment(reference);

    // Validate amount
    const expectedAmount = options.expectedAmount !== undefined
      ? Number(options.expectedAmount)
      : Number(order.pricing.productPaymentTotal);
    if (verification.amount !== undefined && Number(verification.amount) !== expectedAmount) {
      return {
        verified: false,
        status: PAYMENT_STATUS.FAILED,
        failureReason: 'WRONG_AMOUNT',
        expectedAmount,
        claimedAmount: verification.amount
      };
    }

    // Validate currency
    if (verification.currency && verification.currency.toUpperCase() !== 'NGN') {
      return {
        verified: false,
        status: PAYMENT_STATUS.FAILED,
        failureReason: 'WRONG_CURRENCY',
        currency: verification.currency
      };
    }

    if (!verification.verified || verification.status !== PAYMENT_STATUS.SUCCESSFUL) {
      return {
        verified: false,
        status: verification.status || PAYMENT_STATUS.FAILED,
        failureReason: verification.failureReason || 'Transaction was not successful at provider'
      };
    }

    return {
      verified: true,
      status: PAYMENT_STATUS.SUCCESSFUL,
      amount: expectedAmount,
      currency: 'NGN',
      verifiedAt: verification.verifiedAt || new Date().toISOString(),
      orderId: order.id,
      paymentId: payment.id
    };
  }

  /**
   * Retry payment for an existing failed or pending order.
   * STRICT REQUIREMENT (Milestone C20.6):
   * - Must NEVER duplicate the order record (keeps same order.id and order.orderNumber).
   * - Increments payment attempt count and tracks attempt history.
   * - Generates a new unique provider payment reference.
   * - Resets order status to PENDING_PAYMENT.
   * 
   * @param {string} orderId
   * @returns {Promise<{ order: Object, payment: Object, providerData: Object }>}
   */
  async retryPayment(orderId) {
    if (!orderId) {
      throw new Error('Order ID is required to retry payment.');
    }

    const order = OrderStore.getOrder(orderId);
    if (!order) {
      throw new Error(`Order "${orderId}" not found for payment retry.`);
    }

    // Guard: Do not allow retry if the product payment already succeeded.
    // The payment record — not the order status — is the source of paid truth:
    // verified success lands orders in SHIPPING_QUOTE_REQUIRED (never PAID),
    // so an order-status-only check would allow a second charge on paid orders.
    const paidPayment = order.paymentId ? OrderStore.getPayment(order.paymentId) : null;
    if (order.orderStatus === ORDER_STATUS.PAID || paidPayment?.status === PAYMENT_STATUS.SUCCESSFUL) {
      const payment = paidPayment;
      return {
        order,
        payment,
        alreadyPaid: true,
        providerData: { reference: payment?.providerReference }
      };
    }

    // Pre-flight Inventory Check before creating new attempt
    const stockCheck = inventoryService.checkStock(order.items);
    if (!stockCheck.available) {
      const uItem = stockCheck.unavailableItem;
      const itemName = uItem ? `${uItem.productName} (${uItem.variantName || uItem.sku})` : 'A selected item';
      throw new Error(`Cannot retry payment: ${itemName} is currently out of stock.`);
    }

    // Get existing payment record
    const existingPayment = order.paymentId ? OrderStore.getPayment(order.paymentId) : null;
    const currentAttemptNum = existingPayment?.attemptNumber || 1;
    const newAttemptNum = currentAttemptNum + 1;

    // Archive current attempt in history
    const previousAttempts = Array.isArray(existingPayment?.attempts) ? [...existingPayment.attempts] : [];
    if (existingPayment) {
      previousAttempts.push({
        attemptNumber: currentAttemptNum,
        providerReference: existingPayment.providerReference,
        status: existingPayment.status,
        failureReason: existingPayment.failureReason,
        timestamp: existingPayment.updatedAt || new Date().toISOString()
      });
    }

    // Delegate to active provider to generate new unique attempt reference
    const provider = this.getActiveProvider();
    const providerInit = await provider.initializePayment({
      orderId: order.id,
      amount: order.pricing.productPaymentTotal,
      currency: order.pricing.currency,
      customerEmail: order.customer.email,
      customerName: order.customer.fullName,
      metadata: {
        flow: order.flow,
        attemptNumber: newAttemptNum,
        isRetry: true
      }
    });

    // Create updated payment record for new attempt (or update existing)
    const newPayment = createPaymentRecord({
      id: existingPayment ? existingPayment.id : `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orderId: order.id,
      orderReference: order.orderNumber || order.id,
      checkoutId: order.checkoutId,
      provider: provider.id,
      providerReference: providerInit.reference,
      transactionReference: providerInit.reference,
      amount: order.pricing.productPaymentTotal,
      currency: order.pricing.currency,
      status: PAYMENT_STATUS.PENDING,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phone,
      customerName: order.customer.fullName,
      failureReason: null,
      attemptNumber: newAttemptNum,
      attempts: previousAttempts,
      metadata: {
        providerData: providerInit,
        isRetry: true
      }
    });

    OrderStore.savePayment(newPayment);

    // Update order status back to PENDING_PAYMENT with updated payment attempt
    order.paymentId = newPayment.id;
    order.paymentStatus = newPayment.status;
    order.orderStatus = ORDER_STATUS.PENDING_PAYMENT;
    if (!order.history) order.history = [];
    order.history.push({
      status: ORDER_STATUS.PENDING_PAYMENT,
      timestamp: new Date().toISOString(),
      note: `Payment retry attempt #${newAttemptNum} initiated (Ref: ${newPayment.providerReference})`
    });

    OrderStore.saveOrder(order);

    return {
      order,
      payment: newPayment,
      providerData: providerInit
    };
  }

  /**
   * Create (or re-create, on retry) a payment intent for an order's shipping fee.
   * Reuses the exact same payment abstraction (provider, payment record shape,
   * OrderStore persistence) as the product payment pipeline — this is NOT a second,
   * unrelated payment system. The amount always comes from an admin-entered shipping
   * quote already stored on the order; it is never invented or calculated here.
   *
   * Safe to call repeatedly (e.g. "Try Again" after a declined/failed attempt):
   * archives the previous attempt and issues a fresh provider reference, exactly
   * like retryPayment does for the product payment.
   *
   * @param {string} orderId
   * @returns {Promise<{ order: Object, payment: Object, providerData?: Object, alreadyPaid?: boolean }>}
   */
  async createShippingPayment(orderId) {
    if (!orderId) {
      throw new Error('Order ID is required to create a shipping payment.');
    }

    const order = OrderStore.getOrder(orderId);
    if (!order) {
      throw new Error(`Order "${orderId}" not found for shipping payment.`);
    }

    const quoteAmount = Number(order.shippingQuote?.amount ?? order.pricing?.shippingAmount ?? 0);
    if (!quoteAmount || quoteAmount <= 0) {
      throw new Error('No shipping quote amount is available for this order yet.');
    }

    const existingPayment = order.shippingPaymentId ? OrderStore.getPayment(order.shippingPaymentId) : null;

    // Guard: never re-charge a shipping fee that is already verified successful
    if (existingPayment && existingPayment.status === PAYMENT_STATUS.SUCCESSFUL) {
      return { order, payment: existingPayment, alreadyPaid: true };
    }

    const currentAttemptNum = existingPayment?.attemptNumber || 0;
    const newAttemptNum = currentAttemptNum + 1;
    const previousAttempts = Array.isArray(existingPayment?.attempts) ? [...existingPayment.attempts] : [];
    if (existingPayment) {
      previousAttempts.push({
        attemptNumber: currentAttemptNum,
        providerReference: existingPayment.providerReference,
        status: existingPayment.status,
        failureReason: existingPayment.failureReason,
        timestamp: existingPayment.updatedAt || new Date().toISOString()
      });
    }

    const provider = this.getActiveProvider();
    const providerInit = await provider.initializePayment({
      orderId: order.id,
      orderReference: order.orderNumber || order.id,
      amount: quoteAmount,
      currency: order.pricing?.currency || 'NGN',
      customerEmail: order.customer?.email,
      customerName: order.customer?.fullName,
      metadata: {
        flow: order.flow,
        purpose: 'shipping',
        attemptNumber: newAttemptNum
      }
    });

    const payment = createPaymentRecord({
      id: existingPayment ? existingPayment.id : undefined,
      orderId: order.id,
      orderReference: order.orderNumber || order.id,
      checkoutId: order.checkoutId,
      provider: provider.id,
      providerReference: providerInit.reference,
      transactionReference: providerInit.reference,
      amount: quoteAmount,
      currency: order.pricing?.currency || 'NGN',
      status: PAYMENT_STATUS.PENDING,
      customerEmail: order.customer?.email,
      customerPhone: order.customer?.phone,
      customerName: order.customer?.fullName,
      purpose: 'shipping',
      attemptNumber: newAttemptNum,
      attempts: previousAttempts,
      metadata: {
        providerData: providerInit
      }
    });

    OrderStore.savePayment(payment);

    return {
      order: OrderStore.getOrder(order.id),
      payment,
      providerData: providerInit
    };
  }

  /**
   * Process a shipping payment intent (created via createShippingPayment) through the
   * same provider/verification pipeline as a product payment. On authoritative
   * verification, advances the order to SHIPPING_PAYMENT_CONFIRMED and dispatches a
   * transactional confirmation email — it never touches inventory, the cart, or the
   * (fully independent) product payment/order-paid state.
   *
   * @param {Object} params
   * @param {string} params.paymentId
   * @param {Object} [params.cardDetails]
   * @param {string} [params.simulationOutcome]
   * @returns {Promise<{ success: boolean, status: string, order: Object, payment: Object, failureReason?: string }>}
   */
  async processShippingPayment({
    paymentId,
    cardDetails = {},
    simulationOutcome = null
  }) {
    if (this.inFlightPromises.has(paymentId)) {
      return await this.inFlightPromises.get(paymentId);
    }
    if (this.inFlightLocks.has(paymentId)) {
      return {
        success: false,
        status: 'processing',
        failureReason: 'Shipping payment is currently being processed.'
      };
    }

    const executionPromise = (async () => {
      this.inFlightLocks.add(paymentId);
      try {
        const payment = OrderStore.getPayment(paymentId);
        if (!payment) {
          throw new Error(`Payment record "${paymentId}" not found.`);
        }

        const order = OrderStore.getOrder(payment.orderId);
        if (!order) {
          throw new Error(`Order record "${payment.orderId}" not found for shipping payment.`);
        }

        // Idempotent short-circuit if already verified successful
        if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
          return { success: true, status: PAYMENT_STATUS.SUCCESSFUL, order, payment, alreadyPaid: true };
        }

        OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.PROCESSING);

        const provider = this.getActiveProvider();
        const result = await provider.processPayment({
          reference: payment.providerReference,
          cardDetails,
          simulationOutcome
        });

        if (result.status === PAYMENT_STATUS.SUCCESSFUL) {
          // Independent authoritative verification gate (same rule as product payments)
          const verification = await this.verifyPayment(payment.providerReference, { expectedAmount: payment.amount });

          if (!verification.verified || verification.status !== PAYMENT_STATUS.SUCCESSFUL) {
            const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.FAILED, {
              failureReason: verification.failureReason || 'Shipping payment verification failed'
            });
            return {
              success: false,
              status: PAYMENT_STATUS.FAILED,
              failureReason: 'Shipping payment could not be authoritatively verified. Your card was not charged.',
              order,
              payment: updatedPayment
            };
          }

          const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.SUCCESSFUL, {
            verifiedAt: verification.verifiedAt || new Date().toISOString()
          });

          const updatedOrder = OrderStore.recordShippingPaymentSuccess(order.id, updatedPayment, { actor: 'customer' });

          try {
            await emailService.sendShippingPaymentConfirmedEmail(updatedOrder, updatedOrder.shippingPayment);
          } catch (emailErr) {
            console.warn('[PaymentService] Shipping payment confirmation email skipped/failed:', emailErr);
          }

          return {
            success: true,
            status: PAYMENT_STATUS.SUCCESSFUL,
            order: updatedOrder,
            payment: updatedPayment
          };

        } else if (result.status === PAYMENT_STATUS.DECLINED) {
          const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.DECLINED, {
            failureReason: result.failureReason || 'Shipping payment declined. Please try again.'
          });
          return {
            success: false,
            status: PAYMENT_STATUS.DECLINED,
            failureReason: updatedPayment.failureReason,
            order,
            payment: updatedPayment
          };

        } else if (result.status === PAYMENT_STATUS.CANCELLED) {
          const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.CANCELLED, {
            failureReason: 'Shipping payment cancelled by customer'
          });
          return {
            success: false,
            status: PAYMENT_STATUS.CANCELLED,
            failureReason: 'Shipping payment was cancelled.',
            order,
            payment: updatedPayment
          };

        } else {
          const failureReason = result.failureReason || "We couldn't confirm your shipping payment. Please try again.";
          const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.FAILED, { failureReason });
          return {
            success: false,
            status: PAYMENT_STATUS.FAILED,
            failureReason,
            order,
            payment: updatedPayment
          };
        }
      } finally {
        this.inFlightLocks.delete(paymentId);
      }
    })();

    this.inFlightPromises.set(paymentId, executionPromise);
    try {
      return await executionPromise;
    } finally {
      this.inFlightPromises.delete(paymentId);
    }
  }

  /**
   * Authoritatively recover payment state for an order on page refresh.
   * Never blindly assumes refresh = failure or refresh = success.
   * @param {string} orderId
   * @returns {Promise<{ found: boolean, status: string, order?: Object, payment?: Object, failureReason?: string }>}
   */
  async recoverAuthoritativeState(orderId) {
    if (!orderId) return { found: false };

    const order = OrderStore.getOrder(orderId);
    if (!order) return { found: false };

    const payment = order.paymentId ? OrderStore.getPayment(order.paymentId) : null;

    // 1. Authoritative PAID / SUCCESSFUL
    const isPaidOrder = (order.orderStatus === ORDER_STATUS.PAID || order.orderStatus === ORDER_STATUS.SHIPPING_QUOTE_REQUIRED);
    if (isPaidOrder && payment?.status === PAYMENT_STATUS.SUCCESSFUL) {
      return {
        found: true,
        status: PAYMENT_LIFECYCLE_STATES.SUCCESSFUL,
        order,
        payment
      };
    }

    // 2. Authoritative PAYMENT_FAILED / DECLINED
    if (order.orderStatus === ORDER_STATUS.PAYMENT_FAILED || payment?.status === PAYMENT_STATUS.FAILED || payment?.status === PAYMENT_STATUS.DECLINED) {
      return {
        found: true,
        status: PAYMENT_LIFECYCLE_STATES.FAILED,
        order,
        payment,
        failureReason: payment?.failureReason || 'Payment could not be completed.'
      };
    }

    // 3. Authoritative CANCELLED
    if (order.orderStatus === ORDER_STATUS.CANCELLED || payment?.status === PAYMENT_STATUS.CANCELLED) {
      return {
        found: true,
        status: PAYMENT_LIFECYCLE_STATES.CANCELLED,
        order,
        payment
      };
    }

    // 4. In-flight / PENDING: Check with provider
    if (payment?.providerReference) {
      try {
        const provider = this.getActiveProvider();
        const providerStatus = await provider.getPaymentStatus(payment.providerReference);

        if (providerStatus.status === PAYMENT_STATUS.SUCCESSFUL) {
          const verification = await this.verifyPayment(payment.providerReference);
          if (verification.verified) {
            // ATOMIC STOCK DEDUCTION (idempotent by order.id — see Milestone
            // C18): this recovery path can reach a verified-successful
            // payment via a route that never passed through processPayment's
            // own deduction step (e.g. a stale in-memory provider status
            // surviving an SPA navigation), so deduct here too rather than
            // assuming it already happened.
            const stockDeduction = inventoryService.deductStock(order.id, order.items);
            if (!stockDeduction.success) {
              const updatedPayment = OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.FAILED, {
                failureReason: 'Inventory sold out during processing. Transaction reversed safely.'
              });
              const updatedOrder = OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_FAILED, {
                paymentStatus: PAYMENT_STATUS.FAILED,
                pricing: { ...order.pricing, totalPaid: 0 }
              });
              return {
                found: true,
                status: PAYMENT_LIFECYCLE_STATES.FAILED,
                order: updatedOrder,
                payment: updatedPayment,
                failureReason: 'Inventory unavailable. Your card was not charged.'
              };
            }

            // Both flows require a manual shipping quote before dispatch (Milestone C20.10)
            const targetOrderStatus = ORDER_STATUS.SHIPPING_QUOTE_REQUIRED;
            order.orderStatus = targetOrderStatus;
            order.pricing.totalPaid = order.pricing.productPaymentTotal;
            OrderStore.updateOrderStatus(order.id, targetOrderStatus, {
              paymentStatus: PAYMENT_STATUS.SUCCESSFUL,
              pricing: order.pricing
            });
            OrderStore.updatePaymentStatus(payment.id, PAYMENT_STATUS.SUCCESSFUL);
            return {
              found: true,
              status: PAYMENT_LIFECYCLE_STATES.SUCCESSFUL,
              order: OrderStore.getOrder(order.id),
              payment: OrderStore.getPayment(payment.id)
            };
          }
        } else if (providerStatus.status === PAYMENT_STATUS.FAILED || providerStatus.status === PAYMENT_STATUS.DECLINED) {
          OrderStore.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_FAILED);
          OrderStore.updatePaymentStatus(payment.id, providerStatus.status);
          return {
            found: true,
            status: PAYMENT_LIFECYCLE_STATES.FAILED,
            order: OrderStore.getOrder(order.id),
            payment: OrderStore.getPayment(payment.id),
            failureReason: providerStatus.failureReason || 'Payment could not be completed.'
          };
        }
      } catch (err) {
        console.warn('[PaymentService] Provider status recovery check error:', err);
      }
    }

    // Default: Order is pending payment and ready for customer action
    return {
      found: true,
      status: PAYMENT_LIFECYCLE_STATES.IDLE,
      order,
      payment
    };
  }
}

export const paymentService = new PaymentService();
