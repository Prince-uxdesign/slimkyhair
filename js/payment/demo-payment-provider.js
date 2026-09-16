/**
 * Slimky DemoPay - Local Demo Payment Provider
 * Milestone C10 & C11: Local Demo Payment Gateway
 * 
 * STRICT COMPLIANCE:
 * - Completely local, zero external network requests.
 * - Does NOT use or imitate Paystack, Flutterwave, Stripe, or any real gateway.
 * - Clearly marked: TEST MODE · No real payment will be charged.
 * - Deterministic outcomes driven by documented test cards or simulation flags.
 */

import { PaymentProvider } from './payment-provider-interface.js';
import { 
  PAYMENT_STATUS, 
  PAYMENT_PROVIDERS, 
  DEMO_TEST_CARDS, 
  generatePaymentReference,
  isDemoPaymentAllowed
} from './payment-model.js';

export class DemoPaymentProvider extends PaymentProvider {
  constructor(options = {}) {
    super(PAYMENT_PROVIDERS.DEMO, 'Demo Payment');
    this.testMode = true;
    this.inMemoryTransactions = new Map();
    this.options = options;
  }

  /**
   * Initialize a simulated payment session.
   * @param {Object} request
   * @returns {Promise<{ reference: string, transactionReference: string, provider: string, name: string, amount: number, currency: string, testMode: boolean }>}
   */
  async initializePayment(request) {
    if (!isDemoPaymentAllowed(this.options)) {
      throw new Error('Production Safety Guard: Demo Payment Gateway is disabled in production environments.');
    }

    const reference = generatePaymentReference('DEMO-PAY');
    const transaction = {
      reference,
      transactionReference: reference,
      provider: this.id,
      orderId: request.orderId,
      orderReference: request.orderReference || request.orderId,
      amount: request.amount,
      currency: request.currency || 'NGN',
      customerEmail: request.customerEmail,
      status: PAYMENT_STATUS.PENDING,
      failureReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: request.metadata || {}
    };

    this.inMemoryTransactions.set(reference, transaction);

    return {
      reference,
      transactionReference: reference,
      provider: this.id,
      name: this.name,
      orderId: request.orderId,
      orderReference: transaction.orderReference,
      amount: request.amount,
      currency: transaction.currency,
      testMode: true
    };
  }

  /**
   * Process a payment intent using deterministic test card inputs or explicit action flag.
   * @param {Object} intent
   * @param {string} intent.reference
   * @param {Object} [intent.cardDetails]
   * @param {string} [intent.cardDetails.cardNumber]
   * @param {string} [intent.simulationOutcome] - Optional override: 'SUCCESS' | 'DECLINED' | 'FAILED' | 'PROCESSING' | 'CANCELLED'
   * @returns {Promise<{ status: string, reference: string, failureReason?: string, verifiedAt?: string }>}
   */
  async processPayment(intent) {
    if (!isDemoPaymentAllowed(this.options)) {
      throw new Error('Production Safety Guard: Demo Payment Gateway is disabled in production environments.');
    }

    const { reference, cardDetails = {}, simulationOutcome } = intent;
    const transaction = this.inMemoryTransactions.get(reference) || {
      reference,
      status: PAYMENT_STATUS.PENDING
    };

    // Clean card number (remove whitespace)
    const rawCardNumber = (cardDetails.cardNumber || '').replace(/\s+/g, '');

    // Determine outcome based on simulationOutcome override or test card number
    let outcome = PAYMENT_STATUS.SUCCESSFUL;
    let failureReason = null;

    if (simulationOutcome) {
      switch (simulationOutcome.toUpperCase()) {
        case 'DECLINED':
          outcome = PAYMENT_STATUS.DECLINED;
          failureReason = DEMO_TEST_CARDS.DECLINED.failureReason;
          break;
        case 'FAILED':
          outcome = PAYMENT_STATUS.FAILED;
          failureReason = DEMO_TEST_CARDS.FAILED.failureReason;
          break;
        case 'CANCELLED':
          outcome = PAYMENT_STATUS.CANCELLED;
          failureReason = 'Payment cancelled by customer';
          break;
        case 'TIMEOUT':
          outcome = PAYMENT_STATUS.FAILED;
          failureReason = DEMO_TEST_CARDS.TIMEOUT?.failureReason || "We couldn't confirm your payment. Please try again.";
          break;
        case 'PROCESSING':
          outcome = PAYMENT_STATUS.PROCESSING;
          break;
        case 'SUCCESS':
        default:
          outcome = PAYMENT_STATUS.SUCCESSFUL;
          break;
      }
    } else if (rawCardNumber) {
      if (rawCardNumber === DEMO_TEST_CARDS.DECLINED.number) {
        outcome = PAYMENT_STATUS.DECLINED;
        failureReason = DEMO_TEST_CARDS.DECLINED.failureReason;
      } else if (rawCardNumber === DEMO_TEST_CARDS.FAILED.number) {
        outcome = PAYMENT_STATUS.FAILED;
        failureReason = DEMO_TEST_CARDS.FAILED.failureReason;
      } else if (DEMO_TEST_CARDS.TIMEOUT && rawCardNumber === DEMO_TEST_CARDS.TIMEOUT.number) {
        outcome = PAYMENT_STATUS.FAILED;
        failureReason = DEMO_TEST_CARDS.TIMEOUT.failureReason;
      } else if (rawCardNumber === DEMO_TEST_CARDS.PROCESSING.number) {
        outcome = PAYMENT_STATUS.PROCESSING;
      } else {
        // Any other card number defaults to successful demo payment
        outcome = PAYMENT_STATUS.SUCCESSFUL;
      }
    }

    // Small simulated network processing latency (150ms) for realistic UX
    await new Promise(resolve => setTimeout(resolve, 150));

    const now = new Date().toISOString();
    transaction.status = outcome;
    transaction.failureReason = failureReason;
    transaction.updatedAt = now;
    if (outcome === PAYMENT_STATUS.SUCCESSFUL) {
      transaction.verifiedAt = now;
    }

    this.inMemoryTransactions.set(reference, transaction);

    return {
      status: outcome,
      reference,
      failureReason,
      verifiedAt: transaction.verifiedAt || null,
      provider: this.id
    };
  }

  /**
   * Verify transaction state.
   * @param {string} reference
   * @returns {Promise<{ verified: boolean, status: string, amount: number, currency: string, verifiedAt: string, failureReason?: string }>}
   */
  async verifyPayment(reference) {
    const transaction = this.inMemoryTransactions.get(reference);
    if (!transaction) {
      return {
        verified: false,
        status: PAYMENT_STATUS.FAILED,
        failureReason: 'Transaction reference not found in Slimky DemoPay store',
        reference
      };
    }

    const isSuccess = transaction.status === PAYMENT_STATUS.SUCCESSFUL;
    return {
      verified: isSuccess,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      verifiedAt: transaction.verifiedAt,
      failureReason: transaction.failureReason,
      reference
    };
  }

  /**
   * Webhook simulator for testing asynchronous transaction resolution.
   * @param {Object} payload
   * @returns {Promise<{ handled: boolean, event: string, reference: string, status: string }>}
   */
  async handleWebhook(payload) {
    const { reference, event = 'charge.completed', status = PAYMENT_STATUS.SUCCESSFUL } = payload;
    const transaction = this.inMemoryTransactions.get(reference);
    if (transaction) {
      transaction.status = status;
      transaction.updatedAt = new Date().toISOString();
      if (status === PAYMENT_STATUS.SUCCESSFUL) {
        transaction.verifiedAt = transaction.updatedAt;
      }
      this.inMemoryTransactions.set(reference, transaction);
    }
    return {
      handled: true,
      event,
      reference,
      status
    };
  }

  /**
   * Query status.
   * @param {string} reference
   */
  async getPaymentStatus(reference) {
    const transaction = this.inMemoryTransactions.get(reference);
    return {
      reference,
      status: transaction ? transaction.status : PAYMENT_STATUS.FAILED,
      amount: transaction?.amount || 0
    };
  }
}

// Backwards compatibility alias
export const SlimkyDemoPaymentProvider = DemoPaymentProvider;
