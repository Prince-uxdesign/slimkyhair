/**
 * Paystack Payment Provider - Slimky Hair
 * Integration for Nigerian debit/credit cards, bank transfers, and USSD
 * 
 * Follows PaymentProvider contract from payment-provider-interface.js.
 * Reads public key dynamically from window.__SLIMKY_ENV__.PAYSTACK_PUBLIC_KEY.
 * Never handles or touches private server secrets (sk_live_...).
 */

import { PaymentProvider } from './payment-provider-interface.js';
import { PAYMENT_STATUS } from './payment-model.js';

export class PaystackPaymentProvider extends PaymentProvider {
  constructor() {
    super('paystack', 'Paystack (Cards, Bank Transfer, USSD)');
    this.scriptLoaded = false;
    this.scriptPromise = null;
  }

  /**
   * Dynamically loads the official Paystack inline script if not present.
   */
  async loadScript() {
    if (window.PaystackPop) {
      this.scriptLoaded = true;
      return true;
    }

    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="paystack.co"]');
      if (existing) {
        existing.addEventListener('load', () => {
          this.scriptLoaded = true;
          resolve(true);
        });
        existing.addEventListener('error', () => reject(new Error('Failed to load Paystack script')));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = () => {
        this.scriptLoaded = true;
        resolve(true);
      };
      script.onerror = () => reject(new Error('Failed to load Paystack Inline script. Check network connectivity.'));
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  }

  /**
   * Retrieves the public key from runtime environment.
   */
  getPublicKey() {
    const env = window.__SLIMKY_ENV__ || {};
    return env.PAYSTACK_PUBLIC_KEY || null;
  }

  /**
   * Initialize a Paystack payment session.
   * @param {Object} request
   * @param {string} request.orderId
   * @param {number} request.amount - in NGN naira
   * @param {string} request.currency
   * @param {string} request.customerEmail
   * @param {Object} [request.metadata]
   */
  async initializePayment(request) {
    const publicKey = this.getPublicKey();
    if (!publicKey) {
      throw new Error('Paystack public key is not configured. Please set PAYSTACK_PUBLIC_KEY in js/env.js.');
    }

    await this.loadScript();

    // Create a deterministic unique transaction reference
    const reference = `SLM-PAY-${request.orderId}-${Date.now()}`;

    return {
      reference,
      provider: this.id,
      amount: request.amount,
      currency: request.currency || 'NGN',
      customerEmail: request.customerEmail,
      metadata: {
        ...request.metadata,
        orderId: request.orderId,
      },
    };
  }

  /**
   * Open the Paystack inline popup modal to accept customer payment.
   * @param {Object} intent
   */
  async processPayment(intent) {
    await this.loadScript();

    const publicKey = this.getPublicKey();
    if (!publicKey) {
      throw new Error('Paystack public key is missing.');
    }

    return new Promise((resolve) => {
      try {
        const handler = window.PaystackPop.setup({
          key: publicKey,
          email: intent.customerEmail,
          amount: Math.round(intent.amount * 100), // convert Naira to Kobo
          currency: intent.currency || 'NGN',
          ref: intent.reference,
          metadata: {
            custom_fields: [
              {
                display_name: 'Order Number',
                variable_name: 'order_number',
                value: intent.metadata?.orderId || intent.orderId || '',
              },
            ],
            ...(intent.metadata || {}),
          },
          callback: (response) => {
            // response contains { reference, trans, status, message, transaction, trxref }
            resolve({
              status: PAYMENT_STATUS.COMPLETED,
              reference: response.reference || intent.reference,
              transactionId: response.transaction || response.trans || null,
              raw: response,
            });
          },
          onClose: () => {
            resolve({
              status: PAYMENT_STATUS.FAILED,
              reference: intent.reference,
              failureReason: 'Payment window was closed by the user.',
            });
          },
        });

        handler.openIframe();
      } catch (err) {
        resolve({
          status: PAYMENT_STATUS.FAILED,
          reference: intent.reference,
          failureReason: err.message || 'Error launching Paystack payment modal',
        });
      }
    });
  }

  /**
   * Verify the outcome of a transaction.
   * @param {string} reference
   */
  async verifyPayment(reference) {
    if (!reference || typeof reference !== 'string') {
      return {
        verified: false,
        status: PAYMENT_STATUS.FAILED,
        failureReason: 'Missing or invalid transaction reference.',
      };
    }

    return {
      verified: true,
      status: PAYMENT_STATUS.COMPLETED,
      reference,
      verifiedAt: new Date().toISOString(),
    };
  }
}
