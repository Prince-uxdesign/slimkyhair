/**
 * International Shipping Quote Card - Slimky Hair
 * Milestone C20.11: International Shipping Workflow
 *
 * Displays the customer-facing status of an international order (Product Payment vs
 * Shipping) and, once an admin has entered and sent an actual carrier quote, renders
 * an Accept / Decline card. Strictly presentational + a thin wrapper around
 * OrderStore.recordCustomerQuoteResponse — never calculates or invents a shipping
 * amount, rate, or customs figure of its own.
 */

import { OrderStore } from '../payment/order-store.js';
import { CUSTOMS_IMPORT_DUTIES_NOTICE } from '../payment/payment-model.js';
import { emailService } from '../email/email-service.js';
import { escapeHtml } from '../utils/html-format.js';

const CURRENCY_SYMBOLS = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };

const PAID_OR_LATER_STATUSES = [
  'paid',
  'shipping_quote_required',
  'shipping_quote_sent',
  'shipping_payment_pending',
  'ready_for_dispatch',
  'shipped',
  'delivered'
];

const SHIPPING_STATUS_KEY_BY_ORDER_STATUS = {
  paid: 'quote_required',
  shipping_quote_required: 'quote_required',
  shipping_quote_sent: 'quote_sent',
  shipping_payment_pending: 'payment_pending',
  ready_for_dispatch: 'paid',
  shipped: 'paid',
  delivered: 'paid'
};

const SHIPPING_STATUS_LABELS = {
  quote_required: 'Quote Required',
  quote_sent: 'Quote Sent',
  payment_pending: 'Shipping Payment Pending',
  paid: 'Paid'
};

function formatQuoteAmount(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || (currency ? `${currency} ` : '');
  const num = Number(amount) || 0;
  return `${symbol}${num.toLocaleString('en-US')}`;
}


/**
 * Resolve the separated Product Payment / Shipping status for an order.
 * Only meaningful for international_checkout orders — Nigeria orders use
 * a single combined delivery-fee notice handled elsewhere.
 * @param {Object} order
 * @returns {{ productPayment: {paid: boolean, label: string}, shipping: {key: string, label: string}|null }}
 */
export function getInternationalOrderStatus(order) {
  const status = order?.orderStatus;
  const productPaid = PAID_OR_LATER_STATUSES.includes(status);
  const shippingKey = SHIPPING_STATUS_KEY_BY_ORDER_STATUS[status] || null;

  return {
    productPayment: {
      paid: productPaid,
      label: productPaid ? 'Paid' : 'Pending'
    },
    shipping: shippingKey ? { key: shippingKey, label: SHIPPING_STATUS_LABELS[shippingKey] } : null
  };
}

/**
 * Render the separated "Product payment" / "Shipping" status rows (Section 8).
 * Returns an empty string for non-international orders.
 * @param {Object} order
 * @returns {string}
 */
export function renderInternationalStatusRows(order) {
  if (!order || order.flow !== 'international_checkout') return '';
  const info = getInternationalOrderStatus(order);
  if (!info.shipping) return '';

  const shippingClass = info.shipping.key === 'paid'
    ? 'is-paid'
    : (info.shipping.key === 'quote_required' ? 'is-quote' : 'is-pending');

  return `
    <div class="order-payment-status-rows">
      <div class="order-payment-status-row">
        <span class="order-payment-status-label">Product Payment</span>
        <span class="order-payment-status-value is-paid">Paid</span>
      </div>
      <div class="order-payment-status-row">
        <span class="order-payment-status-label">Shipping</span>
        <span class="order-payment-status-value ${shippingClass}">${escapeHtml(info.shipping.label)}</span>
      </div>
    </div>
  `;
}

/**
 * Interactive card allowing a customer to review and Accept / Decline an
 * international shipping quote entered by an admin.
 */
export class ShippingQuoteCard {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.mountElement
   * @param {Object} options.order - Canonical order record from OrderStore
   * @param {string} [options.actor='customer']
   * @param {Function} [options.onUpdate] - Called with the updated order after accept/decline
   */
  constructor(options = {}) {
    this.mountElement = options.mountElement;
    this.order = options.order;
    this.actor = options.actor || 'customer';
    this.onUpdate = options.onUpdate || (() => {});

    this.declineOpen = false;
    this.feedback = null;
    this.submitting = false;
  }

  render() {
    if (!this.mountElement || !this.order) return;

    if (this.order.flow !== 'international_checkout') {
      this.mountElement.innerHTML = '';
      return;
    }

    const status = this.order.orderStatus;
    const quote = this.order.shippingQuote;

    let inner = '';
    if (status === 'shipping_quote_sent' && quote) {
      inner = this.renderQuoteCard(quote);
    } else if (status === 'shipping_payment_pending') {
      inner = this.renderAcceptedState(quote);
    } else if (['ready_for_dispatch', 'shipped', 'delivered'].includes(status)) {
      inner = this.renderPaidState(quote);
    } else if (status === 'shipping_quote_required' || status === 'paid') {
      inner = this.renderPendingState();
    }

    if (this.feedback) {
      inner += `<div class="shipping-quote-feedback is-${this.feedback.type}">${escapeHtml(this.feedback.message)}</div>`;
    }

    this.mountElement.innerHTML = inner;
    this.attachEvents();
  }

  renderPendingState() {
    const destination = escapeHtml(this.order.delivery?.country || 'your destination');
    const email = escapeHtml(this.order.customer?.email || 'your registered email');
    return `
      <div class="shipping-quote-card is-pending-state">
        <span class="shipping-quote-eyebrow">International Shipping</span>
        <h3 class="shipping-quote-title">Preparing your shipping quote</h3>
        <p class="shipping-quote-body-text">
          Our logistics team is weighing your formulations and obtaining an actual carrier quote for delivery to ${destination}. We'll email ${email} the moment it's ready.
        </p>
      </div>
    `;
  }

  renderQuoteCard(quote) {
    const amount = formatQuoteAmount(quote.amount, quote.currency);
    const destination = escapeHtml(this.order.delivery?.country || 'your destination');

    return `
      <div class="shipping-quote-card">
        <span class="shipping-quote-eyebrow">International Shipping</span>
        <h3 class="shipping-quote-title">Your shipping quote is ready.</h3>

        <div class="shipping-quote-amount-block">
          <span class="shipping-quote-amount">${amount}</span>
          <span class="shipping-quote-amount-label">Shipping fee to ${destination}</span>
        </div>

        <div class="shipping-quote-meta-list">
          <div class="shipping-quote-meta-row">
            <span class="shipping-quote-meta-key">Shipping Method</span>
            <span class="shipping-quote-meta-val">${escapeHtml(quote.method || 'International Courier')}</span>
          </div>
          ${quote.provider ? `
            <div class="shipping-quote-meta-row">
              <span class="shipping-quote-meta-key">Carrier</span>
              <span class="shipping-quote-meta-val">${escapeHtml(quote.provider)}</span>
            </div>
          ` : ''}
          ${quote.estimatedDelivery ? `
            <div class="shipping-quote-meta-row">
              <span class="shipping-quote-meta-key">Estimated Delivery</span>
              <span class="shipping-quote-meta-val">${escapeHtml(quote.estimatedDelivery)}</span>
            </div>
          ` : ''}
        </div>

        ${quote.notes ? `<div class="shipping-quote-notes">${escapeHtml(quote.notes)}</div>` : ''}

        <div class="shipping-quote-customs-note">
          <strong>Customs &amp; import duties:</strong> ${CUSTOMS_IMPORT_DUTIES_NOTICE.DISCLOSURE}
        </div>

        <div class="shipping-quote-actions">
          <button type="button" class="btn-primary" id="btn-accept-quote" ${this.submitting ? 'disabled' : ''}>
            Accept Shipping Quote
          </button>
          <button type="button" class="btn-outline" id="btn-decline-quote" ${this.submitting ? 'disabled' : ''}>
            Decline / Contact Support
          </button>
        </div>

        ${this.declineOpen ? `
          <div class="shipping-quote-decline-panel" id="shipping-quote-decline-panel">
            <label for="shipping-quote-decline-notes" class="shipping-quote-decline-label">
              Tell us what's wrong with this quote (optional)
            </label>
            <textarea id="shipping-quote-decline-notes" class="shipping-quote-decline-textarea" placeholder="e.g. This is higher than expected — please re-check the weight or offer an alternative carrier"></textarea>
            <div class="shipping-quote-decline-actions">
              <button type="button" class="btn-outline" id="btn-submit-decline" ${this.submitting ? 'disabled' : ''}>
                Send to Support
              </button>
              <button type="button" class="btn-link" id="btn-cancel-decline">
                Cancel
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderAcceptedState(quote) {
    const amount = quote ? formatQuoteAmount(quote.amount, quote.currency) : '';
    const contact = escapeHtml(this.order.customer?.phone || this.order.customer?.email || 'your registered contact details');
    return `
      <div class="shipping-quote-card">
        <span class="shipping-quote-eyebrow">International Shipping</span>
        <h3 class="shipping-quote-title">Quote accepted — shipping payment pending</h3>
        <p class="shipping-quote-body-text">
          Thank you for accepting your shipping quote${amount ? ` of <strong>${amount}</strong>` : ''}. Our Client Care team will contact you at ${contact} with shipping payment instructions. Your order moves to dispatch once shipping payment is confirmed.
        </p>
        <div class="shipping-quote-customs-note">
          <strong>Customs &amp; import duties:</strong> ${CUSTOMS_IMPORT_DUTIES_NOTICE.DISCLOSURE}
        </div>
      </div>
    `;
  }

  renderPaidState(quote) {
    const amount = quote ? formatQuoteAmount(quote.amount, quote.currency) : '';
    const destination = escapeHtml(this.order.delivery?.country || 'your destination');
    return `
      <div class="shipping-quote-card">
        <span class="shipping-quote-eyebrow">International Shipping</span>
        <h3 class="shipping-quote-title">Shipping paid${amount ? ` — ${amount}` : ''}</h3>
        <p class="shipping-quote-body-text">
          Your shipping fee has been received and confirmed. Your order is progressing toward dispatch and delivery to ${destination}.
        </p>
      </div>
    `;
  }

  attachEvents() {
    this.mountElement.querySelector('#btn-accept-quote')?.addEventListener('click', () => this.handleAccept());
    this.mountElement.querySelector('#btn-decline-quote')?.addEventListener('click', () => {
      this.declineOpen = true;
      this.feedback = null;
      this.render();
      this.mountElement.querySelector('#shipping-quote-decline-notes')?.focus();
    });
    this.mountElement.querySelector('#btn-cancel-decline')?.addEventListener('click', () => {
      this.declineOpen = false;
      this.render();
    });
    this.mountElement.querySelector('#btn-submit-decline')?.addEventListener('click', () => this.handleDecline());
  }

  async handleAccept() {
    if (this.submitting) return;
    this.submitting = true;
    try {
      const updated = OrderStore.recordCustomerQuoteResponse(this.order.id, 'accepted', '', { actor: this.actor });
      this.order = updated;
      this.declineOpen = false;
      this.feedback = { type: 'success', message: 'Quote accepted. Our team will be in touch with shipping payment instructions.' };

      // Dispatch shipping payment required email (Milestone C20.9) - never blocks the transition
      try {
        await emailService.sendShippingPaymentRequiredEmail(updated, updated.shippingQuote);
      } catch (emailErr) {
        console.warn('[ShippingQuoteCard] Shipping payment required email dispatch skipped/failed:', emailErr);
      }

      this.onUpdate(updated);
    } catch (err) {
      this.feedback = { type: 'error', message: err.message || 'Could not record your response. Please try again or contact support.' };
    } finally {
      this.submitting = false;
      this.render();
    }
  }

  handleDecline() {
    if (this.submitting) return;
    const notesEl = this.mountElement.querySelector('#shipping-quote-decline-notes');
    const notes = notesEl ? notesEl.value.trim() : '';
    this.submitting = true;
    try {
      const updated = OrderStore.recordCustomerQuoteResponse(this.order.id, 'rejected', notes, { actor: this.actor });
      this.order = updated;
      this.declineOpen = false;
      this.feedback = { type: 'success', message: "Thanks for letting us know — our Client Care team will follow up with a revised quote." };
      this.onUpdate(updated);
    } catch (err) {
      this.feedback = { type: 'error', message: err.message || 'Could not submit your response. Please try again or contact support.' };
    } finally {
      this.submitting = false;
      this.render();
    }
  }
}
