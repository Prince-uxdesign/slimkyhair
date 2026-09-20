/**
 * Customer Account Dashboard Controller - Slimky Hair
 * Milestone C19.5: Customer Account Dashboard
 */

import { customerService, CUSTOMER_STATUSES } from './auth/customer-service.js';
import { getWishlistIds, getWishlistProducts } from './wishlist-store.js';
import { initAccountShell } from './account-shell.js';

export class AccountDashboard {
  constructor(options = {}) {
    if (options.rootPrefix !== undefined) {
      this.rootPrefix = options.rootPrefix;
    } else {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      this.rootPrefix = path.includes('/account/') ? '../' : './';
    }

    this.customer = customerService.getCurrentCustomer();

    // Guard: strictly require authentication
    if (!this.customer) {
      if (typeof window !== 'undefined') {
        const target = window.location.pathname + window.location.search;
        window.location.href = `${this.rootPrefix}account/login/?redirect=${encodeURIComponent(target)}`;
      }
      return;
    }

    this.init();
  }

  init() {
    // Initialize common shell navigation
    initAccountShell({
      activeNav: 'overview',
      rootPrefix: this.rootPrefix,
      authRequired: true
    });

    this.loadData();
    this.render();
    this.bindEvents();
  }

  loadData() {
    // Load real customer orders
    try {
      this.orders = customerService.getCustomerOrders(this.customer.id) || [];
    } catch {
      this.orders = [];
    }

    // Load real customer saved addresses
    try {
      this.addresses = customerService.getAddresses(this.customer.id) || [];
    } catch {
      this.addresses = [];
    }

    // Load real wishlist items
    try {
      this.wishlistIds = getWishlistIds() || [];
      this.wishlistItems = getWishlistProducts() || [];
    } catch {
      this.wishlistIds = [];
      this.wishlistItems = [];
    }
  }

  render() {
    this.renderGreeting();
    this.renderProfileCard();
    this.renderRecentOrderCard();
    this.renderAddressesCard();
    this.renderWishlistCard();
    this.renderSettingsCard();
  }

  renderGreeting() {
    const mount = document.querySelector('#dashboard-greeting-mount');
    if (!mount) return;

    const fullName = this.customer.fullName || 'Valued Client';
    const status = this.customer.status || CUSTOMER_STATUSES.ACTIVE;
    const statusLabel = status.replace(/_/g, ' ');
    const ordersCount = (this.orders && this.orders.length) || 0;
    const addressesCount = (this.addresses && this.addresses.length) || 0;
    const wishlistCount = (this.wishlistIds && this.wishlistIds.length) || 0;

    mount.innerHTML = `
      <div class="dashboard-greeting-hero">
        <div class="dashboard-greeting-top">
          <div class="dashboard-greeting-meta">
            <span class="dashboard-badge-luxury">
              <span class="badge-dot">●</span> Slimky Botanical Client
            </span>
            <span class="account-status-badge status-${status}">
              ${statusLabel.toUpperCase()}
            </span>
            <span class="dashboard-account-id">
              ID: ${this.escapeHtml(this.customer.id)}
            </span>
          </div>
          <h1 class="dashboard-greeting-title">Hello, ${this.escapeHtml(fullName)}</h1>
          <p class="dashboard-greeting-subtitle">
            Welcome to your Slimky Hair customer portal. Review active formulation orders, manage shipping addresses, and adjust your personal details.
          </p>
        </div>

        <div class="dashboard-kpi-strip">
          <a href="${this.rootPrefix}account/orders/" class="dashboard-kpi-item">
            <span class="dashboard-kpi-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
            </span>
            <div class="dashboard-kpi-info">
              <span class="dashboard-kpi-value">${ordersCount}</span>
              <span class="dashboard-kpi-label">${ordersCount === 1 ? 'Active Order' : 'Orders Placed'}</span>
            </div>
          </a>

          <a href="${this.rootPrefix}account/addresses/" class="dashboard-kpi-item">
            <span class="dashboard-kpi-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            </span>
            <div class="dashboard-kpi-info">
              <span class="dashboard-kpi-value">${addressesCount}</span>
              <span class="dashboard-kpi-label">${addressesCount === 1 ? 'Saved Address' : 'Saved Addresses'}</span>
            </div>
          </a>

          <a href="${this.rootPrefix}account/wishlist/" class="dashboard-kpi-item">
            <span class="dashboard-kpi-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </span>
            <div class="dashboard-kpi-info">
              <span class="dashboard-kpi-value">${wishlistCount}</span>
              <span class="dashboard-kpi-label">${wishlistCount === 1 ? 'Saved Formulation' : 'Wishlist Items'}</span>
            </div>
          </a>
        </div>
      </div>
    `;
  }

  renderProfileCard() {
    const mount = document.querySelector('#dashboard-profile-mount');
    if (!mount) return;

    const phoneDisplay = this.customer.phone ? this.escapeHtml(this.customer.phone) : '<em style="color:var(--color-text-muted);">Not provided</em>';

    mount.innerHTML = `
      <div class="dashboard-card">
        <div>
          <div class="dashboard-card-header">
            <div class="dashboard-card-title-group">
              <span class="dashboard-card-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </span>
              <h2 class="dashboard-card-title">Personal Profile</h2>
            </div>
            <button type="button" id="btn-open-edit-profile" class="btn-outline btn-sm" style="min-height: 38px; padding: 0 14px;">
              Edit Profile
            </button>
          </div>

          <div class="dashboard-card-body">
            <ul class="dashboard-profile-list">
              <li class="dashboard-profile-item">
                <span class="dashboard-profile-label">Full Name</span>
                <span class="dashboard-profile-value" id="profile-display-name">${this.escapeHtml(this.customer.fullName || '')}</span>
              </li>
              <li class="dashboard-profile-item">
                <span class="dashboard-profile-label">Email Address</span>
                <span class="dashboard-profile-value">${this.escapeHtml(this.customer.email || '')}</span>
                <span style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 2px;">
                  Verified authentication credential
                </span>
              </li>
              <li class="dashboard-profile-item">
                <span class="dashboard-profile-label">Phone / WhatsApp</span>
                <span class="dashboard-profile-value" id="profile-display-phone">${phoneDisplay}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="dashboard-card-footer">
          <a href="${this.rootPrefix}account/profile/" class="btn-outline btn-sm" style="display: block; text-align: center; text-decoration: none; width: 100%;">
            View Full Profile Page
          </a>
        </div>
      </div>
    `;
  }

  renderRecentOrderCard() {
    const mount = document.querySelector('#dashboard-order-mount');
    if (!mount) return;

    if (this.orders && this.orders.length > 0) {
      // Sort to get newest order
      const sorted = [...this.orders].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const recent = sorted[0];
      const orderNum = recent.orderNumber || recent.id;
      const orderDate = recent.createdAt ? new Date(recent.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent';
      const itemsCount = recent.items ? recent.items.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0;
      const totalFormatted = recent.pricing ? `₦${Number(recent.pricing.totalAmount || recent.pricing.productPaymentTotal || recent.pricing.subtotal || 0).toLocaleString('en-NG')}` : (recent.totalFormatted || '₦0');
      const status = recent.orderStatus || 'processing';

      mount.innerHTML = `
        <div class="dashboard-card">
          <div>
            <div class="dashboard-card-header">
              <div class="dashboard-card-title-group">
                <span class="dashboard-card-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                  </svg>
                </span>
                <h2 class="dashboard-card-title">Recent Order</h2>
              </div>
              <span class="account-status-badge status-active" style="text-transform: capitalize;">
                ${status.replace(/_/g, ' ')}
              </span>
            </div>

            <div class="dashboard-card-body">
              <div class="dashboard-snippet-box">
                <div class="dashboard-snippet-header">
                  <span class="dashboard-snippet-title">Order ${this.escapeHtml(orderNum)}</span>
                  <span style="color: var(--color-text-muted);">${orderDate}</span>
                </div>
                <div style="font-size: 0.8125rem; color: var(--color-text-secondary); margin-bottom: 6px;">
                  ${itemsCount} item${itemsCount !== 1 ? 's' : ''} queued for dispatch
                </div>
                <div class="dashboard-snippet-price">${totalFormatted}</div>
              </div>
              <p style="font-size: 0.8125rem; color: var(--color-text-muted); margin: 0;">
                You have placed <strong>${this.orders.length}</strong> total order${this.orders.length !== 1 ? 's' : ''} with Slimky Hair.
              </p>
            </div>
          </div>

          <div class="dashboard-card-footer">
            <a href="${this.rootPrefix}account/orders/" class="btn-primary btn-sm" style="display: block; text-align: center; text-decoration: none; width: 100%;">
              View Order History
            </a>
          </div>
        </div>
      `;
    } else {
      // Intentional empty state: No orders yet
      mount.innerHTML = `
        <div class="dashboard-card">
          <div>
            <div class="dashboard-card-header">
              <div class="dashboard-card-title-group">
                <span class="dashboard-card-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                  </svg>
                </span>
                <h2 class="dashboard-card-title">Order History</h2>
              </div>
            </div>

            <div class="dashboard-card-body">
              <div class="dashboard-empty-state">
                <div class="dashboard-empty-icon" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                  </svg>
                </div>
                <h3 class="dashboard-empty-title">No orders yet</h3>
                <p class="dashboard-empty-desc">
                  Your orders and formulation shipments will appear here once placed.
                </p>
              </div>
            </div>
          </div>

          <div class="dashboard-card-footer">
            <a href="${this.rootPrefix}shop/" class="btn-outline btn-sm" style="display: block; text-align: center; text-decoration: none; width: 100%;">
              Explore Formulations
            </a>
          </div>
        </div>
      `;
    }
  }

  renderAddressesCard() {
    const mount = document.querySelector('#dashboard-addresses-mount');
    if (!mount) return;

    const defaultAddress = this.addresses.find(a => a.isDefault) || (this.addresses.length > 0 ? this.addresses[0] : null);

    if (defaultAddress) {
      mount.innerHTML = `
        <div class="dashboard-card">
          <div>
            <div class="dashboard-card-header">
              <div class="dashboard-card-title-group">
                <span class="dashboard-card-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </span>
                <h2 class="dashboard-card-title">Delivery Address</h2>
              </div>
              <span class="account-status-badge status-active">Default</span>
            </div>

            <div class="dashboard-card-body">
              <div class="dashboard-snippet-box">
                <div style="font-weight: 600; color: var(--color-text-primary); margin-bottom: 4px;">
                  ${this.escapeHtml(defaultAddress.recipientName || this.customer.fullName || 'Default Recipient')}
                </div>
                <div style="font-size: 0.8125rem; color: var(--color-text-secondary); line-height: 1.4;">
                  ${this.escapeHtml(defaultAddress.streetAddress || '')}<br>
                  ${this.escapeHtml(defaultAddress.city || '')}, ${this.escapeHtml(defaultAddress.state || '')}<br>
                  ${this.escapeHtml(defaultAddress.country || 'Nigeria')}
                </div>
              </div>
              <p style="font-size: 0.8125rem; color: var(--color-text-muted); margin: 0;">
                Saved addresses: <strong>${this.addresses.length}</strong> total destination${this.addresses.length !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>

          <div class="dashboard-card-footer">
            <a href="${this.rootPrefix}account/addresses/" class="btn-outline btn-sm" style="display: block; text-align: center; text-decoration: none; width: 100%;">
              Manage Addresses
            </a>
          </div>
        </div>
      `;
    } else {
      // Intentional empty state: No saved addresses
      mount.innerHTML = `
        <div class="dashboard-card">
          <div>
            <div class="dashboard-card-header">
              <div class="dashboard-card-title-group">
                <span class="dashboard-card-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </span>
                <h2 class="dashboard-card-title">Saved Addresses</h2>
              </div>
            </div>

            <div class="dashboard-card-body">
              <div class="dashboard-empty-state">
                <div class="dashboard-empty-icon" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"></path>
                    <circle cx="12" cy="9" r="2.5"></circle>
                  </svg>
                </div>
                <h3 class="dashboard-empty-title">No saved addresses</h3>
                <p class="dashboard-empty-desc">
                  Save your primary delivery location for faster checkout on future formulation purchases.
                </p>
              </div>
            </div>
          </div>

          <div class="dashboard-card-footer">
            <a href="${this.rootPrefix}account/addresses/" class="btn-outline btn-sm" style="display: block; text-align: center; text-decoration: none; width: 100%;">
              Manage Addresses
            </a>
          </div>
        </div>
      `;
    }
  }

  renderWishlistCard() {
    const mount = document.querySelector('#dashboard-wishlist-mount');
    if (!mount) return;

    const count = (this.wishlistIds && this.wishlistIds.length) || (this.wishlistItems && this.wishlistItems.length) || 0;

    if (count > 0) {
      mount.innerHTML = `
        <div class="dashboard-card">
          <div>
            <div class="dashboard-card-header">
              <div class="dashboard-card-title-group">
                <span class="dashboard-card-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </span>
                <h2 class="dashboard-card-title">Wishlist</h2>
              </div>
              <span class="account-status-badge status-active">${count} Saved</span>
            </div>

            <div class="dashboard-card-body">
              <p style="font-size: 0.9375rem; color: var(--color-text-primary); margin: 0 0 10px 0; font-weight: 500;">
                You have ${count} saved botanical formulation${count !== 1 ? 's' : ''}.
              </p>
              <p style="font-size: 0.8125rem; color: var(--color-text-secondary); margin: 0;">
                Saved items remain stored for future purchases and routine replenishments.
              </p>
            </div>
          </div>

          <div class="dashboard-card-footer">
            <a href="${this.rootPrefix}account/wishlist/" class="btn-outline btn-sm" style="display: block; text-align: center; text-decoration: none; width: 100%;">
              View Wishlist (${count})
            </a>
          </div>
        </div>
      `;
    } else {
      // Intentional empty state: Wishlist empty
      mount.innerHTML = `
        <div class="dashboard-card">
          <div>
            <div class="dashboard-card-header">
              <div class="dashboard-card-title-group">
                <span class="dashboard-card-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </span>
                <h2 class="dashboard-card-title">Wishlist</h2>
              </div>
            </div>

            <div class="dashboard-card-body">
              <div class="dashboard-empty-state">
                <div class="dashboard-empty-icon" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </div>
                <h3 class="dashboard-empty-title">Your wishlist is empty</h3>
                <p class="dashboard-empty-desc">
                  Curate your preferred African botanical hair and scalp treatments.
                </p>
              </div>
            </div>
          </div>

          <div class="dashboard-card-footer">
            <a href="${this.rootPrefix}shop/" class="btn-outline btn-sm" style="display: block; text-align: center; text-decoration: none; width: 100%;">
              Discover Formulations
            </a>
          </div>
        </div>
      `;
    }
  }

  renderSettingsCard() {
    const mount = document.querySelector('#dashboard-settings-mount');
    if (!mount) return;

    mount.innerHTML = `
      <div class="dashboard-card">
        <div>
          <div class="dashboard-card-header">
            <div class="dashboard-card-title-group">
              <span class="dashboard-card-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </span>
              <h2 class="dashboard-card-title">Security & Preferences</h2>
            </div>
          </div>

          <div class="dashboard-card-body">
            <div style="margin-bottom: 14px;">
              <div style="font-weight: 600; color: var(--color-text-primary); font-size: 0.875rem; margin-bottom: 4px;">
                Password Management
              </div>
              <p style="font-size: 0.8125rem; color: var(--color-text-secondary); margin: 0 0 10px 0;">
                Update your account password or receive a secure reset link.
              </p>
              <button type="button" id="btn-request-reset" class="btn-outline btn-sm" style="min-height: 38px;">
                Send Reset Password Email
              </button>
              <div id="reset-request-feedback" style="display: none; font-size: 0.8125rem; color: #1E6B37; margin-top: 6px; font-weight: 500;"></div>
            </div>

            <div>
              <div style="font-weight: 600; color: var(--color-text-primary); font-size: 0.875rem; margin-bottom: 4px;">
                Order Dispatch Channels
              </div>
              <p style="font-size: 0.8125rem; color: var(--color-text-secondary); margin: 0;">
                Notifications are sent to <strong>${this.escapeHtml(this.customer.email)}</strong> and WhatsApp when quotes or tracking numbers are dispatched.
              </p>
            </div>
          </div>
        </div>

        <div class="dashboard-card-footer">
          <div style="display: flex; gap: 10px;">
            <a href="${this.rootPrefix}account/settings/" class="btn-outline btn-sm" style="flex: 1; text-align: center; text-decoration: none;">
              All Settings
            </a>
            <button type="button" class="btn-outline btn-sm account-signout-btn" style="flex: 1; border-color: #FECDCA; color: #B42318;">
              Sign Out
            </button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // 1. Edit Profile Modal Triggers
    const editBtn = document.querySelector('#btn-open-edit-profile');
    const modal = document.querySelector('#dashboard-edit-modal');
    const closeBtn = document.querySelector('#btn-close-edit-modal');
    const cancelBtn = document.querySelector('#btn-cancel-edit-modal');
    const editForm = document.querySelector('#dashboard-edit-form');
    const nameInput = document.querySelector('#edit-profile-name');
    const phoneInput = document.querySelector('#edit-profile-phone');
    const feedback = document.querySelector('#edit-profile-feedback');

    if (editBtn && modal) {
      editBtn.addEventListener('click', () => {
        if (nameInput) nameInput.value = this.customer.fullName || '';
        if (phoneInput) phoneInput.value = this.customer.phone || '';
        if (feedback) feedback.style.display = 'none';
        modal.style.display = 'flex';
        nameInput?.focus();
      });

      const closeModal = () => {
        modal.style.display = 'none';
        editBtn.focus();
      };

      closeBtn?.addEventListener('click', closeModal);
      cancelBtn?.addEventListener('click', closeModal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
          closeModal();
        }
      });

      if (editForm) {
        editForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const newName = nameInput.value.trim();
          const newPhone = phoneInput.value.trim();

          if (!newName) {
            if (feedback) {
              feedback.textContent = 'Please enter your full name.';
              feedback.style.color = '#B42318';
              feedback.style.display = 'block';
            }
            nameInput.focus();
            return;
          }

          try {
            const updated = await customerService.updateProfile(this.customer.id, {
              fullName: newName,
              phone: newPhone
            });

            this.customer = updated;

            // Re-render UI components with new profile data
            this.renderGreeting();
            this.renderProfileCard();

            // Re-bind modal buttons after re-rendering profile card
            this.bindEvents();

            if (feedback) {
              feedback.textContent = '✓ Profile updated successfully.';
              feedback.style.color = '#1E6B37';
              feedback.style.display = 'block';
            }

            setTimeout(() => {
              closeModal();
            }, 700);

          } catch (err) {
            if (feedback) {
              feedback.textContent = err.message || 'Failed to update profile.';
              feedback.style.color = '#B42318';
              feedback.style.display = 'block';
            }
          }
        });
      }
    }

    // 2. Request Password Reset Link in Settings
    const resetBtn = document.querySelector('#btn-request-reset');
    const resetFeedback = document.querySelector('#reset-request-feedback');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        try {
          resetBtn.disabled = true;
          resetBtn.textContent = 'Sending...';
          const res = await customerService.requestPasswordReset(this.customer.email, this.rootPrefix);
          if (resetFeedback) {
            resetFeedback.textContent = '✓ ' + (res.message || 'Reset link sent to your email.');
            resetFeedback.style.display = 'block';
          }
          resetBtn.textContent = 'Reset Link Dispatched';
        } catch {
          if (resetFeedback) {
            resetFeedback.textContent = 'Unable to send reset link right now.';
            resetFeedback.style.color = '#B42318';
            resetFeedback.style.display = 'block';
          }
          resetBtn.disabled = false;
          resetBtn.textContent = 'Send Reset Password Email';
        }
      });
    }

    // 3. Bind Sign Out actions
    document.querySelectorAll('.account-signout-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await customerService.logoutCustomer();
        window.location.href = `${this.rootPrefix}account/login/`;
      });
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }
}

// Auto-bootstrap safely
if (typeof document !== 'undefined') {
  const bootstrap = () => new AccountDashboard();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
