/**
 * Slimky Hair Admin Dashboard Controller
 * Milestones C21 - C26: Orders, Quotes, Tracking & Status Management
 */

import { adminService } from './auth/admin-service.js';
import { OrderStore } from './payment/order-store.js';
import { formatNaira } from './cart-store.js';
import { ORDER_STATUS, PAYMENT_STATUS, validateOrderStatusTransition, CUSTOMS_IMPORT_DUTIES_NOTICE } from './payment/payment-model.js';
import { emailService } from './email/email-service.js';
import { productService } from './catalog/product-service.js';
import { PRODUCT_STATUS } from './catalog/product-model.js';
import { inventoryService, getAvailabilityLabel, setLowStockThreshold } from './inventory/inventory-service.js';
import {
  renderInventoryBody,
  renderAdjustDialog,
  renderHistoryDialog,
  renderThresholdDialog,
  DEFAULT_SORT
} from './admin/inventory-admin.js';
import { buildDashboardSnapshot, DEFAULT_RANGE_ID } from './admin/dashboard-service.js';
import {
  applyOrderQuery,
  renderSortSelect,
  renderCountrySelect,
  renderOrdersPagination,
  renderOrderNotFound,
  getCustomerName,
  getCustomerEmail,
  getShippingCountry,
  getShippingState,
  getOrderTotal,
  getShippingStatusLabel,
  formatOrderDate,
  DEFAULT_ORDER_SORT
} from './admin/orders-admin.js';
import { escapeHtml } from './utils/html-format.js';
import {
  renderDashboardOverview,
  renderDashboardLoading,
  renderDashboardError
} from './admin/dashboard-view.js';

export class AdminPage {
  constructor() {
    this.appContainer = document.querySelector('#admin-app');
    // 'overview' | 'orders' | 'inventory'. The Overview dashboard (Phase A2) is
    // the landing view; a ?view= query param still wins so deep links from the
    // dashboard's own section actions land on the right screen.
    this.currentView = this.readViewFromUrl() || 'overview';

    // Dashboard Overview state (Phase A2)
    this.dashboardRangeId = DEFAULT_RANGE_ID;
    this.dashboardState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
    this.dashboardSnapshot = null;
    this.dashboardError = null;
    this.currentQueue = 'all';
    this.statusFilter = 'all';
    this.paymentFilter = 'all';
    this.searchQuery = '';
    this.activeModalOrderId = null;

    // Order List View State (Phase A6): sort, paging and country filter live
    // here; status/payment/search filtering stays in adminService.getAdminOrders
    // so there is exactly one authorization + filtering path.
    this.orderSort = DEFAULT_ORDER_SORT;
    this.orderPage = 1;
    this.orderCountry = 'all';

    // Order detail route state (Phase A6). Set when the URL addresses a single
    // order: /admin/orders/<id>/ or /admin/orders/?order=<id>.
    this.detailOrderId = this.readOrderIdFromUrl();

    // Inventory View State (Milestone C20.12)
    this.inventorySearchQuery = '';
    this.inventoryAvailabilityFilter = 'all';
    this.inventorySort = { ...DEFAULT_SORT };

    this.init();
  }

  init() {
    if (!this.appContainer) return;
    this.render();
  }

  render() {
    const admin = adminService.getCurrentAdmin();
    if (!admin) {
      this.renderLogin();
    } else if (this.currentView === 'inventory') {
      this.renderInventoryView(admin);
    } else if (this.currentView === 'order-detail') {
      this.renderOrderDetailView(admin);
    } else if (this.currentView === 'overview') {
      this.renderOverviewView(admin);
    } else {
      this.renderDashboard(admin);
    }
  }

  /**
   * Shared sidebar navigation markup for every admin view (Orders, Inventory).
   * @param {number} orderCount
   * @returns {string}
   */
  renderSidebarNav(orderCount) {
    return `
      <aside class="admin-sidebar" role="navigation" aria-label="Admin Navigation">
        <div class="admin-sidebar-brand">
          <h1>SLIMKY HAIR</h1>
          <span>Operations Backoffice</span>
        </div>

        <nav class="admin-nav">
          <a href="${this.adminRoot()}" class="admin-nav-item ${this.currentView === 'overview' ? 'is-active' : ''}" id="nav-overview-link">
            <span>Overview</span>
          </a>
          <a href="${this.adminRoot()}orders/" class="admin-nav-item ${this.currentView === 'orders' || this.currentView === 'order-detail' ? 'is-active' : ''}" id="nav-orders-link">
            <span>Orders</span>
            <span class="admin-nav-badge">${orderCount}</span>
          </a>
          <a href="#" class="admin-nav-item" onclick="return false;" style="opacity: 0.7;">
            <span>Products & Variants</span>
          </a>
          <a href="${this.adminRoot()}inventory/" class="admin-nav-item ${this.currentView === 'inventory' ? 'is-active' : ''}" id="nav-inventory-link">
            <span>Inventory</span>
          </a>
          <a href="#" class="admin-nav-item" onclick="return false;" style="opacity: 0.7;">
            <span>Customers</span>
          </a>
          <a href="#" class="admin-nav-item" onclick="return false;" style="opacity: 0.7;">
            <span>Settings</span>
          </a>
        </nav>

        <div class="admin-sidebar-footer">
          <div>Slimky Hair Ops v2.4</div>
          <div style="margin-top: 4px; color: #554C47;"> African Botanical Science</div>
        </div>
      </aside>
      <!-- Phase A6 §10: the sidebar hides at ≤900px, so small screens get this
           compact nav instead. Plain hrefs (real routes) — no JS required. -->
      <nav class="admin-mobile-nav-inline" aria-label="Admin sections">
        <a href="${this.adminRoot()}" class="${this.currentView === 'overview' ? 'is-active' : ''}">Overview</a>
        <a href="${this.adminRoot()}orders/" class="${this.currentView === 'orders' || this.currentView === 'order-detail' ? 'is-active' : ''}">Orders</a>
        <a href="${this.adminRoot()}inventory/" class="${this.currentView === 'inventory' ? 'is-active' : ''}">Inventory</a>
      </nav>
    `;
  }

  /**
   * Wire the sidebar nav links that are shared across every admin view.
   */
  bindSidebarNavEvents() {
    document.querySelector('#nav-overview-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.currentView = 'overview';
      this.syncUrlToView('overview');
      this.render();
    });
    document.querySelector('#nav-orders-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.currentView = 'orders';
      this.detailOrderId = null;
      this.syncUrlToView('orders');
      this.render();
    });
    document.querySelector('#nav-inventory-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.currentView = 'inventory';
      this.syncUrlToView('inventory');
      this.render();
    });
  }

  renderLogin() {
    this.appContainer.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #F9F7F4; padding: 20px;">
        <div style="background: #FFFFFF; border: 1px solid #E8E2D9; border-radius: 8px; max-width: 440px; width: 100%; padding: 36px 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
          <div style="text-align: center; margin-bottom: 28px;">
            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #8F3B3B; font-weight: 700;">Backoffice Access</span>
            <h1 style="font-family: var(--font-serif, Georgia, serif); font-size: 1.75rem; margin: 6px 0 0 0; color: #231B18;">Slimky Hair Admin</h1>
            <p style="font-size: 0.875rem; color: #6B625B; margin-top: 6px;">Sign in to access order management and fulfillment.</p>
          </div>

          <form id="admin-login-form">
            <div id="admin-login-error" style="display: none; background: #FEE2E2; color: #B91C1C; padding: 10px 14px; border-radius: 4px; font-size: 0.8125rem; margin-bottom: 16px;"></div>

            <div style="margin-bottom: 16px;">
              <label for="admin-email" style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 6px;">Admin Email</label>
              <input type="email" id="admin-email" class="admin-search-input" value="admin@slimkyhair.com" required style="padding-left: 14px;">
            </div>

            <div style="margin-bottom: 24px;">
              <label for="admin-password" style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 6px;">Password</label>
              <input type="password" id="admin-password" class="admin-search-input" value="BotanicalAdmin2026" required style="padding-left: 14px;">
            </div>

            <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; height: 48px; font-size: 0.9375rem;">
              Sign In to Admin Portal
            </button>
          </form>

          <div style="border-top: 1px solid #E8E2D9; margin-top: 24px; padding-top: 16px; text-align: center;">
            <p style="font-size: 0.75rem; color: #8C827A; margin: 0;">Authorized Slimky Operations & Fulfillment Personnel Only.</p>
          </div>
        </div>
      </div>
    `;

    document.querySelector('#admin-login-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.querySelector('#admin-email')?.value.trim();
      const pass = document.querySelector('#admin-password')?.value;
      const res = adminService.loginAdmin(email, pass);
      if (res.success) {
        this.render();
      } else {
        const errDiv = document.querySelector('#admin-login-error');
        if (errDiv) {
          errDiv.textContent = res.error || 'Authentication failed.';
          errDiv.style.display = 'block';
        }
      }
    });
  }

  renderDashboard(admin) {
    const allOrders = OrderStore.getAllOrders();

    // Compute queue counts
    const queueCounts = {
      all: allOrders.length,
      shipping_quote_required: allOrders.filter(o => o.orderStatus === 'shipping_quote_required').length,
      shipping_quote_sent: allOrders.filter(o => o.orderStatus === 'shipping_quote_sent').length,
      shipping_payment_pending: allOrders.filter(o => o.orderStatus === 'shipping_payment_pending').length,
      shipping_payment_confirmed: allOrders.filter(o => o.orderStatus === 'shipping_payment_confirmed').length,
      ready_for_dispatch: allOrders.filter(o => o.orderStatus === 'ready_for_dispatch').length,
      shipped: allOrders.filter(o => o.orderStatus === 'shipped').length
    };

    // Filter orders
    let filteredOrders = adminService.getAdminOrders(admin.token, {
      queue: this.currentQueue !== 'all' ? this.currentQueue : null,
      orderStatus: this.statusFilter,
      paymentStatus: this.paymentFilter,
      search: this.searchQuery
    });

    // Phase A6: country filter, sort and pagination apply on top of the
    // authorized, already status/search-filtered set.
    const orderQuery = applyOrderQuery(filteredOrders, {
      country: this.orderCountry,
      sort: this.orderSort,
      page: this.orderPage
    });
    const pagedOrders = orderQuery.rows;

    this.appContainer.innerHTML = `
      <div class="admin-shell">
        <!-- Sidebar Navigation -->
        ${this.renderSidebarNav(allOrders.length)}

        <!-- Main Workspace -->
        <div class="admin-main-wrapper">
          <!-- Header Bar -->
          <header class="admin-header" role="banner">
            <div class="admin-header-title">
              <h2>Order Fulfillment & Shipping Quotes</h2>
            </div>

            <div class="admin-user-menu">
              <div class="admin-user-pill">
                <span class="admin-user-dot"></span>
                <span>${admin.fullName || admin.email}</span>
              </div>
              <button type="button" id="admin-logout-btn" class="btn-admin btn-admin-outline btn-admin-sm">
                Sign Out
              </button>
            </div>
          </header>

          <!-- Main Content -->
          <main class="admin-content" role="main">
            
            <!-- Operational Queue Filters -->
            <div class="admin-queue-bar" role="tablist" aria-label="Order Fulfillment Queues">
              <button type="button" class="admin-queue-tab ${this.currentQueue === 'all' ? 'is-active' : ''}" data-queue="all" role="tab">
                <span>All Orders</span>
                <span class="admin-queue-count">${queueCounts.all}</span>
              </button>
              <button type="button" class="admin-queue-tab ${this.currentQueue === 'shipping_quote_required' ? 'is-active' : ''}" data-queue="shipping_quote_required" role="tab">
                <span>Needs Shipping Quote</span>
                <span class="admin-queue-count">${queueCounts.shipping_quote_required}</span>
              </button>
              <button type="button" class="admin-queue-tab ${this.currentQueue === 'shipping_quote_sent' ? 'is-active' : ''}" data-queue="shipping_quote_sent" role="tab">
                <span>Awaiting Customer</span>
                <span class="admin-queue-count">${queueCounts.shipping_quote_sent}</span>
              </button>
              <button type="button" class="admin-queue-tab ${this.currentQueue === 'shipping_payment_pending' ? 'is-active' : ''}" data-queue="shipping_payment_pending" role="tab">
                <span>Shipping Payment Pending</span>
                <span class="admin-queue-count">${queueCounts.shipping_payment_pending}</span>
              </button>
              <button type="button" class="admin-queue-tab ${this.currentQueue === 'shipping_payment_confirmed' ? 'is-active' : ''}" data-queue="shipping_payment_confirmed" role="tab">
                <span>Shipping Paid</span>
                <span class="admin-queue-count">${queueCounts.shipping_payment_confirmed}</span>
              </button>
              <button type="button" class="admin-queue-tab ${this.currentQueue === 'ready_for_dispatch' ? 'is-active' : ''}" data-queue="ready_for_dispatch" role="tab">
                <span>Ready for Dispatch</span>
                <span class="admin-queue-count">${queueCounts.ready_for_dispatch}</span>
              </button>
              <button type="button" class="admin-queue-tab ${this.currentQueue === 'shipped' ? 'is-active' : ''}" data-queue="shipped" role="tab">
                <span>Shipped / In Transit</span>
                <span class="admin-queue-count">${queueCounts.shipped}</span>
              </button>
            </div>

            <!-- Search & Filters Toolbar -->
            <div class="admin-toolbar">
              <div class="admin-search-box">
                <span class="admin-search-icon">🔍</span>
                <input type="text" id="admin-search-input" class="admin-search-input" placeholder="Search by Order #, Customer Name, or Email..." value="${this.searchQuery}">
              </div>

              <div class="admin-filter-group">
                <select id="admin-filter-order-status" class="admin-select" aria-label="Filter by Order Status">
                  <option value="all" ${this.statusFilter === 'all' ? 'selected' : ''}>All Order Statuses</option>
                  <option value="pending_payment" ${this.statusFilter === 'pending_payment' ? 'selected' : ''}>Pending Payment</option>
                  <option value="paid" ${this.statusFilter === 'paid' ? 'selected' : ''}>Paid</option>
                  <option value="shipping_quote_required" ${this.statusFilter === 'shipping_quote_required' ? 'selected' : ''}>Quote Required</option>
                  <option value="shipping_quote_sent" ${this.statusFilter === 'shipping_quote_sent' ? 'selected' : ''}>Quote Sent</option>
                  <option value="shipping_payment_pending" ${this.statusFilter === 'shipping_payment_pending' ? 'selected' : ''}>Shipping Payment Pending</option>
                  <option value="shipping_payment_confirmed" ${this.statusFilter === 'shipping_payment_confirmed' ? 'selected' : ''}>Shipping Paid</option>
                  <option value="ready_for_dispatch" ${this.statusFilter === 'ready_for_dispatch' ? 'selected' : ''}>Ready for Dispatch</option>
                  <option value="shipped" ${this.statusFilter === 'shipped' ? 'selected' : ''}>Shipped</option>
                  <option value="delivered" ${this.statusFilter === 'delivered' ? 'selected' : ''}>Delivered</option>
                  <option value="cancelled" ${this.statusFilter === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>

                <select id="admin-filter-payment-status" class="admin-select" aria-label="Filter by Payment Status">
                  <option value="all" ${this.paymentFilter === 'all' ? 'selected' : ''}>All Payment Statuses</option>
                  <option value="successful" ${this.paymentFilter === 'successful' ? 'selected' : ''}>Payment: Successful</option>
                  <option value="pending" ${this.paymentFilter === 'pending' ? 'selected' : ''}>Payment: Pending</option>
                  <option value="failed" ${this.paymentFilter === 'failed' ? 'selected' : ''}>Payment: Failed</option>
                  <option value="declined" ${this.paymentFilter === 'declined' ? 'selected' : ''}>Payment: Declined</option>
                </select>

                ${renderCountrySelect(orderQuery.countries, this.orderCountry)}

                ${renderSortSelect(this.orderSort)}

                <button type="button" id="admin-reset-filters-btn" class="btn-admin btn-admin-outline">
                  Reset
                </button>
              </div>
            </div>

            <!-- Orders Table (Desktop View) & Cards (Mobile/Tablet View) -->
            <div class="admin-card">
              ${filteredOrders.length === 0 ? `
                <div style="text-align: center; padding: 48px 20px; color: var(--admin-text-muted);">
                  <div style="font-size: 2rem; margin-bottom: 8px;">📦</div>
                  <h3 style="margin: 0; color: var(--admin-text-main);">No matching orders found</h3>
                  <p style="font-size: 0.875rem; margin-top: 4px;">Adjust your search or queue filter to view orders.</p>
                </div>
              ` : `
                <!-- Desktop Table -->
                <div class="admin-table-wrap">
                  <table class="admin-table">
                    <thead>
                      <tr>
                        <th>Order Number</th>
                        <th>Customer</th>
                        <th>Date</th>
                        <th>Country</th>
                        <th>State / Region</th>
                        <th>Payment Status</th>
                        <th>Order Status</th>
                        <th>Total</th>
                        <th>Shipping Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${pagedOrders.map(order => this.renderTableRow(order)).join('')}
                    </tbody>
                  </table>
                </div>

                <!-- Responsive Tablet / Mobile Cards -->
                <div class="admin-cards-list">
                  ${pagedOrders.map(order => this.renderCardRow(order)).join('')}
                </div>

                ${renderOrdersPagination(orderQuery)}
              `}
            </div>

          </main>
        </div>
      </div>

      <!-- Order Detail Modal Drawer -->
      <div id="admin-detail-modal" class="admin-modal-backdrop" aria-hidden="true">
        <div class="admin-modal-drawer" role="dialog" aria-labelledby="modal-order-number">
          <!-- Populated dynamically when inspecting -->
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * Full-page order detail — the /admin/orders/<id> route (Phase A6).
   *
   * Deliberately reuses renderModalContent() and bindModalEvents(): the drawer
   * and this page are the SAME detail surface, so the fulfilment controls,
   * shipping-quote forms and status machine exist in exactly one place. Only
   * the chrome around them differs.
   *
   * @param {Object} admin Authenticated admin session
   */
  renderOrderDetailView(admin) {
    const orderId = this.detailOrderId;
    const order = orderId ? OrderStore.getOrder(orderId) : null;
    const listHref = `${this.adminRoot()}orders/`;

    this.appContainer.innerHTML = `
      <div class="admin-shell">
        ${this.renderSidebarNav(OrderStore.getAllOrders().length)}

        <div class="admin-main-wrapper">
          <header class="admin-header" role="banner">
            <div class="admin-header-title">
              <h2>${order ? `Order ${escapeHtml(order.orderNumber || order.id)}` : 'Order'}</h2>
            </div>
            <div class="admin-user-menu">
              <a href="${listHref}" class="btn-admin btn-admin-outline btn-admin-sm">&larr; All orders</a>
              <div class="admin-user-pill">
                <span class="admin-user-dot"></span>
                <span>${escapeHtml(admin.fullName || admin.email)}</span>
              </div>
              <button type="button" id="admin-logout-btn" class="btn-admin btn-admin-outline btn-admin-sm">
                Sign Out
              </button>
            </div>
          </header>

          <main class="admin-content" role="main">
            ${order
              ? `<div class="admin-card admin-order-detail-page">${this.renderModalContent(order)}</div>`
              : renderOrderNotFound(orderId || '', listHref)}
          </main>
        </div>
      </div>

      <!-- Kept so shared modal helpers that look for the drawer stay harmless here -->
      <div id="admin-detail-modal" class="admin-modal-backdrop" aria-hidden="true">
        <div class="admin-modal-drawer"></div>
      </div>
    `;

    this.bindSidebarNavEvents();

    document.querySelector('#admin-logout-btn')?.addEventListener('click', () => {
      adminService.logoutAdmin();
      window.location.href = this.adminRoot();
    });

    if (order) {
      this.activeModalOrderId = order.id;
      this.bindModalEvents(order);
      // On this route the detail header's close control means "back to list",
      // not "close a drawer that is not open".
      const closeBtn = document.querySelector('#admin-modal-close-btn');
      if (closeBtn) {
        closeBtn.setAttribute('aria-label', 'Back to all orders');
        closeBtn.addEventListener('click', () => { window.location.href = listHref; });
      }
    }
  }

  renderTableRow(order) {
    const formattedDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    // Phase A6: every customer-supplied value below is escaped. These fields
    // come straight from checkout input, so an unescaped name or address is a
    // stored-XSS vector against the backoffice operator.
    const country = getShippingCountry(order);
    const region = getShippingState(order);
    const total = getOrderTotal(order);
    const shippingStatus = getShippingStatusLabel(order);

    return `
      <tr data-order-id="${escapeHtml(order.id)}">
        <td>
          <a href="${this.adminRoot()}orders/?order=${encodeURIComponent(order.id)}" class="admin-order-link">
            ${escapeHtml(order.orderNumber || order.id)}
          </a>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(getCustomerName(order))}</div>
          <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${escapeHtml(getCustomerEmail(order))}</div>
        </td>
        <td>${formattedDate}</td>
        <td>
          <span class="admin-badge badge-country">${escapeHtml(country)}</span>
        </td>
        <td style="font-size: 0.8125rem;">${escapeHtml(region || '—')}</td>
        <td>
          <span class="admin-badge badge-${order.paymentStatus || 'pending'}">
            ${order.paymentStatus || 'pending'}
          </span>
        </td>
        <td>
          <span class="admin-badge badge-${order.orderStatus || 'pending_payment'}">
            ${(order.orderStatus || 'pending_payment').replace(/_/g, ' ')}
          </span>
        </td>
        <td style="font-weight: 600;">${formatNaira(total)}</td>
        <td style="font-size: 0.8125rem; color: var(--admin-brand-brown);">${escapeHtml(shippingStatus)}</td>
        <td>
          <button type="button" class="btn-admin btn-admin-outline btn-admin-sm inspect-order-btn" data-order-id="${order.id}">
            Inspect
          </button>
        </td>
      </tr>
    `;
  }

  renderCardRow(order) {
    const formattedDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const country = getShippingCountry(order);
    const region = getShippingState(order);
    const total = order.pricing?.productPaymentTotal || order.pricing?.subtotal || 0;
    const shippingStatus = getShippingStatusLabel(order);

    return `
      <div class="admin-order-card" data-order-id="${escapeHtml(order.id)}">
        <div class="admin-order-card-header">
          <div>
            <span style="font-size: 0.6875rem; color: var(--admin-text-muted); text-transform: uppercase;">Order Number</span>
            <div style="font-weight: 700; font-size: 1rem; color: var(--admin-brand-brown);">
              ${escapeHtml(order.orderNumber || order.id)}
            </div>
          </div>
          <span class="admin-badge badge-country">${escapeHtml(country)}</span>
        </div>

        <div class="admin-order-card-grid">
          <div>
            <div class="admin-order-card-label">Customer</div>
            <div style="font-weight: 600;">${escapeHtml(getCustomerName(order))}</div>
            <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${escapeHtml(getCustomerEmail(order))}</div>
          </div>
          <div>
            <div class="admin-order-card-label">Date</div>
            <div>${formattedDate}</div>
          </div>
          <div>
            <div class="admin-order-card-label">State / Region</div>
            <div>${escapeHtml(region || '—')}</div>
          </div>
          <div>
            <div class="admin-order-card-label">Payment Status</div>
            <span class="admin-badge badge-${order.paymentStatus || 'pending'}">
              ${order.paymentStatus || 'pending'}
            </span>
          </div>
          <div>
            <div class="admin-order-card-label">Order Status</div>
            <span class="admin-badge badge-${order.orderStatus || 'pending_payment'}">
              ${(order.orderStatus || 'pending_payment').replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div class="admin-order-card-footer">
          <div>
            <div class="admin-order-card-label">Total</div>
            <div style="font-weight: 700; font-size: 1.0625rem;">${formatNaira(total)}</div>
            <div style="font-size: 0.75rem; color: var(--admin-brand-brown);">${escapeHtml(shippingStatus)}</div>
          </div>
          <button type="button" class="btn-admin btn-admin-primary btn-admin-sm inspect-order-btn" data-order-id="${escapeHtml(order.id)}">
            Inspect Order &rarr;
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Build the flattened list of inventory rows (one per SKU/variant) with
   * live stock resolved through inventoryService — the same authoritative
   * source the storefront, cart, and checkout read from (Milestone C20.12).
   * @returns {Array<Object>}
   */
  getInventoryRows() {
    const rows = [];
    // Phase A3: stock is managed for every product that can still be sold or
    // is being prepared for sale — drafts and products awaiting publication
    // included. Archived products are excluded: they are deactivated, and
    // their SKUs are no longer purchasable.
    const managedProducts = productService.getAllProducts()
      .filter(product => product.status !== PRODUCT_STATUS.ARCHIVED);

    managedProducts.forEach(product => {
      const variants = Array.isArray(product.variants) && product.variants.length > 0
        ? product.variants
        : [{ sku: product.sku, size: 'Standard', stock: product.stock, priceFormatted: product.priceFormatted }];

      variants.forEach(variant => {
        if (!variant.sku) return;
        const stock = inventoryService.getEffectiveStock(variant.sku, variant.stock);
        const availability = getAvailabilityLabel(stock);
        // Read the ledger record for its updatedAt stamp. A SKU that has never
        // moved since seeding simply has no stamp, and renders as "Never".
        const record = inventoryService.getSkuStock(variant.sku);
        rows.push({
          productId: product.id,
          productName: product.name,
          category: product.category,
          variantName: variant.size || variant.name || 'Standard',
          sku: variant.sku,
          priceFormatted: variant.priceFormatted || '',
          stock,
          availability,
          updatedAt: record?.updatedAt || null
        });
      });
    });
    return rows;
  }

  /**
   * Read the requested view from the URL query string.
   *
   * The dashboard's section actions ("View all orders", "Manage inventory") and
   * its recent-order rows are real links carrying ?view=, so they survive a
   * reload, middle-click, and bookmarking rather than being JS-only handlers.
   *
   * @returns {string|null} 'overview' | 'orders' | 'inventory' | null
   */
  /**
   * Absolute path of the admin root, from wherever the current page sits.
   *
   * `/admin/` and `/admin/inventory/` both load this controller, so nav links
   * are built relative to the root rather than to the current directory.
   *
   * @returns {string} e.g. "/admin/"
   */
  adminRoot() {
    if (typeof window === 'undefined') return '/admin/';
    const path = window.location.pathname;
    const idx = path.indexOf('/admin/');
    return idx >= 0 ? path.slice(0, idx + '/admin/'.length) : '/admin/';
  }

  /**
   * Keep the address bar honest when a view is switched in place.
   *
   * Without this, switching from /admin/inventory/ to Orders would leave the
   * URL saying "inventory", and a reload would contradict the screen.
   *
   * @param {string} view
   */
  syncUrlToView(view) {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const root = this.adminRoot();
    const target = view === 'inventory' ? `${root}inventory/`
      : view === 'orders' ? `${root}orders/`
      : root;
    try {
      window.history.replaceState({}, '', target);
    } catch {
      /* history unavailable — the view still switches correctly */
    }
  }

  /**
   * Resolve the order id addressed by the URL, if any.
   *
   * Two forms are accepted, matching how this site already routes dynamic
   * entities (see /product/<slug>/ and its ?slug= fallback):
   *   /admin/orders/<id>/        canonical path form
   *   /admin/orders/?order=<id>  query form — always works on static hosting,
   *                              where an unbounded set of runtime order ids
   *                              cannot be pre-generated as directories.
   *
   * @returns {string|null}
   */
  readOrderIdFromUrl() {
    if (typeof window === 'undefined') return null;

    try {
      const param = new URLSearchParams(window.location.search).get('order');
      if (param) return param.trim();
    } catch {
      /* fall through to the path form */
    }

    try {
      const segments = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      const idx = segments.lastIndexOf('orders');
      // A segment after "orders" that is not a file is an order id.
      if (idx !== -1 && segments[idx + 1] && !segments[idx + 1].includes('.')) {
        return decodeURIComponent(segments[idx + 1]);
      }
    } catch {
      return null;
    }
    return null;
  }

  readViewFromUrl() {
    if (typeof window === 'undefined') return null;
    const allowed = ['overview', 'orders', 'inventory'];

    // An addressed order is its own view, so a reload of /admin/orders/<id>/
    // lands back on that order rather than the list.
    if (this.readOrderIdFromUrl()) return 'order-detail';

    // Path wins: /admin/inventory/ is a real directory with its own
    // index.html, matching this site's routing convention. The ?view= form is
    // kept so in-app links and existing deep links keep working.
    try {
      const path = window.location.pathname.replace(/\/+$/, '');
      const segment = path.split('/').pop();
      if (allowed.includes(segment)) return segment;
    } catch {
      /* fall through to the query string */
    }

    try {
      const view = new URLSearchParams(window.location.search).get('view');
      return allowed.includes(view) ? view : null;
    } catch {
      return null;
    }
  }

  /**
   * Render the Dashboard Overview (Phase A2).
   *
   * Loads in two paints: the shell plus an honest loading state first, then the
   * real snapshot. Aggregation is synchronous against the local store, so the
   * loading paint is brief — but it is a genuine state, and it is the same
   * state a network-backed read will occupy once Supabase is wired in.
   *
   * @param {Object} admin Authenticated admin session
   */
  renderOverviewView(admin) {
    this.appContainer.innerHTML = `
      <div class="admin-shell">
        ${this.renderSidebarNav(OrderStore.getAllOrders().length)}

        <div class="admin-main-wrapper">
          <header class="admin-header" role="banner">
            <div class="admin-header-title">
              <h2>Dashboard Overview</h2>
            </div>
            <div class="admin-user-menu">
              <div class="admin-user-pill">
                <span class="admin-user-dot"></span>
                <span>${admin.fullName || admin.email}</span>
              </div>
              <button type="button" id="admin-logout-btn" class="btn-admin btn-admin-outline btn-admin-sm">
                Sign Out
              </button>
            </div>
          </header>

          <main class="admin-content" role="main" id="admin-overview-root">
            ${renderDashboardLoading()}
          </main>
        </div>
      </div>
    `;

    this.bindSidebarNavEvents();
    document.querySelector('#admin-logout-btn')?.addEventListener('click', () => {
      adminService.logoutAdmin();
      this.render();
    });

    this.loadDashboardData(admin);
  }

  /**
   * Fetch the dashboard snapshot and paint the resulting state into the
   * overview root, without re-rendering the surrounding shell.
   *
   * @param {Object} admin Authenticated admin session
   */
  loadDashboardData(admin) {
    const root = document.querySelector('#admin-overview-root');
    if (!root) return;

    this.dashboardState = 'loading';
    root.innerHTML = renderDashboardLoading();

    // Deferred a frame so the loading state actually paints before the
    // synchronous aggregation blocks, and so a thrown error lands in the
    // error state rather than in the middle of a render.
    const run = () => {
      try {
        const snapshot = buildDashboardSnapshot(admin.token, {
          rangeId: this.dashboardRangeId
        });
        this.dashboardSnapshot = snapshot;
        this.dashboardError = null;
        this.dashboardState = 'ready';
        root.innerHTML = renderDashboardOverview(snapshot);
        this.bindOverviewEvents(admin);
      } catch (err) {
        console.error('[AdminPage] Dashboard load failed:', err);
        this.dashboardSnapshot = null;
        this.dashboardError = err;
        this.dashboardState = 'error';
        root.innerHTML = renderDashboardError(err);
        document.querySelector('#admin-dash-retry')?.addEventListener('click', () => {
          this.loadDashboardData(admin);
        });
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      run();
    }
  }

  /**
   * Wire the Overview's own controls: date range presets and manual refresh.
   * @param {Object} admin
   */
  bindOverviewEvents(admin) {
    document.querySelectorAll('.admin-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rangeId = btn.dataset.range;
        if (!rangeId || rangeId === this.dashboardRangeId) return;
        this.dashboardRangeId = rangeId;
        this.loadDashboardData(admin);
      });
    });

    document.querySelector('#admin-dash-refresh')?.addEventListener('click', () => {
      this.loadDashboardData(admin);
    });
  }

  renderInventoryView(admin) {
    const allRows = this.getInventoryRows();

    this.appContainer.innerHTML = `
      <div class="admin-shell">
        ${this.renderSidebarNav(OrderStore.getAllOrders().length)}

        <div class="admin-main-wrapper">
          <header class="admin-header" role="banner">
            <div class="admin-header-title">
              <h2>Inventory Management</h2>
            </div>
            <div class="admin-user-menu">
              <div class="admin-user-pill">
                <span class="admin-user-dot"></span>
                <span>${admin.fullName || admin.email}</span>
              </div>
              <button type="button" id="admin-logout-btn" class="btn-admin btn-admin-outline btn-admin-sm">
                Sign Out
              </button>
            </div>
          </header>

          <main class="admin-content" role="main">
            ${renderInventoryBody(allRows, {
              search: this.inventorySearchQuery,
              availability: this.inventoryAvailabilityFilter,
              sort: this.inventorySort
            })}
          </main>
        </div>
      </div>

      <div class="admin-modal-backdrop" id="admin-inventory-dialog" aria-hidden="true" role="dialog" aria-modal="true">
        <div class="admin-modal-drawer admin-inv-dialog"></div>
      </div>
    `;

    this.bindInventoryEvents();
  }

  /**
   * Open one of the inventory dialogs (adjust / history / threshold) in the
   * shared modal, and wire whatever controls that dialog carries.
   *
   * @param {string} kind 'adjust' | 'history' | 'threshold'
   * @param {string|null} sku
   */
  openInventoryDialog(kind, sku = null) {
    const backdrop = document.querySelector('#admin-inventory-dialog');
    const drawer = backdrop?.querySelector('.admin-modal-drawer');
    if (!backdrop || !drawer) return;

    let row = null;
    if (sku) {
      row = this.getInventoryRows().find(r => r.sku === sku);
      if (!row) return;
    }

    if (kind === 'adjust') drawer.innerHTML = renderAdjustDialog(row);
    else if (kind === 'history') drawer.innerHTML = renderHistoryDialog(row);
    else drawer.innerHTML = renderThresholdDialog();

    backdrop.classList.add('is-open');
    backdrop.setAttribute('aria-hidden', 'false');

    const close = () => this.closeInventoryDialog();
    drawer.querySelector('#inv-dialog-close')?.addEventListener('click', close);
    drawer.querySelector('#inv-adjust-cancel')?.addEventListener('click', close);
    drawer.querySelector('#inv-threshold-cancel')?.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    if (kind === 'adjust') this.bindAdjustDialog(row);
    if (kind === 'threshold') this.bindThresholdDialog();
  }

  closeInventoryDialog() {
    const backdrop = document.querySelector('#admin-inventory-dialog');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
  }

  /**
   * Wire the adjustment form: steppers, live delta readout, and submit.
   * The write itself is delegated to inventoryService.adjustStock(), which
   * owns authorization, the negative-quantity guard and the audit entry.
   *
   * @param {Object} row
   */
  bindAdjustDialog(row) {
    const qtyInput = document.querySelector('#inv-new-qty');
    const deltaEl = document.querySelector('#inv-delta');
    const errorEl = document.querySelector('#inv-adjust-error');

    const clampToZero = () => {
      const n = parseInt(qtyInput.value, 10);
      if (!Number.isFinite(n) || n < 0) qtyInput.value = '0';
    };

    const renderDelta = () => {
      const next = parseInt(qtyInput.value, 10);
      if (!Number.isFinite(next)) { deltaEl.textContent = 'Enter a whole number'; return; }
      const delta = next - row.stock;
      deltaEl.textContent = delta === 0
        ? 'No change'
        : `${delta > 0 ? 'Adding' : 'Removing'} ${Math.abs(delta)} unit${Math.abs(delta) === 1 ? '' : 's'} · ${row.stock} → ${next}`;
      deltaEl.className = `admin-inv-delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`;
    };

    document.querySelector('#inv-qty-minus')?.addEventListener('click', () => {
      qtyInput.value = Math.max(0, (parseInt(qtyInput.value, 10) || 0) - 1);
      renderDelta();
    });
    document.querySelector('#inv-qty-plus')?.addEventListener('click', () => {
      qtyInput.value = (parseInt(qtyInput.value, 10) || 0) + 1;
      renderDelta();
    });
    qtyInput?.addEventListener('input', () => { clampToZero(); renderDelta(); });

    document.querySelector('#inv-adjust-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const admin = adminService.getCurrentAdmin();
      const result = inventoryService.adjustStock(row.sku, parseInt(qtyInput.value, 10), {
        token: admin?.token || null,
        reason: document.querySelector('#inv-reason')?.value || null,
        note: document.querySelector('#inv-note')?.value || ''
      });

      if (!result.success) {
        errorEl.textContent = result.error;
        errorEl.hidden = false;
        return;
      }

      this.closeInventoryDialog();
      this.renderInventoryView(adminService.getCurrentAdmin());
    });
  }

  /** Wire the low-stock threshold form. */
  bindThresholdDialog() {
    const errorEl = document.querySelector('#inv-threshold-error');

    document.querySelector('#inv-threshold-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const admin = adminService.getCurrentAdmin();
      const value = parseInt(document.querySelector('#inv-threshold-input')?.value, 10);
      const result = setLowStockThreshold(value, admin?.token || null);

      if (!result.success) {
        errorEl.textContent = result.error;
        errorEl.hidden = false;
        return;
      }

      this.closeInventoryDialog();
      this.renderInventoryView(adminService.getCurrentAdmin());
    });
  }

  bindInventoryEvents() {
    this.bindSidebarNavEvents();

    document.querySelector('#admin-logout-btn')?.addEventListener('click', () => {
      adminService.logoutAdmin();
      this.render();
    });

    // Availability filter tabs
    document.querySelectorAll('.admin-queue-tab[data-availability]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.inventoryAvailabilityFilter = e.currentTarget.dataset.availability;
        this.renderInventoryView(adminService.getCurrentAdmin());
      });
    });

    // Search — re-render, then restore focus and caret so typing is unbroken.
    const searchInput = document.querySelector('#admin-inventory-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.inventorySearchQuery = e.target.value;
      this.renderInventoryView(adminService.getCurrentAdmin());
      const refocused = document.querySelector('#admin-inventory-search-input');
      if (refocused) {
        refocused.focus();
        refocused.setSelectionRange(refocused.value.length, refocused.value.length);
      }
    });

    // Sort column
    document.querySelector('#admin-inventory-sort')?.addEventListener('change', (e) => {
      this.inventorySort = { ...this.inventorySort, key: e.target.value };
      this.renderInventoryView(adminService.getCurrentAdmin());
    });

    // Sort direction
    document.querySelector('#admin-inventory-sort-dir')?.addEventListener('click', () => {
      this.inventorySort = {
        ...this.inventorySort,
        dir: this.inventorySort.dir === 'asc' ? 'desc' : 'asc'
      };
      this.renderInventoryView(adminService.getCurrentAdmin());
    });

    // Configurable low-stock threshold
    document.querySelector('#admin-inventory-threshold-btn')?.addEventListener('click', () => {
      this.openInventoryDialog('threshold');
    });

    // Per-SKU actions
    document.querySelectorAll('.inv-adjust-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openInventoryDialog('adjust', btn.dataset.sku));
    });
    document.querySelectorAll('.inv-history-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openInventoryDialog('history', btn.dataset.sku));
    });
  }

  bindEvents() {
    this.bindSidebarNavEvents();

    // Logout
    document.querySelector('#admin-logout-btn')?.addEventListener('click', () => {
      adminService.logoutAdmin();
      this.render();
    });

    // Queue bar
    document.querySelectorAll('.admin-queue-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentQueue = e.currentTarget.dataset.queue;
        this.orderPage = 1;
        this.render();
      });
    });

    // Search input
    const searchInput = document.querySelector('#admin-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.orderPage = 1;
      this.renderDashboard(adminService.getCurrentAdmin());
    });

    // Filter selects
    document.querySelector('#admin-filter-order-status')?.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.orderPage = 1;
      this.render();
    });

    document.querySelector('#admin-filter-payment-status')?.addEventListener('change', (e) => {
      this.paymentFilter = e.target.value;
      this.orderPage = 1;
      this.render();
    });

    // Reset filters
    document.querySelector('#admin-reset-filters-btn')?.addEventListener('click', () => {
      this.currentQueue = 'all';
      this.statusFilter = 'all';
      this.paymentFilter = 'all';
      this.searchQuery = '';
      this.orderCountry = 'all';
      this.orderSort = DEFAULT_ORDER_SORT;
      this.orderPage = 1;
      this.render();
    });

    // Shipping country filter (Phase A6)
    document.querySelector('#admin-filter-country')?.addEventListener('change', (e) => {
      this.orderCountry = e.target.value;
      this.orderPage = 1;
      this.render();
    });

    // Sort (Phase A6)
    document.querySelector('#admin-order-sort')?.addEventListener('change', (e) => {
      this.orderSort = e.target.value;
      this.orderPage = 1;
      this.render();
    });

    // Pagination (Phase A6)
    document.querySelectorAll('.admin-order-page-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const page = Number(e.currentTarget.dataset.page);
        if (!Number.isFinite(page) || page < 1) return;
        this.orderPage = page;
        this.render();
        document.querySelector('.admin-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Inspect buttons
    document.querySelectorAll('.inspect-order-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const orderId = e.currentTarget.dataset.orderId;
        this.openOrderModal(orderId);
      });
    });

    this.consumeDeepLinkedOrder();
  }

  /**
   * Open the order named by ?order= on arrival, then drop the param.
   *
   * This is what makes a Dashboard Overview recent-order row a working
   * destination before the dedicated /admin/orders/:id route exists: the row is
   * a real link, and landing here opens that order's detail drawer. When the
   * dedicated route ships, this hook and orderDetailHref() are the only two
   * places that need to change.
   */
  consumeDeepLinkedOrder() {
    if (typeof window === 'undefined') return;

    let orderId = null;
    try {
      orderId = new URLSearchParams(window.location.search).get('order');
    } catch {
      return;
    }
    if (!orderId) return;

    // Clear the param first so a later re-render doesn't reopen the drawer
    // after the operator has closed it.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('order');
      window.history.replaceState({}, '', url);
    } catch {
      /* history API unavailable — opening the drawer still works */
    }

    this.openOrderModal(orderId);
  }

  openOrderModal(orderId) {
    // On the /admin/orders/<id> route the detail is already the page. Opening
    // the drawer on top of it would show the same order twice — after a status
    // change the page re-render is the whole update.
    if (this.currentView === 'order-detail') return;

    const order = OrderStore.getOrder(orderId);
    if (!order) {
      // Previously a silent no-op: a stale or mistyped reference left the
      // operator staring at an unchanged screen with no explanation.
      console.warn(`[AdminPage] No order found for id "${orderId}".`);
      window.alert(`Order "${orderId}" could not be found. It may have been removed, or the reference may be mistyped.`);
      return;
    }

    this.activeModalOrderId = order.id;
    const modalBackdrop = document.querySelector('#admin-detail-modal');
    const drawer = modalBackdrop?.querySelector('.admin-modal-drawer');
    if (!modalBackdrop || !drawer) return;

    drawer.innerHTML = this.renderModalContent(order);
    modalBackdrop.classList.add('is-open');
    modalBackdrop.setAttribute('aria-hidden', 'false');

    this.bindModalEvents(order);
  }

  closeOrderModal() {
    const modalBackdrop = document.querySelector('#admin-detail-modal');
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('is-open');
    modalBackdrop.setAttribute('aria-hidden', 'true');
    this.activeModalOrderId = null;
  }

  renderModalContent(order) {
    const formattedDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Next allowed status transitions based on state machine
    const allStatuses = [
      ORDER_STATUS.DRAFT,
      ORDER_STATUS.PENDING_PAYMENT,
      ORDER_STATUS.PAID,
      ORDER_STATUS.SHIPPING_QUOTE_REQUIRED,
      ORDER_STATUS.SHIPPING_QUOTE_SENT,
      ORDER_STATUS.SHIPPING_PAYMENT_PENDING,
      ORDER_STATUS.SHIPPING_PAYMENT_CONFIRMED,
      ORDER_STATUS.READY_FOR_DISPATCH,
      ORDER_STATUS.SHIPPED,
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.PAYMENT_FAILED,
      ORDER_STATUS.CANCELLED
    ];

    const validNextStatuses = allStatuses.filter(s => s !== order.orderStatus && validateOrderStatusTransition(order.orderStatus, s, order.flow));

    // Phase A6 §6: product payment is gateway-verified only. The manual
    // fulfilment form must never offer `paid` as a hand-applied status —
    // marking an order paid happens exclusively through the verified
    // DemoPay/webhook path (payment-service.js, webhook-service.js), never
    // because an admin clicked a button. Shipping states, dispatch,
    // delivery and cancellation remain manual fulfilment actions.
    const GATEWAY_ONLY_STATUSES = new Set([ORDER_STATUS.PAID]);
    const manualNextStatuses = validNextStatuses.filter(s => !GATEWAY_ONLY_STATUSES.has(s));
    const gatewayBlockedStatuses = validNextStatuses.filter(s => GATEWAY_ONLY_STATUSES.has(s));

    return `
      <div class="admin-modal-header">
        <div>
          <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--admin-text-muted);">Order Details</span>
          <h3 id="modal-order-number" style="margin: 2px 0 0 0; font-size: 1.25rem; font-family: var(--font-serif, Georgia, serif);">
            ${escapeHtml(order.orderNumber || order.id)}
          </h3>
          <div style="font-size: 0.75rem; color: var(--admin-text-muted); margin-top: 2px;">Placed ${formattedDate}</div>
        </div>
        <button type="button" id="admin-modal-close-btn" class="admin-modal-close" aria-label="Close Order Modal">×</button>
      </div>

      <div class="admin-modal-body">
        
        <!-- Feedback Alert Container -->
        <div id="admin-modal-alert" style="display: none; padding: 12px 16px; border-radius: 6px; font-size: 0.8125rem;"></div>

        <!-- 1. Customer Information -->
        <div class="admin-detail-section">
          <div class="admin-detail-title">
            <span>Customer Information</span>
            <span class="admin-badge ${order.isGuest ? 'badge-pending' : 'badge-paid'}">
              ${order.isGuest ? 'Guest Checkout' : 'Registered Customer'}
            </span>
          </div>
          <div class="admin-detail-grid">
            <div class="admin-detail-item">
              <strong>Full Name</strong>
              ${escapeHtml(getCustomerName(order))}
            </div>
            <div class="admin-detail-item">
              <strong>Email Address</strong>
              <a href="mailto:${encodeURIComponent(getCustomerEmail(order))}" style="color: var(--admin-brand-brown); text-decoration: underline;">
                ${escapeHtml(getCustomerEmail(order) || 'N/A')}
              </a>
            </div>
            <div class="admin-detail-item">
              <strong>Phone / WhatsApp</strong>
              ${escapeHtml(order.customer?.phone || order.customerPhone || 'N/A')}
            </div>
            <div class="admin-detail-item">
              <strong>Customer ID</strong>
              ${escapeHtml(order.customerId || 'None (Guest)')}
            </div>
          </div>
        </div>

        <!-- 2. Delivery Information -->
        <div class="admin-detail-section">
          <div class="admin-detail-title">
            <span>Delivery Destination</span>
            <span class="admin-badge badge-country">${escapeHtml(getShippingCountry(order))}</span>
          </div>
          <div class="admin-detail-grid">
            <div class="admin-detail-item">
              <strong>Country</strong>
              ${escapeHtml(getShippingCountry(order))}
            </div>
            <div class="admin-detail-item">
              <strong>State / Region</strong>
              ${escapeHtml(order.delivery?.state || 'N/A')}
            </div>
            <div class="admin-detail-item">
              <strong>City / Local Area</strong>
              ${escapeHtml(order.delivery?.city || 'N/A')}
            </div>
            ${order.delivery?.postalCode ? `
              <div class="admin-detail-item">
                <strong>Postal / ZIP Code</strong>
                ${escapeHtml(order.delivery.postalCode)}
              </div>
            ` : ''}
          </div>
          <div style="margin-top: 10px; font-size: 0.8125rem;">
            <strong style="display: block; font-size: 0.6875rem; text-transform: uppercase; color: var(--admin-text-muted); margin-bottom: 2px;">Full Street Address</strong>
            ${escapeHtml(order.delivery?.streetAddress || order.delivery?.address || 'N/A')}
          </div>
          ${order.delivery?.deliveryInstructions ? `
            <div style="margin-top: 10px; font-size: 0.8125rem; background: #FAF7F2; padding: 10px; border-radius: 4px; border-left: 3px solid var(--admin-brand-brown);">
              <strong style="display: block; font-size: 0.6875rem; text-transform: uppercase; color: var(--admin-text-muted); margin-bottom: 2px;">Special Delivery Instructions</strong>
              ${escapeHtml(order.delivery.deliveryInstructions)}
            </div>
          ` : ''}
        </div>

        <!-- 3. Purchased Formulations & Itemization -->
        <div class="admin-detail-section">
          <div class="admin-detail-title">
            <span>Purchased Formulations</span>
            <span>${order.items?.length || 0} items</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.8125rem; margin-top: 8px;">
            <thead>
              <tr style="border-bottom: 1px solid var(--admin-border); text-align: left; color: var(--admin-text-muted);">
                <th style="padding: 6px 0;">Item</th>
                <th style="padding: 6px 8px; text-align: center;">Qty</th>
                <th style="padding: 6px 8px; text-align: right;">Unit Price</th>
                <th style="padding: 6px 0; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${(order.items || []).map(item => `
                <tr style="border-bottom: 1px solid var(--admin-border-subtle);">
                  <td style="padding: 10px 0;">
                    <div style="font-weight: 600;">${escapeHtml(item.productName)}</div>
                    <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${escapeHtml(item.variantName || '')} ${item.sku ? `(${escapeHtml(item.sku)})` : ''}</div>
                  </td>
                  <td style="padding: 10px 8px; text-align: center;">${item.quantity}</td>
                  <td style="padding: 10px 8px; text-align: right;">${formatNaira(item.unitPrice)}</td>
                  <td style="padding: 10px 0; text-align: right; font-weight: 600;">${formatNaira(item.lineSubtotal || (item.unitPrice * item.quantity))}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding: 10px 0 4px 0; text-align: right; color: var(--admin-text-muted);">Formulations Subtotal:</td>
                <td style="padding: 10px 0 4px 0; text-align: right; font-weight: 600;">${formatNaira(order.pricing?.subtotal || 0)}</td>
              </tr>
              <tr>
                <td colspan="3" style="padding: 4px 0; text-align: right; color: var(--admin-text-muted);">Shipping:</td>
                <td style="padding: 4px 0; text-align: right; color: var(--admin-brand-brown);">${order.pricing?.shippingStatus || 'Calculated separately'}</td>
              </tr>
              <tr style="font-size: 0.9375rem; font-weight: 700; border-top: 1px solid var(--admin-border);">
                <td colspan="3" style="padding: 10px 0; text-align: right;">Total Paid:</td>
                <td style="padding: 10px 0; text-align: right; color: var(--admin-status-paid-text);">${formatNaira(order.pricing?.totalPaid || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- 4. Payment Information (Decoupled from Order Status) -->
        <div class="admin-detail-section">
          <div class="admin-detail-title">
            <span>Payment Information</span>
            <span class="admin-badge badge-${order.paymentStatus || 'pending'}">
              Payment: ${order.paymentStatus || 'pending'}
            </span>
          </div>
          <div class="admin-detail-grid">
            <div class="admin-detail-item">
              <strong>Payment Status</strong>
              <span class="admin-badge badge-${order.paymentStatus || 'pending'}">
                ${order.paymentStatus || 'pending'}
              </span>
            </div>
            <div class="admin-detail-item">
              <strong>Order Status</strong>
              <span class="admin-badge badge-${order.orderStatus || 'pending_payment'}">
                ${(order.orderStatus || 'pending_payment').replace(/_/g, ' ')}
              </span>
            </div>
            <div class="admin-detail-item">
              <strong>Provider Reference</strong>
              <code>${escapeHtml(order.paymentId || order.latestPaymentId || 'DEMO-PAY-REF')}</code>
            </div>
            <div class="admin-detail-item">
              <strong>Payment Method</strong>
              Slimky DemoPay (Test Mode)
            </div>
          </div>
        </div>

        <!-- 5. Customs & Import Duties Information (International Orders) -->
        ${order.flow === 'international_checkout' ? `
          <div class="admin-detail-section" style="background: #FDF9EE; border-color: #E2D3B3;">
            <div class="admin-detail-title" style="color: #634C19; border-color: #E2D3B3;">
              <span>Customs & Import Duties Separation</span>
              <span style="font-size: 0.75rem; font-weight: 600;">Recipient Responsibility</span>
            </div>
            <p style="font-size: 0.8125rem; color: #523F15; margin: 0; line-height: 1.5;">
              ${CUSTOMS_IMPORT_DUTIES_NOTICE.DISCLOSURE}
            </p>
          </div>
        ` : ''}

        <!-- 6. Nigeria Shipping Quote & Payment Panel -->
        ${order.flow === 'nigeria_checkout' ? `
          <div class="admin-detail-section">
            <div class="admin-detail-title">
              <span>Nigeria Shipping Quote</span>
              <span class="admin-badge badge-${order.shippingQuote?.status || 'quote'}">
                Quote Status: ${(order.shippingQuote?.status || 'Required').replace(/_/g, ' ')}
              </span>
            </div>
            <p style="font-size: 0.75rem; color: var(--admin-text-muted); margin: 0 0 12px 0;">Manual entry only — no automated rate calculator or carrier API. The customer pays this fee themselves via Slimky DemoPay once they accept the quote.</p>

            ${['shipping_quote_required', 'shipping_quote_sent'].includes(order.orderStatus) ? `
              <form id="ng-quote-form">
                <div class="admin-detail-grid">
                  <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Shipping Provider</label>
                    <input type="text" id="ng-quote-provider" class="admin-search-input" placeholder="e.g. GIG Logistics, DHL Nigeria, Local Courier" value="${escapeHtml(order.shippingQuote?.provider || '')}" required style="height: 44px; padding-left: 12px;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Shipping Method</label>
                    <input type="text" id="ng-quote-method" class="admin-search-input" placeholder="e.g. Doorstep Delivery, Hub Pickup" value="${escapeHtml(order.shippingQuote?.method || 'Doorstep Delivery')}" required style="height: 44px; padding-left: 12px;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Shipping Cost (₦ NGN)</label>
                    <input type="number" id="ng-quote-amount" class="admin-search-input" placeholder="e.g. 3500" value="${order.shippingQuote?.amount || ''}" required min="1" style="height: 44px; padding-left: 12px;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Delivery Estimate (Optional)</label>
                    <input type="text" id="ng-quote-estimate" class="admin-search-input" placeholder="e.g. 2-4 business days" value="${escapeHtml(order.shippingQuote?.estimatedDelivery || '')}" style="height: 44px; padding-left: 12px;">
                  </div>
                </div>
                <div style="margin-top: 12px;">
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Notes</label>
                  <textarea id="ng-quote-notes" class="admin-search-input" style="height: 60px; padding: 8px 12px;" placeholder="Internal courier notes or delivery coordination details">${escapeHtml(order.shippingQuote?.notes || '')}</textarea>
                </div>
                <div style="margin-top: 14px; text-align: right;">
                  <button type="submit" class="btn-admin btn-admin-primary">
                    ${order.orderStatus === 'shipping_quote_sent' ? 'Update & Resend Quote' : 'Save & Send Shipping Quote to Customer'}
                  </button>
                </div>
              </form>
            ` : `
              <div class="admin-detail-grid">
                <div class="admin-detail-item">
                  <strong>Shipping Provider</strong>
                  ${escapeHtml(order.shippingQuote?.provider || 'N/A')}
                </div>
                <div class="admin-detail-item">
                  <strong>Shipping Method</strong>
                  ${escapeHtml(order.shippingQuote?.method || 'N/A')}
                </div>
                <div class="admin-detail-item">
                  <strong>Shipping Fee</strong>
                  ${formatNaira(order.shippingQuote?.amount || 0)}
                </div>
                ${order.shippingQuote?.estimatedDelivery ? `
                  <div class="admin-detail-item">
                    <strong>Delivery Estimate</strong>
                    ${escapeHtml(order.shippingQuote.estimatedDelivery)}
                  </div>
                ` : ''}
              </div>
            `}

            ${order.orderStatus === 'shipping_payment_pending' ? `
              <div style="margin-top: 16px; padding: 14px; background: #FFF8E1; border: 1px solid #FFE082; border-radius: 6px;">
                <div style="font-weight: 600; font-size: 0.875rem; margin-bottom: 6px;">Awaiting Customer Shipping Payment</div>
                <p style="font-size: 0.8125rem; color: #6B571A; margin: 0;">Customer accepted the quote and is completing shipping payment via Slimky DemoPay from their order page. This will advance automatically to "Shipping Paid" once verified — no admin action needed.</p>
              </div>
            ` : ''}

            ${['shipping_payment_confirmed', 'ready_for_dispatch', 'shipped', 'delivered'].includes(order.orderStatus) && order.shippingPayment ? `
              <div style="margin-top: 16px; padding: 14px; background: #E8F5E9; border: 1px solid #A5D6A7; border-radius: 6px;">
                <div style="font-weight: 600; font-size: 0.875rem; margin-bottom: 6px; color: #2E7D32;">Shipping Payment Confirmed</div>
                <div class="admin-detail-grid">
                  <div class="admin-detail-item">
                    <strong>Reference</strong>
                    <code>${order.shippingPayment.reference}</code>
                  </div>
                  <div class="admin-detail-item">
                    <strong>Amount Paid</strong>
                    ${formatNaira(order.shippingPayment.amount || order.shippingQuote?.amount || 0)}
                  </div>
                  <div class="admin-detail-item">
                    <strong>Confirmed At</strong>
                    ${new Date(order.shippingPayment.confirmedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- 7. International Shipping Quote Management Panel -->
        ${order.flow === 'international_checkout' ? `
          <div class="admin-detail-section">
            <div class="admin-detail-title">
              <span>International Shipping Quote</span>
              <span class="admin-badge badge-${order.shippingQuote?.status || 'quote'}">
                Quote Status: ${order.shippingQuote?.status || 'Required'}
              </span>
            </div>

            <form id="intl-quote-form">
              <div class="admin-detail-grid">
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Quote Amount</label>
                  <input type="number" id="intl-quote-amount" class="admin-search-input" placeholder="e.g. 45000" value="${order.shippingQuote?.amount || ''}" required style="height: 44px; padding-left: 12px;">
                </div>
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Currency</label>
                  <select id="intl-quote-currency" class="admin-select" style="width: 100%; height: 44px;">
                    <option value="NGN" ${order.shippingQuote?.currency === 'NGN' ? 'selected' : ''}>NGN (Nigerian Naira)</option>
                    <option value="USD" ${order.shippingQuote?.currency === 'USD' ? 'selected' : ''}>USD (US Dollar)</option>
                    <option value="GBP" ${order.shippingQuote?.currency === 'GBP' ? 'selected' : ''}>GBP (British Pound)</option>
                    <option value="EUR" ${order.shippingQuote?.currency === 'EUR' ? 'selected' : ''}>EUR (Euro)</option>
                  </select>
                </div>
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Carrier / Provider</label>
                  <input type="text" id="intl-quote-provider" class="admin-search-input" placeholder="e.g. DHL Express, FedEx, UPS" value="${order.shippingQuote?.provider || 'DHL Express'}" required style="height: 44px; padding-left: 12px;">
                </div>
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Delivery Method</label>
                  <input type="text" id="intl-quote-method" class="admin-search-input" placeholder="e.g. Express Air Freight" value="${order.shippingQuote?.method || 'Standard International Air Courier'}" required style="height: 44px; padding-left: 12px;">
                </div>
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Estimated Delivery Timeframe</label>
                  <input type="text" id="intl-quote-estimate" class="admin-search-input" placeholder="e.g. 3-5 business days" value="${escapeHtml(order.shippingQuote?.estimatedDelivery || '')}" style="height: 44px; padding-left: 12px;">
                </div>
              </div>

              <div style="margin-top: 12px;">
                <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Quote Notes</label>
                <textarea id="intl-quote-notes" class="admin-search-input" style="height: 60px; padding: 8px 12px;" placeholder="Carrier quote reference, volumetric weight details, or customer notes">${escapeHtml(order.shippingQuote?.notes || '')}</textarea>
              </div>

              <div style="display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap;">
                <button type="submit" id="btn-save-send-quote" class="btn-admin btn-admin-primary">
                  Send Shipping Quote to Customer
                </button>
                <button type="button" id="btn-quote-accepted" class="btn-admin btn-admin-outline" style="border-color: #2E7D32; color: #2E7D32;">
                  Mark Quote Accepted
                </button>
                <button type="button" id="btn-quote-rejected" class="btn-admin btn-admin-outline" style="border-color: #B91C1C; color: #B91C1C;">
                  Mark Quote Rejected
                </button>
              </div>
            </form>

            <!-- Shipping Payment Confirmation Action -->
            ${order.orderStatus === 'shipping_payment_pending' ? `
              <div style="margin-top: 16px; padding: 14px; background: #FFF8E1; border: 1px solid #FFE082; border-radius: 6px;">
                <div style="font-weight: 600; font-size: 0.875rem; margin-bottom: 6px;">Shipping Payment Pending</div>
                <p style="font-size: 0.8125rem; color: #6B571A; margin: 0 0 10px 0;">Customer has accepted the quote. When payment for shipping is received, confirm it below to advance the order to Ready for Dispatch.</p>
                <button type="button" id="btn-confirm-shipping-pay" class="btn-admin btn-admin-primary" style="background: #2E7D32;">
                  Confirm Shipping Payment Received
                </button>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- 8. Tracking Number & Dispatch Panel -->
        <div class="admin-detail-section">
          <div class="admin-detail-title">
            <span>Tracking & Dispatch</span>
            ${order.tracking?.trackingNumber ? `
              <span class="admin-badge badge-paid">Shipped: ${escapeHtml(order.tracking.trackingNumber)}</span>
            ` : `
              <span class="admin-badge badge-pending">Not Dispatched</span>
            `}
          </div>
          ${order.tracking?.trackingNumber ? `
            <div class="admin-detail-grid">
              <div class="admin-detail-item">
                <strong>Carrier</strong>
                ${escapeHtml(order.tracking.carrier)}
              </div>
              <div class="admin-detail-item">
                <strong>Tracking Number</strong>
                <code>${escapeHtml(order.tracking.trackingNumber)}</code>
              </div>
              <div class="admin-detail-item">
                <strong>Dispatched At</strong>
                ${new Date(order.tracking.dispatchedAt).toLocaleString()}
              </div>
            </div>
            ${order.orderStatus === 'shipped' ? `
              <div style="margin-top: 12px; text-align: right;">
                <button type="button" id="btn-mark-delivered" class="btn-admin btn-admin-primary" style="background: #2E7D32;">
                  Mark as Delivered
                </button>
              </div>
            ` : ''}
          ` : `
            <form id="tracking-dispatch-form">
              <div class="admin-detail-grid">
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Carrier Name</label>
                  <input type="text" id="dispatch-carrier" class="admin-search-input" placeholder="e.g. DHL Express, GIG Logistics" value="${order.shippingQuote?.provider || order.shippingDetails?.provider || 'DHL Express'}" style="height: 44px; padding-left: 12px;" required>
                </div>
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Tracking Number</label>
                  <input type="text" id="dispatch-tracking-number" class="admin-search-input" placeholder="e.g. DHL-9482710492" style="height: 44px; padding-left: 12px;" required>
                </div>
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Tracking URL (Optional)</label>
                  <input type="url" id="dispatch-tracking-url" class="admin-search-input" placeholder="https://www.dhl.com/track?..." style="height: 44px; padding-left: 12px;">
                </div>
              </div>
              <div style="margin-top: 12px; text-align: right;">
                <button type="submit" class="btn-admin btn-admin-primary" style="background: var(--admin-brand-brown);">
                  Mark Order Shipped & Notify Customer
                </button>
              </div>
            </form>
          `}
        </div>

        <!-- 9. State Machine Status Transition Management -->
        <div class="admin-detail-section">
          <div class="admin-detail-title">
            <span>Status Transition Management</span>
            <span class="admin-badge badge-${order.orderStatus}">
              Current: ${order.orderStatus.replace(/_/g, ' ')}
            </span>
          </div>

          <form id="status-transition-form">
            <div style="display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
                <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Next Permitted Status</label>
                <select id="admin-target-status-select" class="admin-select" style="width: 100%; height: 44px;">
                  ${manualNextStatuses.length === 0 ? `
                    <option value="">No valid next transitions (Terminal state)</option>
                  ` : `
                    <option value="">Select next transition...</option>
                    ${manualNextStatuses.map(s => `
                      <option value="${s}">${s.replace(/_/g, ' ')}</option>
                    `).join('')}
                  `}
                </select>
              </div>
              <div style="flex: 1; min-width: 200px;">
                <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Transition Audit Note</label>
                <input type="text" id="admin-transition-note" class="admin-search-input" placeholder="e.g. Formulations packed for courier dispatch" style="height: 44px; padding-left: 12px;">
              </div>
              <button type="submit" id="btn-execute-transition" class="btn-admin btn-admin-primary" ${manualNextStatuses.length === 0 ? 'disabled' : ''}>
                Update Status
              </button>
            </div>
          </form>
          ${gatewayBlockedStatuses.length > 0 ? `
            <p style="font-size: 0.75rem; color: var(--admin-text-muted); margin: 8px 0 0 0;">
              Product payment (“paid”) is applied automatically by verified Slimky DemoPay
              and is never set by hand from this form.
            </p>
          ` : ''}

          <!-- Audit Timeline -->
          <div style="margin-top: 18px; border-top: 1px solid var(--admin-border); padding-top: 12px;">
            <div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--admin-text-muted); margin-bottom: 8px;">Order State History</div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.8125rem;">
              ${(order.history || []).map(h => `
                <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed var(--admin-border-subtle);">
                  <span><strong>${h.to || h.action || h.status || 'Updated'}</strong>: ${h.note || ''}</span>
                  <span style="color: var(--admin-text-muted); font-size: 0.75rem;">${new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- 10. Internal Notes (Private to Admin) -->
        <div class="admin-detail-section">
          <div class="admin-detail-title">
            <span>Internal Notes</span>
            <span style="font-size: 0.75rem; color: #8F3B3B;">Private to Admin</span>
          </div>

          <div id="internal-notes-history" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;">
            ${(order.metadata?.internalNotes || []).length === 0 ? `
              <div style="font-size: 0.8125rem; color: var(--admin-text-muted);">No internal notes recorded yet.</div>
            ` : `
              ${order.metadata.internalNotes.map(n => `
                <div style="background: #FFFFFF; border: 1px solid var(--admin-border); border-radius: 6px; padding: 10px 12px; font-size: 0.8125rem;">
                  <div style="display: flex; justify-content: space-between; font-size: 0.6875rem; color: var(--admin-text-muted); margin-bottom: 4px;">
                    <strong>${escapeHtml(n.author || 'Admin')}</strong>
                    <span>${escapeHtml(new Date(n.createdAt).toLocaleString())}</span>
                  </div>
                  <div>${escapeHtml(n.text)}</div>
                </div>
              `).join('')}
            `}
          </div>

          <form id="add-internal-note-form">
            <textarea id="internal-note-input" class="admin-search-input" style="height: 64px; padding: 8px 12px;" placeholder="Add private fulfillment or customer care note..." required></textarea>
            <div style="margin-top: 8px; text-align: right;">
              <button type="submit" class="btn-admin btn-admin-outline btn-admin-sm">
                Add Note
              </button>
            </div>
          </form>
        </div>

      </div>
    `;
  }

  bindModalEvents(order) {
    const alertDiv = document.querySelector('#admin-modal-alert');
    const showAlert = (msg, isError = false) => {
      if (!alertDiv) return;
      alertDiv.textContent = msg;
      alertDiv.style.background = isError ? '#FEE2E2' : '#E8F5E9';
      alertDiv.style.color = isError ? '#B91C1C' : '#2E7D32';
      alertDiv.style.display = 'block';
      setTimeout(() => { if (alertDiv) alertDiv.style.display = 'none'; }, 4000);
    };

    // Close modal
    document.querySelector('#admin-modal-close-btn')?.addEventListener('click', () => {
      this.closeOrderModal();
    });

    // Close on backdrop click
    document.querySelector('#admin-detail-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'admin-detail-modal') {
        this.closeOrderModal();
      }
    });

    // Nigeria Shipping Quote Form - Save & Send Quote
    document.querySelector('#ng-quote-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const provider = document.querySelector('#ng-quote-provider')?.value.trim();
        const method = document.querySelector('#ng-quote-method')?.value.trim();
        const amount = parseFloat(document.querySelector('#ng-quote-amount')?.value) || 0;
        const estimatedDelivery = document.querySelector('#ng-quote-estimate')?.value.trim();
        const notes = document.querySelector('#ng-quote-notes')?.value.trim();

        if (!amount || amount <= 0) {
          showAlert('Enter a valid shipping cost before sending the quote.', true);
          return;
        }

        const updated = OrderStore.updateShippingQuote(order.id, {
          amount,
          currency: 'NGN',
          provider,
          method,
          estimatedDelivery,
          notes,
          status: 'sent'
        }, { actor: 'admin' });

        // Dispatch transactional quote email (Milestone C20.9)
        try {
          await emailService.sendShippingQuoteEmail(updated, updated.shippingQuote);
        } catch (emailErr) {
          console.warn('[AdminPage] Nigeria shipping quote email dispatch skipped/failed:', emailErr);
        }

        showAlert('Shipping quote saved and emailed to the customer.');
        this.render();
        this.openOrderModal(order.id);
      } catch (err) {
        showAlert(err.message, true);
      }
    });

    // International Quote Form - Send Quote
    document.querySelector('#intl-quote-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const amount = parseFloat(document.querySelector('#intl-quote-amount')?.value) || 0;
        const currency = document.querySelector('#intl-quote-currency')?.value || 'NGN';
        const provider = document.querySelector('#intl-quote-provider')?.value.trim();
        const method = document.querySelector('#intl-quote-method')?.value.trim();
        const estimatedDelivery = document.querySelector('#intl-quote-estimate')?.value.trim();
        const notes = document.querySelector('#intl-quote-notes')?.value.trim();

        const updated = OrderStore.updateInternationalShippingQuote(order.id, {
          amount,
          currency,
          provider,
          method,
          estimatedDelivery,
          notes,
          status: 'sent'
        }, { actor: 'admin' });

        // Dispatch transactional quote email
        await emailService.sendShippingQuoteEmail(updated, updated.shippingQuote);

        showAlert('Shipping quote saved and email dispatched to customer.');
        this.render();
        this.openOrderModal(order.id);
      } catch (err) {
        showAlert(err.message, true);
      }
    });

    // Customer Accepted Quote button
    document.querySelector('#btn-quote-accepted')?.addEventListener('click', async () => {
      try {
        const updated = OrderStore.recordCustomerQuoteResponse(order.id, 'accepted', 'Customer accepted quote via backoffice confirmation.', { actor: 'admin' });

        // Dispatch shipping payment required email (Milestone C20.9)
        try {
          await emailService.sendShippingPaymentRequiredEmail(updated, updated.shippingQuote);
        } catch (emailErr) {
          console.warn('[AdminPage] Shipping payment required email dispatch skipped/failed:', emailErr);
        }

        showAlert('Quote marked accepted. Order awaiting shipping payment.');
        this.render();
        this.openOrderModal(order.id);
      } catch (err) {
        showAlert(err.message, true);
      }
    });

    // Customer Rejected Quote button
    document.querySelector('#btn-quote-rejected')?.addEventListener('click', () => {
      try {
        OrderStore.recordCustomerQuoteResponse(order.id, 'rejected', 'Customer requested revised quote.', { actor: 'admin' });
        showAlert('Quote marked rejected. Order returned to Quote Required state.');
        this.render();
        this.openOrderModal(order.id);
      } catch (err) {
        showAlert(err.message, true);
      }
    });

    // Confirm Shipping Payment
    document.querySelector('#btn-confirm-shipping-pay')?.addEventListener('click', async () => {
      try {
        const updated = OrderStore.confirmShippingPayment(order.id, {
          reference: `SHIP-PAY-${Date.now()}`,
          notes: 'Shipping payment verified by admin'
        }, { actor: 'admin' });

        // Dispatch shipping payment confirmed email (Milestone C20.9)
        try {
          await emailService.sendShippingPaymentConfirmedEmail(updated, updated.shippingPayment);
        } catch (emailErr) {
          console.warn('[AdminPage] Shipping payment confirmed email dispatch skipped/failed:', emailErr);
        }

        showAlert('Shipping payment confirmed! Order is now Ready for Dispatch.');
        this.render();
        this.openOrderModal(order.id);
      } catch (err) {
        showAlert(err.message, true);
      }
    });

    // Mark Shipped with Tracking Number
    document.querySelector('#tracking-dispatch-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const carrier = document.querySelector('#dispatch-carrier')?.value.trim();
        const trackingNumber = document.querySelector('#dispatch-tracking-number')?.value.trim();
        const trackingUrl = document.querySelector('#dispatch-tracking-url')?.value.trim();

        const updated = OrderStore.markOrderShipped(order.id, {
          carrier,
          trackingNumber,
          trackingUrl
        }, { actor: 'admin' });

        // Dispatch shipping tracking email
        await emailService.sendDispatchNotificationEmail(updated, updated.tracking);

        showAlert('Order marked as Shipped and tracking notification dispatched.');
        this.render();
        this.openOrderModal(order.id);
      } catch (err) {
        showAlert(err.message, true);
      }
    });

    // Mark Delivered
    document.querySelector('#btn-mark-delivered')?.addEventListener('click', async () => {
      try {
        const updated = OrderStore.markOrderDelivered(order.id, { actor: 'admin' });

        // Dispatch order delivered email (Milestone C20.9)
        try {
          await emailService.sendOrderDeliveredEmail(updated);
        } catch (emailErr) {
          console.warn('[AdminPage] Order delivered email dispatch skipped/failed:', emailErr);
        }

        showAlert('Order marked as Delivered and customer notified.');
        this.render();
        this.openOrderModal(order.id);
      } catch (err) {
        showAlert(err.message, true);
      }
    });

    // Status Transition Form
    document.querySelector('#status-transition-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const targetStatus = document.querySelector('#admin-target-status-select')?.value;
        const note = document.querySelector('#admin-transition-note')?.value.trim();

        if (!targetStatus) {
          showAlert('Please select a valid next status.', true);
          return;
        }

        // Phase A6 §6 defence-in-depth: even a devtools-tampered select POST
        // must not hand-apply a gateway-only status.
        if (targetStatus === ORDER_STATUS.PAID) {
          showAlert('Product payment is applied automatically by verified Slimky DemoPay and cannot be set by hand.', true);
          return;
        }

        OrderStore.transitionOrderStatus(order.id, targetStatus, {
          actor: 'admin',
          note: note || `Admin updated order status to ${targetStatus}`
        });

        showAlert(`Status successfully updated to ${targetStatus.replace(/_/g, ' ')}.`);
        this.render();
        this.openOrderModal(order.id);
      } catch (err) {
        showAlert(err.message, true);
      }
    });

    // Internal Note Form
    document.querySelector('#add-internal-note-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const noteText = document.querySelector('#internal-note-input')?.value.trim();
        if (!noteText) return;

        OrderStore.addInternalNote(order.id, noteText, 'Admin');
        showAlert('Internal note recorded.');
        this.render();
        this.openOrderModal(order.id);
      } catch (err) {
        showAlert(err.message, true);
      }
    });
  }
}

// Auto-initialize when mounted
document.addEventListener('DOMContentLoaded', () => {
  new AdminPage();
});
