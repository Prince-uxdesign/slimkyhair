/**
 * Customer Orders & Order Details Controller - Slimky Hair
 * Milestone C19.7: Customer Orders & Responsive Order Experience
 */

import { initAccountShell } from './account-shell.js';
import { customerService } from './auth/customer-service.js';
import { ShippingQuoteCard, renderInternationalStatusRows } from './components/shipping-quote-card.js';
import { NigeriaShippingCard, renderNigeriaStatusRows } from './components/nigeria-shipping-card.js';
import {
  formatOrderStatus,
  getOrderStatusClass,
  formatPaymentStatus,
  calculateTotalItemCount,
  formatOrderItemsSummary,
  formatOrderDate,
  formatOrderNaira,
  getOrderShippingNotice
} from './auth/customer-orders-helper.js';

class AccountOrdersController {
  constructor() {
    this.customer = null;
    this.orders = [];
    this.root = this.computeRootPrefix();
    this.appMount = document.querySelector('#account-orders-mount');
  }

  async init() {
    // 1. Guard route - authenticated customers only
    this.customer = customerService.getCurrentCustomer();
    if (!this.customer) {
      const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`${this.root}account/login/?redirect=${redirectUrl}`);
      return;
    }

    // 2. Initialize account shell
    initAccountShell({ activeNav: 'orders', rootPrefix: this.root });

    // 3. Handle Popstate (browser back/forward navigation)
    window.addEventListener('popstate', () => {
      this.route();
    });

    // 4. Initial Route
    this.route();
  }

  computeRootPrefix() {
    return window.location.pathname.includes('/account/orders/') ? '../../' : '../';
  }

  route() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');

    if (orderId) {
      this.renderOrderDetail(orderId);
    } else {
      this.renderOrderList();
    }
  }

  showLoading() {
    if (!this.appMount) return;
    this.appMount.innerHTML = `
      <div style="text-align: center; padding: 60px 0;">
        <div class="loading-spinner" style="margin: 0 auto 16px auto;" aria-hidden="true"></div>
        <p style="color: var(--color-text-secondary); font-size: 0.9375rem;">Loading your order history...</p>
      </div>
    `;
  }

  renderOrderList() {
    if (!this.appMount) return;
    this.showLoading();

    try {
      this.orders = customerService.getCustomerOrders(this.customer.id) || [];
    } catch (err) {
      console.warn('[AccountOrders] Failed to load orders:', err);
      this.orders = [];
    }

    if (this.orders.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Desktop Table Markup
    const desktopTableRows = this.orders.map(order => {
      const orderNum = order.orderNumber || order.id;
      const dateStr = formatOrderDate(order.createdAt);
      const itemsSummary = formatOrderItemsSummary(order.items);
      const totalAmount = formatOrderNaira(order.pricing?.totalAmount || order.pricing?.productPaymentTotal || order.pricing?.subtotal || 0);
      const statusClass = getOrderStatusClass(order.orderStatus);
      const statusLabel = formatOrderStatus(order.orderStatus);
      const isPaid = order.orderStatus === 'paid' || order.paymentStatus === 'successful';

      return `
        <tr>
          <td>
            <div class="order-table-number">${this.escapeHtml(orderNum)}</div>
          </td>
          <td>${dateStr}</td>
          <td>
            <div class="order-table-items" title="${this.escapeHtml(itemsSummary)}">${this.escapeHtml(itemsSummary)}</div>
          </td>
          <td>
            <span class="order-table-total">${totalAmount}</span>
          </td>
          <td>
            <span class="order-status-badge ${isPaid ? 'status-paid' : 'status-pending'}">
              ${isPaid ? 'Paid' : 'Pending'}
            </span>
          </td>
          <td>
            <span class="order-status-badge ${statusClass}">
              ${statusLabel}
            </span>
          </td>
          <td style="text-align: right;">
            <button type="button" class="btn-outline btn-sm btn-view-order-trigger" data-order-id="${order.id}">
              View Order
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Mobile Stacked Cards Markup
    const mobileCardsHtml = this.orders.map(order => {
      const orderNum = order.orderNumber || order.id;
      const dateStr = formatOrderDate(order.createdAt);
      const itemsSummary = formatOrderItemsSummary(order.items);
      const itemCount = calculateTotalItemCount(order.items);
      const totalAmount = formatOrderNaira(order.pricing?.totalAmount || order.pricing?.productPaymentTotal || order.pricing?.subtotal || 0);
      const statusClass = getOrderStatusClass(order.orderStatus);
      const statusLabel = formatOrderStatus(order.orderStatus);
      const isPaid = order.orderStatus === 'paid' || order.paymentStatus === 'successful';

      return `
        <article class="order-mobile-card" aria-label="Order ${this.escapeHtml(orderNum)}">
          <div class="order-mobile-card-top">
            <div>
              <div class="order-mobile-card-num">${this.escapeHtml(orderNum)}</div>
              <div class="order-mobile-card-date">${dateStr}</div>
            </div>
            <span class="order-status-badge ${statusClass}">
              ${statusLabel}
            </span>
          </div>

          <div class="order-mobile-card-body">
            <div class="order-mobile-card-items">
              ${this.escapeHtml(itemsSummary)}
            </div>
            <div class="order-mobile-card-pricing">
              <span class="order-mobile-card-price-label">${itemCount} item${itemCount === 1 ? '' : 's'}</span>
              <span class="order-mobile-card-price-val">${totalAmount}</span>
            </div>
          </div>

          <div class="order-mobile-card-bottom">
            <span class="order-status-badge ${isPaid ? 'status-paid' : 'status-pending'}">
              Payment: ${isPaid ? 'Paid' : 'Pending'}
            </span>
            <button type="button" class="btn-outline btn-view-order-trigger" data-order-id="${order.id}">
              View Order
            </button>
          </div>
        </article>
      `;
    }).join('');

    this.appMount.innerHTML = `
      <header class="addresses-header-actions">
        <div>
          <h1 class="account-panel-title">Order History</h1>
          <p class="account-panel-desc">Review your botanical formulation orders, shipment tracking, and receipts.</p>
        </div>
      </header>

      <!-- Desktop View Table -->
      <div class="order-table-responsive-wrapper">
        <table class="order-history-desktop-table" aria-label="Customer Order History Table">
          <thead>
            <tr>
              <th>Order Ref</th>
              <th>Date</th>
              <th>Summary</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${desktopTableRows}
          </tbody>
        </table>
      </div>

      <!-- Mobile View Stacked Cards -->
      <div class="order-history-mobile-stack" aria-label="Customer Order Cards List">
        ${mobileCardsHtml}
      </div>
    `;

    // Attach View Order listeners
    this.appMount.querySelectorAll('.btn-view-order-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-order-id');
        this.navigateToOrder(orderId);
      });
    });
  }

  renderEmptyState() {
    this.appMount.innerHTML = `
      <header class="addresses-header-actions">
        <div>
          <h1 class="account-panel-title">Order History</h1>
          <p class="account-panel-desc">Review your botanical formulation orders, shipment tracking, and receipts.</p>
        </div>
      </header>

      <div class="dashboard-empty-state" style="margin-top: 20px;">
        <div class="dashboard-empty-icon" aria-hidden="true">🛍️</div>
        <h3 class="dashboard-empty-title">No orders yet</h3>
        <p class="dashboard-empty-desc">
          Your Slimky Hair purchases will appear here. Discover our authentic African botanical hair care formulations.
        </p>
        <a href="${this.root}shop/" class="btn-primary" style="margin-top: 18px; min-height: 44px; padding: 0 24px; text-decoration: none; display: inline-flex; align-items: center;">
          Shop Hair Care
        </a>
      </div>
    `;
  }

  navigateToOrder(orderId) {
    const newUrl = `${window.location.pathname}?id=${encodeURIComponent(orderId)}`;
    window.history.pushState({ orderId }, '', newUrl);
    this.renderOrderDetail(orderId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navigateBackToList() {
    const cleanUrl = window.location.pathname;
    window.history.pushState({}, '', cleanUrl);
    this.renderOrderList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderOrderDetail(orderId) {
    if (!this.appMount) return;
    this.showLoading();

    let order;
    try {
      order = customerService.getOrderDetails(orderId, this.customer.id);
    } catch (err) {
      console.warn('[AccountOrders] Error loading order details:', err);
      this.renderOrderNotFound(orderId);
      return;
    }

    if (!order) {
      this.renderOrderNotFound(orderId);
      return;
    }

    const orderNum = order.orderNumber || order.id;
    const dateStr = formatOrderDate(order.createdAt, true);
    const statusLabel = formatOrderStatus(order.orderStatus);
    const statusClass = getOrderStatusClass(order.orderStatus);
    const isPaid = order.orderStatus === 'paid' || order.paymentStatus === 'successful';
    const totalCount = calculateTotalItemCount(order.items);
    const shippingNotice = getOrderShippingNotice(order);
    const isInternational = order.flow === 'international_checkout';

    const subtotal = formatOrderNaira(order.pricing?.subtotal || order.pricing?.productPaymentTotal || 0);
    const total = formatOrderNaira(order.pricing?.totalAmount || order.pricing?.productPaymentTotal || order.pricing?.subtotal || 0);

    // Items table rows
    const itemsRows = (order.items || []).map(it => {
      const unitPrice = formatOrderNaira(it.unitPrice || it.price || 0);
      const qty = Number(it.quantity) || 1;
      const lineSubtotal = formatOrderNaira((it.unitPrice || it.price || 0) * qty);
      const variant = it.variantName ? `<span style="font-size: 0.8125rem; color: var(--color-text-secondary); display: block;">${this.escapeHtml(it.variantName)}</span>` : '';

      return `
        <tr>
          <td>
            <strong>${this.escapeHtml(it.productName || 'Product')}</strong>
            ${variant}
          </td>
          <td>${unitPrice}</td>
          <td>× ${qty}</td>
          <td style="text-align: right; font-weight: 600;">${lineSubtotal}</td>
        </tr>
      `;
    }).join('');

    // Delivery address
    const recipient = order.delivery?.recipientName || order.delivery?.fullName || order.customer?.fullName || 'Valued Customer';
    const phone = order.delivery?.phone || order.customer?.phone || 'No phone recorded';
    const street = order.delivery?.streetAddress || order.delivery?.address || 'Delivery Address';
    const city = order.delivery?.city || '';
    const state = order.delivery?.state || '';
    const postal = order.delivery?.postalCode ? ` ${order.delivery.postalCode}` : '';
    const country = order.delivery?.country || 'Nigeria';

    this.appMount.innerHTML = `
      <!-- Order Detail Header -->
      <div class="order-detail-header-strip">
        <div>
          <button type="button" id="btn-back-to-orders" class="btn-outline btn-sm" style="margin-bottom: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            ← Back to Order History
          </button>
          <h1 class="account-panel-title" style="margin: 0;">Order #${this.escapeHtml(orderNum)}</h1>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <span class="order-status-badge ${statusClass}">
            ${statusLabel}
          </span>
          <span class="order-status-badge ${isPaid ? 'status-paid' : 'status-pending'}">
            Payment: ${isPaid ? 'Paid' : 'Pending'}
          </span>
        </div>
      </div>

      <!-- Order Meta Grid -->
      <div class="order-detail-meta-grid">
        <div class="order-detail-meta-item">
          <span class="order-detail-meta-label">Date Placed</span>
          <span class="order-detail-meta-val">${dateStr}</span>
        </div>
        <div class="order-detail-meta-item">
          <span class="order-detail-meta-label">Total Items</span>
          <span class="order-detail-meta-val">${totalCount} item${totalCount === 1 ? '' : 's'}</span>
        </div>
        <div class="order-detail-meta-item">
          <span class="order-detail-meta-label">Order Status</span>
          <span class="order-detail-meta-val">${statusLabel}</span>
        </div>
        <div class="order-detail-meta-item">
          <span class="order-detail-meta-label">Total Amount</span>
          <span class="order-detail-meta-val">${total}</span>
        </div>
      </div>

      <!-- Itemized Products Breakdown -->
      <div class="order-detail-items-box">
        <table class="order-detail-items-table" aria-label="Ordered Formulations">
          <thead>
            <tr>
              <th>Formulation</th>
              <th>Unit Price</th>
              <th>Quantity</th>
              <th style="text-align: right;">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </div>

      <!-- Details Grid (Delivery Info + Pricing Summary) -->
      <div class="order-detail-grid-cards">
        
        <!-- Delivery Destination Card -->
        <div class="order-detail-card">
          <h3 class="order-detail-card-title">Delivery Information</h3>
          <div style="font-size: 0.9375rem; color: var(--color-text-primary); line-height: 1.5;">
            <div><strong>${this.escapeHtml(recipient)}</strong></div>
            <div style="color: var(--color-text-secondary); margin-bottom: 8px;">📞 ${this.escapeHtml(phone)}</div>
            <div>${this.escapeHtml(street)}</div>
            <div>${this.escapeHtml(city)}, ${this.escapeHtml(state)}${this.escapeHtml(postal)}</div>
            <div style="font-weight: 500;">${this.escapeHtml(country)}</div>
            ${order.delivery?.instructions ? `
              <div style="margin-top: 10px; font-size: 0.8125rem; background: var(--color-bg-primary); padding: 8px 12px; border-radius: 4px;">
                <strong>Dispatch Note:</strong> ${this.escapeHtml(order.delivery.instructions)}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Pricing Summary Card -->
        <div class="order-detail-card">
          <h3 class="order-detail-card-title">Payment & Pricing Summary</h3>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9375rem;">
            <span style="color: var(--color-text-secondary);">Product Subtotal</span>
            <span>${subtotal}</span>
          </div>
          ${!isInternational ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 0.9375rem;">
              <span style="color: var(--color-text-secondary);">Shipping</span>
              <span>${shippingNotice.isSeparate ? 'Separate / Invoiced' : 'Included'}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--color-border-subtle); font-weight: 700; font-size: 1.125rem; color: var(--color-text-primary);">
            <span>Total Paid</span>
            <span>${total}</span>
          </div>

          <!-- Shipping Notice Banner (Nigeria) -->
          ${!isInternational ? `
            <div class="order-shipping-notice-banner">
              <strong>${this.escapeHtml(shippingNotice.title)}:</strong>
              ${this.escapeHtml(shippingNotice.description)}
            </div>
          ` : ''}
        </div>

      </div>

      <!-- C20.11: Separated Product Payment / Shipping status + Quote Card (International) -->
      ${isInternational ? `
        <div class="order-detail-card" style="margin-bottom: 24px;">
          <h3 class="order-detail-card-title">Shipping Status</h3>
          ${renderInternationalStatusRows(order)}
          <div id="shipping-quote-card-mount"></div>
        </div>
      ` : ''}
    `;

    document.querySelector('#btn-back-to-orders')?.addEventListener('click', () => {
      this.navigateBackToList();
    });

    const quoteMount = this.appMount.querySelector('#shipping-quote-card-mount');
    if (quoteMount) {
      const quoteCard = new ShippingQuoteCard({
        mountElement: quoteMount,
        order,
        onUpdate: (updatedOrder) => this.renderOrderDetail(updatedOrder.id)
      });
      quoteCard.render();
    }
  }

  renderOrderNotFound(orderId) {
    this.appMount.innerHTML = `
      <div class="dashboard-empty-state" style="margin-top: 20px;">
        <div class="dashboard-empty-icon" aria-hidden="true">🔍</div>
        <h3 class="dashboard-empty-title">Order not found</h3>
        <p class="dashboard-empty-desc">
          We could not locate order reference "${this.escapeHtml(orderId)}" for your account. It may belong to another session or has not been placed.
        </p>
        <button type="button" id="btn-back-from-error" class="btn-primary" style="margin-top: 18px; min-height: 44px; padding: 0 24px; cursor: pointer;">
          Return to Order History
        </button>
      </div>
    `;

    document.querySelector('#btn-back-from-error')?.addEventListener('click', () => {
      this.navigateBackToList();
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const controller = new AccountOrdersController();
  controller.init().catch(err => {
    console.error('[AccountOrders] Controller init failed:', err);
  });
});
