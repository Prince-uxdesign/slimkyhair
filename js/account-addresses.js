/**
 * Customer Saved Addresses Page Controller - Slimky Hair
 * Milestone C19.6: Customer Saved Addresses & Management
 */

import { initAccountShell } from './account-shell.js';
import { customerService } from './auth/customer-service.js';
import {
  SUPPORTED_COUNTRIES,
  NIGERIAN_STATES,
  ADDRESS_LABELS,
  validateAddressData,
  formatAddressLines
} from './auth/customer-address-book.js';

class AccountAddressesController {
  constructor() {
    this.customer = null;
    this.addresses = [];
    this.activeModalMode = 'add'; // 'add' | 'edit'
    this.editingAddressId = null;
    this.deletingAddressId = null;

    // DOM References
    this.listContainer = document.querySelector('#account-addresses-list');
    this.feedbackContainer = document.querySelector('#addresses-feedback');
    this.addBtnTrigger = document.querySelector('#add-address-trigger-btn');

    // Add / Edit Modal Elements
    this.formModal = document.querySelector('#address-form-modal');
    this.modalTitle = document.querySelector('#address-modal-title');
    this.modalCloseBtn = document.querySelector('#btn-close-address-modal');
    this.modalCancelBtn = document.querySelector('#btn-cancel-address-modal');
    this.addressForm = document.querySelector('#customer-address-form');
    this.modalFeedback = document.querySelector('#address-modal-feedback');

    // Form Field Inputs
    this.labelSelect = document.querySelector('#addr-label');
    this.recipientNameInput = document.querySelector('#addr-recipient-name');
    this.phoneInput = document.querySelector('#addr-phone');
    this.countrySelect = document.querySelector('#addr-country');
    this.ngStateSelect = document.querySelector('#addr-ng-state');
    this.intlStateInput = document.querySelector('#addr-intl-state');
    this.cityInput = document.querySelector('#addr-city');
    this.postalInput = document.querySelector('#addr-postal');
    this.streetInput = document.querySelector('#addr-street');
    this.instructionsInput = document.querySelector('#addr-instructions');
    this.isDefaultCheckbox = document.querySelector('#addr-is-default');

    // Field Error Containers
    this.ngStateWrapper = document.querySelector('#wrapper-ng-state');
    this.intlStateWrapper = document.querySelector('#wrapper-intl-state');
    this.postalWrapper = document.querySelector('#wrapper-postal');

    // Delete Confirmation Modal Elements
    this.deleteModal = document.querySelector('#address-delete-modal');
    this.deleteModalCloseBtn = document.querySelector('#btn-close-delete-modal');
    this.deleteModalCancelBtn = document.querySelector('#btn-cancel-delete-modal');
    this.deleteModalConfirmBtn = document.querySelector('#btn-confirm-delete-address');
    this.deleteTargetPreview = document.querySelector('#delete-target-preview');
  }

  async init() {
    // 1. Guard route - authenticated customers only
    this.customer = customerService.getCurrentCustomer();
    if (!this.customer) {
      const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
      const rootPrefix = this.computeRootPrefix();
      window.location.replace(`${rootPrefix}account/login/?redirect=${redirectUrl}`);
      return;
    }

    // 2. Initialize account shell & active navigation
    initAccountShell({ activeNav: 'addresses', rootPrefix: this.computeRootPrefix() });

    // 3. Populate Country & State Select Options
    this.populateSelectOptions();

    // 4. Attach Event Listeners
    this.attachEventListeners();

    // 5. Initial Render
    await this.loadAndRenderAddresses();
  }

  computeRootPrefix() {
    return window.location.pathname.includes('/account/addresses/') ? '../../' : '../';
  }

  populateSelectOptions() {
    // Populate Countries
    if (this.countrySelect) {
      this.countrySelect.innerHTML = SUPPORTED_COUNTRIES.map(c => 
        `<option value="${c}" ${c === 'Nigeria' ? 'selected' : ''}>${c}</option>`
      ).join('');
    }

    // Populate Nigerian States
    if (this.ngStateSelect) {
      this.ngStateSelect.innerHTML = [
        '<option value="">Select Delivery State...</option>',
        ...NIGERIAN_STATES.map(s => `<option value="${s}">${s}</option>`)
      ].join('');
    }

    // Populate Address Labels
    if (this.labelSelect) {
      this.labelSelect.innerHTML = ADDRESS_LABELS.map(lbl => 
        `<option value="${lbl}">${lbl}</option>`
      ).join('');
    }
  }

  attachEventListeners() {
    // Open Add Modal
    this.addBtnTrigger?.addEventListener('click', () => this.openAddModal());

    // Modal Close buttons
    this.modalCloseBtn?.addEventListener('click', () => this.closeFormModal());
    this.modalCancelBtn?.addEventListener('click', () => this.closeFormModal());
    this.formModal?.addEventListener('click', (e) => {
      if (e.target === this.formModal) this.closeFormModal();
    });

    // Delete Modal Close buttons
    this.deleteModalCloseBtn?.addEventListener('click', () => this.closeDeleteModal());
    this.deleteModalCancelBtn?.addEventListener('click', () => this.closeDeleteModal());
    this.deleteModal?.addEventListener('click', (e) => {
      if (e.target === this.deleteModal) this.closeDeleteModal();
    });

    // Delete Confirm
    this.deleteModalConfirmBtn?.addEventListener('click', () => this.confirmDelete());

    // Country Switcher
    this.countrySelect?.addEventListener('change', () => this.handleCountryChange());

    // Form Submit
    this.addressForm?.addEventListener('submit', (e) => this.handleFormSubmit(e));

    // Keyboard navigation (Escape key)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.formModal && this.formModal.style.display !== 'none') this.closeFormModal();
        if (this.deleteModal && this.deleteModal.style.display !== 'none') this.closeDeleteModal();
      }
    });
  }

  handleCountryChange() {
    const country = (this.countrySelect?.value || 'Nigeria').trim();
    const isNigeria = country.toLowerCase() === 'nigeria';

    if (this.ngStateWrapper) {
      this.ngStateWrapper.style.display = isNigeria ? 'block' : 'none';
      const select = this.ngStateWrapper.querySelector('select');
      if (select) select.required = isNigeria;
    }

    if (this.intlStateWrapper) {
      this.intlStateWrapper.style.display = isNigeria ? 'none' : 'block';
      const input = this.intlStateWrapper.querySelector('input');
      if (input) input.required = !isNigeria;
    }

    if (this.postalWrapper) {
      this.postalWrapper.style.display = isNigeria ? 'none' : 'block';
      const input = this.postalWrapper.querySelector('input');
      if (input) input.required = !isNigeria;
    }
  }

  async loadAndRenderAddresses() {
    this.addresses = await customerService.getAddresses(this.customer.id) || [];
    this.renderAddressList();
  }

  renderAddressList() {
    if (!this.listContainer) return;

    if (this.addresses.length === 0) {
      this.listContainer.innerHTML = `
        <div class="dashboard-empty-state" style="grid-column: 1 / -1; margin-top: 12px;">
          <div class="dashboard-empty-icon" aria-hidden="true">📍</div>
          <h3 class="dashboard-empty-title">No saved addresses yet</h3>
          <p class="dashboard-empty-desc">
            Save your home or office address to speed through checkout on future botanical hair care orders.
          </p>
          <button type="button" id="empty-add-address-btn" class="btn-primary" style="margin-top: 18px; min-height: 44px; padding: 0 24px;">
            + Add Your First Address
          </button>
        </div>
      `;

      document.querySelector('#empty-add-address-btn')?.addEventListener('click', () => {
        this.openAddModal();
      });
      return;
    }

    this.listContainer.innerHTML = this.addresses.map(addr => {
      const isDefault = !!addr.isDefault;
      const lines = formatAddressLines(addr);

      return `
        <article class="address-card ${isDefault ? 'is-default' : ''}" data-address-id="${addr.id}" aria-label="${addr.label || 'Delivery'} Address">
          <div class="address-card-header">
            <div class="address-card-badges">
              <span class="address-tag-label">${addr.label || 'Home'}</span>
              ${isDefault ? '<span class="account-status-badge status-active">Default Address</span>' : ''}
            </div>
          </div>

          <div class="address-card-body">
            <h3 class="address-card-recipient">${this.escapeHtml(addr.recipientName || this.customer.fullName || 'Valued Customer')}</h3>
            <div class="address-card-phone">
              <span aria-hidden="true">📞</span>
              <span>${this.escapeHtml(addr.phone || 'No phone provided')}</span>
            </div>

            <div class="address-card-location">
              ${lines.map(line => `<div>${this.escapeHtml(line)}</div>`).join('')}
            </div>

            ${addr.deliveryInstructions ? `
              <div class="address-card-instructions">
                <strong>Note:</strong> ${this.escapeHtml(addr.deliveryInstructions)}
              </div>
            ` : ''}
          </div>

          <div class="address-card-actions">
            <div class="address-card-action-group">
              <button type="button" class="btn-address-action btn-outline btn-edit-address" data-id="${addr.id}" aria-label="Edit address for ${this.escapeHtml(addr.recipientName)}">
                Edit
              </button>
              <button type="button" class="btn-address-action btn-address-delete btn-delete-address" data-id="${addr.id}" aria-label="Delete address for ${this.escapeHtml(addr.recipientName)}">
                Delete
              </button>
            </div>

            ${!isDefault ? `
              <button type="button" class="btn-address-action btn-address-default btn-set-default" data-id="${addr.id}" aria-label="Set ${this.escapeHtml(addr.label || 'this address')} as default">
                Set as Default
              </button>
            ` : `
              <span class="address-default-indicator" aria-label="Current Default Address">
                ✓ Primary Destination
              </span>
            `}
          </div>
        </article>
      `;
    }).join('');

    // Attach card actions
    this.listContainer.querySelectorAll('.btn-edit-address').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.openEditModal(id);
      });
    });

    this.listContainer.querySelectorAll('.btn-delete-address').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.openDeleteModal(id);
      });
    });

    this.listContainer.querySelectorAll('.btn-set-default').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.handleSetDefault(id);
      });
    });
  }

  openAddModal() {
    this.activeModalMode = 'add';
    this.editingAddressId = null;
    if (this.modalTitle) this.modalTitle.textContent = 'Add New Delivery Address';
    if (this.modalFeedback) this.modalFeedback.style.display = 'none';

    this.addressForm?.reset();

    // Default values
    if (this.labelSelect) this.labelSelect.value = 'Home';
    if (this.recipientNameInput) this.recipientNameInput.value = this.customer.fullName || '';
    if (this.phoneInput) this.phoneInput.value = this.customer.phone || '';
    if (this.countrySelect) this.countrySelect.value = 'Nigeria';
    if (this.isDefaultCheckbox) {
      this.isDefaultCheckbox.checked = this.addresses.length === 0;
      this.isDefaultCheckbox.disabled = this.addresses.length === 0; // First address must be default
    }

    this.handleCountryChange();
    this.clearErrors();

    if (this.formModal) {
      this.formModal.style.display = 'flex';
      setTimeout(() => this.recipientNameInput?.focus(), 50);
    }
  }

  openEditModal(addressId) {
    const address = this.addresses.find(a => a.id === addressId);
    if (!address) return;

    this.activeModalMode = 'edit';
    this.editingAddressId = addressId;
    if (this.modalTitle) this.modalTitle.textContent = 'Edit Delivery Address';
    if (this.modalFeedback) this.modalFeedback.style.display = 'none';

    this.clearErrors();

    if (this.labelSelect) this.labelSelect.value = address.label || 'Home';
    if (this.recipientNameInput) this.recipientNameInput.value = address.recipientName || '';
    if (this.phoneInput) this.phoneInput.value = address.phone || '';
    if (this.countrySelect) this.countrySelect.value = address.country || 'Nigeria';

    this.handleCountryChange();

    const isNigeria = (address.country || 'Nigeria').toLowerCase() === 'nigeria';
    if (isNigeria && this.ngStateSelect) {
      this.ngStateSelect.value = address.state || '';
    } else if (!isNigeria && this.intlStateInput) {
      this.intlStateInput.value = address.state || '';
    }

    if (this.cityInput) this.cityInput.value = address.city || '';
    if (this.postalInput) this.postalInput.value = address.postalCode || '';
    if (this.streetInput) this.streetInput.value = address.streetAddress || '';
    if (this.instructionsInput) this.instructionsInput.value = address.deliveryInstructions || '';

    if (this.isDefaultCheckbox) {
      this.isDefaultCheckbox.checked = !!address.isDefault;
      // If it's the only address, keep it locked as default
      this.isDefaultCheckbox.disabled = !!address.isDefault && this.addresses.length === 1;
    }

    if (this.formModal) {
      this.formModal.style.display = 'flex';
      setTimeout(() => this.recipientNameInput?.focus(), 50);
    }
  }

  closeFormModal() {
    if (this.formModal) this.formModal.style.display = 'none';
    this.editingAddressId = null;
  }

  openDeleteModal(addressId) {
    const address = this.addresses.find(a => a.id === addressId);
    if (!address) return;

    this.deletingAddressId = addressId;
    if (this.deleteTargetPreview) {
      this.deleteTargetPreview.innerHTML = `
        <div style="background: var(--color-bg-primary); border: 1px solid var(--color-border-subtle); border-radius: 6px; padding: 14px; margin: 16px 0; text-align: left; font-size: 0.875rem;">
          <div style="font-weight: 600; margin-bottom: 4px;">${this.escapeHtml(address.recipientName)} (${this.escapeHtml(address.label || 'Address')})</div>
          <div style="color: var(--color-text-secondary);">${this.escapeHtml(address.streetAddress)}, ${this.escapeHtml(address.city)}</div>
          ${address.isDefault ? '<div style="margin-top: 6px;"><span class="account-status-badge status-active">Default Address</span></div>' : ''}
        </div>
      `;
    }

    if (this.deleteModal) {
      this.deleteModal.style.display = 'flex';
    }
  }

  closeDeleteModal() {
    if (this.deleteModal) this.deleteModal.style.display = 'none';
    this.deletingAddressId = null;
  }

  async confirmDelete() {
    if (!this.deletingAddressId) return;

    const addressToDelete = this.addresses.find(a => a.id === this.deletingAddressId);
    const wasDefault = addressToDelete?.isDefault;

    const success = await customerService.deleteAddress(this.customer.id, this.deletingAddressId);
    this.closeDeleteModal();

    if (success) {
      this.showToast(wasDefault && this.addresses.length > 1
        ? 'Address deleted. Your next saved address has been set as default.'
        : 'Address deleted successfully.', 'success');
      await this.loadAndRenderAddresses();
    } else {
      this.showToast('Failed to delete address. Please try again.', 'error');
    }
  }

  async handleSetDefault(addressId) {
    const success = await customerService.setDefaultAddress(this.customer.id, addressId);
    if (success) {
      this.showToast('Default delivery address updated.', 'success');
      await this.loadAndRenderAddresses();
    } else {
      this.showToast('Could not update default address.', 'error');
    }
  }

  async handleFormSubmit(e) {
    e.preventDefault();
    this.clearErrors();

    const country = (this.countrySelect?.value || 'Nigeria').trim();
    const isNigeria = country.toLowerCase() === 'nigeria';

    const state = isNigeria 
      ? (this.ngStateSelect?.value || '').trim()
      : (this.intlStateInput?.value || '').trim();

    const addressData = {
      id: this.editingAddressId,
      label: (this.labelSelect?.value || 'Home').trim(),
      recipientName: (this.recipientNameInput?.value || '').trim(),
      phone: (this.phoneInput?.value || '').trim(),
      country,
      state,
      city: (this.cityInput?.value || '').trim(),
      postalCode: (this.postalInput?.value || '').trim(),
      streetAddress: (this.streetInput?.value || '').trim(),
      deliveryInstructions: (this.instructionsInput?.value || '').trim(),
      isDefault: this.isDefaultCheckbox?.checked || false
    };

    // Validate
    const validation = validateAddressData(addressData);
    if (!validation.isValid) {
      this.displayErrors(validation.errors);
      return;
    }

    try {
      await customerService.saveAddress(this.customer.id, addressData);
      this.closeFormModal();
      this.showToast(this.activeModalMode === 'edit' ? 'Address updated successfully.' : 'New delivery address saved.', 'success');
      await this.loadAndRenderAddresses();
    } catch (err) {
      console.error('[AccountAddresses] Error saving address:', err);
      if (this.modalFeedback) {
        this.modalFeedback.textContent = err.message || 'Error saving address. Please try again.';
        this.modalFeedback.style.color = '#B42318';
        this.modalFeedback.style.display = 'block';
      }
    }
  }

  displayErrors(errors) {
    for (const [field, msg] of Object.entries(errors)) {
      const errEl = document.querySelector(`#error-${field}`);
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
    }
  }

  clearErrors() {
    document.querySelectorAll('.address-field-error').forEach(el => {
      el.textContent = '';
      el.style.display = 'none';
    });
  }

  showToast(message, type = 'success') {
    if (!this.feedbackContainer) return;
    this.feedbackContainer.textContent = message;
    this.feedbackContainer.style.background = type === 'success' ? '#EBEFE9' : '#FDF0EE';
    this.feedbackContainer.style.color = type === 'success' ? '#2A3830' : '#B42318';
    this.feedbackContainer.style.border = `1px solid ${type === 'success' ? '#B9C6B5' : '#FECDCA'}`;
    this.feedbackContainer.style.padding = '12px 18px';
    this.feedbackContainer.style.borderRadius = '6px';
    this.feedbackContainer.style.display = 'block';

    setTimeout(() => {
      if (this.feedbackContainer) this.feedbackContainer.style.display = 'none';
    }, 4500);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const controller = new AccountAddressesController();
  controller.init().catch(err => {
    console.error('[AccountAddresses] Failed initialization:', err);
  });
});
