/**
 * Nigeria Shipping Quote & Payment Card - Slimky Hair
 * Milestone C20.10: Nigeria Shipping Workflow
 *
 * Displays the customer-facing status of a Nigeria order (Product Payment vs
 * Delivery, shown separately — never combined into one confusing total) and,
 * once an admin has entered and sent an actual delivery-fee quote, renders an
 * Accept & Pay card. The shipping fee is charged through the SAME payment
 * abstraction used for the product payment (Slimky DemoPay via PaymentService
 * + DemoPaymentUI) — this is not a second, unrelated payment system, and the
 * amount is always an admin-entered quote, never calculated or invented here.
 */

import { OrderStore } from '../payment/order-store.js';
import { paymentService } from '../payment/payment-service.js';
import { DemoPaymentUI } from '../payment/demo-payment-ui.js';
import { emailService } from '../email/email-service.js';
import { formatNaira } from '../cart-store.js';
import { escapeHtml } from '../utils/html-format.js';

const DELIVERY_STATUS_BY_ORDER_STATUS = {
  paid: { key: 'quote_required', label: 'Quote Required' },
  shipping_quote_required: { key: 'quote_required', label: 'Quote Required' },
  shipping_quote_sent: { key: 'quote_sent', label: 'Quote Sent' },
  shipping_payment_pending: { key: 'payment_pending', label: 'Payment Pending' },
  shipping_payment_confirmed: { key: 'paid', label: 'Shipping Paid' },
  ready_for_dispatch: { key: 'paid', label: 'Ready for Dispatch' },
  shipped: { key: 'paid', label: 'Shipped' },
  delivered: { key: 'paid', label: 'Delivered' }
};

/**
 * Render the separated "Product Payment" / "Delivery" status rows (mobile
 * customers must see PAID vs QUOTE REQUIRED/QUOTE SENT/SHIPPING PAID as two
 * distinct stacked cards, never one combined total). Returns an empty string
 * for non-Nigeria orders.
 * @param {Object} order
 * @returns {string}
 */
export function renderNigeriaStatusRows(order) {
  if (!order || order.flow !== 'nigeria_checkout') return '';
  const delivery = DELIVERY_STATUS_BY_ORDER_STATUS[order.orderStatus];
  if (!delivery) return '';

  const deliveryClass = delivery.key === 'paid'
    ? 'is-paid'
    : (delivery.key === 'quote_required' ? 'is-quote' : 'is-pending');

  return `
    <div class="order-payment-status-rows">
      <div class="order-payment-status-row">
        <span class="order-payment-status-label">Product Payment</span>
        <span class="order-payment-status-value is-paid">PAID</span>
      </div>
      <div class="order-payment-status-row">
        <span class="order-payment-status-label">Delivery</span>
        <span class="order-payment-status-value ${deliveryClass}">${escapeHtml(delivery.label.toUpperCase())}</span>
      </div>
    </div>
  `;
}

/**
 * Interactive card taking a Nigeria customer from "quote sent" through
 * "accept & pay" to "shipping paid" — reusing the Slimky DemoPay abstraction.
 */
export class NigeriaShippingCard {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.mountElement
   * @param {Object} options.order - Canonical order record from OrderStore
   * @param {string} [options.actor='customer']
   * @param {Function} [options.onUpdate] - Called with the updated order after any state change
   */
  constructor(options = {}) {
    this.mountElement = options.mountElement;
    this.order = options.order;
    this.actor = options.actor || 'customer';
    this.onUpdate = options.onUpdate || (() => {});

    this.busy = false;
    this.feedback = null;

    this.demoPaymentUI = new DemoPaymentUI({
      onSuccess: (result) => this.handlePaymentSettled(result),
      onDeclined: (result) => this.handlePaymentSettled(result),
      onFailure: (result) => this.handlePaymentSettled(result),
      onCancel: () => this.handlePaymentSettled(null)
    });
  }

  render() {
    if (!this.mountElement || !this.order) return;

    if (this.order.flow !== 'nigeria_checkout') {
      this.mountElement.innerHTML = '';
      return;
    }

    const status = this.order.orderStatus;
    let inner = '';

    if (status === 'shipping_quote_sent') {
      inner = this.renderQuoteCard();
    } else if (status === 'shipping_payment_pending') {
      inner = this.renderPaymentPendingCard();
    } else if (['shipping_payment_confirmed', 'ready_for_dispatch', 'shipped', 'delivered'].includes(status)) {
      inner = this.renderPaidCard();
    } else {
      inner = this.renderPendingQuoteCard();
    }

    if (this.feedback) {
      inner += `<div class="shipping-quote-feedback is-${this.feedback.type}">${escapeHtml(this.feedback.message)}</div>`;
    }

    this.mountElement.innerHTML = inner;
    this.attachEvents();
  }

  renderPendingQuoteCard() {
    const destination = escapeHtml(this.order.delivery?.state || this.order.delivery?.city || 'your destination');
    const email = escapeHtml(this.order.customer?.email || 'your registered email');
    return `
      <div class="shipping-quote-card is-pending-state">
        <span class="shipping-quote-eyebrow">Nigeria Delivery</span>
        <h3 class="shipping-quote-title">Your delivery fee is being calculated</h3>
        <p class="shipping-quote-body-text">
          Our logistics team is confirming your actual delivery fee for ${destination}. We'll email ${email} the moment it's ready.
        </p>
      </div>
    `;
  }

  renderQuoteCard() {
    const q = this.order.shippingQuote || {};
    return `
      <div class="shipping-quote-card">
        <span class="shipping-quote-eyebrow">Nigeria Delivery</span>
        <h3 class="shipping-quote-title">Your delivery fee is ready.</h3>

        <div class="shipping-quote-amount-block">
          <span class="shipping-quote-amount">${formatNaira(q.amount)}</span>
          <span class="shipping-quote-amount-label">Delivery fee</span>
        </div>

        <div class="shipping-quote-meta-list">
          <div class="shipping-quote-meta-row">
            <span class="shipping-quote-meta-key">Shipping Method</span>
            <span class="shipping-quote-meta-val">${escapeHtml(q.provider || 'Local Courier')} — ${escapeHtml(q.method || 'Doorstep Delivery')}</span>
          </div>
          ${q.estimatedDelivery ? `
            <div class="shipping-quote-meta-row">
              <span class="shipping-quote-meta-key">Estimated Delivery</span>
              <span class="shipping-quote-meta-val">${escapeHtml(q.estimatedDelivery)}</span>
            </div>
          ` : ''}
        </div>

        ${q.notes ? `<div class="shipping-quote-notes">${escapeHtml(q.notes)}</div>` : ''}

        <div class="shipping-quote-actions">
          <button type="button" class="btn-primary" id="ng-btn-accept-pay" ${this.busy ? 'disabled' : ''}>
            ${this.busy ? 'Please wait…' : `Accept &amp; Pay ${formatNaira(q.amount)}`}
          </button>
        </div>
      </div>
    `;
  }

  renderPaymentPendingCard() {
    const q = this.order.shippingQuote || {};
    return `
      <div class="shipping-quote-card">
        <span class="shipping-quote-eyebrow">Nigeria Delivery</span>
        <h3 class="shipping-quote-title">Complete your shipping payment</h3>
        <p class="shipping-quote-body-text">
          You accepted a delivery fee of <strong>${formatNaira(q.amount)}</strong>. Complete payment below to move your order to dispatch.
        </p>
        <div class="shipping-quote-actions">
          <button type="button" class="btn-primary" id="ng-btn-pay-now" ${this.busy ? 'disabled' : ''}>
            ${this.busy ? 'Please wait…' : `Pay Shipping Fee — ${formatNaira(q.amount)}`}
          </button>
        </div>
      </div>
    `;
  }

  renderPaidCard() {
    const sp = this.order.shippingPayment || {};
    const q = this.order.shippingQuote || {};
    const trackingNumber = this.order.tracking?.trackingNumber;
    return `
      <div class="shipping-quote-card">
        <span class="shipping-quote-eyebrow">Nigeria Delivery</span>
        <h3 class="shipping-quote-title">Shipping paid — ${formatNaira(sp.amount || q.amount || 0)}</h3>
        <p class="shipping-quote-body-text">
          Your delivery fee has been received and confirmed${sp.reference ? ` (Ref: <span style="word-break: break-all;">${escapeHtml(sp.reference)}</span>)` : ''}. Your order is progressing toward dispatch.
        </p>
        ${trackingNumber ? `
          <div class="shipping-quote-meta-list">
            <div class="shipping-quote-meta-row">
              <span class="shipping-quote-meta-key">Carrier</span>
              <span class="shipping-quote-meta-val">${escapeHtml(this.order.tracking.carrier || '')}</span>
            </div>
            <div class="shipping-quote-meta-row">
              <span class="shipping-quote-meta-key">Tracking Number</span>
              <span class="shipping-quote-meta-val">${escapeHtml(trackingNumber)}</span>
            </div>
          </div>
          ${this.order.tracking.trackingUrl ? `
            <div class="shipping-quote-actions">
              <a class="btn-outline" href="${this.order.tracking.trackingUrl}" target="_blank" rel="noopener" style="text-align: center; text-decoration: none;">Track Package</a>
            </div>
          ` : ''}
        ` : ''}
      </div>
    `;
  }

  attachEvents() {
    this.mountElement.querySelector('#ng-btn-accept-pay')?.addEventListener('click', () => this.handleAcceptAndPay());
    this.mountElement.querySelector('#ng-btn-pay-now')?.addEventListener('click', () => this.handlePayNow());
  }

  async handleAcceptAndPay() {
    if (this.busy) return;
    this.busy = true;
    this.feedback = null;
    this.render();

    try {
      const accepted = OrderStore.recordCustomerQuoteResponse(this.order.id, 'accepted', '', { actor: this.actor });
      this.order = accepted;

      try {
        await emailService.sendShippingPaymentRequiredEmail(this.order, this.order.shippingQuote);
      } catch (emailErr) {
        console.warn('[NigeriaShippingCard] Shipping payment required email skipped/failed:', emailErr);
      }

      await this.launchShippingPayment();
    } catch (err) {
      this.busy = false;
      this.feedback = { type: 'error', message: err.message || 'Could not proceed to shipping payment. Please try again.' };
      this.render();
    }
  }

  async handlePayNow() {
    if (this.busy) return;
    this.busy = true;
    this.feedback = null;
    this.render();

    try {
      await this.launchShippingPayment();
    } catch (err) {
      this.busy = false;
      this.feedback = { type: 'error', message: err.message || 'Could not start shipping payment. Please try again.' };
      this.render();
    }
  }

  async launchShippingPayment() {
    const initResult = await paymentService.createShippingPayment(this.order.id);
    this.order = initResult.order;
    this.busy = false;
    this.render();

    if (initResult.alreadyPaid) {
      this.onUpdate(this.order);
      return;
    }

    this.demoPaymentUI.open({
      order: initResult.order,
      payment: initResult.payment,
      mode: 'shipping',
      amountLabel: 'Shipping Fee'
    });
  }

  handlePaymentSettled() {
    const refreshed = OrderStore.getOrder(this.order.id);
    if (refreshed) this.order = refreshed;
    this.render();
    this.onUpdate(this.order);
  }
}
