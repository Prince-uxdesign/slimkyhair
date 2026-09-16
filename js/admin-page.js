/**
 * Slimky Hair Admin Dashboard Controller
 * Milestones C21 - C26: Orders, Quotes, Tracking & Status Management
 */

import { adminService } from './auth/admin-service.js';
import { OrderStore } from './payment/order-store.js';
import { formatNaira } from './cart-store.js';
import { ORDER_STATUS, PAYMENT_STATUS, validateOrderStatusTransition, CUSTOMS_IMPORT_DUTIES_NOTICE } from './payment/payment-model.js';
import { emailService } from './email/email-service.js';
import { CATALOG_PRODUCTS } from './catalog-data.js';
import { inventoryService, getAvailabilityLabel } from './inventory/inventory-service.js';

export class AdminPage {
  constructor() {
    this.appContainer = document.querySelector('#admin-app');
    this.currentView = 'orders'; // 'orders' | 'inventory'
    this.currentQueue = 'all';
    this.statusFilter = 'all';
    this.paymentFilter = 'all';
    this.searchQuery = '';
    this.activeModalOrderId = null;

    // Inventory View State (Milestone C20.12)
    this.inventorySearchQuery = '';
    this.inventoryAvailabilityFilter = 'all';

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
          <a href="#" class="admin-nav-item" onclick="return false;" style="opacity: 0.7;">
            <span>Overview</span>
          </a>
          <a href="#" class="admin-nav-item ${this.currentView === 'orders' ? 'is-active' : ''}" id="nav-orders-link">
            <span>Orders</span>
            <span class="admin-nav-badge">${orderCount}</span>
          </a>
          <a href="#" class="admin-nav-item" onclick="return false;" style="opacity: 0.7;">
            <span>Products & Variants</span>
          </a>
          <a href="#" class="admin-nav-item ${this.currentView === 'inventory' ? 'is-active' : ''}" id="nav-inventory-link">
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
    `;
  }

  /**
   * Wire the sidebar nav links that are shared across every admin view.
   */
  bindSidebarNavEvents() {
    document.querySelector('#nav-orders-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.currentView = 'orders';
      this.render();
    });
    document.querySelector('#nav-inventory-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.currentView = 'inventory';
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
                        <th>Payment Status</th>
                        <th>Order Status</th>
                        <th>Total</th>
                        <th>Shipping Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filteredOrders.map(order => this.renderTableRow(order)).join('')}
                    </tbody>
                  </table>
                </div>

                <!-- Responsive Tablet / Mobile Cards -->
                <div class="admin-cards-list">
                  ${filteredOrders.map(order => this.renderCardRow(order)).join('')}
                </div>
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

  renderTableRow(order) {
    const formattedDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const country = order.delivery?.country || 'Nigeria';
    const total = order.pricing?.productPaymentTotal || order.pricing?.subtotal || 0;
    const shippingStatus = order.pricing?.shippingStatus || (order.flow === 'nigeria_checkout' ? 'Calculated separately' : 'Quote required');

    return `
      <tr data-order-id="${order.id}">
        <td>
          <a href="#" class="admin-order-link inspect-order-btn" data-order-id="${order.id}">
            ${order.orderNumber || order.id}
          </a>
        </td>
        <td>
          <div style="font-weight: 600;">${order.customer?.fullName || order.customerName || 'Guest'}</div>
          <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${order.customer?.email || order.customerEmail || ''}</div>
        </td>
        <td>${formattedDate}</td>
        <td>
          <span class="admin-badge badge-country">${country}</span>
        </td>
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
        <td style="font-size: 0.8125rem; color: var(--admin-brand-brown);">${shippingStatus}</td>
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
    const country = order.delivery?.country || 'Nigeria';
    const total = order.pricing?.productPaymentTotal || order.pricing?.subtotal || 0;
    const shippingStatus = order.pricing?.shippingStatus || (order.flow === 'nigeria_checkout' ? 'Calculated separately' : 'Quote required');

    return `
      <div class="admin-order-card" data-order-id="${order.id}">
        <div class="admin-order-card-header">
          <div>
            <span style="font-size: 0.6875rem; color: var(--admin-text-muted); text-transform: uppercase;">Order Number</span>
            <div style="font-weight: 700; font-size: 1rem; color: var(--admin-brand-brown);">
              ${order.orderNumber || order.id}
            </div>
          </div>
          <span class="admin-badge badge-country">${country}</span>
        </div>

        <div class="admin-order-card-grid">
          <div>
            <div class="admin-order-card-label">Customer</div>
            <div style="font-weight: 600;">${order.customer?.fullName || 'Guest'}</div>
            <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${order.customer?.email || ''}</div>
          </div>
          <div>
            <div class="admin-order-card-label">Date</div>
            <div>${formattedDate}</div>
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
            <div style="font-size: 0.75rem; color: var(--admin-brand-brown);">${shippingStatus}</div>
          </div>
          <button type="button" class="btn-admin btn-admin-primary btn-admin-sm inspect-order-btn" data-order-id="${order.id}">
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
    CATALOG_PRODUCTS.forEach(product => {
      const variants = Array.isArray(product.variants) && product.variants.length > 0
        ? product.variants
        : [{ sku: product.sku, size: 'Standard', stock: product.stock, priceFormatted: product.priceFormatted }];

      variants.forEach(variant => {
        if (!variant.sku) return;
        const stock = inventoryService.getEffectiveStock(variant.sku, variant.stock);
        const availability = getAvailabilityLabel(stock);
        rows.push({
          productId: product.id,
          productName: product.name,
          category: product.category,
          variantName: variant.size || variant.name || 'Standard',
          sku: variant.sku,
          priceFormatted: variant.priceFormatted || '',
          stock,
          availability
        });
      });
    });
    return rows;
  }

  /**
   * Apply the current inventory search + availability filter.
   * @param {Array<Object>} rows
   * @returns {Array<Object>}
   */
  filterInventoryRows(rows) {
    let filtered = rows;

    if (this.inventoryAvailabilityFilter !== 'all') {
      filtered = filtered.filter(r => r.availability.className === this.inventoryAvailabilityFilter);
    }

    if (this.inventorySearchQuery) {
      const q = this.inventorySearchQuery.trim().toLowerCase();
      filtered = filtered.filter(r =>
        r.productName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    }

    return filtered;
  }

  renderInventoryView(admin) {
    const allRows = this.getInventoryRows();
    const filteredRows = this.filterInventoryRows(allRows);

    const counts = {
      all: allRows.length,
      'in-stock': allRows.filter(r => r.availability.className === 'in-stock').length,
      'low-stock': allRows.filter(r => r.availability.className === 'low-stock').length,
      'out-of-stock': allRows.filter(r => r.availability.className === 'out-of-stock').length
    };

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

            <!-- Availability Queue Filters -->
            <div class="admin-queue-bar" role="tablist" aria-label="Inventory Availability Filters">
              <button type="button" class="admin-queue-tab ${this.inventoryAvailabilityFilter === 'all' ? 'is-active' : ''}" data-availability="all" role="tab">
                <span>All SKUs</span>
                <span class="admin-queue-count">${counts.all}</span>
              </button>
              <button type="button" class="admin-queue-tab ${this.inventoryAvailabilityFilter === 'in-stock' ? 'is-active' : ''}" data-availability="in-stock" role="tab">
                <span>In Stock</span>
                <span class="admin-queue-count">${counts['in-stock']}</span>
              </button>
              <button type="button" class="admin-queue-tab ${this.inventoryAvailabilityFilter === 'low-stock' ? 'is-active' : ''}" data-availability="low-stock" role="tab">
                <span>Low Stock</span>
                <span class="admin-queue-count">${counts['low-stock']}</span>
              </button>
              <button type="button" class="admin-queue-tab ${this.inventoryAvailabilityFilter === 'out-of-stock' ? 'is-active' : ''}" data-availability="out-of-stock" role="tab">
                <span>Out of Stock</span>
                <span class="admin-queue-count">${counts['out-of-stock']}</span>
              </button>
            </div>

            <!-- Search Toolbar -->
            <div class="admin-toolbar">
              <div class="admin-search-box">
                <span class="admin-search-icon">🔍</span>
                <input type="text" id="admin-inventory-search-input" class="admin-search-input" placeholder="Search by product name, category, or SKU..." value="${this.inventorySearchQuery}">
              </div>
            </div>

            <!-- Inventory Table (Desktop) / Hybrid (Tablet) / Cards (Mobile) -->
            <div class="admin-card">
              ${filteredRows.length === 0 ? `
                <div style="text-align: center; padding: 48px 20px; color: var(--admin-text-muted);">
                  <div style="font-size: 2rem; margin-bottom: 8px;">📦</div>
                  <h3 style="margin: 0; color: var(--admin-text-main);">No matching SKUs found</h3>
                  <p style="font-size: 0.875rem; margin-top: 4px;">Adjust your search or availability filter.</p>
                </div>
              ` : `
                <div class="admin-table-wrap admin-inventory-table-wrap">
                  <table class="admin-table admin-inventory-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th class="admin-inv-hide-tablet">Variant</th>
                        <th>SKU</th>
                        <th>Stock</th>
                        <th>Availability</th>
                        <th class="admin-inv-hide-tablet">Price</th>
                        <th>Adjust</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filteredRows.map(row => this.renderInventoryTableRow(row)).join('')}
                    </tbody>
                  </table>
                </div>

                <div class="admin-cards-list admin-inventory-cards-list">
                  ${filteredRows.map(row => this.renderInventoryCard(row)).join('')}
                </div>
              `}
            </div>

          </main>
        </div>
      </div>
    `;

    this.bindInventoryEvents();
  }

  renderInventoryTableRow(row) {
    return `
      <tr data-sku="${row.sku}">
        <td>
          <div style="font-weight: 600;">${row.productName}</div>
          <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${row.category}</div>
        </td>
        <td class="admin-inv-hide-tablet">${row.variantName}</td>
        <td><code>${row.sku}</code></td>
        <td>
          <span class="admin-stock-number">${row.stock}</span>
        </td>
        <td>
          <span class="admin-badge admin-stock-badge-${row.availability.className}">${row.availability.label.split(' · ')[0]}</span>
        </td>
        <td class="admin-inv-hide-tablet">${row.priceFormatted}</td>
        <td>
          <div class="admin-stock-adjust-group">
            <button type="button" class="admin-stock-step-btn inv-stock-minus" data-sku="${row.sku}" aria-label="Decrease stock for ${row.productName} ${row.variantName}">−</button>
            <input type="number" class="admin-stock-input inv-stock-input" data-sku="${row.sku}" value="${row.stock}" min="0" aria-label="Set stock for ${row.productName} ${row.variantName}">
            <button type="button" class="admin-stock-step-btn inv-stock-plus" data-sku="${row.sku}" aria-label="Increase stock for ${row.productName} ${row.variantName}">+</button>
            <button type="button" class="btn-admin btn-admin-outline btn-admin-sm inv-stock-save" data-sku="${row.sku}">Save</button>
          </div>
        </td>
      </tr>
    `;
  }

  renderInventoryCard(row) {
    return `
      <div class="admin-inventory-card" data-sku="${row.sku}">
        <div class="admin-order-card-header">
          <div>
            <span style="font-size: 0.6875rem; color: var(--admin-text-muted); text-transform: uppercase;">${row.category}</span>
            <div style="font-weight: 700; font-size: 1rem; color: var(--admin-brand-brown);">${row.productName}</div>
            <div style="font-size: 0.8125rem; color: var(--admin-text-muted); margin-top: 2px;">${row.variantName} · <code>${row.sku}</code></div>
          </div>
          <span class="admin-badge admin-stock-badge-${row.availability.className}">${row.availability.label.split(' · ')[0]}</span>
        </div>

        <div class="admin-inventory-card-stock-row">
          <div>
            <div class="admin-order-card-label">Current Stock</div>
            <div class="admin-stock-number admin-stock-number-lg">${row.stock}</div>
          </div>
          <div>
            <div class="admin-order-card-label">Price</div>
            <div>${row.priceFormatted}</div>
          </div>
        </div>

        <div class="admin-stock-adjust-group admin-stock-adjust-group-mobile">
          <button type="button" class="admin-stock-step-btn inv-stock-minus" data-sku="${row.sku}" aria-label="Decrease stock for ${row.productName} ${row.variantName}">−</button>
          <input type="number" class="admin-stock-input inv-stock-input" data-sku="${row.sku}" value="${row.stock}" min="0" aria-label="Set stock for ${row.productName} ${row.variantName}">
          <button type="button" class="admin-stock-step-btn inv-stock-plus" data-sku="${row.sku}" aria-label="Increase stock for ${row.productName} ${row.variantName}">+</button>
        </div>
        <button type="button" class="btn-admin btn-admin-primary inv-stock-save" data-sku="${row.sku}" style="width: 100%; margin-top: 10px;">
          Save Stock Level
        </button>
      </div>
    `;
  }

  bindInventoryEvents() {
    this.bindSidebarNavEvents();

    document.querySelector('#admin-logout-btn')?.addEventListener('click', () => {
      adminService.logoutAdmin();
      this.render();
    });

    document.querySelectorAll('.admin-queue-tab[data-availability]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.inventoryAvailabilityFilter = e.currentTarget.dataset.availability;
        this.render();
      });
    });

    const searchInput = document.querySelector('#admin-inventory-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.inventorySearchQuery = e.target.value;
      this.renderInventoryView(adminService.getCurrentAdmin());
      // Preserve focus/cursor across re-render for a smooth typing experience.
      const refocused = document.querySelector('#admin-inventory-search-input');
      if (refocused) {
        refocused.focus();
        refocused.setSelectionRange(refocused.value.length, refocused.value.length);
      }
    });

    // Quick +/- stepper buttons — adjust the visible number input, saved on "Save".
    document.querySelectorAll('.inv-stock-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.querySelector(`.inv-stock-input[data-sku="${btn.dataset.sku}"]`);
        if (input) input.value = Math.max(0, (parseInt(input.value, 10) || 0) - 1);
      });
    });
    document.querySelectorAll('.inv-stock-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.querySelector(`.inv-stock-input[data-sku="${btn.dataset.sku}"]`);
        if (input) input.value = (parseInt(input.value, 10) || 0) + 1;
      });
    });

    // Explicit Save action — stock is only written to the live ledger on demand.
    document.querySelectorAll('.inv-stock-save').forEach(btn => {
      btn.addEventListener('click', () => {
        const sku = btn.dataset.sku;
        const input = document.querySelector(`.inv-stock-input[data-sku="${sku}"]`);
        const newStock = Math.max(0, parseInt(input?.value, 10) || 0);
        inventoryService.setSkuStock(sku, newStock);
        this.render();
      });
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
        this.render();
      });
    });

    // Search input
    const searchInput = document.querySelector('#admin-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderDashboard(adminService.getCurrentAdmin());
    });

    // Filter selects
    document.querySelector('#admin-filter-order-status')?.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.render();
    });

    document.querySelector('#admin-filter-payment-status')?.addEventListener('change', (e) => {
      this.paymentFilter = e.target.value;
      this.render();
    });

    // Reset filters
    document.querySelector('#admin-reset-filters-btn')?.addEventListener('click', () => {
      this.currentQueue = 'all';
      this.statusFilter = 'all';
      this.paymentFilter = 'all';
      this.searchQuery = '';
      this.render();
    });

    // Inspect buttons
    document.querySelectorAll('.inspect-order-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const orderId = e.currentTarget.dataset.orderId;
        this.openOrderModal(orderId);
      });
    });
  }

  openOrderModal(orderId) {
    const order = OrderStore.getOrder(orderId);
    if (!order) return;

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

    return `
      <div class="admin-modal-header">
        <div>
          <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--admin-text-muted);">Order Details</span>
          <h3 id="modal-order-number" style="margin: 2px 0 0 0; font-size: 1.25rem; font-family: var(--font-serif, Georgia, serif);">
            ${order.orderNumber || order.id}
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
              ${order.customer?.fullName || order.customerName || 'N/A'}
            </div>
            <div class="admin-detail-item">
              <strong>Email Address</strong>
              <a href="mailto:${order.customer?.email || ''}" style="color: var(--admin-brand-brown); text-decoration: underline;">
                ${order.customer?.email || order.customerEmail || 'N/A'}
              </a>
            </div>
            <div class="admin-detail-item">
              <strong>Phone / WhatsApp</strong>
              ${order.customer?.phone || order.customerPhone || 'N/A'}
            </div>
            <div class="admin-detail-item">
              <strong>Customer ID</strong>
              ${order.customerId || 'None (Guest)'}
            </div>
          </div>
        </div>

        <!-- 2. Delivery Information -->
        <div class="admin-detail-section">
          <div class="admin-detail-title">
            <span>Delivery Destination</span>
            <span class="admin-badge badge-country">${order.delivery?.country || 'Nigeria'}</span>
          </div>
          <div class="admin-detail-grid">
            <div class="admin-detail-item">
              <strong>Country</strong>
              ${order.delivery?.country || 'Nigeria'}
            </div>
            <div class="admin-detail-item">
              <strong>State / Region</strong>
              ${order.delivery?.state || 'N/A'}
            </div>
            <div class="admin-detail-item">
              <strong>City / Local Area</strong>
              ${order.delivery?.city || 'N/A'}
            </div>
            ${order.delivery?.postalCode ? `
              <div class="admin-detail-item">
                <strong>Postal / ZIP Code</strong>
                ${order.delivery.postalCode}
              </div>
            ` : ''}
          </div>
          <div style="margin-top: 10px; font-size: 0.8125rem;">
            <strong style="display: block; font-size: 0.6875rem; text-transform: uppercase; color: var(--admin-text-muted); margin-bottom: 2px;">Full Street Address</strong>
            ${order.delivery?.streetAddress || order.delivery?.address || 'N/A'}
          </div>
          ${order.delivery?.deliveryInstructions ? `
            <div style="margin-top: 10px; font-size: 0.8125rem; background: #FAF7F2; padding: 10px; border-radius: 4px; border-left: 3px solid var(--admin-brand-brown);">
              <strong style="display: block; font-size: 0.6875rem; text-transform: uppercase; color: var(--admin-text-muted); margin-bottom: 2px;">Special Delivery Instructions</strong>
              ${order.delivery.deliveryInstructions}
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
                    <div style="font-weight: 600;">${item.productName}</div>
                    <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${item.variantName || ''} ${item.sku ? `(${item.sku})` : ''}</div>
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
              <code>${order.paymentId || order.latestPaymentId || 'DEMO-PAY-REF'}</code>
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
                    <input type="text" id="ng-quote-provider" class="admin-search-input" placeholder="e.g. GIG Logistics, DHL Nigeria, Local Courier" value="${order.shippingQuote?.provider || ''}" required style="height: 44px; padding-left: 12px;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Shipping Method</label>
                    <input type="text" id="ng-quote-method" class="admin-search-input" placeholder="e.g. Doorstep Delivery, Hub Pickup" value="${order.shippingQuote?.method || 'Doorstep Delivery'}" required style="height: 44px; padding-left: 12px;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Shipping Cost (₦ NGN)</label>
                    <input type="number" id="ng-quote-amount" class="admin-search-input" placeholder="e.g. 3500" value="${order.shippingQuote?.amount || ''}" required min="1" style="height: 44px; padding-left: 12px;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Delivery Estimate (Optional)</label>
                    <input type="text" id="ng-quote-estimate" class="admin-search-input" placeholder="e.g. 2-4 business days" value="${order.shippingQuote?.estimatedDelivery || ''}" style="height: 44px; padding-left: 12px;">
                  </div>
                </div>
                <div style="margin-top: 12px;">
                  <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Notes</label>
                  <textarea id="ng-quote-notes" class="admin-search-input" style="height: 60px; padding: 8px 12px;" placeholder="Internal courier notes or delivery coordination details">${order.shippingQuote?.notes || ''}</textarea>
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
                  ${order.shippingQuote?.provider || 'N/A'}
                </div>
                <div class="admin-detail-item">
                  <strong>Shipping Method</strong>
                  ${order.shippingQuote?.method || 'N/A'}
                </div>
                <div class="admin-detail-item">
                  <strong>Shipping Fee</strong>
                  ${formatNaira(order.shippingQuote?.amount || 0)}
                </div>
                ${order.shippingQuote?.estimatedDelivery ? `
                  <div class="admin-detail-item">
                    <strong>Delivery Estimate</strong>
                    ${order.shippingQuote.estimatedDelivery}
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
                  <input type="text" id="intl-quote-estimate" class="admin-search-input" placeholder="e.g. 3-5 business days" value="${order.shippingQuote?.estimatedDelivery || ''}" style="height: 44px; padding-left: 12px;">
                </div>
              </div>

              <div style="margin-top: 12px;">
                <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Quote Notes</label>
                <textarea id="intl-quote-notes" class="admin-search-input" style="height: 60px; padding: 8px 12px;" placeholder="Carrier quote reference, volumetric weight details, or customer notes">${order.shippingQuote?.notes || ''}</textarea>
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
              <span class="admin-badge badge-paid">Shipped: ${order.tracking.trackingNumber}</span>
            ` : `
              <span class="admin-badge badge-pending">Not Dispatched</span>
            `}
          </div>
          ${order.tracking?.trackingNumber ? `
            <div class="admin-detail-grid">
              <div class="admin-detail-item">
                <strong>Carrier</strong>
                ${order.tracking.carrier}
              </div>
              <div class="admin-detail-item">
                <strong>Tracking Number</strong>
                <code>${order.tracking.trackingNumber}</code>
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
                  ${validNextStatuses.length === 0 ? `
                    <option value="">No valid next transitions (Terminal state)</option>
                  ` : `
                    <option value="">Select next transition...</option>
                    ${validNextStatuses.map(s => `
                      <option value="${s}">${s.replace(/_/g, ' ')}</option>
                    `).join('')}
                  `}
                </select>
              </div>
              <div style="flex: 1; min-width: 200px;">
                <label style="display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Transition Audit Note</label>
                <input type="text" id="admin-transition-note" class="admin-search-input" placeholder="e.g. Formulations packed for courier dispatch" style="height: 44px; padding-left: 12px;">
              </div>
              <button type="submit" id="btn-execute-transition" class="btn-admin btn-admin-primary" ${validNextStatuses.length === 0 ? 'disabled' : ''}>
                Update Status
              </button>
            </div>
          </form>

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
                    <strong>${n.author || 'Admin'}</strong>
                    <span>${new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <div>${n.text}</div>
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
