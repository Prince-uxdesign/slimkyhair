/**
 * Shared Customer Account Shell Controller - Slimky Hair
 * Milestone C19.1: Account Architecture & Responsive Foundation
 */

import { customerService, CUSTOMER_STATUSES } from './auth/customer-service.js';
import { initNavigation } from './navigation.js';
import { initDrawers } from './drawers.js';
import { syncWishlistUI } from './wishlist-store.js';
import { escapeHtml } from './utils/html-format.js';

export function getAccountRoutes(root = '') {
  return [
    {
      id: 'overview',
      label: 'Overview',
      href: `${root}account/`,
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`
    },
    {
      id: 'orders',
      label: 'Order History',
      href: `${root}account/orders/`,
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`
    },
    {
      id: 'addresses',
      label: 'Saved Addresses',
      href: `${root}account/addresses/`,
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`
    },
    {
      id: 'wishlist',
      label: 'Wishlist',
      href: `${root}account/wishlist/`,
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`
    },
    {
      id: 'profile',
      label: 'Personal Profile',
      href: `${root}account/profile/`,
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
    },
    {
      id: 'settings',
      label: 'Preferences & Security',
      href: `${root}account/settings/`,
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
    }
  ];
}

/**
 * Render standard desktop sidebar and mobile navigation pills.
 * @param {Object} options
 * @param {string} options.activeNav Active tab id
 * @param {string} options.rootPrefix Relative path to site root
 */
export function initAccountShell(options = {}) {
  const activeNav = options.activeNav || 'overview';
  const root = options.rootPrefix !== undefined ? options.rootPrefix : '../';
  const authRequired = options.authRequired !== undefined ? !!options.authRequired : true;
  const routes = getAccountRoutes(root);

  let customer = customerService.getCurrentCustomer();

  // Protected Route Guard
  if (authRequired && !customer) {
    if (typeof window !== 'undefined' && window.location) {
      const currentPath = window.location.pathname + window.location.search;
      const redirectParam = encodeURIComponent(currentPath);
      window.location.href = `${root}account/login/?redirect=${redirectParam}`;
    }
    return;
  }

  if (!customer) {
    customer = {
      fullName: 'Valued Client',
      email: '',
      status: CUSTOMER_STATUSES.ACTIVE
    };
  }

  const statusLabel = (customer.status || 'active').replace(/_/g, ' ');
  const statusClass = `status-${customer.status || 'active'}`;
  // Escape user-controlled profile fields before innerHTML interpolation (stored-XSS guard).
  const safeName = escapeHtml(customer.fullName || 'Valued Client');
  const safeEmail = escapeHtml(customer.email || '');
  const initialLetter = (customer.fullName ? customer.fullName.charAt(0).toUpperCase() : 'C').replace(/[<>&"']/g, 'C');

  // Render Sidebar in #account-sidebar-mount if present
  const sidebarMount = document.querySelector('#account-sidebar-mount');
  if (sidebarMount) {
    sidebarMount.innerHTML = `
      <aside class="account-sidebar" aria-label="Customer Account Navigation">
        <div class="account-sidebar-profile">
          <div class="account-sidebar-avatar" aria-hidden="true">${initialLetter}</div>
          <div class="account-sidebar-info">
            <span class="account-sidebar-eyebrow">Client Portal</span>
            <div class="account-sidebar-name">${safeName}</div>
            <div class="account-sidebar-email" title="${safeEmail}">${safeEmail}</div>
            <span class="account-status-badge ${statusClass}">● ${statusLabel}</span>
          </div>
        </div>

        <nav class="account-sidebar-nav" aria-label="Account Navigation">
          <ul class="account-nav" role="list">
            ${routes.map(r => `
              <li class="account-nav-item">
                <a href="${r.href}" class="account-nav-link ${r.id === activeNav ? 'active' : ''}" ${r.id === activeNav ? 'aria-current="page"' : ''}>
                  <span class="account-nav-link-icon" aria-hidden="true">${r.icon}</span>
                  <span class="account-nav-link-text">${r.label}</span>
                </a>
              </li>
            `).join('')}
          </ul>

          <div class="account-nav-signout">
            <button type="button" id="shell-signout-btn" class="account-signout-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </nav>
      </aside>
    `;
  }

  // Render Mobile Pill Nav in #account-mobile-nav-mount if present
  const mobileNavMount = document.querySelector('#account-mobile-nav-mount');
  if (mobileNavMount) {
    mobileNavMount.innerHTML = `
      <div class="account-mobile-identity">
        <div class="account-mobile-identity-left">
          <div class="account-mobile-avatar" aria-hidden="true">${initialLetter}</div>
          <div class="account-mobile-info">
            <div class="account-mobile-name">${safeName}</div>
            <span class="account-status-badge ${statusClass}">● ${statusLabel}</span>
          </div>
        </div>
        <button type="button" class="account-mobile-signout-btn" aria-label="Sign Out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Sign Out</span>
        </button>
      </div>

      <nav class="account-mobile-nav" aria-label="Account Sections Navigation">
        ${routes.map(r => `
          <a href="${r.href}" class="account-mobile-pill ${r.id === activeNav ? 'active' : ''}" ${r.id === activeNav ? 'aria-current="page"' : ''}>
            <span class="account-mobile-pill-icon" aria-hidden="true">${r.icon}</span>
            <span>${r.label}</span>
          </a>
        `).join('')}
      </nav>
    `;
  }

  // Bind signout
  document.querySelectorAll('#shell-signout-btn, #account-logout-btn, .account-signout-btn, .account-mobile-signout-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await customerService.logoutCustomer();
      window.location.href = `${root}account/login/`;
    });
  });

  // Global listeners
  initNavigation();
  initDrawers();
  syncWishlistUI();
}
