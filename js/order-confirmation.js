/**
 * Order Confirmation Controller - Slimky Hair
 * Milestone C16: Dedicated Order Confirmation Page & Security Gate
 * 
 * Guarantees:
 * - Only accessible for valid completed orders.
 * - Access-controlled: Prevents URL order enumeration without matching securityToken or authenticated session.
 * - Displays exact shipping notices (Nigeria: calculated separately; International: quote required).
 * - Zero card numbers or CVVs exposed.
 */

import { OrderStore } from './payment/order-store.js';
import { customerService } from './auth/customer-service.js';
import { GuestConversionCard } from './auth/guest-conversion-component.js';
import { ShippingQuoteCard, renderInternationalStatusRows } from './components/shipping-quote-card.js';
import { NigeriaShippingCard, renderNigeriaStatusRows } from './components/nigeria-shipping-card.js';
import { formatNaira, getCartRootPath, resolveCartImagePath } from './cart-store.js';
import { initNavigation } from './navigation.js';
import { initDrawers } from './drawers.js';
import { syncWishlistUI } from './wishlist-store.js';

const ORDER_STATUS_LABELS = {
  pending_payment: 'Pending Payment',
  paid: 'Order Placed',
  shipping_quote_required: 'Awaiting Shipping Quote',
  shipping_quote_sent: 'Shipping Quote Sent',
  shipping_payment_pending: 'Awaiting Shipping Payment',
  shipping_payment_confirmed: 'Shipping Paid',
  ready_for_dispatch: 'Ready for Dispatch',
  shipped: 'Shipped',
  delivered: 'Delivered',
  payment_failed: 'Payment Failed',
  cancelled: 'Cancelled'
};

function getOrderStatusLabel(orderStatus) {
  return ORDER_STATUS_LABELS[orderStatus] || 'Order Placed';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Resolve order identity from URL.
 * Supports BOTH:
 *  - Query form: /order-confirmation/?order_id=ORD-123&token=abc
 *    (also ?order= / ?id=, &token= / &sec=)
 *  - Path form:  /order-confirmation/ORD-123?token=abc
 *                  /order-confirmation.html?order_id=ORD-123&token=abc
 * This page IS the ecommerce thank-you experience — no separate /thank-you
 * route is created or required.
 */
function resolveOrderIdentityFromUrl() {
  const params = new URLSearchParams(window.location.search);
  let orderId = params.get('order_id') || params.get('order') || params.get('id');
  const token = params.get('token') || params.get('sec');

  if (!orderId && typeof window.location.pathname === 'string') {
    // e.g. /order-confirmation/ORD-ABC123 or /order-confirmation/ORD-ABC123/
    const segments = window.location.pathname.split('/').filter(Boolean);
    const idx = segments.findIndex(s => s === 'order-confirmation' || s === 'order-confirmation.html');
    const candidate = idx >= 0 ? segments[idx + 1] : null;
    if (candidate && !candidate.includes('.') && candidate.length >= 3) {
      orderId = decodeURIComponent(candidate);
    }
  }

  return { orderId, token };
}

export class OrderConfirmationPage {
  constructor(options = {}) {
    this.root = options.rootPrefix !== undefined ? options.rootPrefix : getCartRootPath();
    this.container = document.querySelector('#order-confirmation-app');
    this.init();
  }

  /**
   * REFRESH SAFETY (C20.8):
   * This page is strictly READ-ONLY on load / reload. init() only validates
   * access and renders. It never:
   *  - creates another order (no createOrder call),
   *  - creates another payment (no processPayment / createPayment call),
   *  - deducts inventory (no deductStock call).
   * The only writes available on this page are explicit, user-initiated
   * shipping-quote accept/decline/pay actions handled by the mounted
   * ShippingQuoteCard / NigeriaShippingCard components, which are guarded
   * by the order status state-machine + idempotency registries.
   */
  init() {
    if (!this.container) return;

    const { orderId, token } = resolveOrderIdentityFromUrl();

    if (!orderId) {
      this.renderNoOrderSpecified();
      return;
    }

    const currentCustomer = customerService.getCurrentCustomer();
    const customerId = currentCustomer ? currentCustomer.id : null;

    // Authoritative Access Verification Gate (Milestone C16 & C19)
    const access = OrderStore.validateOrderAccess(orderId, token, customerId);

    if (!access.authorized || !access.order) {
      this.renderAccessDenied();
      return;
    }

    const order = access.order;

    // Ensure order is a completed / paid order
    const completedStatuses = [
      'paid',
      'shipping_quote_required',
      'shipping_quote_sent',
      'shipping_payment_pending',
      'shipping_payment_confirmed',
      'ready_for_dispatch',
      'shipped',
      'delivered'
    ];

    if (!completedStatuses.includes(order.orderStatus)) {
      this.renderOrderIncomplete(order);
      return;
    }

    this.renderOrderConfirmation(order);
  }

  renderNoOrderSpecified() {
    this.container.innerHTML = `
      <div class="order-confirmation-card order-access-denied">
        <div class="order-access-denied-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h2 class="order-access-denied-title">No Order Reference Specified</h2>
        <p class="order-access-denied-text">
          Please check your confirmation email or order link to access your order receipt.
        </p>
        <div class="order-actions-bar">
          <a href="${this.root}shop/" class="btn-primary">Explore Products</a>
          <a href="${this.root}" class="btn-outline">Return Home</a>
        </div>
      </div>
    `;
  }

  renderAccessDenied() {
    this.container.innerHTML = `
      <div class="order-confirmation-card order-access-denied">
        <div class="order-access-denied-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2 class="order-access-denied-title">Access Denied</h2>
        <p class="order-access-denied-text">
          You do not have authorization to view this order receipt. Order receipts are protected and can only be accessed using the secure link provided during checkout or through your verified customer account.
        </p>
        <div class="order-actions-bar">
          <a href="${this.root}shop/" class="btn-primary">Explore Products</a>
          <a href="${this.root}" class="btn-outline">Return Home</a>
        </div>
      </div>
    `;
  }

  renderOrderIncomplete(order) {
    this.container.innerHTML = `
      <div class="order-confirmation-card order-access-denied">
        <div style="color: #9E6B20; margin-bottom: 16px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>
        <h2 class="order-access-denied-title">Payment Pending or Unverified</h2>
        <p class="order-access-denied-text">
          Order <strong>${order.orderNumber || order.id}</strong> has not been verified as paid. Confirmation receipts are only generated for successfully verified orders.
        </p>
        <div class="order-actions-bar">
          <a href="${this.root}checkout/" class="btn-primary">Return to Checkout</a>
          <a href="${this.root}shop/" class="btn-outline">Explore Products</a>
        </div>
      </div>
    `;
  }

  renderOrderConfirmation(order) {
    // READ-ONLY render: no order / payment / inventory writes happen below.
    const isNigeria = order.flow === 'nigeria_checkout';
    const orderNumber = order.orderNumber || order.id;
    const currentCustomer = customerService.getCurrentCustomer();
    const isSignedInOwner = !!(currentCustomer && order.customerId && currentCustomer.id === order.customerId);
    const isGuest = !isSignedInOwner;
    let orderDate = '';
    try {
      orderDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (e) { orderDate = ''; }

    const safeName = escapeHtml(order.customer?.fullName || 'valued customer');
    const safeEmail = escapeHtml(order.customer?.email || '');
    const safePhone = escapeHtml(order.customer?.phone || '');
    const safeInstructions = escapeHtml(order.delivery?.instructions || '');
    const safeOrderNumber = escapeHtml(orderNumber);
    const safeShippingStatus = escapeHtml(order.pricing?.shippingStatus || (isNigeria ? 'Calculated separately' : 'Quote required'));
    const safeOrderStatus = escapeHtml(getOrderStatusLabel(order.orderStatus));
    let safeAddress = '';
    try {
      if (isNigeria) {
        const addr = String(order.delivery?.address || '');
        const city = String(order.delivery?.city || '');
        const state = String(order.delivery?.state || '');
        safeAddress = escapeHtml(
          (city && addr.toLowerCase().includes(city.toLowerCase()))
            ? `${addr}, ${state}, Nigeria`
            : `${addr}, ${city}, ${state}, Nigeria`
        );
      } else {
        const d = order.delivery || {};
        safeAddress = escapeHtml(`${d.address || ''}, ${d.city || ''}, ${d.state || ''}${d.postalCode ? ' ' + d.postalCode : ''}, ${d.country || ''}`);
      }
    } catch (e) { safeAddress = ''; }

    // Exact C20.8 logistics copy (audited verbatim):
    // Nigeria: "Delivery fee will be calculated separately."
    // International: "Shipping quote required."
    const shippingNotice = isNigeria
      ? {
          title: 'Nigeria delivery — fee calculated separately',
          body: `Your product payment is complete. Delivery fee will be calculated separately. Our logistics team will contact you on ${safePhone || 'your phone / WhatsApp'} with the actual delivery fee before dispatch.`
        }
      : {
          title: 'International shipping — quote required',
          body: `Your product payment is complete. Shipping quote required. Slimky logistics will weigh your package and email the official carrier quote to ${safeEmail || 'your email'} — your order moves to dispatch once shipping is settled.`
        };

    const nextSteps = isNigeria
      ? [
          { t: 'Check your email', d: `Your receipt for order ${safeOrderNumber} is on its way to ${safeEmail || 'your inbox'}.` },
          { t: 'Expect our delivery-fee call', d: 'Our logistics team will contact you with the actual delivery fee before dispatch.' },
          { t: 'Track progress here', d: 'Revisit this receipt anytime with your secure link to see delivery updates.' }
        ]
      : [
          { t: 'Check your email', d: `Your receipt for order ${safeOrderNumber} is on its way to ${safeEmail || 'your inbox'}.` },
          { t: 'Await your shipping quote', d: 'We will email your official carrier quote as soon as it is ready — accept it here to continue.' },
          { t: 'Track progress here', d: 'Revisit this receipt anytime with your secure link to see shipping updates.' }
        ];

    // Primary CTA hierarchy (mobile-first, C20.8):
    // - Signed-in owner: primary = [ View My Orders ], secondary = [ Continue Shopping ]
    // - Guest: primary = [ Continue Shopping ], plus OPTIONAL [ Create Account ] card below.
    // Account creation is never forced.
    const primaryCta = isSignedInOwner
      ? `<a href="${this.root}account/orders/" id="confirmed-view-orders-link" class="btn-primary oc-cta oc-cta-primary">View My Orders</a>`
      : `<a href="${this.root}shop/" id="confirmed-continue-shopping-link" class="btn-primary oc-cta oc-cta-primary">Continue Shopping</a>`;
    const secondaryCta = isSignedInOwner
      ? `<a href="${this.root}shop/" class="btn-outline oc-cta" data-cta="continue-shopping">Continue Shopping</a>`
      : '';
    // Footer actions reuse: same destinations, no duplicate IDs (querySelector-safe).
    const primaryCtaFooter = isSignedInOwner
      ? `<a href="${this.root}account/orders/" class="btn-primary oc-cta oc-cta-primary" data-cta="view-orders">View My Orders</a>`
      : `<a href="${this.root}shop/" class="btn-primary oc-cta oc-cta-primary" data-cta="continue-shopping">Continue Shopping</a>`;
    const secondaryCtaFooter = isSignedInOwner
      ? `<a href="${this.root}shop/" class="btn-outline oc-cta" data-cta="continue-shopping">Continue Shopping</a>`
      : '';

    this.container.innerHTML = `
      <p class="oc-live-success" role="status" aria-live="polite">Your order was successful.</p>

      <div class="order-confirmation-card" id="confirmed-order-card">
        <!-- Header: instantly scannable success (360-480px first) -->
        <div class="order-confirmation-header">
          <div class="order-confirmation-icon" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <br>
          <div class="order-confirmation-badge">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: var(--color-sage-dark);"></span>
            Payment Verified · Order Placed
          </div>
          <h1 class="order-confirmation-title">Order Confirmed</h1>
          <p class="order-confirmation-subtitle">
            Thank you, <strong>${safeName}</strong>. Your payment has been verified via Slimky DemoPay.
          </p>
        </div>

        <!-- Primary CTA directly under the thank-you (mobile thumb reach) -->
        <div class="oc-primary-cta-block">
          ${primaryCta}
          ${secondaryCta}
        </div>

        <!-- Order reference: copyable on mobile -->
        <div class="oc-order-ref-card">
          <div class="oc-order-ref-row">
            <div>
              <div class="order-meta-label">Order Number</div>
              <div class="order-meta-val oc-order-number" id="confirmed-order-number">${safeOrderNumber}</div>
            </div>
            <button type="button" class="btn-outline oc-copy-btn" id="oc-copy-order-btn" data-copy="${safeOrderNumber}" aria-label="Copy order number">
              Copy
            </button>
          </div>
          <div class="oc-order-ref-meta">
            <span>${orderDate ? `Placed ${escapeHtml(orderDate)} · ` : ''}${isGuest ? 'Guest checkout' : 'Saved to your account'}</span>
          </div>
        </div>

        <!-- Meta Grid: payment + order status stay explicit for QA/support -->
        <div class="order-meta-grid">
          <div class="order-meta-item">
            <div class="order-meta-label">Payment Status</div>
            <div class="order-meta-val oc-paid" id="confirmed-payment-status">Successful (Slimky DemoPay)</div>
          </div>
          <div class="order-meta-item">
            <div class="order-meta-label">Order Status</div>
            <div class="order-meta-val" id="confirmed-order-status">${safeOrderStatus}</div>
          </div>
          <div class="order-meta-item">
            <div class="order-meta-label">Customer Email</div>
            <div class="order-meta-val oc-wrap" id="confirmed-customer-email">${safeEmail}</div>
          </div>
          <div class="order-meta-item">
            <div class="order-meta-label">Payment Method</div>
            <div class="order-meta-val">Demo Card</div>
          </div>
        </div>

        <!-- Delivery Destination Details -->
        <div class="oc-stack-card">
          <div class="order-section-heading">Delivery Information</div>
          <div class="oc-delivery-lines">
            <div><strong>Recipient:</strong> ${safeName}</div>
            <div><strong>Phone / WhatsApp:</strong> ${safePhone}</div>
            <div><strong>Address:</strong> ${safeAddress}</div>
            ${safeInstructions ? `<div class="oc-delivery-notes"><em>Notes: &ldquo;${safeInstructions}&rdquo;</em></div>` : ''}
          </div>
        </div>

        <!-- Ordered Items Section: stacked cards, never a desktop table -->
        <div class="oc-stack-card">
          <div class="order-section-heading">Items Purchased (${order.items.length})</div>
          <div class="order-items-list" id="confirmed-items-list">
            ${order.items.map(it => {
              const imgSrc = resolveCartImagePath(it.productImage, this.root);
              const qty = Number(it.quantity || 1);
              return `
                <div class="order-item-row">
                  <div class="order-item-main">
                    <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(it.productName)}" class="order-item-thumb" loading="lazy" decoding="async">
                    <div class="order-item-info">
                      <span class="order-item-title">${escapeHtml(it.productName)}</span>
                      <span class="order-item-variant">${escapeHtml(it.variantName || 'Standard')} × ${qty}</span>
                    </div>
                  </div>
                  <div class="order-item-price-block">
                    <div class="order-item-total">${formatNaira(it.lineSubtotal || it.lineTotal)}</div>
                    <div class="order-item-unit">${formatNaira(it.unitPrice)} each</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Financial Summary: subtotal + shipping status + total paid -->
        <div class="order-summary-box">
          <div class="order-summary-line">
            <span>Product Subtotal</span>
            <strong id="confirmed-subtotal">${formatNaira(order.pricing.subtotal)}</strong>
          </div>
          <div class="order-summary-line">
            <span>Shipping Status</span>
            <strong id="confirmed-shipping-status" style="color: var(--color-brown-deep);">${safeShippingStatus}</strong>
          </div>
          <div class="order-summary-total-line">
            <span>Total Paid</span>
            <span class="amount" id="confirmed-total-paid">${formatNaira(order.pricing.productPaymentTotal)}</span>
          </div>
        </div>

        <!-- Explicit logistics notice (verbatim C20.8 copy, mobile stacked card) -->
        <div class="oc-notice-box ${isNigeria ? 'is-nigeria' : 'is-international'}" id="confirmed-shipping-notice" role="note" aria-label="${escapeHtml(shippingNotice.title)}">
          <div class="oc-notice-title">${escapeHtml(shippingNotice.title)}</div>
          <p class="oc-notice-body">${shippingNotice.body}</p>
        </div>

        <!-- Specific Shipping Messages (Nigeria vs International) -->
        ${isNigeria ? `
          <!-- C20.10: Separated Product Payment / Delivery status, stacked on mobile -->
          ${renderNigeriaStatusRows(order)}
          <div id="ng-shipping-card-mount"></div>
        ` : `
          <!-- C20.11: Separated Product Payment / Shipping status (Section 8) -->
          ${renderInternationalStatusRows(order)}
          <div id="shipping-quote-card-mount"></div>
        `}

        <!-- What happens next -->
        <div class="oc-stack-card oc-next-steps" aria-label="What happens next">
          <div class="order-section-heading">What happens next</div>
          <ol class="oc-steps-list">
            ${nextSteps.map((s, i) => `
              <li class="oc-step">
                <span class="oc-step-num" aria-hidden="true">${i + 1}</span>
                <span class="oc-step-text"><strong>${escapeHtml(s.t)}.</strong> ${s.d}</span>
              </li>
            `).join('')}
          </ol>
        </div>

        <!-- Actions: full-width stacked CTAs on mobile -->
        <div class="order-actions-bar oc-actions">
          ${primaryCtaFooter}
          ${secondaryCtaFooter}
          <button type="button" class="btn-outline oc-cta" id="oc-print-receipt-btn">
            Print Receipt
          </button>
          <a href="${this.root}" class="btn-outline oc-cta">
            Return Home
          </a>
        </div>
      </div>

      <!-- Optional Guest-to-Account Conversion Card (Milestone C19.9): never forced -->
      <div id="order-guest-conversion-mount"></div>
    `;

    // Wire copy + print (pure UI helpers — no order/payment/inventory writes).
    this.container.querySelector('#oc-copy-order-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const text = btn.getAttribute('data-copy') || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        const original = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = original; }, 1600);
      } catch (err) {
        btn.textContent = 'Copy';
      }
    });
    this.container.querySelector('#oc-print-receipt-btn')?.addEventListener('click', () => window.print());

    // Initialize Post-Purchase Conversion Card if applicable
    const conversionMount = this.container.querySelector('#order-guest-conversion-mount');
    if (conversionMount) {
      new GuestConversionCard({
        mountElement: conversionMount,
        order,
        securityToken: order.securityToken,
        rootPrefix: this.root
      });
    }

    // C20.11: International shipping quote Accept/Decline card
    const quoteMount = this.container.querySelector('#shipping-quote-card-mount');
    if (quoteMount && !isNigeria) {
      const quoteCard = new ShippingQuoteCard({
        mountElement: quoteMount,
        order,
        onUpdate: (updatedOrder) => this.renderOrderConfirmation(updatedOrder)
      });
      quoteCard.render();
    }

    // C20.10: Nigeria shipping quote Accept & Pay card
    const ngShippingMount = this.container.querySelector('#ng-shipping-card-mount');
    if (ngShippingMount && isNigeria) {
      const ngCard = new NigeriaShippingCard({
        mountElement: ngShippingMount,
        order,
        onUpdate: (updatedOrder) => this.renderOrderConfirmation(updatedOrder)
      });
      ngCard.render();
    }
  }
}

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('#order-confirmation-app')) {
      new OrderConfirmationPage();
    }
    initNavigation();
    initDrawers();
    syncWishlistUI();
  });
}
