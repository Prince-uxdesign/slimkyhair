import { DEMO_TEST_CARDS, PAYMENT_STATUS, PAYMENT_LIFECYCLE_STATES } from './payment-model.js';
import { paymentService } from './payment-service.js';

export class DemoPaymentUI {
  constructor(options = {}) {
    this.options = options;
    this.modalEl = null;
    this.currentPayment = null;
    this.currentOrder = null;
    this.isSubmitting = false;
    this.state = PAYMENT_LIFECYCLE_STATES.IDLE;
    this.failureReason = null;
    this.lastResult = null;
    this.selectedPreset = 'SUCCESS';
    this.mode = 'product';
    this.amountLabel = 'Product Payment Total';

    this.onSuccess = options.onSuccess || (() => {});
    this.onDeclined = options.onDeclined || (() => {});
    this.onFailure = options.onFailure || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.onRetry = options.onRetry || (() => {});

    this.initDOM();
  }

  initDOM() {
    let backdrop = document.querySelector('#demopay-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'demopay-modal-backdrop';
      backdrop.className = 'demopay-modal-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'demopay-title');
      document.body.appendChild(backdrop);
    }
    this.modalEl = backdrop;

    // Handle Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.handleCancel();
      }
    });

    // Close on backdrop click (outside modal card)
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl && !this.isSubmitting && this.state !== PAYMENT_LIFECYCLE_STATES.PROCESSING) {
        this.handleCancel();
      }
    });

    // Milestone C20.6: Mobile Browser Back Navigation Handler (Popstate Safety)
    this.handlePopState = (e) => {
      if (this.isOpen()) {
        // Intercept back navigation, cleanly dismiss modal without corrupting cart or form
        this.close(false);
        this.onCancel();
      }
    };
    window.addEventListener('popstate', this.handlePopState);
  }

  isOpen() {
    return this.modalEl && this.modalEl.classList.contains('is-open');
  }

  /**
   * Transition lifecycle state and re-render.
   * @param {string} newState - One of PAYMENT_LIFECYCLE_STATES
   * @param {Object} [meta]
   */
  setState(newState, meta = {}) {
    this.state = newState;
    if (meta.failureReason !== undefined) this.failureReason = meta.failureReason;
    if (meta.order) this.currentOrder = meta.order;
    if (meta.payment) this.currentPayment = meta.payment;
    if (meta.lastResult) this.lastResult = meta.lastResult;
    this.render();
  }

  /**
   * Open DemoPay modal with active order and payment data.
   * @param {Object} params
   * @param {Object} params.order
   * @param {Object} params.payment
   * @param {string} [params.initialState] - Optional initial lifecycle state
   * @param {string} [params.failureReason] - Optional initial failure reason
   * @param {string} [params.mode='product'] - 'product' or 'shipping' — determines which payment pipeline handles submit/retry/cancel
   * @param {string} [params.amountLabel] - Display label above the amount (defaults per mode)
   */
  open({ order, payment, initialState = PAYMENT_LIFECYCLE_STATES.IDLE, failureReason = null, mode = 'product', amountLabel = null }) {
    this.currentOrder = order;
    this.currentPayment = payment;
    this.isSubmitting = false;
    this.failureReason = failureReason;
    this.state = initialState;
    this.mode = mode;
    this.amountLabel = amountLabel || (mode === 'shipping' ? 'Shipping Fee' : 'Product Payment Total');

    // Refresh recovery: If payment was left in processing, recover safely to pending/idle
    if (this.currentPayment?.status === 'processing') {
      this.currentPayment.status = 'pending';
    }

    // Push history state to protect mobile back navigation
    try {
      if (typeof window !== 'undefined' && window.history && !window.history.state?.slimkyPaymentModal) {
        window.history.pushState({ slimkyPaymentModal: true }, '');
      }
    } catch (e) {
      console.warn('[DemoPaymentUI] History pushState error:', e);
    }

    this.render();
    this.modalEl.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    // Autofocus appropriate element
    setTimeout(() => {
      if (this.state === PAYMENT_LIFECYCLE_STATES.FAILED) {
        const retryBtn = this.modalEl.querySelector('#demopay-retry-btn');
        if (retryBtn) retryBtn.focus();
      } else if (this.state === PAYMENT_LIFECYCLE_STATES.SUCCESSFUL) {
        const receiptBtn = this.modalEl.querySelector('#demopay-view-receipt-btn');
        if (receiptBtn) receiptBtn.focus();
      } else {
        const submitBtn = this.modalEl.querySelector('#demopay-submit-btn');
        if (submitBtn) submitBtn.focus();
      }
    }, 100);
  }

  close(syncHistory = true) {
    if (this.modalEl) {
      this.modalEl.classList.remove('is-open');
    }
    document.body.style.overflow = '';

    if (syncHistory) {
      try {
        if (typeof window !== 'undefined' && window.history.state?.slimkyPaymentModal) {
          window.history.back();
        }
      } catch (e) {
        console.warn('[DemoPaymentUI] History back error:', e);
      }
    }
  }

  render() {
    if (!this.modalEl || !this.currentOrder || !this.currentPayment) return;

    const formattedAmount = `₦${Number(this.currentPayment.amount).toLocaleString('en-NG')}`;
    const orderRef = this.currentOrder.orderNumber || this.currentOrder.orderReference || this.currentOrder.id || 'CHK_DEMO';
    const paymentRef = this.currentPayment.transactionReference || this.currentPayment.providerReference || 'DEMO-PAY';
    const attemptNum = this.currentPayment.attemptNumber || 1;

    let bodyHTML = '';

    switch (this.state) {
      case PAYMENT_LIFECYCLE_STATES.PROCESSING:
        bodyHTML = this.renderProcessingView(formattedAmount, orderRef);
        break;

      case PAYMENT_LIFECYCLE_STATES.FAILED:
        bodyHTML = this.renderFailedView(formattedAmount, orderRef, paymentRef);
        break;

      case PAYMENT_LIFECYCLE_STATES.SUCCESSFUL:
        bodyHTML = this.renderSuccessfulView(formattedAmount, orderRef, paymentRef);
        break;

      case PAYMENT_LIFECYCLE_STATES.IDLE:
      case PAYMENT_LIFECYCLE_STATES.INITIALIZING:
      default:
        bodyHTML = this.renderReadyView(formattedAmount, orderRef, paymentRef, attemptNum);
        break;
    }

    this.modalEl.innerHTML = `
      <div class="demopay-modal" data-state="${this.state}">
        <!-- Header -->
        <div class="demopay-header">
          <div class="demopay-title-group">
            <span class="demopay-logo-mark" aria-hidden="true">★</span>
            <div>
              <h3 id="demopay-title" class="demopay-title">Demo Payment</h3>
              <span style="font-size: 0.75rem; color: var(--color-text-secondary);">Internal Sandbox Mode</span>
            </div>
          </div>
          ${this.state !== PAYMENT_LIFECYCLE_STATES.PROCESSING ? `
            <button type="button" class="demopay-close-btn" id="demopay-close-trigger" aria-label="Cancel and close Demo Payment">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          ` : ''}
        </div>

        <!-- Strict Test Mode Banner -->
        <div class="demopay-test-banner">
          <span class="demopay-test-badge">Test Payment</span>
          <span>Test Payment — No real money will be charged.</span>
        </div>

        <!-- Body Content according to State -->
        <div class="demopay-body">
          ${bodyHTML}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * Render Ready / Idle Payment Form
   */
  renderReadyView(formattedAmount, orderRef, paymentRef, attemptNum) {
    const defaultName = this.currentOrder?.customer?.fullName || 'Ada Lovelace';
    const isRetry = attemptNum > 1;

    return `
      <!-- Read-Only Canonical Order Amount -->
      <div class="demopay-amount-box">
        <div>
          <div class="demopay-amount-label">${this.amountLabel}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-secondary); margin-top: 2px;">Ref: ${orderRef}</div>
        </div>
        <div style="text-align: right;">
          <div class="demopay-amount-value" id="demopay-display-amount">${formattedAmount}</div>
          <div style="font-size: 0.6875rem; color: #92400E; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px;">
            ${isRetry ? `Attempt #${attemptNum}` : 'Test Payment'}
          </div>
        </div>
      </div>

      ${isRetry ? `
        <div class="demopay-retry-notice" role="status" style="padding: 10px 14px; background: #FEF3C7; border: 1px solid #FCD34D; border-radius: var(--radius-xs, 2px); margin-bottom: 16px; font-size: 0.8125rem; color: #92400E; display: flex; align-items: center; gap: 8px;">
          <span aria-hidden="true">↺</span>
          <span>Retrying payment under Order Reference: <strong>${orderRef}</strong> (Attempt #${attemptNum})</span>
        </div>
      ` : ''}

      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-secondary, #F7F5F0); border: 1px solid var(--color-border-subtle, #E8E2D9); border-radius: var(--radius-xs, 2px); margin-bottom: 16px; font-size: 0.8125rem;">
        <span style="color: var(--color-text-secondary); font-weight: 500;">Provider Gateway</span>
        <span style="font-weight: 600; color: var(--color-text-primary);">Demo Payment (Internal Gateway)</span>
      </div>

      <!-- Alert Container for Dynamic Status -->
      <div id="demopay-alert" class="demopay-alert" role="alert" aria-live="assertive" style="display: none;"></div>

      <!-- Simulation Controls -->
      <div class="demopay-simulation-controls" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
        <button type="button" id="demopay-submit-btn" class="demopay-submit-btn">
          <span>Simulate Successful Payment</span>
        </button>
        <button type="button" id="demopay-simulate-fail-btn" class="demopay-simulate-fail-btn">
          <span>Simulate Failed Payment</span>
        </button>
      </div>

      <!-- Quick Test Presets -->
      <div class="demopay-presets-box">
        <div class="demopay-presets-title">Deterministic Test Presets</div>
        <div class="demopay-preset-buttons">
          <button type="button" class="demopay-preset-btn ${this.selectedPreset === 'SUCCESS' ? 'is-active' : ''}" data-test="SUCCESS" title="Approve Payment">
            ✓ Test Success
          </button>
          <button type="button" class="demopay-preset-btn ${this.selectedPreset === 'DECLINED' ? 'is-active' : ''}" data-test="DECLINED" title="Simulate Card Declined">
            ✕ Test Decline
          </button>
          <button type="button" class="demopay-preset-btn ${this.selectedPreset === 'FAILED' ? 'is-active' : ''}" data-test="FAILED" title="Simulate Gateway Failure">
            ! Test Failure
          </button>
          <button type="button" class="demopay-preset-btn ${this.selectedPreset === 'TIMEOUT' ? 'is-active' : ''}" id="demopay-preset-timeout" data-test="TIMEOUT" title="Simulate Network Timeout">
            ⏱ Timeout
          </button>
        </div>
      </div>

      <!-- Hidden Form for Compatibility with Automated Programmatic Tests -->
      <form id="demopay-form" style="display: none;" aria-hidden="true">
        <input type="hidden" id="demopay-cardholder" value="${defaultName}">
        <input type="hidden" id="demopay-card-number" value="${DEMO_TEST_CARDS.SUCCESS.formatted}">
        <input type="hidden" id="demopay-expiry" value="12/28">
        <input type="hidden" id="demopay-cvv" value="123">
      </form>

      <!-- Actions -->
      <div class="demopay-actions">
        <button type="button" id="demopay-cancel-btn" class="demopay-cancel-btn">
          Cancel &amp; Return to Checkout
        </button>
      </div>
    `;
  }

  /**
   * Render Dedicated Processing State View
   */
  renderProcessingView(formattedAmount, orderRef) {
    return `
      <div class="demopay-status-view is-processing" role="status" aria-live="polite" aria-busy="true">
        <div class="demopay-status-icon-box">
          <div class="demopay-spinner-large" aria-hidden="true"></div>
        </div>
        
        <h2 class="demopay-status-title">Processing Payment...</h2>
        
        <p class="demopay-status-desc">
          Connecting to Demo Payment Provider. Please do not close or refresh your browser.
        </p>

        <div class="demopay-status-details-box">
          <div class="demopay-status-row">
            <span class="demopay-status-label">Order</span>
            <span class="demopay-status-val font-mono">${orderRef}</span>
          </div>
          <div class="demopay-status-row">
            <span class="demopay-status-label">Total Amount</span>
            <span class="demopay-status-val" style="font-weight: 600;">${formattedAmount}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Dedicated Mobile-First Failed State View (Milestone C20.6)
   */
  renderFailedView(formattedAmount, orderRef, paymentRef) {
    const reason = this.failureReason || 'Your transaction could not be authorized by the demo gateway.';

    return `
      <div class="demopay-status-view is-failed" role="alert" aria-live="assertive">
        <div class="demopay-status-icon-box demopay-icon-failed" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>

        <h2 class="demopay-status-title">Payment could not be completed.</h2>

        <div class="demopay-status-reason">
          ${reason}
        </div>

        <div class="demopay-status-safe-notice">
          <span class="demopay-shield-icon" aria-hidden="true">🛡</span>
          <span>Your card was not charged. Your shopping bag and order information remain safe.</span>
        </div>

        <div class="demopay-status-details-box">
          <div class="demopay-status-row">
            <span class="demopay-status-label">Order Reference</span>
            <span class="demopay-status-val font-mono">${orderRef}</span>
          </div>
          <div class="demopay-status-row">
            <span class="demopay-status-label">Payment Reference</span>
            <span class="demopay-status-val font-mono">${paymentRef}</span>
          </div>
          <div class="demopay-status-row">
            <span class="demopay-status-label">Amount</span>
            <span class="demopay-status-val">${formattedAmount}</span>
          </div>
        </div>

        <!-- Full-width Vertical CTA Stack (Mobile Primary Target) -->
        <div class="demopay-status-actions">
          <button type="button" id="demopay-retry-btn" class="demopay-btn-primary">
            <span>Try Again</span>
          </button>
          
          <button type="button" id="demopay-return-btn" class="demopay-btn-secondary">
            <span>Return to Checkout</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render Dedicated Mobile-First Successful State View (Milestone C20.6)
   */
  renderSuccessfulView(formattedAmount, orderRef, paymentRef) {
    const customerName = this.currentOrder?.customer?.fullName || 'Customer';

    return `
      <div class="demopay-status-view is-success" role="status" aria-live="polite">
        <div class="demopay-status-icon-box demopay-icon-success" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>

        <h2 class="demopay-status-title">Payment Successful</h2>

        <p class="demopay-status-desc">
          Thank you, <strong>${customerName}</strong>. Your payment has been verified via Demo Payment.
        </p>

        <div class="demopay-status-details-box">
          <div class="demopay-status-row">
            <span class="demopay-status-label">Order Reference</span>
            <span class="demopay-status-val font-mono" id="demopay-success-order-ref">${orderRef}</span>
          </div>
          <div class="demopay-status-row">
            <span class="demopay-status-label">Payment Reference</span>
            <span class="demopay-status-val font-mono" id="demopay-success-pay-ref">${paymentRef}</span>
          </div>
          <div class="demopay-status-row">
            <span class="demopay-status-label">Amount</span>
            <span class="demopay-status-val" id="demopay-success-amount">${formattedAmount}</span>
          </div>
          <div class="demopay-status-row">
            <span class="demopay-status-label">Currency</span>
            <span class="demopay-status-val" id="demopay-success-currency">${this.currentPayment.currency || 'NGN'}</span>
          </div>
        </div>

        <div class="demopay-status-actions">
          <button type="button" id="demopay-view-receipt-btn" class="demopay-btn-primary">
            <span>View Order Confirmation</span>
          </button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const closeBtn = this.modalEl.querySelector('#demopay-close-trigger');
    if (closeBtn) closeBtn.addEventListener('click', () => this.handleCancel());

    if (this.state === PAYMENT_LIFECYCLE_STATES.FAILED) {
      const retryBtn = this.modalEl.querySelector('#demopay-retry-btn');
      const returnBtn = this.modalEl.querySelector('#demopay-return-btn');

      retryBtn?.addEventListener('click', () => {
        this.handleRetry();
      });

      returnBtn?.addEventListener('click', () => {
        this.handleCancel();
      });
      return;
    }

    if (this.state === PAYMENT_LIFECYCLE_STATES.SUCCESSFUL) {
      const viewReceiptBtn = this.modalEl.querySelector('#demopay-view-receipt-btn');
      viewReceiptBtn?.addEventListener('click', () => {
        this.close();
        if (this.lastResult) {
          this.onSuccess(this.lastResult);
        }
      });
      return;
    }

    if (this.state === PAYMENT_LIFECYCLE_STATES.IDLE || this.state === PAYMENT_LIFECYCLE_STATES.INITIALIZING) {
      const submitSuccessBtn = this.modalEl.querySelector('#demopay-submit-btn');
      const simulateFailBtn = this.modalEl.querySelector('#demopay-simulate-fail-btn');
      const cancelBtn = this.modalEl.querySelector('#demopay-cancel-btn');
      const cardInput = this.modalEl.querySelector('#demopay-card-number');
      const presetBtns = this.modalEl.querySelectorAll('.demopay-preset-btn');
      const form = this.modalEl.querySelector('#demopay-form');

      // Primary Simulate Success / Submit
      submitSuccessBtn?.addEventListener('click', () => {
        this.handleSubmit();
      });

      // Primary Simulate Fail
      simulateFailBtn?.addEventListener('click', () => {
        this.handleSubmit('FAILED');
      });

      // Preset button click handlers
      presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const testType = btn.getAttribute('data-test');
          const testCard = DEMO_TEST_CARDS[testType];
          if (testCard && cardInput) {
            cardInput.value = testCard.formatted;
          }
          this.selectedPreset = testType;
          presetBtns.forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
        });
      });

      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleSubmit();
        });
      }

      if (cancelBtn) cancelBtn.addEventListener('click', () => this.handleCancel());
    }
  }

  /**
   * Handle Try Again / Retry Flow (Milestone C20.6)
   * Must NEVER duplicate the order.
   */
  async handleRetry() {
    if (this.isSubmitting) return;

    try {
      this.setState(PAYMENT_LIFECYCLE_STATES.PROCESSING);

      const retryResult = this.mode === 'shipping'
        ? await paymentService.createShippingPayment(this.currentOrder.id)
        : await paymentService.retryPayment(this.currentOrder.id);
      this.currentOrder = retryResult.order;
      this.currentPayment = retryResult.payment;

      // Notify external listeners if provided
      this.onRetry(retryResult);

      // Transition back to IDLE ready view with incremented attempt
      this.setState(PAYMENT_LIFECYCLE_STATES.IDLE, {
        order: retryResult.order,
        payment: retryResult.payment
      });

    } catch (err) {
      console.error('[DemoPay Retry Error]', err);
      this.setState(PAYMENT_LIFECYCLE_STATES.FAILED, {
        failureReason: err.message || 'Unable to initiate retry attempt. Please return to checkout.'
      });
    }
  }

  async handleSubmit(overrideTestType = null) {
    // Duplicate click / idempotency prevention
    if (this.isSubmitting || this.state === PAYMENT_LIFECYCLE_STATES.PROCESSING) return;

    let testType = overrideTestType || this.selectedPreset || 'SUCCESS';
    const cardInput = this.modalEl.querySelector('#demopay-card-number');
    const rawVal = cardInput ? cardInput.value.replace(/\s+/g, '') : '';
    if (!overrideTestType) {
      if (rawVal === DEMO_TEST_CARDS.DECLINED.number) testType = 'DECLINED';
      else if (rawVal === DEMO_TEST_CARDS.FAILED.number) testType = 'FAILED';
      else if (rawVal === DEMO_TEST_CARDS.TIMEOUT.number) testType = 'TIMEOUT';
      else if (rawVal === DEMO_TEST_CARDS.SUCCESS.number) testType = 'SUCCESS';
    }

    const testCard = DEMO_TEST_CARDS[testType] || DEMO_TEST_CARDS.SUCCESS;

    this.isSubmitting = true;
    this.setState(PAYMENT_LIFECYCLE_STATES.PROCESSING);

    try {
      const processFn = this.mode === 'shipping'
        ? paymentService.processShippingPayment.bind(paymentService)
        : paymentService.processPayment.bind(paymentService);

      const result = await processFn({
        paymentId: this.currentPayment.id,
        cardDetails: {
          cardNumber: testCard.number,
          expiry: testCard.expiry,
          cvv: testCard.cvv
        }
      });

      this.isSubmitting = false;

      if (result.success && result.status === PAYMENT_STATUS.SUCCESSFUL) {
        // SUCCESS STATE (Milestone C20.6)
        this.lastResult = result;
        this.setState(PAYMENT_LIFECYCLE_STATES.SUCCESSFUL, {
          order: result.order,
          payment: result.payment,
          lastResult: result
        });
        this.onSuccess(result);

      } else if (result.status === PAYMENT_STATUS.DECLINED) {
        // DECLINED STATE: Show dedicated mobile-first failed view
        this.lastResult = result;
        this.setState(PAYMENT_LIFECYCLE_STATES.FAILED, {
          order: result.order,
          payment: result.payment,
          failureReason: result.failureReason || 'Transaction declined by card issuer (Insufficient Funds)',
          lastResult: result
        });
        this.onDeclined(result);

      } else {
        // FAILED / TIMEOUT STATE: Show dedicated mobile-first failed view
        this.lastResult = result;
        this.setState(PAYMENT_LIFECYCLE_STATES.FAILED, {
          order: result.order,
          payment: result.payment,
          failureReason: result.failureReason || "We couldn't confirm your payment. Please try again.",
          lastResult: result
        });
        this.onFailure(result);
      }

    } catch (err) {
      console.error('[DemoPay Processing Error]', err);
      this.isSubmitting = false;
      this.setState(PAYMENT_LIFECYCLE_STATES.FAILED, {
        failureReason: err.message || 'Payment could not be completed. A network or system interruption occurred.',
        lastResult: { error: err }
      });
      this.onFailure({ error: err });
    }
  }

  async handleCancel() {
    if (this.isSubmitting || this.state === PAYMENT_LIFECYCLE_STATES.PROCESSING) return;

    if (this.currentPayment) {
      try {
        const processFn = this.mode === 'shipping'
          ? paymentService.processShippingPayment.bind(paymentService)
          : paymentService.processPayment.bind(paymentService);
        await processFn({
          paymentId: this.currentPayment.id,
          simulationOutcome: 'CANCELLED'
        });
      } catch (err) {
        console.warn('[DemoPay] Cancellation error:', err);
      }
    }
    this.close();
    this.onCancel();
  }
}

export const demoPaymentUI = new DemoPaymentUI();

