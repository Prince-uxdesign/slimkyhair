/**
 * Checkout Page Controller - Slimky Hair (C6 / C7)
 * 
 * Implements C7: Nigeria Checkout Flow
 * Flow: Cart ↓ Checkout ↓ Contact information ↓ Nigeria delivery information ↓ Order summary ↓ Product payment handoff ↓ Payment verification later ↓ Order confirmation ↓ Shipping fee calculated separately
 * 
 * Rules & Constraints:
 * - Do NOT calculate shipping automatically; shipping fee is calculated separately.
 * - The product total is what the customer will pay through the product payment flow.
 * - After payment: Slimky contacts the customer with the delivery fee.
 * - Do NOT fake successful payment.
 * - Do NOT mark an order as paid from the frontend.
 * - Do NOT add invented shipping amounts, coupons, or fake order confirmations.
 * - Clean handoff ready for upcoming C10+ payment gateway integration.
 */

import {
  getCart,
  getCartSubtotal,
  getCartCount,
  getCartRootPath,
  resolveCartImagePath,
  formatNaira,
  validateCart,
  applyCartValidation
} from './cart-store.js';

import {
  validateCustomerInfo,
  validateDeliveryAddress,
  validateOrderTotal,
  validateCartItems,
  validateFullCheckout,
  isValidPhone
} from './checkout-validator.js';

import {
  calculateOrderPricing,
  OrderSummaryComponent
} from './components/order-summary.js';

import { initNavigation } from './navigation.js';
import { initDrawers } from './drawers.js';
import { syncWishlistUI } from './wishlist-store.js';

import { paymentService } from './payment/payment-service.js';
import { DemoPaymentUI } from './payment/demo-payment-ui.js';
import { PAYMENT_STATUS, PAYMENT_LIFECYCLE_STATES, ORDER_STATUS } from './payment/payment-model.js';
import { OrderStore } from './payment/order-store.js';
import { webhookService } from './payment/webhook-service.js';
import { customerService } from './auth/customer-service.js';
import { GuestConversionCard } from './auth/guest-conversion-component.js';
import { renderCheckoutCurrencyIndicatorHTML, getApproximateForeignCurrencies } from './utils/currency-converter.js';

if (typeof window !== 'undefined') {
  window.paymentService = paymentService;
  window.webhookService = webhookService;
  window.OrderStore = OrderStore;
  window.customerService = customerService;
  window.validateCustomerInfo = validateCustomerInfo;
  window.validateDeliveryAddress = validateDeliveryAddress;
  window.validateOrderTotal = validateOrderTotal;
  window.validateFullCheckout = validateFullCheckout;
  window.isValidPhone = isValidPhone;
}

export const CHECKOUT_SESSION_KEY = 'slimky_checkout_session';

export const FORM_STATES = {
  INITIAL: 'INITIAL',
  EDITING: 'EDITING',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SUBMITTING: 'SUBMITTING',
  READY_FOR_PAYMENT: 'READY_FOR_PAYMENT',
  PAID: 'PAID',
  SERVER_ERROR: 'SERVER_ERROR'
};

export const DEMO_CUSTOMER_DATA = {
  fullName: 'Ada Test Customer',
  email: 'ada.test@example.com',
  phone: '+234 800 000 0000',
  country: 'Nigeria',
  state: 'Lagos',
  city: 'Ikeja',
  address: '12 Demo Street, Ikeja',
  postalCode: '',
  instructions: 'Please call on arrival at the security gate.'
};

export const DEMO_INTL_US_DATA = {
  fullName: 'Emma Test Customer',
  email: 'emma.test@example.com',
  phone: '+1 202 555 0100',
  country: 'United States',
  state: 'New York',
  city: 'New York',
  postalCode: '10001',
  address: '100 Demo Avenue',
  instructions: 'Leave package with building doorman or concierge.'
};

export const DEMO_INTL_UK_DATA = {
  fullName: 'Oliver Test Customer',
  email: 'oliver.test@example.com',
  phone: '+44 20 7946 0192',
  country: 'United Kingdom',
  state: 'Greater London',
  city: 'London',
  postalCode: 'W1B 3AG',
  address: '100 Demo Regent Street',
  instructions: 'Ring flat bell #4B or leave at reception.'
};

export class CheckoutPage {
  constructor(options = {}) {
    this.root = options.rootPrefix !== undefined ? options.rootPrefix : getCartRootPath();
    this.state = FORM_STATES.INITIAL;
    this.submitting = false;

    // Containers
    this.emptyContainer = document.querySelector('#checkout-empty-state');
    this.layoutContainer = document.querySelector('#checkout-layout');
    this.successView = document.querySelector('#checkout-success-view');

    // Order Summary Elements
    this.summaryToggle = document.querySelector('#checkout-summary-toggle');
    this.summaryContent = document.querySelector('#checkout-summary-content');
    this.summaryCountEl = document.querySelector('#checkout-summary-count');
    this.summaryMobileTotalEl = document.querySelector('#checkout-summary-mobile-total');
    this.itemsListEl = document.querySelector('#checkout-items-list');
    this.subtotalEl = document.querySelector('#checkout-subtotal');
    this.shippingStatusEl = document.querySelector('#checkout-shipping-status');
    this.shippingNoteEl = document.querySelector('#checkout-shipping-note');
    this.totalLabelEl = document.querySelector('#checkout-total-label');
    this.totalEl = document.querySelector('#checkout-total');
    this.currencyIndicatorEl = document.querySelector('#checkout-currency-indicator');

    // Form & Flow Selection
    this.form = document.querySelector('#checkout-form');
    this.countrySelect = document.querySelector('#checkout-country');
    this.nigeriaFields = document.querySelector('#checkout-delivery-nigeria');
    this.internationalFields = document.querySelector('#checkout-delivery-intl');

    // Contact Inputs
    this.fullNameInput = document.querySelector('#checkout-fullname');
    this.emailInput = document.querySelector('#checkout-email');
    this.phoneInput = document.querySelector('#checkout-phone');
    
    // Nigeria Address Inputs
    this.ngStateInput = document.querySelector('#checkout-ng-state');
    this.ngCityInput = document.querySelector('#checkout-ng-city');
    this.ngAddressInput = document.querySelector('#checkout-ng-address');
    this.ngInstructionsInput = document.querySelector('#checkout-ng-instructions');

    // International Address Inputs
    this.intlStateInput = document.querySelector('#checkout-intl-state');
    this.intlCityInput = document.querySelector('#checkout-intl-city');
    this.intlPostalInput = document.querySelector('#checkout-intl-postal');
    this.intlAddressInput = document.querySelector('#checkout-intl-address');
    this.intlInstructionsInput = document.querySelector('#checkout-intl-instructions');

    // Actions & Feedback
    this.submitBtn = document.querySelector('#checkout-submit-btn');
    this.feedbackBanner = document.querySelector('#checkout-feedback-banner');
    this.prefillBtn = document.querySelector('#checkout-prefill-demo-btn');
    this.prefillUsBtn = document.querySelector('#checkout-prefill-intl-btn');
    this.prefillUkBtn = document.querySelector('#checkout-prefill-uk-btn');

    // Auth Status, Guest Banner & Saved Addresses Elements (Milestone C20.1)
    this.guestStatusEl = document.querySelector('#checkout-guest-status');
    this.authBannerEl = document.querySelector('#checkout-auth-banner');
    this.savedAddressesWrapper = document.querySelector('#checkout-saved-addresses-wrapper');
    this.savedAddressesList = document.querySelector('#checkout-saved-addresses-list');
    this.toggleNewAddressBtn = document.querySelector('#btn-toggle-new-address');
    this.saveAddressGroup = document.querySelector('#checkout-save-address-group');
    this.saveAddressCheck = document.querySelector('#checkout-save-address-check');
    this.saveContactGroup = document.querySelector('#checkout-save-contact-group');
    this.saveContactCheck = document.querySelector('#checkout-save-contact-check');
    this.deliveryFieldsWrapper = document.querySelector('#checkout-delivery-fields-wrapper');
    this.selectedSavedAddressId = null;
    this.isEnteringNewAddress = false;

    // Simulation / testing harness properties
    this.simulatedScenario = null;
    this.simulatedError = null;

    // Local Demo Payment Gateway (C10/C11 / C20.5 / C20.6)
    this.demoPaymentUI = new DemoPaymentUI({
      onSuccess: (result) => this.handlePaymentSuccess(result),
      onDeclined: (result) => this.handlePaymentDeclined(result),
      onFailure: (result) => this.handlePaymentFailure(result),
      onCancel: () => this.handlePaymentCancel(),
      onRetry: (result) => this.handlePaymentRetry(result)
    });

    this.init();
  }

  init() {
    this.render();

    // Re-render reactively upon cart changes (item removed, quantity changed)
    window.addEventListener('slimky:cart:updated', () => {
      this.render();
    });

    window.addEventListener('storage', (e) => {
      if (e.key === 'slimky_hair_cart') {
        this.render();
      }
    });

    this.bindEvents();
    this.initStickyCTA();
    this.exposeDevHelpers();
    this.recoverAuthoritativePaymentOnBoot();
  }

  exposeDevHelpers() {
    if (typeof window !== 'undefined') {
      window.__slimkyCheckoutDev = {
        page: this,
        paymentService,
        createOrder: (payload, opts) => paymentService.createOrder(payload, opts),
        demoPaymentUI: this.demoPaymentUI,
        orderStore: OrderStore,
        lifecycleStates: PAYMENT_LIFECYCLE_STATES,
        recoverPaymentBoot: () => this.recoverAuthoritativePaymentOnBoot(),
        getPricing: (items, isNigeria) => calculateOrderPricing(items, { isNigeria }),
        validateCart: (scenario) => validateCart(getCart(), { scenario }),
        prefillNigeria: () => this.prefillDemoData(),
        prefillUS: () => this.prefillInternationalDemoData(DEMO_INTL_US_DATA),
        prefillUK: () => this.prefillInternationalDemoData(DEMO_INTL_UK_DATA),
        customerService,
        syncCustomerAuthStatus: () => this.syncCustomerAuthStatus(),
        selectSavedAddress: (addressId) => {
          const customer = customerService.getCurrentCustomer();
          if (customer) this.selectSavedAddress(customer, addressId);
        },
        switchToNewAddressMode: () => this.switchToNewAddressMode(),
        triggerValidation: () => this.validateForm(),
        launchDemoPay: async () => {
          const sessionKey = localStorage.getItem(CHECKOUT_SESSION_KEY);
          if (sessionKey) {
            const session = JSON.parse(sessionKey);
            const initResult = await paymentService.initializePaymentSession(session);
            this.demoPaymentUI.open(initResult);
            return initResult;
          }
        },
        setSimulatedScenario: (scenario) => {
          this.simulatedScenario = scenario;
          this.render();
        },
        setSimulatedError: (errType) => {
          this.simulatedError = errType;
        },
        clearSimulation: () => {
          this.simulatedScenario = null;
          this.simulatedError = null;
          this.render();
        }
      };
    }
  }

  bindEvents() {
    // Country change
    this.countrySelect?.addEventListener('change', () => {
      this.handleCountryChange();
      this.clearFieldError('country');
      this.updateState(FORM_STATES.EDITING);
      this.render();
    });

    // Mobile collapsible summary toggle
    this.summaryToggle?.addEventListener('click', () => {
      this.toggleMobileSummary();
    });

    // Form submit
    this.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Direct submit button click
    this.submitBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Prefill demo customer buttons (Nigeria, US, UK)
    this.prefillBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.prefillDemoData();
    });

    this.prefillUsBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.prefillInternationalDemoData(DEMO_INTL_US_DATA);
    });

    this.prefillUkBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.prefillInternationalDemoData(DEMO_INTL_UK_DATA);
    });

    // Real-time input validation error clearance
    const allInputs = [
      this.fullNameInput,
      this.emailInput,
      this.phoneInput,
      this.countrySelect,
      this.ngStateInput,
      this.ngCityInput,
      this.ngAddressInput,
      this.intlStateInput,
      this.intlCityInput,
      this.intlPostalInput,
      this.intlAddressInput
    ].filter(Boolean);

    allInputs.forEach(input => {
      input.addEventListener('input', () => {
        this.updateState(FORM_STATES.EDITING);
        const fieldName = input.getAttribute('data-field-name') || input.name || input.id.replace('checkout-', '');
        this.clearFieldError(fieldName);
      });
      input.addEventListener('change', () => {
        this.updateState(FORM_STATES.EDITING);
        const fieldName = input.getAttribute('data-field-name') || input.name || input.id.replace('checkout-', '');
        this.clearFieldError(fieldName);
      });
    });

    // Reactive listener to auth changes (login, logout, switch account)
    if (typeof customerService?.onAuthStateChange === 'function') {
      customerService.onAuthStateChange(() => {
        this.syncCustomerAuthStatus();
      });
    }

    this.syncCustomerAuthStatus();
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

  syncCustomerAuthStatus() {
    const customer = customerService.getCurrentCustomer();
    const statusBadge = this.guestStatusEl || document.querySelector('#checkout-guest-status');
    const authBanner = this.authBannerEl || document.querySelector('#checkout-auth-banner');

    if (customer) {
      // 1. Signed-in Customer Checkout Experience
      if (statusBadge) {
        statusBadge.innerHTML = `<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: var(--color-sage-muted);"></span> Signed in as ${this.escapeHtml(customer.fullName)} · Linked to Account`;
      }

      if (authBanner) {
        const initials = (customer.fullName || 'Customer')
          .split(' ')
          .filter(Boolean)
          .map(n => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'C';

        authBanner.innerHTML = `
          <div class="checkout-auth-box checkout-auth-customer">
            <div class="checkout-auth-header-row">
              <div class="checkout-auth-badge is-customer">
                <span class="checkout-auth-dot is-customer"></span>
                <span>Signed-in Customer Checkout</span>
              </div>
              <button type="button" id="btn-checkout-switch-account" class="checkout-auth-switch-link">
                Switch Account / Sign Out
              </button>
            </div>
            <div class="checkout-auth-customer-details">
              <div class="checkout-auth-avatar" aria-hidden="true">${initials}</div>
              <div class="checkout-auth-customer-text">
                <div class="checkout-auth-customer-name">${this.escapeHtml(customer.fullName)}</div>
                <div class="checkout-auth-customer-email">${this.escapeHtml(customer.email)}</div>
              </div>
            </div>
          </div>
        `;

        const switchBtn = authBanner.querySelector('#btn-checkout-switch-account');
        if (switchBtn) {
          switchBtn.addEventListener('click', () => {
            customerService.logoutCustomer();
            this.syncCustomerAuthStatus();
          });
        }
      }

      // Milestone C20.2: Prefill contact information for signed-in customer if fields are currently empty
      if (this.fullNameInput && !this.fullNameInput.value) this.fullNameInput.value = customer.fullName || '';
      if (this.emailInput && !this.emailInput.value) this.emailInput.value = customer.email || '';
      if (this.phoneInput && !this.phoneInput.value && customer.phone) this.phoneInput.value = customer.phone;

      // Milestone C20.2: Display explicit "Save changes to my account profile" checkbox for signed-in customer
      if (this.saveContactGroup) {
        this.saveContactGroup.style.display = 'block';
      }

      // Render Saved Addresses for signed-in customer
      this.renderSavedAddresses(customer);

    } else {
      // 2. Guest Checkout Experience (Low friction, no account required)
      if (statusBadge) {
        statusBadge.innerHTML = `<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: var(--color-sage-muted);"></span> Guest Checkout · No Account Required`;
      }

      if (authBanner) {
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : 'checkout/';
        const loginUrl = `${this.root}account/login/?redirect=${encodeURIComponent(currentPath)}`;

        authBanner.innerHTML = `
          <div class="checkout-auth-box checkout-auth-guest">
            <div class="checkout-auth-header-row">
              <div class="checkout-auth-badge">
                <span class="checkout-auth-dot"></span>
                <span>Guest Checkout</span>
              </div>
              <div class="checkout-auth-tagline">Fast &amp; Direct · No Account Required</div>
            </div>
            <p class="checkout-auth-message">
              You are completing this purchase as a guest. You can continue directly below without creating an account, or sign in to access your saved profile and addresses.
            </p>
            <div class="checkout-auth-button-group">
              <button type="button" id="btn-continue-as-guest" class="checkout-btn-guest-action is-primary">
                Continue as Guest
              </button>
              <a href="${loginUrl}" id="btn-checkout-login-link" class="checkout-btn-guest-action is-secondary">
                Sign In
              </a>
            </div>
          </div>
        `;

        const continueBtn = authBanner.querySelector('#btn-continue-as-guest');
        if (continueBtn) {
          continueBtn.addEventListener('click', () => {
            if (this.fullNameInput) {
              this.fullNameInput.focus();
              this.fullNameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
        }
      }

      // Hide saved addresses and save checkboxes for guests
      if (this.savedAddressesWrapper) {
        this.savedAddressesWrapper.style.display = 'none';
      }
      if (this.saveAddressGroup) {
        this.saveAddressGroup.style.display = 'none';
      }
      if (this.saveAddressCheck) {
        this.saveAddressCheck.checked = false;
      }
      if (this.saveContactGroup) {
        this.saveContactGroup.style.display = 'none';
      }
      if (this.saveContactCheck) {
        this.saveContactCheck.checked = false;
      }
      this.selectedSavedAddressId = null;
      this.isEnteringNewAddress = false;
    }
  }

  renderSavedAddresses(customer) {
    if (!this.savedAddressesWrapper || !this.savedAddressesList) return;

    const addresses = customerService.getAddresses(customer.id) || [];

    if (addresses.length === 0) {
      // Customer has no saved addresses
      this.savedAddressesWrapper.style.display = 'none';
      if (this.saveAddressGroup) {
        this.saveAddressGroup.style.display = 'block';
      }
      this.selectedSavedAddressId = null;
      this.isEnteringNewAddress = true;
      return;
    }

    // Customer has saved addresses
    this.savedAddressesWrapper.style.display = 'block';

    // Milestone C20.3: Preselect default address if customer has one; if not, do NOT invent one!
    let targetAddress = null;
    if (this.selectedSavedAddressId) {
      targetAddress = customerService.getAddress(this.selectedSavedAddressId, customer.id);
    }
    if (!targetAddress && !this.isEnteringNewAddress) {
      const defaultAddr = addresses.find(a => a.isDefault);
      if (defaultAddr) {
        targetAddress = defaultAddr;
        this.selectedSavedAddressId = defaultAddr.id;
      } else {
        targetAddress = null;
        this.selectedSavedAddressId = null;
      }
    }

    const cardsHtml = addresses.map(addr => {
      const isSelected = !this.isEnteringNewAddress && (addr.id === this.selectedSavedAddressId);
      return `
        <div 
          class="checkout-address-card ${isSelected ? 'is-selected' : ''}" 
          data-address-id="${addr.id}"
          role="radio"
          aria-checked="${isSelected ? 'true' : 'false'}"
          tabindex="0"
          aria-label="${this.escapeHtml(addr.label || 'Address')}: ${this.escapeHtml(addr.streetAddress)}, ${this.escapeHtml(addr.city)}"
        >
          <div class="checkout-address-card-head">
            <div class="checkout-address-card-radio" aria-hidden="true">
              <span class="checkout-address-radio-indicator"></span>
            </div>
            <span class="checkout-address-label-badge">${this.escapeHtml(addr.label || 'Home')}</span>
            ${addr.isDefault ? '<span class="checkout-address-default-badge">Default</span>' : ''}
          </div>
          <div class="checkout-address-card-body">
            <div class="checkout-address-card-name">${this.escapeHtml(addr.recipientName || customer.fullName)}</div>
            ${addr.phone ? `<div class="checkout-address-card-phone">📞 ${this.escapeHtml(addr.phone)}</div>` : ''}
            <div class="checkout-address-card-street">${this.escapeHtml(addr.streetAddress)}</div>
            <div class="checkout-address-card-location">${this.escapeHtml(addr.city)}, ${this.escapeHtml(addr.state)}${addr.postalCode ? ' ' + this.escapeHtml(addr.postalCode) : ''}</div>
            <div class="checkout-address-card-country">${this.escapeHtml(addr.country || 'Nigeria')}</div>
          </div>
        </div>
      `;
    }).join('');

    this.savedAddressesList.innerHTML = cardsHtml;

    // Attach click and keyboard listeners to each card (large tap target)
    const cards = this.savedAddressesList.querySelectorAll('.checkout-address-card');
    cards.forEach(card => {
      const selectCard = () => {
        const addressId = card.getAttribute('data-address-id');
        this.selectSavedAddress(customer, addressId);
      };
      card.addEventListener('click', selectCard);
      card.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          selectCard();
        }
      });
    });

    // Wire "+ Use a different address" button
    if (this.toggleNewAddressBtn) {
      this.toggleNewAddressBtn.onclick = () => {
        this.switchToNewAddressMode();
      };
      this.toggleNewAddressBtn.textContent = this.isEnteringNewAddress 
        ? '← Use a saved address' 
        : '+ Use a different address';
    }

    if (targetAddress && !this.isEnteringNewAddress) {
      this.applyAddressToForm(targetAddress);
      if (this.saveAddressGroup) this.saveAddressGroup.style.display = 'none';
    } else if (this.isEnteringNewAddress) {
      if (this.saveAddressGroup) this.saveAddressGroup.style.display = 'block';
    } else {
      // No address selected yet and not entering new address
      if (this.saveAddressGroup) this.saveAddressGroup.style.display = 'none';
    }
  }

  selectSavedAddress(customer, addressId) {
    if (!customer || !customer.id) return;
    
    // Security check: Verify that the selected address strictly belongs to this authenticated customer
    const addr = customerService.getAddress(addressId, customer.id);
    if (!addr) {
      console.warn('[Security Alert] Selected address ID does not belong to authenticated customer:', addressId);
      this.selectedSavedAddressId = null;
      return;
    }

    this.selectedSavedAddressId = addr.id;
    this.isEnteringNewAddress = false;

    // Update radio cards visual and aria attributes
    const cards = this.savedAddressesList?.querySelectorAll('.checkout-address-card');
    cards?.forEach(c => {
      const isThis = c.getAttribute('data-address-id') === addressId;
      c.classList.toggle('is-selected', isThis);
      c.setAttribute('aria-checked', isThis ? 'true' : 'false');
    });

    if (this.toggleNewAddressBtn) {
      this.toggleNewAddressBtn.textContent = '+ Use a different address';
    }

    if (this.saveAddressGroup) {
      this.saveAddressGroup.style.display = 'none';
    }

    this.applyAddressToForm(addr);
  }

  switchToNewAddressMode() {
    this.isEnteringNewAddress = !this.isEnteringNewAddress;
    const customer = customerService.getCurrentCustomer();
    if (!customer) return;

    if (this.isEnteringNewAddress) {
      // Clear card selection
      this.selectedSavedAddressId = null;
      const cards = this.savedAddressesList?.querySelectorAll('.checkout-address-card');
      cards?.forEach(c => {
        c.classList.remove('is-selected');
        c.setAttribute('aria-checked', 'false');
      });

      // Clear delivery fields
      if (this.countrySelect) {
        this.countrySelect.value = 'Nigeria';
        this.handleCountryChange();
      }
      if (this.ngStateInput) this.ngStateInput.value = '';
      if (this.ngCityInput) this.ngCityInput.value = '';
      if (this.ngAddressInput) this.ngAddressInput.value = '';
      if (this.ngInstructionsInput) this.ngInstructionsInput.value = '';
      if (this.intlStateInput) this.intlStateInput.value = '';
      if (this.intlCityInput) this.intlCityInput.value = '';
      if (this.intlPostalInput) this.intlPostalInput.value = '';
      if (this.intlAddressInput) this.intlAddressInput.value = '';
      if (this.intlInstructionsInput) this.intlInstructionsInput.value = '';

      if (this.saveAddressGroup) {
        this.saveAddressGroup.style.display = 'block';
      }
      if (this.toggleNewAddressBtn) {
        this.toggleNewAddressBtn.textContent = '← Use a saved address';
      }
      if (this.countrySelect) {
        this.countrySelect.focus();
      }
    } else {
      // Return to saved address
      this.renderSavedAddresses(customer);
    }
  }

  applyAddressToForm(addr) {
    if (!addr) return;
    const country = (addr.country || 'Nigeria').trim();
    const isNigeria = country.toLowerCase() === 'nigeria';

    if (this.countrySelect) {
      // Find matching option or fallback
      const hasOption = Array.from(this.countrySelect.options).some(o => o.value.toLowerCase() === country.toLowerCase());
      if (hasOption) {
        this.countrySelect.value = country;
      } else {
        this.countrySelect.value = isNigeria ? 'Nigeria' : 'Other';
      }
      this.handleCountryChange();
    }

    if (isNigeria) {
      if (this.ngStateInput) this.ngStateInput.value = addr.state || '';
      if (this.ngCityInput) this.ngCityInput.value = addr.city || '';
      if (this.ngAddressInput) this.ngAddressInput.value = addr.streetAddress || '';
      if (this.ngInstructionsInput) this.ngInstructionsInput.value = addr.deliveryInstructions || '';
    } else {
      if (this.intlStateInput) this.intlStateInput.value = addr.state || '';
      if (this.intlCityInput) this.intlCityInput.value = addr.city || '';
      if (this.intlPostalInput) this.intlPostalInput.value = addr.postalCode || '';
      if (this.intlAddressInput) this.intlAddressInput.value = addr.streetAddress || '';
      if (this.intlInstructionsInput) this.intlInstructionsInput.value = addr.deliveryInstructions || '';
    }

    if (addr.recipientName && this.fullNameInput && !this.fullNameInput.value) {
      this.fullNameInput.value = addr.recipientName;
    }
    if (addr.phone && this.phoneInput && !this.phoneInput.value) {
      this.phoneInput.value = addr.phone;
    }
  }

  updateState(newState) {
    this.state = newState;
    if (this.form) {
      this.form.setAttribute('data-form-state', newState);
    }
  }

  toggleMobileSummary() {
    if (!this.summaryContent || !this.summaryToggle) return;
    const isExpanded = this.summaryContent.classList.toggle('is-expanded');
    this.summaryToggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    const chevron = this.summaryToggle.querySelector('.checkout-summary-chevron');
    if (chevron) {
      chevron.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }

  /**
   * Mobile-only sticky checkout CTA (checkout page only, never site-wide).
   *
   * Design decisions:
   * - Mirrors the existing #checkout-submit-btn ("Verify Information &
   *   Proceed to Payment") via delegation — one action, two positions, so
   *   validation, cart stock gates, and total invariants stay in one place.
   *   The compact visible label is "Continue to Payment"; the accessible
   *   label carries the full action + live total.
   * - Activates only below 768px. Tablet/desktop keep the two-column layout
   *   where the primary CTA is reachable; a second CTA there would duplicate
   *   the action and risk covering fields or errors.
   * - Parks (hides) while the virtual keyboard is open, an overlay
   *   (DemoPay modal / drawer) is open, the footer is visible, or the cart
   *   is empty / the payment-handoff view is shown.
   */
  initStickyCTA() {
    const mobileQuery = window.matchMedia
      ? window.matchMedia('(max-width: 767px)')
      : { matches: window.innerWidth < 768, addEventListener: null };

    let stickyEl = document.querySelector('.checkout-sticky-cta');
    if (!stickyEl) {
      stickyEl = document.createElement('div');
      stickyEl.className = 'checkout-sticky-cta';
      stickyEl.setAttribute('aria-hidden', 'true');
      stickyEl.innerHTML = `
        <div class="checkout-sticky-cta-info">
          <span class="checkout-sticky-cta-label">Product Payment Total</span>
          <span class="checkout-sticky-cta-total" id="checkout-sticky-total">₦0</span>
        </div>
        <button type="button" class="checkout-sticky-cta-btn" id="checkout-sticky-submit" tabindex="-1">
          Continue to Payment
        </button>
      `;
      document.body.appendChild(stickyEl);
    }

    this.stickyEl = stickyEl;
    this.stickySubmitBtn = stickyEl.querySelector('#checkout-sticky-submit');
    this.stickyTotalEl = stickyEl.querySelector('#checkout-sticky-total');
    this.stickyState = { submitOutOfView: false, footerInView: false };

    this.stickySubmitBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      // Delegate to the existing primary action: validation, cart gates,
      // and submission locking all run through handleSubmit exactly once.
      this.submitBtn?.click();
    });

    const footerEl = document.querySelector('.site-footer');

    this.updateStickyVisibility = () => {
      if (!this.stickyEl) return;
      if (!mobileQuery.matches) {
        this.stickyEl.classList.remove('is-visible');
        return;
      }
      const layoutVisible = this.layoutContainer
        && this.layoutContainer.style.display !== 'none'
        && this.state !== FORM_STATES.READY_FOR_PAYMENT
        && this.state !== FORM_STATES.PAID;
      const cart = getCart();
      const hasItems = Array.isArray(cart) && cart.length > 0;
      const keyboardOpen = document.body.classList.contains('is-keyboard-open');
      const overlayOpen = document.body.classList.contains('has-overlay-open')
        || document.querySelector('.drawer.is-open, .drawer-backdrop.is-open, .demopay-modal-backdrop.is-open');
      const shouldShow = Boolean(layoutVisible && hasItems
        && this.stickyState.submitOutOfView
        && !this.stickyState.footerInView
        && !keyboardOpen && !overlayOpen);
      this.stickyEl.classList.toggle('is-visible', shouldShow);
      this.stickyEl.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
      if (this.stickySubmitBtn) this.stickySubmitBtn.tabIndex = shouldShow ? 0 : -1;
    };

    if (this.submitBtn && 'IntersectionObserver' in window) {
      const submitObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          this.stickyState.submitOutOfView = !entry.isIntersecting && entry.boundingClientRect.top > 0;
          this.updateStickyVisibility();
        });
      }, { threshold: 0 });
      submitObserver.observe(this.submitBtn);
    }

    if (footerEl && 'IntersectionObserver' in window) {
      const footerObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          this.stickyState.footerInView = entry.isIntersecting;
          this.updateStickyVisibility();
        });
      }, { threshold: 0.05 });
      footerObserver.observe(footerEl);
    }

    // Virtual keyboard: never cover focused fields or their errors.
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
        document.body.classList.add('is-keyboard-open');
        this.updateStickyVisibility();
      }
    });
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
          document.body.classList.remove('is-keyboard-open');
          this.updateStickyVisibility?.();
        }
      }, 100);
    });

    const overlayObserver = new MutationObserver(() => this.updateStickyVisibility());
    overlayObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', () => this.updateStickyVisibility());
    }
    window.addEventListener('resize', () => this.updateStickyVisibility(), { passive: true });
    window.addEventListener('scroll', () => this.updateStickyVisibility(), { passive: true });

    this.syncStickyCTA();
  }

  /**
   * Mirror the primary submit CTA into the sticky bar: live total, label,
   * and disabled state (e.g. blocked while bag notices are unresolved or
   * while submitting). Never invents its own action or total.
   */
  syncStickyCTA() {
    if (!this.stickyEl) return;
    const totalText = this.totalEl?.textContent?.trim() || '₦0';
    if (this.stickyTotalEl) this.stickyTotalEl.textContent = totalText;
    if (this.stickySubmitBtn && this.submitBtn) {
      this.stickySubmitBtn.disabled = this.submitBtn.disabled;
      const blocked = this.submitBtn.disabled;
      this.stickySubmitBtn.setAttribute(
        'aria-label',
        blocked
          ? `Continue to payment unavailable: ${this.submitBtn.title || 'resolve outstanding items first'}`
          : `Verify information and proceed to payment, product total ${totalText}`
      );
    }
    this.updateStickyVisibility?.();
  }

  handleCountryChange() {
    const rawVal = (this.countrySelect?.value || '').trim();
    const isNigeria = rawVal.toLowerCase() === 'nigeria';
    const isBlank = rawVal === '';

    if (this.nigeriaFields) {
      this.nigeriaFields.classList.toggle('hidden', !isNigeria);
    }
    if (this.internationalFields) {
      this.internationalFields.classList.toggle('hidden', isNigeria || isBlank);
    }

    // Shipping & Total Labels (C7 Nigeria & C8 International Flow communication)
    if (this.shippingStatusEl) {
      this.shippingStatusEl.textContent = isNigeria 
        ? 'Shipping: Calculated separately' 
        : 'Shipping: Quote required';
    }

    if (this.shippingNoteEl) {
      this.shippingNoteEl.textContent = isNigeria
        ? 'The product total is what you will pay through the product payment flow. After payment is verified, Slimky will email you a delivery fee quote to review and pay directly from your order page.'
        : 'Shipping quote required. The customer pays for the products first. The shipping amount is handled separately after Slimky obtains the actual shipping quote.';
    }

    if (this.totalLabelEl) {
      this.totalLabelEl.textContent = 'Product Payment Total';
    }

    // Dynamic International Currency Indicator (approx. USD/GBP display)
    if (this.currencyIndicatorEl) {
      if (!isNigeria && !isBlank) {
        const cart = getCart();
        const pricing = calculateOrderPricing(cart, { isNigeria: false });
        if (pricing && pricing.productPaymentTotal > 0) {
          this.currencyIndicatorEl.style.display = 'block';
          this.currencyIndicatorEl.innerHTML = renderCheckoutCurrencyIndicatorHTML(pricing.productPaymentTotal, true);
        } else {
          this.currencyIndicatorEl.style.display = 'none';
        }
      } else {
        this.currencyIndicatorEl.style.display = 'none';
        this.currencyIndicatorEl.innerHTML = '';
      }
    }

    // Clear validation errors in inactive fields
    if (isNigeria) {
      this.clearFieldError('intl-state');
      this.clearFieldError('intl-city');
      this.clearFieldError('intl-postal');
      this.clearFieldError('intl-address');
    } else {
      this.clearFieldError('ng-state');
      this.clearFieldError('ng-city');
      this.clearFieldError('ng-address');
    }
  }

  render() {
    const cart = getCart();

    // 1. Empty Cart Check & Guidance
    if (!cart || cart.length === 0) {
      if (this.emptyContainer) this.emptyContainer.style.display = 'flex';
      if (this.layoutContainer) this.layoutContainer.style.display = 'none';
      if (this.successView) this.successView.style.display = 'none';
      this.updateStickyVisibility?.();
      return;
    }

    if (this.emptyContainer) this.emptyContainer.style.display = 'none';
    if (this.layoutContainer && this.state !== FORM_STATES.READY_FOR_PAYMENT) {
      this.layoutContainer.style.removeProperty('display');
    }

    // 2. Country Change & Field Visibility Setup
    this.handleCountryChange();

    // 3. Authoritative Pre-checkout Cart Validation (C5 / C9)
    const cartValidation = validateCart(cart, { scenario: this.simulatedScenario });
    this.handleCartValidationFeedback(cartValidation);

    // 4. Single Source of Truth Price Consistency via calculateOrderPricing
    const rawVal = (this.countrySelect?.value || 'Nigeria').trim();
    const isNigeria = rawVal.toLowerCase() === 'nigeria';
    const pricing = calculateOrderPricing(cart, { isNigeria });

    // Update counts & subtotals from canonical pricing
    if (this.summaryCountEl) this.summaryCountEl.textContent = pricing.count;
    if (this.summaryMobileTotalEl) this.summaryMobileTotalEl.textContent = pricing.productPaymentTotalFormatted;
    if (this.subtotalEl) this.subtotalEl.textContent = pricing.subtotalFormatted;
    if (this.totalLabelEl) this.totalLabelEl.textContent = pricing.totalLabel;
    if (this.totalEl) this.totalEl.textContent = pricing.productPaymentTotalFormatted;

    // International Currency Indicator update
    if (this.currencyIndicatorEl) {
      if (!isNigeria && pricing && pricing.productPaymentTotal > 0) {
        this.currencyIndicatorEl.style.display = 'block';
        this.currencyIndicatorEl.innerHTML = renderCheckoutCurrencyIndicatorHTML(pricing.productPaymentTotal, true);
      } else {
        this.currencyIndicatorEl.style.display = 'none';
        this.currencyIndicatorEl.innerHTML = '';
      }
    }

    // Mirror the live total + submit state into the mobile sticky CTA.
    this.syncStickyCTA?.();

    // Render individual cart items in order summary
    // Milestone C20.12: surface any stock/availability issue directly against
    // the affected line item — never only as a top-level toast.
    if (this.itemsListEl) {
      this.itemsListEl.innerHTML = pricing.items.map(item => {
        const itemImg = resolveCartImagePath(item.productImage, this.root);
        const itemIssue = cartValidation.notifications?.find(n => n.itemKey === item.itemKey);
        return `
          <div class="checkout-item-line ${itemIssue ? 'has-stock-issue' : ''}" data-item-key="${item.itemKey}">
            <div class="checkout-item-media">
              <img src="${itemImg}" alt="${item.productName || 'Slimky Hair product'}" loading="lazy" decoding="async">
            </div>
            <div class="checkout-item-details">
              <div class="checkout-item-name" title="${item.productName}">${item.productName}</div>
              <div class="checkout-item-meta">
                <span>${item.variantName}</span> · <span>Qty: ${item.quantity}</span>
              </div>
              <div class="checkout-item-meta" style="margin-top: 2px;">
                <span>Unit: ${item.unitPriceFormatted}</span>
              </div>
              ${itemIssue ? `
                <div class="checkout-item-stock-issue" role="alert">
                  ${itemIssue.message}
                </div>
              ` : ''}
            </div>
            <div class="checkout-item-subtotal">
              ${item.subtotalFormatted}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  handleCartValidationFeedback(cartValidation) {
    if (!cartValidation) return;

    if (cartValidation.hasBlockingErrors || !cartValidation.canProceedToCheckout) {
      this.updateState(FORM_STATES.SERVER_ERROR);

      // Milestone C20.12: Mobile-friendly blocking state. Never silently change
      // quantity — the customer must explicitly press "Update Cart" to accept it.
      let explanation = 'Some items in your shopping bag have updated pricing, stock limits, or availability.';
      if (cartValidation.notifications && cartValidation.notifications.length > 0) {
        const notif = cartValidation.notifications[0];
        if (notif.type === 'out_of_stock') {
          explanation = `"${notif.productName || 'An item'}" is now out of stock.`;
        } else if (notif.type === 'price_changed') {
          explanation = `The price for "${notif.productName || 'an item'}" has changed from ${formatNaira(notif.oldVal)} to ${formatNaira(notif.newVal)}. Please review your updated bag.`;
        } else if (notif.type === 'stock_decreased' || notif.type === 'quantity_adjusted') {
          explanation = `Only ${notif.newVal} item${notif.newVal === 1 ? '' : 's'} of "${notif.productName || 'an item'}" ${notif.newVal === 1 ? 'is' : 'are'} now available.`;
        } else if (notif.type === 'product_unavailable' || notif.type === 'variant_unavailable') {
          explanation = `"${notif.productName || 'An item'}" is currently unavailable for shipment.`;
        }
      }

      if (this.feedbackBanner) {
        this.feedbackBanner.className = 'checkout-feedback-banner is-error';
        this.feedbackBanner.innerHTML = `
          <strong>Shopping Bag Notice:</strong> ${explanation}
          <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" id="checkout-update-cart-btn" class="btn btn-primary btn-sm" style="min-height: 40px; padding: 0 16px; font-size: 0.75rem; border-radius: 4px; cursor: pointer;">
              Update Cart
            </button>
            <a href="${this.root}cart/" class="btn-outline btn-sm" style="display: inline-flex; align-items: center; font-size: 0.75rem; padding: 0 12px; min-height: 40px; text-decoration: none; border-radius: 4px;">
              Review Full Bag
            </a>
          </div>
        `;
        this.feedbackBanner.style.display = 'block';

        this.feedbackBanner.querySelector('#checkout-update-cart-btn')?.addEventListener('click', () => {
          applyCartValidation(cartValidation);
          this.render();
        });
      }

      if (this.submitBtn) {
        this.submitBtn.disabled = true;
        this.submitBtn.title = 'Please resolve shopping bag notices before proceeding to payment.';
      }
      this.syncStickyCTA?.();
    } else if (cartValidation.hasNetworkError) {
      if (this.feedbackBanner) {
        this.feedbackBanner.className = 'checkout-feedback-banner is-warning';
        this.feedbackBanner.innerHTML = `
          <strong>Notice:</strong> Unable to verify live inventory due to a temporary network issue. Your bag has been safely preserved.
        `;
        this.feedbackBanner.style.display = 'block';
      }
    } else {
      if (this.feedbackBanner && this.feedbackBanner.classList.contains('is-error') && this.feedbackBanner.textContent.includes('Shopping Bag Notice')) {
        this.feedbackBanner.style.display = 'none';
      }
      if (this.submitBtn && !this.submitting && this.state !== FORM_STATES.SUBMITTING) {
        this.submitBtn.disabled = false;
        this.submitBtn.removeAttribute('title');
      }
      this.syncStickyCTA?.();
    }
  }

  /**
   * Render a persistent, mobile-friendly stock/availability issue directly
   * inside the payment card — right next to the Pay button.
   *
   * Milestone C20.12 rules this satisfies:
   * - Message stays close to the affected product/order item (names each one).
   * - Never a self-dismissing toast — stays until the customer acts.
   * - Provides an explicit "Update Cart" action; quantities are never changed silently.
   *
   * @param {HTMLElement} panelEl
   * @param {{ message?: string, notifications?: Array, validationResult?: Object }} params
   */
  renderPaymentStockIssue(panelEl, { message = null, notifications = [], validationResult = null } = {}) {
    if (!panelEl) return;

    const itemLines = (notifications || []).map(n => {
      let line = n.message;
      if (n.type === 'quantity_adjusted' || n.type === 'stock_decreased') {
        line = `Only ${n.newVal} item${n.newVal === 1 ? '' : 's'} of "${n.productName}" ${n.newVal === 1 ? 'is' : 'are'} now available.`;
      } else if (n.type === 'out_of_stock') {
        line = `"${n.productName}" is now out of stock.`;
      } else if (n.type === 'product_unavailable' || n.type === 'variant_unavailable') {
        line = `"${n.productName}" is no longer available.`;
      }
      return `<li>${line}</li>`;
    }).join('');

    panelEl.innerHTML = `
      <strong style="display: block; margin-bottom: 6px;">We couldn't confirm your order</strong>
      ${itemLines ? `<ul style="margin: 0 0 10px 0; padding-left: 18px; text-align: left;">${itemLines}</ul>` : `<p style="margin: 0 0 10px 0; text-align: left;">${message || 'Please check your order items and try again.'}</p>`}
      <button type="button" id="checkout-stock-update-cart-btn" class="btn btn-primary btn-sm" style="min-height: 44px; width: 100%; font-size: 0.8125rem; border-radius: var(--radius-xs); cursor: pointer;">
        Update Cart
      </button>
    `;
    panelEl.style.display = 'block';

    panelEl.querySelector('#checkout-stock-update-cart-btn')?.addEventListener('click', () => {
      if (validationResult) {
        // Explicit customer action — apply the corrected quantities/removals now.
        applyCartValidation(validationResult);
      }
      // Return to the editable cart/delivery view rather than staying stranded
      // on the payment card, so the customer sees their updated bag.
      if (this.successView) this.successView.style.display = 'none';
      if (this.layoutContainer) this.layoutContainer.style.removeProperty('display');
      this.updateState(FORM_STATES.EDITING);
      this.render();
      this.feedbackBanner?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  validateForm() {
    const customerInfo = {
      fullName: this.fullNameInput?.value,
      email: this.emailInput?.value,
      phone: this.phoneInput?.value
    };

    const country = (this.countrySelect?.value || '').trim();
    const isNigeria = country.toLowerCase() === 'nigeria';
    const delivery = {
      country,
      state: isNigeria ? this.ngStateInput?.value : this.intlStateInput?.value,
      city: isNigeria ? this.ngCityInput?.value : this.intlCityInput?.value,
      address: isNigeria ? this.ngAddressInput?.value : this.intlAddressInput?.value,
      postalCode: isNigeria ? '' : this.intlPostalInput?.value
    };

    const customerVal = validateCustomerInfo(customerInfo);
    const deliveryVal = validateDeliveryAddress(delivery);
    const errors = { ...customerVal.errors, ...deliveryVal.errors };

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  showErrors(errors) {
    this.updateState(FORM_STATES.VALIDATION_ERROR);

    Object.keys(errors).forEach(fieldName => {
      const errorMsg = errors[fieldName];
      const errorEl = document.querySelector(`#error-${fieldName}`);
      const inputEl = document.querySelector(`#checkout-${fieldName}`);

      if (errorEl) {
        errorEl.textContent = errorMsg;
        errorEl.classList.add('is-visible');
      }
      if (inputEl) {
        inputEl.classList.add('is-invalid');
        inputEl.setAttribute('aria-invalid', 'true');
        inputEl.setAttribute('aria-describedby', `error-${fieldName}`);
      }
    });

    if (this.feedbackBanner) {
      this.feedbackBanner.className = 'checkout-feedback-banner is-error';
      this.feedbackBanner.textContent = 'Please complete the highlighted delivery and contact fields to proceed.';
      this.feedbackBanner.style.display = 'block';
    }

    const fieldOrder = [
      'fullname', 'email', 'phone', 'country',
      'ng-state', 'ng-city', 'ng-address',
      'intl-state', 'intl-city', 'intl-postal', 'intl-address'
    ];
    const firstInvalidId = fieldOrder.find(f => errors[f]) || Object.keys(errors)[0];
    if (firstInvalidId) {
      const firstInput = document.querySelector(`#checkout-${firstInvalidId}`);
      if (firstInput) {
        firstInput.focus({ preventScroll: true });
        firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  clearFieldError(fieldName) {
    const errorEl = document.querySelector(`#error-${fieldName}`);
    const inputEl = document.querySelector(`#checkout-${fieldName}`);

    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('is-visible');
    }
    if (inputEl) {
      inputEl.classList.remove('is-invalid');
      inputEl.removeAttribute('aria-invalid');
    }

    const visibleErrors = document.querySelectorAll('.checkout-field-error.is-visible');
    if (visibleErrors.length === 0 && this.feedbackBanner && this.state === FORM_STATES.VALIDATION_ERROR) {
      this.feedbackBanner.style.display = 'none';
      this.updateState(FORM_STATES.EDITING);
    }
  }

  clearAllErrors() {
    const visibleErrors = document.querySelectorAll('.checkout-field-error');
    visibleErrors.forEach(el => {
      el.textContent = '';
      el.classList.remove('is-visible');
    });

    const invalidInputs = document.querySelectorAll('.is-invalid');
    invalidInputs.forEach(el => {
      el.classList.remove('is-invalid');
      el.removeAttribute('aria-invalid');
    });

    if (this.feedbackBanner && this.state === FORM_STATES.VALIDATION_ERROR) {
      this.feedbackBanner.style.display = 'none';
      this.feedbackBanner.className = 'checkout-feedback-banner';
    }
  }

  prefillDemoData() {
    this.clearAllErrors();
    const d = DEMO_CUSTOMER_DATA;

    if (this.fullNameInput) this.fullNameInput.value = d.fullName;
    if (this.emailInput) this.emailInput.value = d.email;
    if (this.phoneInput) this.phoneInput.value = d.phone;

    if (this.countrySelect) {
      this.countrySelect.value = d.country;
      this.handleCountryChange();
    }

    if (this.ngStateInput) this.ngStateInput.value = d.state;
    if (this.ngCityInput) this.ngCityInput.value = d.city;
    if (this.ngAddressInput) this.ngAddressInput.value = d.address;
    if (this.ngInstructionsInput) this.ngInstructionsInput.value = d.instructions;

    this.updateState(FORM_STATES.EDITING);

    if (this.feedbackBanner) {
      this.feedbackBanner.className = 'checkout-feedback-banner is-success';
      this.feedbackBanner.textContent = 'Fictional demo customer details filled for Nigerian test evaluation.';
      this.feedbackBanner.style.display = 'block';
      setTimeout(() => {
        if (this.state !== FORM_STATES.VALIDATION_ERROR && this.feedbackBanner.classList.contains('is-success')) {
          this.feedbackBanner.style.display = 'none';
        }
      }, 4000);
    }
  }

  prefillInternationalDemoData(d) {
    this.clearAllErrors();

    if (this.fullNameInput) this.fullNameInput.value = d.fullName;
    if (this.emailInput) this.emailInput.value = d.email;
    if (this.phoneInput) this.phoneInput.value = d.phone;

    if (this.countrySelect) {
      this.countrySelect.value = d.country;
      this.handleCountryChange();
    }

    if (this.intlStateInput) this.intlStateInput.value = d.state;
    if (this.intlCityInput) this.intlCityInput.value = d.city;
    if (this.intlPostalInput) this.intlPostalInput.value = d.postalCode;
    if (this.intlAddressInput) this.intlAddressInput.value = d.address;
    if (this.intlInstructionsInput) this.intlInstructionsInput.value = d.instructions;

    this.updateState(FORM_STATES.EDITING);

    if (this.feedbackBanner) {
      this.feedbackBanner.className = 'checkout-feedback-banner is-success';
      this.feedbackBanner.textContent = `Fictional demo customer details filled for ${d.country} test evaluation.`;
      this.feedbackBanner.style.display = 'block';
      setTimeout(() => {
        if (this.state !== FORM_STATES.VALIDATION_ERROR && this.feedbackBanner.classList.contains('is-success')) {
          this.feedbackBanner.style.display = 'none';
        }
      }, 4000);
    }
  }

  async handleSubmit() {
    // 1. Submission Protection: Prevent double-click, duplicate, or concurrent processing
    if (this.submitting || this.state === FORM_STATES.SUBMITTING) {
      console.warn('[Checkout] Submission locked: duplicate attempt prevented.');
      return;
    }

    this.clearAllErrors();

    // 2. Cart Non-empty Gate
    const cart = getCart();
    if (!cart || cart.length === 0) {
      this.render();
      return;
    }

    // 3. Authoritative Cart Validation Gate Check (C5 / C9 / C20.4)
    const cartValidation = validateCartItems(cart, { scenario: this.simulatedScenario });
    if (!cartValidation.canProceedToCheckout || cartValidation.hasBlockingErrors) {
      this.handleCartValidationFeedback(cartValidation);
      this.feedbackBanner?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    // 4. Customer Information Form Validation Gate Check
    const validation = this.validateForm();
    if (!validation.isValid) {
      this.showErrors(validation.errors);
      return;
    }

    // 5. Authoritative Order Total & Invariant Validation (C20.4)
    const country = (this.countrySelect?.value || 'Nigeria').trim();
    const totalValidation = validateOrderTotal(cart, country);
    if (!totalValidation.isValid) {
      if (this.feedbackBanner) {
        this.feedbackBanner.className = 'checkout-feedback-banner is-error';
        this.feedbackBanner.textContent = totalValidation.error || 'Order total verification failed.';
        this.feedbackBanner.style.display = 'block';
        this.feedbackBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }

    // 6. Enter Submitting State & Lock Submissions
    this.submitting = true;
    if (this.form) this.form.setAttribute('data-submitting', 'true');
    this.updateState(FORM_STATES.SUBMITTING);

    if (this.submitBtn) {
      this.submitBtn.disabled = true;
      this.submitBtn.setAttribute('aria-busy', 'true');
      this.submitBtn.setAttribute('data-original-text', this.submitBtn.innerHTML);
      this.submitBtn.innerHTML = `
        <span class="checkout-spinner" aria-hidden="true"></span>
        <span>Processing Information &amp; Verifying Order...</span>
      `;
    }

    try {
      // Check for simulated development error scenarios (Scenario 8: Network/Backend Failure)
      if (this.simulatedError === 'network' || this.simulatedScenario === 'network_failure') {
        throw new Error('NETWORK_FAILURE');
      }
      if (this.simulatedError === 'backend') {
        throw new Error('BACKEND_FAILURE');
      }

      // Asynchronous verification & staging dispatch
      await new Promise(resolve => setTimeout(resolve, 350));

      const isNigeria = (this.countrySelect?.value || 'Nigeria').trim().toLowerCase() === 'nigeria';
      const pricing = calculateOrderPricing(cart, { isNigeria });

      // Structure Staged Checkout Session Data Model (Single Source of Truth)
      // Strictly unpaid: DO NOT fake payment success; DO NOT mark order as paid
      const activeCustomer = customerService.getCurrentCustomer();
      const customerId = activeCustomer ? activeCustomer.id : null;
      const isGuest = !activeCustomer;

      // Milestone C20.3: Security verification - verify selected saved address strictly belongs to active customer
      let verifiedSavedAddressId = null;
      if (activeCustomer && this.selectedSavedAddressId && !this.isEnteringNewAddress) {
        const verifiedAddr = customerService.getAddress(this.selectedSavedAddressId, activeCustomer.id);
        if (verifiedAddr) {
          verifiedSavedAddressId = verifiedAddr.id;
        } else {
          console.warn('[Security Alert] Untrusted address ID rejected during checkout submission:', this.selectedSavedAddressId);
          this.selectedSavedAddressId = null;
        }
      }

      // Milestone C20.1: If authenticated customer chose to save new address to their account
      if (activeCustomer && this.saveAddressCheck?.checked && this.isEnteringNewAddress) {
        try {
          const newSaved = customerService.saveAddress(activeCustomer.id, {
            label: 'Home',
            recipientName: this.fullNameInput.value.trim(),
            phone: this.phoneInput.value.trim(),
            country: isNigeria ? 'Nigeria' : this.countrySelect.value.trim(),
            state: isNigeria ? this.ngStateInput.value.trim() : this.intlStateInput.value.trim(),
            city: isNigeria ? this.ngCityInput.value.trim() : this.intlCityInput.value.trim(),
            postalCode: isNigeria ? '' : this.intlPostalInput.value.trim(),
            streetAddress: isNigeria ? this.ngAddressInput.value.trim() : this.intlAddressInput.value.trim(),
            deliveryInstructions: isNigeria ? (this.ngInstructionsInput?.value.trim() || '') : (this.intlInstructionsInput?.value.trim() || '')
          });
          if (newSaved && newSaved.id) {
            verifiedSavedAddressId = newSaved.id;
          }
        } catch (err) {
          console.warn('[Checkout] Failed to save address to customer account:', err);
        }
      }

      // Milestone C20.2: If authenticated customer chose to save updated profile (name / phone)
      if (activeCustomer && this.saveContactCheck?.checked) {
        try {
          const updatedName = this.fullNameInput.value.trim();
          const updatedPhone = this.phoneInput.value.trim();
          customerService.updateProfile(activeCustomer.id, {
            fullName: updatedName,
            phone: updatedPhone
          });
          activeCustomer.fullName = updatedName;
          activeCustomer.phone = updatedPhone;
        } catch (err) {
          console.warn('[Checkout] Failed to update customer profile:', err);
        }
      }

      const checkoutSession = {
        checkoutId: `chk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        customerId,
        isGuest,
        flow: isNigeria ? 'nigeria_checkout' : 'international_checkout',
        customer: {
          fullName: this.fullNameInput.value.trim(),
          email: this.emailInput.value.trim(),
          phone: this.phoneInput.value.trim(),
          isGuest,
          customerId
        },
        delivery: {
          savedAddressId: verifiedSavedAddressId,
          country: isNigeria ? 'Nigeria' : this.countrySelect.value.trim(),
          state: isNigeria ? this.ngStateInput.value.trim() : this.intlStateInput.value.trim(),
          city: isNigeria ? this.ngCityInput.value.trim() : this.intlCityInput.value.trim(),
          postalCode: isNigeria ? '' : this.intlPostalInput.value.trim(),
          address: isNigeria ? this.ngAddressInput.value.trim() : this.intlAddressInput.value.trim(),
          instructions: isNigeria ? this.ngInstructionsInput?.value.trim() || '' : this.intlInstructionsInput?.value.trim() || ''
        },
        items: pricing.items,
        pricing: {
          subtotal: pricing.subtotal,
          subtotalFormatted: pricing.subtotalFormatted,
          shippingStatus: pricing.shippingStatus,
          shippingFee: null, // Strictly null: no automated or invented shipping rates
          productPaymentTotal: pricing.productPaymentTotal,
          productPaymentTotalFormatted: pricing.productPaymentTotalFormatted,
          total: pricing.productPaymentTotal,
          totalFormatted: pricing.productPaymentTotalFormatted,
          currency: 'NGN'
        },
        customsNotice: !isNigeria 
          ? 'Applicable destination-country customs duties, import taxes, or local clearance fees may be separate from product payment and shipping quotes.' 
          : null,
        payment: {
          status: 'unpaid', // Strictly unpaid: DO NOT fake payment success
          method: null,
          reference: null
        },
        status: 'ready_for_payment', // Strictly ready_for_payment: DO NOT mark order as paid
        createdAt: new Date().toISOString()
      };

      // Persist draft checkout session in localStorage
      try {
        localStorage.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(checkoutSession));
      } catch (err) {
        console.warn('[Slimky Hair] Unable to persist checkout session to localStorage', err);
      }

      // Enter Ready for Payment (Handoff Point)
      this.updateState(FORM_STATES.READY_FOR_PAYMENT);
      this.renderPaymentHandoffView(checkoutSession);

    } catch (err) {
      // Safe, customer-friendly error handling - Never expose stack traces or raw errors
      console.error('[Slimky Hair Checkout Error]', err);
      this.updateState(FORM_STATES.SERVER_ERROR);

      let userMessage = 'An unexpected error occurred while staging your information. Please try again.';
      if (err && (err.message === 'NETWORK_FAILURE' || err.name === 'NetworkError' || !navigator.onLine)) {
        userMessage = 'We are experiencing a temporary network delay verifying your order. Your details and shopping bag have been safely preserved. Please try again in a moment.';
      } else if (err && err.message === 'BACKEND_FAILURE') {
        userMessage = 'Our order system is momentarily undergoing maintenance. Your shopping bag is safe. Please try again shortly.';
      }

      if (this.feedbackBanner) {
        this.feedbackBanner.className = 'checkout-feedback-banner is-error';
        this.feedbackBanner.textContent = userMessage;
        this.feedbackBanner.style.display = 'block';
        this.feedbackBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } finally {
      this.submitting = false;
      if (this.form) this.form.removeAttribute('data-submitting');
      if (this.submitBtn && this.state !== FORM_STATES.READY_FOR_PAYMENT) {
        this.submitBtn.disabled = false;
        this.submitBtn.removeAttribute('aria-busy');
        const originalText = this.submitBtn.getAttribute('data-original-text');
        if (originalText) this.submitBtn.innerHTML = originalText;
      }
    }
  }

  renderPaymentHandoffView(session) {
    if (this.layoutContainer) this.layoutContainer.style.display = 'none';
    if (this.emptyContainer) this.emptyContainer.style.display = 'none';
    this.updateStickyVisibility?.();

    const isNigeria = session.flow === 'nigeria_checkout';
    const formattedAddress = isNigeria
      ? (session.delivery.address.toLowerCase().includes(session.delivery.city.toLowerCase()) 
          ? `${session.delivery.address}, ${session.delivery.state}, Nigeria` 
          : `${session.delivery.address}, ${session.delivery.city}, ${session.delivery.state}, Nigeria`)
      : `${session.delivery.address}, ${session.delivery.city}, ${session.delivery.state} ${session.delivery.postalCode}, ${session.delivery.country}`;

    const shippingStatusText = isNigeria ? 'Calculated separately' : 'Quote required';
    const destinationCountry = isNigeria ? 'Nigeria' : session.delivery.country;

    const itemCount = session.items.length;
    const itemLabel = itemCount === 1 ? '1 item' : `${itemCount} items`;

    if (this.successView) {
      this.successView.style.display = 'block';
      this.successView.innerHTML = `
        <div class="checkout-confirmed-wrapper">
          <!-- 1. Standardized Header (Icon Circle + Badge Unit) -->
          <div class="checkout-confirmed-header-group">
            <div class="checkout-confirmed-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <polyline points="9 12 11 14 15 10"></polyline>
              </svg>
            </div>

            <div class="checkout-confirmed-badge" style="background-color: var(--bg-secondary); color: var(--color-brown-deep); border-color: var(--color-border-subtle);">
              <span class="checkout-confirmed-badge-dot" style="background-color: var(--color-brown-deep);" aria-hidden="true"></span>
              Order Staged · Ready for Product Payment
            </div>
          </div>

          <h2 class="checkout-confirmed-title">Information Verified</h2>
          <p class="checkout-confirmed-subtext">
            Thank you, <strong>${session.customer.fullName}</strong>. Your contact and delivery information for ${destinationCountry} have been verified.
          </p>

          <!-- 2. Staged Order Card (Structured Receipt Style) -->
          <div class="checkout-receipt-card">
            <!-- Section A: Staged Order Meta -->
            <div class="checkout-receipt-section">
              <div class="checkout-receipt-section-header">
                <span class="checkout-receipt-section-title">Staged Order</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Checkout Reference</span>
                <span class="checkout-receipt-value font-mono">${session.checkoutId}</span>
              </div>
              <div class="checkout-receipt-row checkout-receipt-row-inline-mobile">
                <span class="checkout-receipt-label">Status</span>
                <span class="checkout-receipt-value">
                  <span class="checkout-receipt-tag-pending">
                    <span class="checkout-receipt-tag-pending-dot" aria-hidden="true"></span>
                    Unpaid
                  </span>
                </span>
              </div>
            </div>

            <hr class="checkout-receipt-divider">

            <!-- Section B: Recipient & Delivery Details -->
            <div class="checkout-receipt-section">
              <div class="checkout-receipt-section-header">
                <span class="checkout-receipt-section-title">Recipient & Delivery</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Recipient</span>
                <span class="checkout-receipt-value" style="font-weight: 600;">${session.customer.fullName}</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Email</span>
                <span class="checkout-receipt-value">${session.customer.email}</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Phone / WhatsApp</span>
                <span class="checkout-receipt-value">${session.customer.phone}</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Delivery Address</span>
                <span class="checkout-receipt-value">${formattedAddress}</span>
              </div>
              ${session.delivery.instructions ? `
                <div class="checkout-receipt-row">
                  <span class="checkout-receipt-label">Delivery Notes</span>
                  <span class="checkout-receipt-value" style="font-style: italic;">"${session.delivery.instructions}"</span>
                </div>
              ` : ''}
            </div>

            <hr class="checkout-receipt-divider">

            <!-- Section C: Summary Breakdown -->
            <div class="checkout-receipt-section" style="padding-bottom: 18px;">
              <div class="checkout-receipt-row checkout-receipt-row-inline-mobile">
                <span class="checkout-receipt-label">Subtotal (${itemLabel})</span>
                <span class="checkout-receipt-value" style="font-weight: 600;">${session.pricing.subtotalFormatted}</span>
              </div>
              <div class="checkout-receipt-row checkout-receipt-row-inline-mobile">
                <span class="checkout-receipt-label">Shipping</span>
                <span class="checkout-receipt-value" style="color: var(--color-brown-deep, #7E4F36); font-weight: 500;">
                  ${shippingStatusText}
                </span>
              </div>
            </div>

            <!-- Total Highlight Bar -->
            <div class="checkout-receipt-total-bar">
              <div>
                <div class="checkout-receipt-total-title">Product Payment Total</div>
                <span class="checkout-receipt-total-caption">Total payable online now</span>
              </div>
              <div class="checkout-receipt-total-amount">
                ${session.pricing.productPaymentTotalFormatted}
              </div>
            </div>
          </div>

          <!-- 3. Shipping Notice Callout (Consistent with Confirmation Page) -->
          ${isNigeria ? `
            <div class="checkout-shipping-separate-alert">
              <strong class="checkout-shipping-alert-title">Shipping Fee Notice (Calculated Separately)</strong>
              <p style="margin: 0; font-size: 0.875rem; line-height: 1.6;">
                The product total above (<strong style="display: inline; font-weight: 700; white-space: nowrap;">${session.pricing.productPaymentTotalFormatted}</strong>) is what you will pay through the product payment flow. Slimky does not add automated or estimated shipping fees online. After payment is verified, our logistics team reviews your order and emails you an exact delivery fee quote for your location in ${session.delivery.state}, which you review and pay directly from your order page.
              </p>
            </div>
          ` : `
            <div class="checkout-shipping-separate-alert" style="text-align: left;">
              <strong class="checkout-shipping-alert-title">International Shipping: Quote Required Flow</strong>
              <p style="margin-bottom: 8px; font-size: 0.875rem; line-height: 1.6;">
                International shipping is not estimated online. To ensure accurate courier rates, delivery follows our standard 4-step international flow:
              </p>
              <ol style="padding-left: 20px; margin: 0; line-height: 1.6; font-size: 0.875rem;">
                <li style="margin-bottom: 4px;"><strong>Product Payment First:</strong> You pay for your ordered products online (${session.pricing.productPaymentTotalFormatted}${!isNigeria ? ` · approx. ${getApproximateForeignCurrencies(session.pricing.productPaymentTotal).usdFormatted} / ${getApproximateForeignCurrencies(session.pricing.productPaymentTotal).gbpFormatted}` : ''}).</li>
                <li style="margin-bottom: 4px;"><strong>Shipping Quote Obtained by Slimky:</strong> Our logistics team packages and weighs your order to obtain the actual courier rate (e.g. DHL Express) for ${destinationCountry}.</li>
                <li style="margin-bottom: 4px;"><strong>Quote Sent to You:</strong> Slimky sends the official shipping quote directly to your Phone / WhatsApp (${session.customer.phone}) and email.</li>
                <li><strong>Acceptance & Shipping Payment:</strong> You accept or decline the quote. The shipping payment is handled separately prior to dispatch.</li>
              </ol>
              <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--color-border-subtle); font-size: 0.8125rem; color: var(--color-text-secondary);">
                Applicable destination-country customs duties, import taxes, or local clearance fees may be assessed upon arrival by authorities in ${destinationCountry}.
              </div>
            </div>
          `}

          <!-- 4. Payment Method Card -->
          <div class="checkout-receipt-card" style="padding: 28px 28px; text-align: center;">
            <div class="checkout-payment-card-icon-circle" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                <line x1="2" y1="10" x2="22" y2="10"></line>
              </svg>
            </div>
            <h3 class="checkout-payment-title" style="font-size: 1.25rem; margin-bottom: 6px;">Product Payment · Slimky DemoPay (Test Mode)</h3>
            <p class="checkout-payment-text" style="font-size: 0.875rem; line-height: 1.5; margin-bottom: 20px; max-width: 440px;">
              Your order information is verified and staged for <strong>${session.pricing.productPaymentTotalFormatted}</strong>${!isNigeria ? ` <span style="display:block; font-size:0.75rem; color:var(--color-text-secondary); margin-top:4px;">(${getApproximateForeignCurrencies(session.pricing.productPaymentTotal).combinedFormatted} · Charged in NGN; approximate exchange rates depend on your card issuer)</span>` : ''}.
              You can now test complete payment approval, card decline, or failure simulation using our local demo gateway.
            </p>

            <!-- Milestone C20.12: Persistent, mobile-friendly stock-issue panel — never a toast that disappears -->
            <div id="checkout-payment-stock-issue" class="checkout-stock-issue-panel" role="alert" style="display: none;"></div>

            <!-- Active Local Demo Payment Gateway Action (C11) -->
            <button type="button" id="checkout-demopay-trigger-btn" class="checkout-submit-cta" style="min-height: 52px; width: 100%; padding: 14px 20px; margin-bottom: 12px; background: var(--color-brown-deep); color: #FAF8F5; font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; text-align: center; border-radius: var(--radius-xs); cursor: pointer;">
              Pay ${session.pricing.productPaymentTotalFormatted} with Slimky DemoPay (Test Mode)
            </button>

            <!-- Preserved Gateway Handoff Button (C7-C9 regression lock) -->
            <button type="button" id="checkout-gateway-handoff-btn" class="checkout-gateway-pending-block" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              Live Gateway Integration Pending (Paystack / Flutterwave)
            </button>

            <div class="checkout-payment-badges">
              <span class="checkout-payment-badge is-active">
                <span class="checkout-payment-pill-dot is-active"></span>
                Demo Payment Ready
              </span>
              <span class="checkout-payment-badge is-active">
                <span class="checkout-payment-pill-dot is-active"></span>
                Zero Real Charge
              </span>
              <span class="checkout-payment-badge is-pending">
                <span class="checkout-payment-pill-dot is-pending"></span>
                Paystack Pending
              </span>
              <span class="checkout-payment-badge is-pending">
                <span class="checkout-payment-pill-dot is-pending"></span>
                Flutterwave Pending
              </span>
            </div>
          </div>

          <!-- 5. Bottom Navigation Actions -->
          <div class="checkout-staged-actions">
            <button type="button" id="checkout-edit-details-btn" class="checkout-staged-action-btn">
              ← Edit Delivery Details
            </button>
            <a href="${this.root}cart/" class="checkout-staged-action-btn">
              Return to Shopping Bag
            </a>
          </div>
        </div>
      `;

      // Wire DemoPay Trigger Button
      const demopayTriggerBtn = document.querySelector('#checkout-demopay-trigger-btn');
      const stockIssuePanel = document.querySelector('#checkout-payment-stock-issue');
      const payBtnDefaultLabel = `Pay ${session.pricing.productPaymentTotalFormatted} with Slimky DemoPay (Test Mode)`;

      if (demopayTriggerBtn) {
        demopayTriggerBtn.addEventListener('click', async () => {
          try {
            if (stockIssuePanel) stockIssuePanel.style.display = 'none';
            demopayTriggerBtn.disabled = true;
            demopayTriggerBtn.innerHTML = '<span class="demopay-spinner" aria-hidden="true"></span> Verifying Inventory & Initializing Demo Payment...';

            // Authoritative Pre-Payment Check: verify live cart
            const currentCart = getCart();
            if (!currentCart || currentCart.length === 0) {
              demopayTriggerBtn.disabled = false;
              demopayTriggerBtn.innerHTML = payBtnDefaultLabel;
              this.renderPaymentStockIssue(stockIssuePanel, {
                message: 'Your shopping bag is empty. Please return to the shop to add items.',
                notifications: []
              });
              return;
            }

            // Milestone C20.12: Revalidate stock against the LIVE inventory ledger
            // immediately before payment — this is the last line of defense before
            // charging. Any issue is shown inline, next to the payment action, and
            // stays visible (never a self-dismissing toast).
            const revalidation = validateCart(currentCart);
            if (!revalidation.canProceedToCheckout || revalidation.hasBlockingErrors) {
              demopayTriggerBtn.disabled = false;
              demopayTriggerBtn.innerHTML = payBtnDefaultLabel;
              this.renderPaymentStockIssue(stockIssuePanel, {
                notifications: revalidation.notifications,
                validationResult: revalidation
              });
              return;
            }

            // Sync session items with current live (and now-revalidated) cart
            session.items = currentCart;
            const updatedPricing = calculateOrderPricing(currentCart, { isNigeria: session.flow === 'nigeria_checkout' });
            session.pricing = updatedPricing;

            const initResult = await paymentService.initializePaymentSession(session);
            demopayTriggerBtn.disabled = false;
            demopayTriggerBtn.innerHTML = `Pay ${session.pricing.productPaymentTotalFormatted} with Demo Payment (Test Mode)`;
            this.demoPaymentUI.open(initResult);
          } catch (err) {
            demopayTriggerBtn.disabled = false;
            demopayTriggerBtn.innerHTML = payBtnDefaultLabel;
            console.error('[Payment Init Error]', err);
            this.renderPaymentStockIssue(stockIssuePanel, {
              message: err.message || 'Unable to initialize demo payment. Please check your order items and try again.',
              notifications: []
            });
          }
        });
      }

      // Allow customer to return to editing mode
      document.querySelector('#checkout-edit-details-btn')?.addEventListener('click', () => {
        if (this.successView) this.successView.style.display = 'none';
        if (this.layoutContainer) this.layoutContainer.style.removeProperty('display');
        this.updateState(FORM_STATES.EDITING);
        if (this.submitBtn) {
          this.submitBtn.disabled = false;
          const orig = this.submitBtn.getAttribute('data-original-text');
          if (orig) this.submitBtn.innerHTML = orig;
        }
      });

      this.successView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  handlePaymentSuccess({ order, payment }) {
    this.updateState(FORM_STATES.PAID);
    this.renderOrderConfirmationView(order, payment);
  }

  handlePaymentDeclined({ order, payment, failureReason }) {
    console.warn('[Checkout] DemoPay Declined:', failureReason);
  }

  handlePaymentFailure({ order, payment, failureReason }) {
    console.warn('[Checkout] DemoPay Failed:', failureReason);
  }

  handlePaymentRetry({ order, payment }) {
    // Retry preserves order reference and increments attempts
  }

  handlePaymentCancel() {
    // Ensure form view is visible and editable; shopping bag and customer inputs remain intact
    if (this.layoutContainer) this.layoutContainer.style.removeProperty('display');
    this.updateState(FORM_STATES.EDITING);
    if (this.submitBtn) {
      this.submitBtn.disabled = false;
      const orig = this.submitBtn.getAttribute('data-original-text');
      if (orig) this.submitBtn.innerHTML = orig;
    }
  }

  /**
   * Authoritatively recover payment state on page boot/refresh (Milestone C20.6).
   * Strictly avoids assuming refresh = failure or refresh = success.
   */
  async recoverAuthoritativePaymentOnBoot() {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const activeOrderId = sessionStorage.getItem('slimky_active_order_id');
      if (!activeOrderId) return;

      const recovery = await paymentService.recoverAuthoritativeState(activeOrderId);
      if (!recovery || !recovery.found) return;

      if (recovery.status === PAYMENT_LIFECYCLE_STATES.SUCCESSFUL) {
        // Authoritative success: render order confirmation view directly without recreating payment
        this.updateState(FORM_STATES.PAID);
        this.renderOrderConfirmationView(recovery.order, recovery.payment);
      } else if (recovery.status === PAYMENT_LIFECYCLE_STATES.FAILED) {
        // Authoritative failure: open demo payment modal directly in failure state with retry CTA
        this.demoPaymentUI.open({
          order: recovery.order,
          payment: recovery.payment,
          initialState: PAYMENT_LIFECYCLE_STATES.FAILED,
          failureReason: recovery.failureReason
        });
      }
    } catch (err) {
      console.warn('[Checkout] Boot payment state recovery check skipped/failed:', err);
    }
  }

  renderOrderConfirmationView(order, payment) {
    if (this.layoutContainer) this.layoutContainer.style.display = 'none';
    if (this.emptyContainer) this.emptyContainer.style.display = 'none';

    const isNigeria = order.flow === 'nigeria_checkout';
    const destinationCountry = isNigeria ? 'Nigeria' : order.delivery.country;
    const formattedAddress = isNigeria
      ? (order.delivery.address.toLowerCase().includes(order.delivery.city.toLowerCase())
          ? `${order.delivery.address}, ${order.delivery.state}, Nigeria`
          : `${order.delivery.address}, ${order.delivery.city}, ${order.delivery.state}, Nigeria`)
      : `${order.delivery.address}, ${order.delivery.city}, ${order.delivery.state} ${order.delivery.postalCode}, ${order.delivery.country}`;

    if (this.successView) {
      this.successView.style.display = 'block';
      this.successView.innerHTML = `
        <div id="checkout-order-confirmed-view" class="checkout-confirmed-wrapper">
          <!-- 1. Header: Centered Checkmark Icon + Status Badge as one cohesive unit -->
          <div class="checkout-confirmed-header-group">
            <div class="checkout-confirmed-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>

            <div class="checkout-confirmed-badge">
              <span class="checkout-confirmed-badge-dot" aria-hidden="true"></span>
              Payment Verified · Order Placed
            </div>
          </div>

          <h2 class="checkout-confirmed-title">Order Confirmed</h2>
          <p class="checkout-confirmed-subtext">
            Thank you, <strong>${order.customer.fullName}</strong>. Your payment of <strong>${formatNaira(order.pricing.productPaymentTotal)}</strong> has been verified via <strong>Demo Payment</strong>.
          </p>

          <!-- 2. Main Info Card (Structured Scannable Receipt) -->
          <div class="checkout-receipt-card">
            
            <!-- Section A: Order & Payment Reference -->
            <div class="checkout-receipt-section">
              <div class="checkout-receipt-section-header">
                <span class="checkout-receipt-section-title">Order & Payment</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Order Reference</span>
                <span class="checkout-receipt-value font-mono"><span id="confirmed-order-id">${order.id}</span></span>
              </div>
              <div class="checkout-receipt-row checkout-receipt-row-inline-mobile">
                <span class="checkout-receipt-label">Status</span>
                <span class="checkout-receipt-value"><span class="checkout-receipt-tag-paid">Paid</span></span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Payment Reference</span>
                <span class="checkout-receipt-value font-mono"><span id="confirmed-payment-ref">${payment.providerReference}</span></span>
              </div>
              <div class="checkout-receipt-row checkout-receipt-row-inline-mobile">
                <span class="checkout-receipt-label">Payment Method</span>
                <span class="checkout-receipt-value">Demo Card</span>
              </div>
            </div>

            <hr class="checkout-receipt-divider">

            <!-- Section B: Recipient & Delivery Details -->
            <div class="checkout-receipt-section">
              <div class="checkout-receipt-section-header">
                <span class="checkout-receipt-section-title">Recipient & Delivery</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Recipient</span>
                <span class="checkout-receipt-value" style="font-weight: 600;">${order.customer.fullName}</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Email</span>
                <span class="checkout-receipt-value">${order.customer.email}</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Phone / WhatsApp</span>
                <span class="checkout-receipt-value">${order.customer.phone}</span>
              </div>
              <div class="checkout-receipt-row">
                <span class="checkout-receipt-label">Delivery Destination</span>
                <span class="checkout-receipt-value">${formattedAddress}</span>
              </div>
              ${order.delivery.instructions ? `
                <div class="checkout-receipt-row">
                  <span class="checkout-receipt-label">Delivery Notes</span>
                  <span class="checkout-receipt-value" style="font-style: italic;">"${order.delivery.instructions}"</span>
                </div>
              ` : ''}
            </div>

            <hr class="checkout-receipt-divider">

            <!-- Section C: Ordered Items -->
            <div class="checkout-receipt-section">
              <div class="checkout-receipt-section-header">
                <span class="checkout-receipt-section-title">Ordered Items (${order.items.length})</span>
              </div>
              <div class="checkout-receipt-items">
                ${order.items.map(it => `
                  <div class="checkout-receipt-item-row">
                    <div class="checkout-receipt-item-info">
                      <div class="checkout-receipt-item-title">${it.productName}</div>
                      <span class="checkout-receipt-item-meta">${it.variantName} × ${it.quantity}</span>
                    </div>
                    <div class="checkout-receipt-item-price">${formatNaira(it.lineTotal)}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <hr class="checkout-receipt-divider">

            <!-- Section D: Subtotal & Shipping Breakdown -->
            <div class="checkout-receipt-section" style="padding-bottom: 18px;">
              <div class="checkout-receipt-row checkout-receipt-row-inline-mobile">
                <span class="checkout-receipt-label">Product Subtotal</span>
                <span class="checkout-receipt-value" style="font-weight: 600;">${formatNaira(order.pricing.subtotal)}</span>
              </div>
              <div class="checkout-receipt-row checkout-receipt-row-inline-mobile">
                <span class="checkout-receipt-label">Shipping Status</span>
                <span class="checkout-receipt-value" style="color: var(--color-brown-deep, #7E4F36); font-weight: 500;">${order.pricing.shippingStatus}</span>
              </div>
            </div>

            <!-- Total Paid Dedicated Highlight Bar -->
            <div class="checkout-receipt-total-bar">
              <div>
                <div class="checkout-receipt-total-title">Total Paid</div>
                <span class="checkout-receipt-total-caption">Product payment verified via DemoPay</span>
              </div>
              <div class="checkout-receipt-total-amount">
                ${formatNaira(order.pricing.productPaymentTotal)}
              </div>
            </div>

          </div>

          <!-- 3. Callout Box (Logistics & Delivery Fee Follow-Up) -->
          ${isNigeria ? `
            <div class="checkout-confirmed-callout">
              <span class="checkout-confirmed-callout-title">Delivery Fee Follow-Up</span>
              <div>
                Your product order is placed. Delivery fees for Nigeria are calculated separately — our logistics team will review your order for ${order.delivery.state} and email <strong>${order.customer.email}</strong> a shipping quote you can review and pay directly from your order page.
              </div>
            </div>
          ` : `
            <div class="checkout-confirmed-callout">
              <span class="checkout-confirmed-callout-title">International Shipping Quote Follow-Up</span>
              <div>
                Your product payment is verified. Slimky logistics will weigh your package to calculate courier rates for ${destinationCountry}, and send the official shipping quote to <strong>${order.customer.email}</strong> and <strong>${order.customer.phone}</strong>.
              </div>
            </div>
          `}

          <!-- 4. Return Actions -->
          <div class="checkout-confirmed-actions">
            <div class="checkout-confirmed-btn-row">
              <button type="button" id="checkout-view-full-receipt-btn" class="btn btn-primary" style="min-height: 48px; padding: 0 28px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"></path>
                  <line x1="8" y1="7" x2="16" y2="7"></line>
                  <line x1="8" y1="11" x2="16" y2="11"></line>
                  <line x1="8" y1="15" x2="13" y2="15"></line>
                </svg>
                View Full Order Receipt
              </button>
              ${order.customerId ? `
                <a href="${this.root}account/orders/?id=${encodeURIComponent(order.id)}" class="btn btn-secondary" style="min-height: 48px; padding: 0 24px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  View in My Account
                </a>
              ` : ''}
            </div>
            <div class="checkout-confirmed-btn-row">
              <a href="${this.root}shop/" class="btn btn-outline" style="min-height: 48px; padding: 0 24px; display: inline-flex; align-items: center; justify-content: center;">
                Explore More Products
              </a>
              <a href="${this.root}" class="btn btn-outline" style="min-height: 48px; padding: 0 24px; display: inline-flex; align-items: center; justify-content: center;">
                Return to Home
              </a>
            </div>
          </div>
        </div>

        <!-- Optional Post-Purchase Guest Conversion (Milestone C19.9) -->
        <div id="checkout-guest-conversion-mount" style="max-width: 640px; margin: 24px auto 0 auto;"></div>
      `;

      // Wire View Receipt Pop-up Modal
      const viewReceiptBtn = document.querySelector('#checkout-view-full-receipt-btn');
      if (viewReceiptBtn) {
        viewReceiptBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openReceiptModal(order, payment);
        });
      }

      // Initialize Optional Guest Conversion Card
      const checkoutConversionMount = document.querySelector('#checkout-guest-conversion-mount');
      if (checkoutConversionMount) {
        new GuestConversionCard({
          mountElement: checkoutConversionMount,
          order,
          securityToken: order.securityToken,
          rootPrefix: this.root
        });
      }

      this.successView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Open interactive pop-up ticket receipt modal matching inspiration design
   */
  openReceiptModal(order, payment = {}) {
    const existingModal = document.querySelector('#receipt-ticket-modal-overlay');
    if (existingModal) existingModal.remove();

    const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const day = String(orderDate.getDate()).padStart(2, '0');
    const month = months[orderDate.getMonth()];
    const year = orderDate.getFullYear();
    const hours = String(orderDate.getHours()).padStart(2, '0');
    const mins = String(orderDate.getMinutes()).padStart(2, '0');
    const formattedDateTime = `${day} ${month}, ${year} | ${hours}:${mins}`;

    // Real Order Reference & Payment Reference for client transaction
    const orderReference = order.orderNumber || order.orderReference || order.id || 'SLM-202609-0001';
    const paymentReference = payment?.providerReference || payment?.reference || payment?.id || order.paymentReference || (order.id ? `PAY-${order.id.replace(/\D/g, '').slice(-8)}` : 'PAY-202609-8841');
    const formattedAmount = `${formatNaira(order.pricing.productPaymentTotal)}.00`;
    const last4 = payment?.last4 || '4567';
    const expiry = payment?.expiry || '10/27';

    const modalHTML = `
      <div id="receipt-ticket-modal-overlay" class="receipt-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
        <div class="receipt-modal-dialog">
          
          <button type="button" class="receipt-modal-close-btn" id="receipt-close-btn" aria-label="Close receipt modal">
            &times;
          </button>

          <!-- Ticket Card inspired by screenshot -->
          <div class="receipt-ticket-card" id="receipt-ticket-modal-card">
            
            <!-- Festive Celebratory Poppers -->
            <div class="receipt-ticket-header">
              <div class="receipt-ticket-icon">
                <svg width="68" height="68" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <!-- Confetti particles -->
                  <circle cx="34" cy="12" r="2.5" fill="#10B981" />
                  <circle cx="48" cy="10" r="2" fill="#EF4444" />
                  <circle cx="56" cy="18" r="2.5" fill="#F59E0B" />
                  <circle cx="28" cy="18" r="2" fill="#06B6D4" />
                  <circle cx="52" cy="26" r="2" fill="#8B5CF6" />
                  <circle cx="40" cy="8" r="1.5" fill="#EC4899" />
                  
                  <!-- Streamers -->
                  <path d="M36 22C38 18 42 16 44 20C46 24 50 22 52 18" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                  <path d="M42 24C44 20 48 18 50 22C52 26 56 24 58 20" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                  <path d="M46 28C48 24 52 22 54 26C56 30 60 28 62 24" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" fill="none"/>
                  <path d="M32 24C34 20 37 19 39 23" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" fill="none"/>

                  <!-- Striped Cone -->
                  <g transform="rotate(-32 32 44)">
                    <path d="M22 52L14 30L38 38L22 52Z" fill="#FBBF24"/>
                    <path d="M19 43.5L16.5 36.5L31.5 42L29 48.5L19 43.5Z" fill="#FB7185"/>
                    <path d="M16.5 36.5L14 30L26 34.5L23.5 41L16.5 36.5Z" fill="#EF4444"/>
                    <path d="M20.5 47L19 43.5L29 48.5L30 50L20.5 47Z" fill="#F97316"/>
                  </g>
                </svg>
              </div>

              <h2 class="receipt-ticket-title" id="receipt-title">Thank you</h2>
              <p class="receipt-ticket-subtitle">
                Your payment has been processed successfully.
              </p>
            </div>

            <!-- Perforated Notched Separator -->
            <div class="receipt-ticket-perforation">
              <span class="receipt-ticket-notch-left" aria-hidden="true"></span>
              <div class="receipt-ticket-dashed-line"></div>
              <span class="receipt-ticket-notch-right" aria-hidden="true"></span>
            </div>

            <!-- Ticket Information Grid: 2x2 with consistent font sizes across all items -->
            <div class="receipt-ticket-body">
              <div class="receipt-info-grid">
                <div class="receipt-info-item">
                  <div class="receipt-info-label">ORDER REFERENCE</div>
                  <div class="receipt-info-val" id="receipt-order-ref-val">${orderReference}</div>
                </div>
                <div class="receipt-info-item">
                  <div class="receipt-info-label amount-label">AMOUNT</div>
                  <div class="receipt-info-val amount" id="receipt-amount-val">${formattedAmount}</div>
                </div>
                <div class="receipt-info-item">
                  <div class="receipt-info-label">PAYMENT REFERENCE</div>
                  <div class="receipt-info-val" id="receipt-payment-ref-val">${paymentReference}</div>
                </div>
                <div class="receipt-info-item">
                  <div class="receipt-info-label align-right">DATE & TIME</div>
                  <div class="receipt-info-val align-right" id="receipt-datetime-val">${formattedDateTime}</div>
                </div>
              </div>
            </div>

            <!-- Payment Method Pill -->
            <div class="receipt-payment-pill">
              <div class="receipt-card-brand-icon">
                <svg width="34" height="22" viewBox="0 0 34 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="11" cy="11" r="11" fill="#EB001B"/>
                  <circle cx="23" cy="11" r="11" fill="#F79E1B"/>
                  <path d="M17 3.27C19.26 5.09 20.73 7.87 20.73 11C20.73 14.13 19.26 16.91 17 18.73C14.74 16.91 13.27 14.13 13.27 11C13.27 7.87 14.74 5.09 17 3.27Z" fill="#FF5F00"/>
                </svg>
              </div>
              <div class="receipt-card-details">
                <span class="receipt-card-title">Mastercard ending in ${last4}</span>
                <span class="receipt-card-sub">Expiry: ${expiry}</span>
              </div>
            </div>

            <!-- Lower Dashed Divider -->
            <div class="receipt-ticket-lower-dash"></div>

            <!-- Barcode Section -->
            <div class="receipt-barcode-wrapper">
              <svg class="receipt-barcode-svg" width="220" height="42" viewBox="0 0 220 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="3" height="42" fill="#111827"/>
                <rect x="5" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="9" y="0" width="4" height="42" fill="#111827"/>
                <rect x="15" y="0" width="2" height="42" fill="#111827"/>
                <rect x="19" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="23" y="0" width="3.5" height="42" fill="#111827"/>
                <rect x="29" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="33" y="0" width="5" height="42" fill="#111827"/>
                <rect x="41" y="0" width="2" height="42" fill="#111827"/>
                <rect x="45" y="0" width="3" height="42" fill="#111827"/>
                <rect x="50" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="54" y="0" width="4" height="42" fill="#111827"/>
                <rect x="61" y="0" width="2.5" height="42" fill="#111827"/>
                <rect x="66" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="70" y="0" width="4" height="42" fill="#111827"/>
                <rect x="76" y="0" width="2" height="42" fill="#111827"/>
                <rect x="80" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="84" y="0" width="3" height="42" fill="#111827"/>
                <rect x="89" y="0" width="2" height="42" fill="#111827"/>
                <rect x="93" y="0" width="4" height="42" fill="#111827"/>
                <rect x="100" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="104" y="0" width="3" height="42" fill="#111827"/>
                <rect x="109" y="0" width="5" height="42" fill="#111827"/>
                <rect x="117" y="0" width="2" height="42" fill="#111827"/>
                <rect x="121" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="125" y="0" width="3.5" height="42" fill="#111827"/>
                <rect x="131" y="0" width="2" height="42" fill="#111827"/>
                <rect x="135" y="0" width="4" height="42" fill="#111827"/>
                <rect x="141" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="145" y="0" width="3" height="42" fill="#111827"/>
                <rect x="150" y="0" width="2" height="42" fill="#111827"/>
                <rect x="154" y="0" width="5" height="42" fill="#111827"/>
                <rect x="162" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="166" y="0" width="3" height="42" fill="#111827"/>
                <rect x="171" y="0" width="2.5" height="42" fill="#111827"/>
                <rect x="176" y="0" width="4" height="42" fill="#111827"/>
                <rect x="183" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="187" y="0" width="3" height="42" fill="#111827"/>
                <rect x="192" y="0" width="2" height="42" fill="#111827"/>
                <rect x="196" y="0" width="4" height="42" fill="#111827"/>
                <rect x="203" y="0" width="1.5" height="42" fill="#111827"/>
                <rect x="207" y="0" width="3" height="42" fill="#111827"/>
                <rect x="212" y="0" width="2" height="42" fill="#111827"/>
                <rect x="216" y="0" width="4" height="42" fill="#111827"/>
              </svg>
              <div class="receipt-barcode-number">400600890050002070013</div>
            </div>

            <!-- Scalloped Bottom Edge -->
            <div class="receipt-ticket-scallop-strip" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>

          <!-- Actions Toolbar -->
          <div class="receipt-modal-actions">
            <button type="button" class="receipt-download-btn" id="receipt-modal-download-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download Receipt
            </button>
            <button type="button" class="receipt-print-btn" id="receipt-modal-print-btn" title="Print or Save as PDF">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              Print
            </button>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.querySelector('#receipt-ticket-modal-overlay');
    requestAnimationFrame(() => {
      overlay.classList.add('is-active');
    });

    const closeModal = () => {
      overlay.classList.remove('is-active');
      setTimeout(() => overlay.remove(), 250);
      document.removeEventListener('keydown', handleKey);
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKey);

    document.querySelector('#receipt-close-btn')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    document.querySelector('#receipt-modal-download-btn')?.addEventListener('click', () => {
      this.downloadReceipt(order, payment, { orderReference, paymentReference, formattedAmount, formattedDateTime, last4, expiry });
    });

    document.querySelector('#receipt-modal-print-btn')?.addEventListener('click', () => {
      window.print();
    });
  }

  /**
   * Download receipt as an image PNG
   */
  downloadReceipt(order, payment, meta) {
    const downloadBtn = document.querySelector('#receipt-modal-download-btn');
    const originalText = downloadBtn ? downloadBtn.innerHTML : '';
    if (downloadBtn) {
      downloadBtn.innerHTML = `
        <span class="demopay-spinner" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;" aria-hidden="true"></span>
        Downloading...
      `;
    }

    try {
      const canvas = document.createElement('canvas');
      const scale = 2;
      const w = 400 * scale;
      const h = 600 * scale;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      const drawRoundRect = (c, x, y, width, height, radius, fill, stroke) => {
        c.beginPath();
        c.moveTo(x + radius, y);
        c.lineTo(x + width - radius, y);
        c.quadraticCurveTo(x + width, y, x + width, y + radius);
        c.lineTo(x + width, y + height - radius);
        c.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        c.lineTo(x + radius, y + height);
        c.quadraticCurveTo(x, y + height, x, y + height - radius);
        c.lineTo(x, y + radius);
        c.quadraticCurveTo(x, y, x + radius, y);
        c.closePath();
        if (fill) c.fill();
        if (stroke) c.stroke();
      };

      // 1. White card background
      ctx.fillStyle = '#FFFFFF';
      drawRoundRect(ctx, 0, 0, w, h, 24 * scale, true, false);

      // 2. Celebratory Party Popper Illustration
      const popperX = w / 2;
      const popperY = 55 * scale;
      
      const dots = [
        { x: popperX + 2 * scale, y: popperY - 26 * scale, r: 3 * scale, c: '#10B981' },
        { x: popperX + 16 * scale, y: popperY - 28 * scale, r: 2.5 * scale, c: '#EF4444' },
        { x: popperX + 24 * scale, y: popperY - 18 * scale, r: 3 * scale, c: '#F59E0B' },
        { x: popperX - 8 * scale, y: popperY - 18 * scale, r: 2.5 * scale, c: '#06B6D4' },
        { x: popperX + 20 * scale, y: popperY - 8 * scale, r: 2.5 * scale, c: '#8B5CF6' }
      ];
      dots.forEach(d => {
        ctx.fillStyle = d.c;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Streamers
      ctx.lineWidth = 2.5 * scale;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#10B981';
      ctx.beginPath();
      ctx.moveTo(popperX + 4 * scale, popperY - 14 * scale);
      ctx.quadraticCurveTo(popperX + 10 * scale, popperY - 20 * scale, popperX + 16 * scale, popperY - 14 * scale);
      ctx.stroke();

      ctx.strokeStyle = '#EF4444';
      ctx.beginPath();
      ctx.moveTo(popperX + 12 * scale, popperY - 12 * scale);
      ctx.quadraticCurveTo(popperX + 18 * scale, popperY - 18 * scale, popperX + 24 * scale, popperY - 12 * scale);
      ctx.stroke();

      // Cone (striped horn)
      ctx.save();
      ctx.translate(popperX, popperY);
      ctx.rotate(-0.55);
      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.moveTo(0, 18 * scale);
      ctx.lineTo(-12 * scale, -10 * scale);
      ctx.lineTo(12 * scale, -2 * scale);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.moveTo(-12 * scale, -10 * scale);
      ctx.lineTo(-5 * scale, 3 * scale);
      ctx.lineTo(6 * scale, 7 * scale);
      ctx.lineTo(0, -6 * scale);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FB7185';
      ctx.beginPath();
      ctx.moveTo(-6 * scale, 2 * scale);
      ctx.lineTo(-2 * scale, 12 * scale);
      ctx.lineTo(4 * scale, 14 * scale);
      ctx.lineTo(3 * scale, 5 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 3. Texts
      ctx.textAlign = 'center';
      ctx.fillStyle = '#111827';
      ctx.font = `bold ${24 * scale}px -apple-system, BlinkMacSystemFont, "DM Sans", sans-serif`;
      ctx.fillText('Thank you', w / 2, 118 * scale);

      ctx.fillStyle = '#64748B';
      ctx.font = `${14 * scale}px -apple-system, BlinkMacSystemFont, "DM Sans", sans-serif`;
      ctx.fillText('Your payment has been processed', w / 2, 142 * scale);
      ctx.fillText('successfully.', w / 2, 160 * scale);

      // 4. Dashed Perforation Line & Cutouts
      const perfY = 188 * scale;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2 * scale;
      ctx.setLineDash([6 * scale, 6 * scale]);
      ctx.beginPath();
      ctx.moveTo(24 * scale, perfY);
      ctx.lineTo(w - 24 * scale, perfY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Side cutouts
      ctx.fillStyle = '#1B242A';
      ctx.beginPath();
      ctx.arc(0, perfY, 14 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w, perfY, 14 * scale, 0, Math.PI * 2);
      ctx.fill();

      // 5. Details Grid (2x2 with strict font size consistency across labels and values)
      const padX = 32 * scale;
      const labelFontSize = 11 * scale;
      const valueFontSize = 13.5 * scale;
      const labelFont = `600 ${labelFontSize}px -apple-system, BlinkMacSystemFont, "DM Sans", sans-serif`;
      const valueFont = `600 ${valueFontSize}px -apple-system, BlinkMacSystemFont, "DM Sans", sans-serif`;

      // Row 1: ORDER REFERENCE (left) & AMOUNT (right)
      const row1Y = 222 * scale;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748B';
      ctx.font = labelFont;
      ctx.fillText('ORDER REFERENCE', padX, row1Y);

      ctx.textAlign = 'right';
      ctx.fillText('AMOUNT', w - padX, row1Y);

      const val1Y = 244 * scale;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#111827';
      ctx.font = valueFont;
      ctx.fillText(meta.orderReference, padX, val1Y);

      ctx.textAlign = 'right';
      ctx.fillText(meta.formattedAmount, w - padX, val1Y);

      // Row 2: PAYMENT REFERENCE (left) & DATE & TIME (right)
      const row2Y = 278 * scale;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748B';
      ctx.font = labelFont;
      ctx.fillText('PAYMENT REFERENCE', padX, row2Y);

      ctx.textAlign = 'right';
      ctx.fillText('DATE & TIME', w - padX, row2Y);

      const val2Y = 298 * scale;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#111827';
      ctx.font = valueFont;
      ctx.fillText(meta.paymentReference, padX, val2Y);

      ctx.textAlign = 'right';
      ctx.fillText(meta.formattedDateTime, w - padX, val2Y);

      // 6. Payment Pill Box
      const pillY = 330 * scale;
      const pillH = 56 * scale;
      ctx.fillStyle = '#EEF3FA';
      drawRoundRect(ctx, padX, pillY, w - padX * 2, pillH, 12 * scale, true, false);

      const mcX = padX + 24 * scale;
      const mcY = pillY + pillH / 2;
      ctx.fillStyle = '#EB001B';
      ctx.beginPath();
      ctx.arc(mcX - 6 * scale, mcY, 10 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F79E1B';
      ctx.beginPath();
      ctx.arc(mcX + 6 * scale, mcY, 10 * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#111827';
      ctx.font = `600 ${14 * scale}px -apple-system, BlinkMacSystemFont, "DM Sans", sans-serif`;
      ctx.fillText(`Mastercard ending in ${meta.last4}`, mcX + 24 * scale, mcY - 2 * scale);

      ctx.fillStyle = '#64748B';
      ctx.font = `${12 * scale}px -apple-system, BlinkMacSystemFont, "DM Sans", sans-serif`;
      ctx.fillText(`Expiry: ${meta.expiry}`, mcX + 24 * scale, mcY + 14 * scale);

      // 7. Lower Dashed Line
      const lowerDashedY = 416 * scale;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2 * scale;
      ctx.setLineDash([6 * scale, 6 * scale]);
      ctx.beginPath();
      ctx.moveTo(padX, lowerDashedY);
      ctx.lineTo(w - padX, lowerDashedY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 8. Barcode
      const barY = 444 * scale;
      const barH = 38 * scale;
      ctx.fillStyle = '#111827';
      const bars = [3, 1.5, 4, 2, 1.5, 3.5, 1.5, 5, 2, 3, 1.5, 4, 2.5, 1.5, 4, 2, 1.5, 3, 2, 4, 1.5, 3, 5, 2, 1.5, 3.5, 2, 4, 1.5, 3, 2, 5, 1.5, 3, 2.5, 4, 1.5, 3, 2, 4, 1.5, 3, 2, 4];
      let curX = (w - 220 * scale) / 2;
      bars.forEach(bw => {
        ctx.fillRect(curX, barY, bw * scale, barH);
        curX += (bw + 2) * scale;
      });

      ctx.textAlign = 'center';
      ctx.fillStyle = '#374151';
      ctx.font = `600 ${11 * scale}px monospace`;
      ctx.fillText('400600890050002070013', w / 2, barY + barH + 18 * scale);

      // 9. Bottom Scallops
      const scallopY = h - 2 * scale;
      ctx.fillStyle = '#1B242A';
      const scallopCount = 6;
      const scallopSpacing = w / (scallopCount + 1);
      for (let i = 1; i <= scallopCount; i++) {
        ctx.beginPath();
        ctx.arc(i * scallopSpacing, scallopY, 10 * scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // Convert to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Slimky_Receipt_${meta.orderReference || order.orderNumber || order.id || 'order'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        if (downloadBtn) downloadBtn.innerHTML = originalText;
      }, 'image/png');
    } catch (err) {
      console.error('[Receipt Download Error]', err);
      if (downloadBtn) downloadBtn.innerHTML = originalText;
      window.print();
    }
  }
}

// Auto-initialize on DOM ready or immediately if document is already loaded
function initCheckoutApp() {
  if (window.__checkoutPageInitialized) return;
  if (document.querySelector('#checkout-layout') || document.querySelector('#checkout-form')) {
    window.__checkoutPage = new CheckoutPage();
    window.__checkoutPageInitialized = true;
  }
  initNavigation();
  initDrawers();
  syncWishlistUI();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckoutApp);
  } else {
    initCheckoutApp();
  }
}
