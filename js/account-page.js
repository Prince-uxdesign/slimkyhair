/**
 * Customer Account & Order History Controller - Slimky Hair
 * Milestone C20: Order History, Details Modal & Authorization
 * 
 * Mandates:
 * - Authenticated customers access strictly their own orders.
 * - Displays order number, date, status, payment status, total, items summary, and view action.
 * - Mobile-first card list (NO horizontal tables that break mobile layouts).
 * - Empty state with "Your orders will appear here." and "Explore Products".
 * - Detailed modal with complete pricing, variants, and delivery information.
 */

import { customerService } from './auth/customer-service.js';
import { formatNaira, getCartRootPath, resolveCartImagePath } from './cart-store.js';
import { initNavigation } from './navigation.js';
import { initDrawers } from './drawers.js';
import { syncWishlistUI } from './wishlist-store.js';

export class AccountPage {
  constructor(options = {}) {
    this.root = options.rootPrefix !== undefined ? options.rootPrefix : getCartRootPath();
    this.appContainer = document.querySelector('#account-order-history-app');
    this.init();
  }

  init() {
    if (!this.appContainer) return;
    this.render();
  }

  render() {
    const customer = customerService.getCurrentCustomer();
    const sessionToken = customerService.getSessionToken();

    if (!customer || !sessionToken) {
      this.renderUnauthenticatedState();
      return;
    }

    this.renderAuthenticatedDashboard(customer, sessionToken);
  }

  renderUnauthenticatedState() {
    this.appContainer.innerHTML = `
      <div class="account-auth-box">
        <h2 style="font-family: var(--font-serif); font-size: 1.5rem; margin-top: 0; margin-bottom: 8px;">Customer Sign In</h2>
        <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: 20px;">
          Sign in to view your order history and track shipments.
        </p>

        <form id="account-login-form">
          <div style="margin-bottom: 16px;">
            <label for="login-email" style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 6px;">Email Address</label>
            <input type="email" id="login-email" class="checkout-input" placeholder="name@example.com" required style="width: 100%; box-sizing: border-box; height: 44px; padding: 0 12px; border: 1px solid var(--color-border-subtle); border-radius: 4px;">
          </div>
          
          <div style="margin-bottom: 20px;">
            <button type="submit" class="btn-primary" style="width: 100%; height: 48px; justify-content: center; cursor: pointer;">
              Sign In to Account
            </button>
          </div>
        </form>

        <div style="border-top: 1px solid var(--color-border-subtle); padding-top: 16px; text-align: center;">
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-secondary); margin-bottom: 10px;">Quick Sign In Demo</div>
          <button type="button" id="quick-demo-login-btn" class="btn-outline btn-sm" style="width: 100%; cursor: pointer;">
            Sign In as Chioma E. (Demo Customer)
          </button>
        </div>
      </div>
    `;

    document.querySelector('#account-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.querySelector('#login-email')?.value.trim();
      if (!email) return;

      try {
        customerService.loginCustomer(email);
        this.render();
      } catch (err) {
        // Auto-register if not yet existing
        await customerService.registerCustomer({
          email,
          fullName: email.split('@')[0]
        });
        this.render();
      }
    });

    document.querySelector('#quick-demo-login-btn')?.addEventListener('click', () => {
      customerService.loginCustomer('chioma.demo@slimkyhair.com');
      this.render();
    });
  }

  renderAuthenticatedDashboard(customer, sessionToken) {
    let orders = [];
    try {
      orders = customerService.getCustomerOrders(customer.id, sessionToken);
    } catch (err) {
      console.warn('[AccountPage] Order retrieval error:', err);
      orders = [];
    }

    let ordersHtml = '';

    if (orders.length === 0) {
      ordersHtml = `
        <div class="order-history-empty" id="order-history-empty-view">
          <div class="order-history-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
          </div>
          <h3 class="order-history-empty-title">Your orders will appear here.</h3>
          <p class="order-history-empty-desc">You have not placed any orders yet. Discover our botanical hair formulations to get started.</p>
          <a href="${this.root}shop/" class="btn-primary" style="display: inline-flex; min-height: 44px; padding: 0 24px; align-items: center;">
            Explore Products
          </a>
        </div>
      `;
    } else {
      ordersHtml = `
        <div class="order-history-list" id="customer-order-list">
          ${orders.map(order => this.renderOrderCard(order)).join('')}
        </div>
      `;
    }

    this.appContainer.innerHTML = `
      <div class="account-header-strip">
        <div>
          <h1 class="account-title">Order History</h1>
          <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin: 4px 0 0 0;">
            Track and review your botanical formulation orders.
          </p>
        </div>

        <div class="account-user-card">
          <div class="account-user-avatar">
            ${customer.fullName ? customer.fullName.charAt(0).toUpperCase() : 'C'}
          </div>
          <div>
            <div style="font-weight: 600; color: var(--color-text-primary);">${customer.fullName}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-secondary);">${customer.email}</div>
          </div>
          <button type="button" id="account-logout-btn" class="btn-text btn-sm" style="margin-left: 12px; color: var(--color-brown-deep); text-decoration: underline; background: none; border: none; cursor: pointer;">
            Sign Out
          </button>
        </div>
      </div>

      ${ordersHtml}

      <div id="order-modal-mount"></div>
    `;

    document.querySelector('#account-logout-btn')?.addEventListener('click', () => {
      customerService.logoutCustomer();
      this.render();
    });

    // Attach View Order Details click handlers
    this.appContainer.querySelectorAll('.view-order-details-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-order-id');
        this.openOrderDetailsModal(orderId, customer.id, sessionToken);
      });
    });
  }

  renderOrderCard(order) {
    const orderNumber = order.orderNumber || order.id;
    const orderDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    const isPaid = order.orderStatus === 'paid' || order.paymentStatus === 'successful';
    const statusClass = isPaid ? 'paid' : (order.orderStatus === 'shipping_quote_required' ? 'quote' : 'pending');
    const statusLabel = order.orderStatus.replace(/_/g, ' ');

    const itemsSummaryText = order.items.map(it => `${it.productName} (${it.variantName || 'Std'}) × ${it.quantity}`).join(', ');

    return `
      <div class="order-history-card" id="order-card-${order.id}">
        <div class="order-card-header">
          <div>
            <div class="order-card-number">${orderNumber}</div>
            <div class="order-card-date">Placed on ${orderDate}</div>
          </div>
          <div class="order-card-badges">
            <span class="order-status-badge ${statusClass}">${statusLabel}</span>
            <span class="order-status-badge ${order.paymentStatus === 'successful' ? 'paid' : 'pending'}">
              Payment: ${order.paymentStatus}
            </span>
          </div>
        </div>

        <div class="order-card-items-summary">
          <div class="order-card-thumbs">
            ${order.items.slice(0, 3).map(it => {
              const src = resolveCartImagePath(it.productImage, this.root);
              return `<img src="${src}" alt="${it.productName || 'Slimky Hair product'}" class="order-card-thumb" loading="lazy" decoding="async">`;
            }).join('')}
          </div>
          <div class="order-card-items-text">
            ${itemsSummaryText}
          </div>
        </div>

        <div class="order-card-footer">
          <div class="order-card-total-block">
            <span class="order-card-total-label">Total</span>
            <span class="order-card-total-val">${formatNaira(order.pricing?.productPaymentTotal || order.pricing?.subtotal || 0)}</span>
          </div>
          <button type="button" class="btn-outline btn-sm view-order-details-btn" data-order-id="${order.id}" style="min-height: 40px; cursor: pointer;">
            View Order Details
          </button>
        </div>
      </div>
    `;
  }

  openOrderDetailsModal(orderId, customerId, sessionToken) {
    let order;
    try {
      order = customerService.getOrderDetails(orderId, customerId, sessionToken);
    } catch (err) {
      alert(err.message || 'Unable to load order details');
      return;
    }

    const modalMount = document.querySelector('#order-modal-mount');
    if (!modalMount) return;

    const orderNumber = order.orderNumber || order.id;
    const orderDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const isNigeria = order.flow === 'nigeria_checkout';
    const formattedAddress = isNigeria
      ? (order.delivery.address.toLowerCase().includes(order.delivery.city.toLowerCase())
          ? `${order.delivery.address}, ${order.delivery.state}, Nigeria`
          : `${order.delivery.address}, ${order.delivery.city}, ${order.delivery.state}, Nigeria`)
      : `${order.delivery.address}, ${order.delivery.city}, ${order.delivery.state}${order.delivery.postalCode ? ' ' + order.delivery.postalCode : ''}, ${order.delivery.country}`;

    modalMount.innerHTML = `
      <div class="order-modal-backdrop" id="order-modal-backdrop">
        <div class="order-modal-card" id="order-modal-card">
          <div class="order-modal-header">
            <div>
              <h2 style="font-family: var(--font-serif); font-size: 1.25rem; margin: 0;">Order Details</h2>
              <div style="font-size: 0.8125rem; color: var(--color-text-secondary); margin-top: 2px;">
                ${orderNumber} · ${orderDate}
              </div>
            </div>
            <button type="button" class="order-modal-close-btn" id="modal-close-btn" aria-label="Close modal">×</button>
          </div>

          <!-- Order Status Strip -->
          <div style="display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap;">
            <span class="order-status-badge paid">Order Status: ${order.orderStatus.replace(/_/g, ' ')}</span>
            <span class="order-status-badge ${order.paymentStatus === 'successful' ? 'paid' : 'pending'}">Payment: ${order.paymentStatus}</span>
          </div>

          <!-- Items Breakdown -->
          <div style="margin-bottom: 24px;">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-secondary); font-weight: 600; margin-bottom: 10px;">
              Items Purchased (${order.items.length})
            </div>
            ${order.items.map(it => `
              <div style="display: flex; justify-content: space-between; font-size: 0.875rem; padding: 8px 0; border-bottom: 1px solid var(--color-border-subtle);">
                <div>
                  <strong>${it.productName}</strong><br>
                  <span style="font-size: 0.8125rem; color: var(--color-text-secondary);">${it.variantName || 'Standard'} × ${it.quantity}</span>
                </div>
                <div style="text-align: right; font-weight: 500;">
                  ${formatNaira(it.lineSubtotal || it.lineTotal)}
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Financial Breakdown -->
          <div style="background: var(--color-bg-primary); padding: 14px 16px; border-radius: 4px; margin-bottom: 20px; font-size: 0.875rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: var(--color-text-secondary);">Subtotal:</span>
              <span>${formatNaira(order.pricing.subtotal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: var(--color-text-secondary);">Shipping Status:</span>
              <span style="color: var(--color-brown-deep);">${order.pricing.shippingStatus}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 1rem; font-weight: 600; border-top: 1px solid var(--color-border-subtle); padding-top: 8px; margin-top: 6px;">
              <span>Total Paid:</span>
              <span style="font-family: var(--font-serif); font-size: 1.25rem;">${formatNaira(order.pricing.productPaymentTotal)}</span>
            </div>
          </div>

          <!-- Delivery Destination -->
          <div style="font-size: 0.875rem; line-height: 1.5; margin-bottom: 24px;">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-secondary); font-weight: 600; margin-bottom: 6px;">
              Delivery Information
            </div>
            <div><strong>Recipient:</strong> ${order.customer.fullName}</div>
            <div><strong>Phone / WhatsApp:</strong> ${order.customer.phone}</div>
            <div><strong>Address:</strong> ${formattedAddress}</div>
            ${order.delivery.instructions ? `<div><strong>Instructions:</strong> "${order.delivery.instructions}"</div>` : ''}
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 12px;">
            <a href="${this.root}order-confirmation/?order_id=${order.id}&token=${order.securityToken}" class="btn-outline btn-sm" target="_blank" style="text-decoration: none; padding: 8px 16px;">
              Open Full Receipt ↗
            </a>
            <button type="button" class="btn-primary btn-sm" id="modal-dismiss-btn" style="padding: 8px 20px; cursor: pointer;">
              Close
            </button>
          </div>
        </div>
      </div>
    `;

    const closeHandler = () => {
      modalMount.innerHTML = '';
    };

    document.querySelector('#modal-close-btn')?.addEventListener('click', closeHandler);
    document.querySelector('#modal-dismiss-btn')?.addEventListener('click', closeHandler);
    document.querySelector('#order-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'order-modal-backdrop') closeHandler();
    });
  }
}

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('#account-order-history-app')) {
      new AccountPage();
    }
    initNavigation();
    initDrawers();
    syncWishlistUI();
  });
}
