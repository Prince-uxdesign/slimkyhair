/**
 * Track Order Page Controller - Slimky Hair
 * Guest & Client Order Lookup, Real-Time Progress, and Interactive Shipping Actions
 */

import { initNavigation } from './navigation.js';
import { initDrawers } from './drawers.js';
import { OrderStore } from './payment/order-store.js';
import { formatNaira, resolveCartImagePath } from './cart-store.js';
import { ShippingQuoteCard } from './components/shipping-quote-card.js';

import { NigeriaShippingCard } from './components/nigeria-shipping-card.js';

import { getWhatsAppNumber } from './contact-page.js';
export class TrackOrderController {
  constructor(options = {}) {
    this.rootPrefix = options.rootPrefix || '';
    this.form = document.getElementById('track-order-form');
    this.orderInput = document.getElementById('track-order-ref');
    this.emailInput = document.getElementById('track-order-email');
    this.submitBtn = document.getElementById('track-order-submit-btn');
    this.feedbackMount = document.getElementById('track-order-feedback');
    this.resultMount = document.getElementById('track-order-result');

    this.activeShippingCard = null;
    this.init();
  }

  init() {
    initNavigation();
    initDrawers();

    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // Handle URL parameters (e.g., /track-order/?order=SLM-202609-1234&email=guest@example.com)
    this.checkUrlParams();
  }

  checkUrlParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const orderParam = params.get('order') || params.get('ref') || params.get('id');
      const emailParam = params.get('email');

      if (orderParam) {
        if (this.orderInput) this.orderInput.value = orderParam.trim();
        if (emailParam && this.emailInput) {
          this.emailInput.value = emailParam.trim();
          this.lookupOrder(orderParam.trim(), emailParam.trim());
        }
      }
    } catch (err) {
      console.warn('[TrackOrder] Error parsing URL parameters:', err);
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    this.clearFeedback();

    const orderRef = (this.orderInput?.value || '').trim();
    const email = (this.emailInput?.value || '').trim();

    if (!orderRef) {
      this.showError('Please enter your Order Reference or Order Number.');
      this.orderInput?.focus();
      return;
    }

    if (!email || !email.includes('@')) {
      this.showError('Please enter a valid email address.');
      this.emailInput?.focus();
      return;
    }

    this.setLoading(true);
    // Slight simulated async lookup for natural tactile feedback
    await new Promise((resolve) => setTimeout(resolve, 350));
    this.lookupOrder(orderRef, email);
    this.setLoading(false);
  }

  setLoading(isLoading) {
    if (!this.submitBtn) return;
    this.submitBtn.disabled = isLoading;
    if (isLoading) {
      this.submitBtn.innerHTML = `
        <svg style="width: 18px; height: 18px; animation: spin 0.8s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25" stroke-width="4"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-width="4"></path>
        </svg>
        <span>Locating Order…</span>
      `;
    } else {
      this.submitBtn.innerHTML = `
        <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <span>Track Order</span>
      `;
    }
  }

  showError(message) {
    if (!this.feedbackMount) return;
    this.feedbackMount.innerHTML = `
      <div class="track-order-alert track-order-alert-error" role="alert">
        <svg style="width: 20px; height: 20px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>${message}</div>
      </div>
    `;
    if (this.resultMount) this.resultMount.innerHTML = '';
  }

  clearFeedback() {
    if (this.feedbackMount) this.feedbackMount.innerHTML = '';
  }

  lookupOrder(orderRef, email) {
    const cleanRef = orderRef.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    // 1. Authoritative Lookup in OrderStore
    let order = OrderStore.getOrderByNumber(cleanRef) || OrderStore.getOrder(cleanRef);

    if (!order) {
      // Search across case-insensitive orderNumber or ID
      try {
        const raw = localStorage.getItem('slimky_orders');
        const list = raw ? JSON.parse(raw) : [];
        order = list.find(
          (o) =>
            (o.orderNumber && o.orderNumber.toUpperCase() === cleanRef) ||
            (o.id && o.id.toUpperCase() === cleanRef)
        );
      } catch (e) {}
    }

    // 2. Privacy & Access Authorization Check
    if (!order || !order.customer || order.customer.email.trim().toLowerCase() !== cleanEmail) {
      this.showError(
        'We could not find an order matching that reference and email address. Please verify your order confirmation or reach out to client care on WhatsApp for assistance.'
      );
      return;
    }

    // 3. Render Order Result
    this.renderOrder(order);
  }

  renderOrder(order) {
    if (!this.resultMount) return;

    const placedDate = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      : 'Recent Order';

    const orderNumber = order.orderNumber || order.id;
    const isNigeria = order.flow === 'nigeria_checkout' || order.shippingAddress?.country === 'NG' || order.shippingAddress?.country === 'Nigeria';
    const status = order.orderStatus || 'pending_payment';
    const paymentStatus = order.paymentStatus || 'pending';

    // Build timeline stages
    const timeline = this.getTimelineSteps(status, paymentStatus, isNigeria);

    // Status Badge config
    const badge = this.getStatusBadge(status, paymentStatus);

    const safeItems = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = safeItems
      .map((item) => {
        const imgPath = resolveCartImagePath(
          item.image || item.thumbnail || 'assets/placeholders/products/oil-dropper-bottle.jpg',
          this.rootPrefix
        );
        const name = item.productName || item.name || 'Botanical Formulation';
        const variant = item.variantName || item.size || 'Standard Edition';
        const qty = item.quantity || 1;
        const lineTotal = item.lineTotal || item.lineSubtotal || (item.unitPrice || 0) * qty;

        return `
          <div class="track-item-row">
            <div class="track-item-left">
              <img src="${imgPath}" alt="${name}" class="track-item-thumb" loading="lazy">
              <div class="track-item-info">
                <span class="track-item-name">${name}</span>
                <span class="track-item-variant">${variant} × ${qty}</span>
              </div>
            </div>
            <div class="track-item-price">${formatNaira(lineTotal)}</div>
          </div>
        `;
      })
      .join('');

    const subtotal = order.pricing?.subtotal || order.pricing?.productPaymentTotal || 0;
    const totalPaid = order.pricing?.totalPaid || order.pricing?.productPaymentTotal || subtotal;

    // WhatsApp Direct Inquiry link (Phase A9: centralized official number —
    // previously a dead placeholder that reached nobody).
    const waText = encodeURIComponent(
      `Hello Slimky Hair Client Care, I am inquiring about the status of my order ${orderNumber}.`
    );
    const waUrl = `https://wa.me/${getWhatsAppNumber()}?text=${waText}`;

    this.resultMount.innerHTML = `
      <div class="track-result-header">
        <div>
          <h2 class="track-result-number">${orderNumber}</h2>
          <div class="track-result-date">Placed on ${placedDate} · ${isNigeria ? 'Nigeria Delivery' : 'International Delivery'}</div>
        </div>
        <div class="track-result-badges">
          <span class="badge ${badge.className}">${badge.label}</span>
          <span class="badge badge-subtle">Payment: ${paymentStatus.toUpperCase()}</span>
        </div>
      </div>

      <!-- Timeline Progress -->
      <div class="track-timeline-wrap">
        <ol class="track-timeline">
          ${timeline
            .map(
              (step, idx) => `
            <li class="track-timeline-step ${step.status}">
              <div class="track-timeline-node">${step.isDone ? '✓' : idx + 1}</div>
              <div class="track-timeline-step-text">
                <span class="track-timeline-label">${step.label}</span>
                <span class="track-timeline-sub">${step.sub}</span>
              </div>
            </li>
          `
            )
            .join('')}
        </ol>
      </div>

      <!-- Mount point for Interactive Shipping / Delivery Card -->
      <div id="track-interactive-shipping-mount" style="margin: 8px 0;"></div>

      <!-- Items Section -->
      <div class="track-items-list">
        <h3 style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-secondary); margin: 0 0 12px 0;">
          Ordered Formulations (${safeItems.length})
        </h3>
        ${itemsHtml}
      </div>

      <!-- Pricing Summary -->
      <div class="track-pricing-table">
        <div class="track-pricing-row">
          <span>Formulations Subtotal</span>
          <span class="track-pricing-val">${formatNaira(subtotal)}</span>
        </div>
        <div class="track-pricing-row">
          <span>Shipping Status</span>
          <span class="track-pricing-val" style="font-weight: 500;">${this.getShippingSummaryLabel(order)}</span>
        </div>
        <div class="track-pricing-row is-total">
          <span>Total Paid to Date</span>
          <span class="track-pricing-val" style="font-family: var(--font-serif); font-size: 1.35rem; color: var(--color-sage-dark);">${formatNaira(totalPaid)}</span>
        </div>
      </div>

      <!-- Delivery & Recipient Details -->
      <div class="track-details-grid">
        <div class="track-detail-col">
          <div class="track-detail-label">Shipping Destination</div>
          <p class="track-detail-text">
            <strong>${order.shippingAddress?.fullName || order.customer?.fullName || 'Client'}</strong><br>
            ${order.shippingAddress?.streetAddress || ''}<br>
            ${order.shippingAddress?.city || ''}${order.shippingAddress?.state ? `, ${order.shippingAddress.state}` : ''}<br>
            ${order.shippingAddress?.country || (isNigeria ? 'Nigeria' : '')}
          </p>
        </div>

        <div class="track-detail-col">
          <div class="track-detail-label">Client Care Contact</div>
          <p class="track-detail-text">
            <strong>Email:</strong> ${order.customer?.email || '—'}<br>
            <strong>Phone / WhatsApp:</strong> ${order.customer?.phone || order.shippingAddress?.phone || '—'}<br>
            ${order.shippingAddress?.deliveryInstructions ? `<em>Instructions: ${order.shippingAddress.deliveryInstructions}</em>` : ''}
          </p>
        </div>
      </div>

      <!-- WhatsApp / Help Bar -->
      <div class="track-help-bar">
        <div>
          <div class="track-help-title">Need updates or dispatch assistance?</div>
          <div class="track-help-sub">Our concierge is on hand to assist with order status and logistics.</div>
        </div>
        <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="track-whatsapp-btn">
          <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          Chat on WhatsApp
        </a>
      </div>
    `;

    // Mount Interactive Shipping Quote Card if applicable
    this.mountShippingComponent(order);

    // Smooth scroll to results
    this.resultMount.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  mountShippingComponent(order) {
    const mount = document.getElementById('track-interactive-shipping-mount');
    if (!mount) return;

    const isNigeria = order.flow === 'nigeria_checkout' || order.shippingAddress?.country === 'NG' || order.shippingAddress?.country === 'Nigeria';

    if (!isNigeria) {
      // International Workflow: Mount interactive shipping quote card
      try {
        this.activeShippingCard = new ShippingQuoteCard({
          order,
          onAccepted: (updated) => this.renderOrder(updated),
          onDeclined: (updated) => this.renderOrder(updated)
        });
        mount.appendChild(this.activeShippingCard.render());
      } catch (err) {
        console.warn('[TrackOrder] Error mounting ShippingQuoteCard:', err);
      }
    } else {
      // Nigeria Workflow: Mount Nigeria shipping fee component if quote exists or needs payment
      try {
        this.activeShippingCard = new NigeriaShippingCard({
          order,
          onPaid: (updated) => this.renderOrder(updated)
        });
        mount.appendChild(this.activeShippingCard.render());
      } catch (err) {
        console.warn('[TrackOrder] Error mounting NigeriaShippingCard:', err);
      }
    }
  }

  getTimelineSteps(status, paymentStatus, isNigeria) {
    const isPaid = paymentStatus === 'successful' || ['paid', 'ready_for_dispatch', 'shipped', 'delivered', 'shipping_quote_required', 'shipping_quote_sent', 'shipping_payment_pending', 'shipping_payment_confirmed'].includes(status);
    const isShipped = ['shipped', 'delivered'].includes(status);
    const isDelivered = status === 'delivered';

    let logisticsLabel = isNigeria ? 'Logistics Coordination' : 'Shipping Quote';
    let logisticsSub = 'In Progress';
    let logisticsDone = ['ready_for_dispatch', 'shipped', 'delivered', 'shipping_payment_confirmed'].includes(status);

    if (status === 'shipping_quote_required') {
      logisticsSub = 'Preparing Quote';
    } else if (status === 'shipping_quote_sent') {
      logisticsSub = 'Quote Ready';
    } else if (status === 'ready_for_dispatch') {
      logisticsSub = 'Packaging Formulations';
    }

    return [
      {
        label: 'Order Placed',
        sub: 'Confirmed',
        status: 'is-done',
        isDone: true
      },
      {
        label: 'Payment Verified',
        sub: isPaid ? 'Completed' : 'Pending',
        status: isPaid ? 'is-done' : 'is-current',
        isDone: isPaid
      },
      {
        label: logisticsLabel,
        sub: logisticsDone ? 'Approved' : logisticsSub,
        status: logisticsDone ? 'is-done' : (isPaid ? 'is-current' : ''),
        isDone: logisticsDone
      },
      {
        label: 'Dispatch / In Transit',
        sub: isShipped ? 'Dispatched' : 'Pending',
        status: isShipped ? (isDelivered ? 'is-done' : 'is-current') : '',
        isDone: isShipped
      },
      {
        label: 'Delivered',
        sub: isDelivered ? 'Received' : 'Estimated',
        status: isDelivered ? 'is-done' : '',
        isDone: isDelivered
      }
    ];
  }

  getStatusBadge(status, paymentStatus) {
    switch (status) {
      case 'delivered':
        return { label: 'Delivered', className: 'badge-success' };
      case 'shipped':
        return { label: 'Dispatched / In Transit', className: 'badge-info' };
      case 'ready_for_dispatch':
      case 'shipping_payment_confirmed':
        return { label: 'Packaging for Dispatch', className: 'badge-info' };
      case 'shipping_quote_sent':
        return { label: 'Shipping Quote Ready', className: 'badge-warning' };
      case 'shipping_quote_required':
        return { label: 'Awaiting Shipping Quote', className: 'badge-subtle' };
      case 'paid':
        return { label: 'Paid & Processing', className: 'badge-success' };
      case 'payment_failed':
        return { label: 'Payment Action Required', className: 'badge-error' };
      default:
        return { label: status.replace(/_/g, ' ').toUpperCase(), className: 'badge-subtle' };
    }
  }

  getShippingSummaryLabel(order) {
    if (order.shippingPayment?.status === 'successful' || order.orderStatus === 'shipping_payment_confirmed') {
      return `Paid (${formatNaira(order.shippingPayment?.amount || 0)})`;
    }
    if (order.shippingQuote?.amount) {
      return `Quote: ${formatNaira(order.shippingQuote.amount)} (${order.shippingQuote.status || 'Sent'})`;
    }
    if (order.flow === 'nigeria_checkout') {
      return 'Coordinated via Phone / WhatsApp';
    }
    return 'Quote Required';
  }
}
