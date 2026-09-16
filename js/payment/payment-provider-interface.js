/**
 * Payment Provider Abstract Interface - Slimky Hair
 * Milestone C10 & C11: Payment Provider Abstraction
 * 
 * Defines the standard contract that every payment gateway adapter
 * (Slimky DemoPay, Paystack, Flutterwave) must implement.
 */

export class PaymentProvider {
  /**
   * @param {string} id - Provider identifier (e.g. 'demo', 'paystack', 'flutterwave')
   * @param {string} name - Human readable provider name (e.g. 'Slimky DemoPay')
   */
  constructor(id, name) {
    if (new.target === PaymentProvider) {
      throw new TypeError('PaymentProvider is an abstract class and cannot be instantiated directly.');
    }
    this.id = id;
    this.name = name;
  }

  /**
   * Initialize a payment session with the provider.
   * @param {Object} request
   * @param {string} request.orderId
   * @param {number} request.amount
   * @param {string} request.currency
   * @param {string} request.customerEmail
   * @param {Object} [request.metadata]
   * @returns {Promise<{ reference: string, authorizationUrl?: string, clientSecret?: string, metadata?: Object }>}
   */
  async initializePayment(request) {
    throw new Error(`initializePayment() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Process/submit a payment intent (e.g. card submission, tokenization, or simulated charge).
   * @param {Object} intent
   * @param {string} intent.reference
   * @param {Object} [intent.paymentDetails] - e.g. card info or simulated test card
   * @returns {Promise<{ status: string, reference: string, failureReason?: string, raw?: Object }>}
   */
  async processPayment(intent) {
    throw new Error(`processPayment() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Authoritatively verify the outcome of a transaction with the provider.
   * @param {string} reference - The provider payment reference
   * @returns {Promise<{ verified: boolean, status: string, amount: number, currency: string, verifiedAt: string, failureReason?: string }>}
   */
  async verifyPayment(reference) {
    throw new Error(`verifyPayment() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Handle incoming asynchronous webhook event from the provider.
   * @param {Object} payload
   * @param {string} [signature]
   * @returns {Promise<{ handled: boolean, event: string, reference: string, status: string }>}
   */
  async handleWebhook(payload, signature) {
    throw new Error(`handleWebhook() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Retrieve current payment status by reference.
   * @param {string} reference
   * @returns {Promise<{ status: string, reference: string, amount: number }>}
   */
  async getPaymentStatus(reference) {
    throw new Error(`getPaymentStatus() must be implemented by ${this.constructor.name}`);
  }
}
