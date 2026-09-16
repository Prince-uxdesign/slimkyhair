/**
 * Slimky Hair — Responsible Cookie Consent Manager
 *
 * Technically sound, opt-in consent mechanism that can be aligned with
 * Slimky Hair's final privacy/cookie policy.
 *
 * Design notes (no legal claims made here):
 * - Essential store functionality (bag, checkout, session, security) always
 *   works and does not depend on optional consent.
 * - Optional categories (preferences + analytics) are OFF by default and only
 *   initialise after an explicit choice. No optional tracking scripts are
 *   injected before consent.
 * - Choice is persisted locally with a versioned record. The banner does not
 *   reappear after a valid choice unless the configuration version changes.
 * - Preferences can be revisited at any time via footer "Cookie Settings",
 *   any `[data-open-consent]` trigger, or the control injected on /cookies
 *   and /privacy.
 *
 * Categories mirror the headings already used on the existing Cookie Policy
 * page (Essential / Preference / Functional / Analytics) without adding new
 * policy language.
 */

export const CONSENT_CONFIG = {
  version: 1,
  storageKey: 'slimky_consent_v1',
  // Optional analytics scripts that may be configured later. Empty by default:
  // nothing non-essential loads until the visitor opts in, and each entry is
  // only injected when analytics consent is active.
  analyticsScripts: [],
};

const CATEGORIES = ['essential', 'preferences', 'analytics'];

function storageAvailable() {
  try {
    const k = '__slimky_consent_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch (_) {
    return false;
  }
}

let memoryFallback = null;

export function defaultConsentState() {
  return {
    version: CONSENT_CONFIG.version,
    essential: true,
    preferences: false,
    analytics: false,
    decidedAt: null,
    method: null, // 'accept-all' | 'reject-non-essential' | 'custom' | null
  };
}

export function loadStoredConsent() {
  if (!storageAvailable()) return memoryFallback ? { ...memoryFallback } : null;
  try {
    const raw = window.localStorage.getItem(CONSENT_CONFIG.storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Version mismatch -> treat as no valid choice so the banner reappears.
    if (parsed.version !== CONSENT_CONFIG.version) return null;
    return {
      ...defaultConsentState(),
      ...parsed,
      essential: true,
      version: CONSENT_CONFIG.version,
    };
  } catch (_) {
    return null;
  }
}

function persistConsent(state) {
  const record = {
    ...defaultConsentState(),
    ...state,
    essential: true,
    version: CONSENT_CONFIG.version,
  };
  if (storageAvailable()) {
    try {
      window.localStorage.setItem(CONSENT_CONFIG.storageKey, JSON.stringify(record));
    } catch (_) {
      memoryFallback = { ...record };
    }
  } else {
    memoryFallback = { ...record };
  }
  return { ...record };
}

let currentConsent = null;
const changeListeners = new Set();

function emitConsentChanged(record, reason) {
  currentConsent = { ...record };
  applyAnalyticsGate(record);
  changeListeners.forEach((fn) => {
    try {
      fn({ ...record }, reason);
    } catch (_) {}
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('slimky:consent-changed', { detail: { consent: { ...record }, reason } })
    );
  }
}

export function getConsent() {
  if (!currentConsent) currentConsent = loadStoredConsent();
  return currentConsent ? { ...currentConsent } : null;
}

export function hasMadeChoice() {
  const c = getConsent();
  return Boolean(c && c.decidedAt);
}

export function isAllowed(category) {
  if (category === 'essential') return true;
  const c = getConsent();
  if (!c) return false; // opt-in: nothing optional is allowed before a choice
  if (category === 'preferences') return c.preferences === true;
  if (category === 'analytics') return c.analytics === true;
  return false;
}

export function onConsentChanged(fn) {
  if (typeof fn === 'function') changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function saveChoice(prefs, method) {
  const record = persistConsent({
    essential: true,
    preferences: Boolean(prefs.preferences),
    analytics: Boolean(prefs.analytics),
    decidedAt: new Date().toISOString(),
    method,
  });
  emitConsentChanged(record, method);
  return record;
}

export function acceptAll() {
  return saveChoice({ preferences: true, analytics: true }, 'accept-all');
}

export function rejectNonEssential() {
  return saveChoice({ preferences: false, analytics: false }, 'reject-non-essential');
}

export function saveCustomChoices(prefs) {
  return saveChoice(
    { preferences: Boolean(prefs.preferences), analytics: Boolean(prefs.analytics) },
    'custom'
  );
}

/** QA / support helper: clears the stored choice on this device. */
export function resetConsent() {
  try {
    if (storageAvailable()) window.localStorage.removeItem(CONSENT_CONFIG.storageKey);
  } catch (_) {}
  memoryFallback = null;
  currentConsent = null;
}

// ---------------------------------------------------------------------------
// Optional analytics gate (nothing loads before opt-in)
// ---------------------------------------------------------------------------

function initAnalyticsRuntime() {
  if (typeof window === 'undefined') return;
  if (!window.SlimkyAnalytics) {
    window.SlimkyAnalytics = {
      enabled: false,
      queue: [],
      /**
       * Queue or drop optional analytics events. Only forwards when analytics
       * consent is active. Essential store flows never depend on this.
       */
      track(eventName, payload) {
        if (!window.SlimkyAnalytics.enabled) return false;
        window.SlimkyAnalytics.queue.push({ eventName, payload, at: new Date().toISOString() });
        return true;
      },
    };
  }
}

/**
 * Inject an optional script only when analytics consent is active.
 * Returns true when injected, false otherwise. Use this helper for any future
 * analytics/performance vendor so non-essential code paths stay gated.
 */
export function loadOptionalScript(src, attrs = {}) {
  if (!src || typeof document === 'undefined') return false;
  if (!isAllowed('analytics')) return false;
  if (document.querySelector(`script[data-consent-src="${src}"]`)) return true;
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  s.setAttribute('data-consent-src', src);
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, String(v)));
  document.head.appendChild(s);
  return true;
}

function applyAnalyticsGate(record) {
  initAnalyticsRuntime();
  const allowed = record ? record.analytics === true : false;
  window.SlimkyAnalytics.enabled = allowed;
  if (allowed) {
    CONSENT_CONFIG.analyticsScripts.forEach((src) => loadOptionalScript(src));
  }
}

// ---------------------------------------------------------------------------
// UI: banner + preferences modal (injected once, works on every page)
// ---------------------------------------------------------------------------

function getRootPrefix() {
  if (typeof window === 'undefined') return './';
  const path = window.location.pathname || '/';
  // Directory-style routes (/shop/, /product/x/, /cookies/) sit one or more
  // levels deep; resolve privacy/cookie links relative to site root.
  if (path === '/' || path.endsWith('.html') || path.split('/').filter(Boolean).length === 0) {
    // Root-level .html files link with ./cookies/ style; directory indexes need ../
    if (path.includes('/product/') || path.includes('/category/')) return '../../';
    return './';
  }
  const depth = path.split('/').filter(Boolean).length;
  if (path.endsWith('/')) {
    if (depth <= 1) return '../';
    return '../../';
  }
  return './';
}

function policyHref(page) {
  const root = getRootPrefix();
  // Prefer the directory routes (/privacy/, /cookies/) used across the site.
  if (root === './') return `./${page}/`;
  return `${root}${page}/`;
}

let uiInitialised = false;
let els = {};

function buildUI() {
  if (uiInitialised || typeof document === 'undefined') return;
  uiInitialised = true;

  const banner = document.createElement('div');
  banner.className = 'slimky-consent-banner';
  banner.id = 'slimky-consent-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-modal', 'false');
  banner.setAttribute('aria-labelledby', 'slimky-consent-title');
  banner.setAttribute('aria-describedby', 'slimky-consent-desc');
  banner.hidden = true;

  banner.innerHTML = `
    <div class="slimky-consent-card">
      <p class="slimky-consent-eyebrow">Your privacy choices</p>
      <h2 class="slimky-consent-title" id="slimky-consent-title">How we use cookies &amp; storage</h2>
      <p class="slimky-consent-desc" id="slimky-consent-desc">
        We use essential storage so your shopping bag, wishlist session and checkout
        keep working. With your permission, we also use optional analytics to
        understand aggregated visits and improve the store. You can accept,
        decline non-essential, or fine-tune preferences.
      </p>
      <p class="slimky-consent-links">
        <a data-consent-link="cookies" href="#">Cookie Policy</a>
        <span aria-hidden="true">·</span>
        <a data-consent-link="privacy" href="#">Privacy Policy</a>
      </p>
      <div class="slimky-consent-actions">
        <button type="button" class="btn btn-primary slimky-consent-btn" data-consent-action="accept">Accept all</button>
        <button type="button" class="btn btn-outline slimky-consent-btn" data-consent-action="reject">Decline non-essential</button>
        <button type="button" class="btn btn-secondary slimky-consent-btn" data-consent-action="manage">Manage preferences</button>
      </div>
    </div>
  `;

  const modalWrap = document.createElement('div');
  modalWrap.className = 'slimky-consent-modal-wrap';
  modalWrap.id = 'slimky-consent-modal-wrap';
  modalWrap.hidden = true;
  modalWrap.innerHTML = `
    <div class="slimky-consent-backdrop" data-consent-action="close-modal"></div>
    <div class="slimky-consent-modal" role="dialog" aria-modal="true" aria-labelledby="slimky-consent-modal-title">
      <div class="slimky-consent-modal-head">
        <div>
          <p class="slimky-consent-eyebrow">Cookie preferences</p>
          <h2 class="slimky-consent-modal-title" id="slimky-consent-modal-title">Manage preferences on this device</h2>
        </div>
        <button type="button" class="slimky-consent-close" data-consent-action="close-modal" aria-label="Close preferences">×</button>
      </div>
      <p class="slimky-consent-modal-intro">
        Essential storage is always on so the store keeps working. Optional categories
        stay off until you turn them on. Your choice is saved on this device only and
        can be changed anytime.
      </p>
      <div class="slimky-consent-options">
        <div class="slimky-consent-option">
          <div class="slimky-consent-option-text">
            <h3>Essential</h3>
            <p>Required for the bag, checkout, sign-in session and security. Always on.</p>
          </div>
          <span class="slimky-consent-pill" aria-label="Essential always on">Always on</span>
        </div>
        <label class="slimky-consent-option" for="slimky-consent-pref">
          <div class="slimky-consent-option-text">
            <h3>Preferences</h3>
            <p>Remembers choices such as wishlist items, currency and dismissed notices.</p>
          </div>
          <button type="button" role="switch" aria-checked="false" id="slimky-consent-pref" class="slimky-switch" data-consent-switch="preferences" aria-label="Preferences">
            <span class="slimky-switch-knob"></span>
          </button>
        </label>
        <label class="slimky-consent-option" for="slimky-consent-analytics">
          <div class="slimky-consent-option-text">
            <h3>Analytics &amp; performance</h3>
            <p>Optional aggregated measurement used to improve speed and browsing. Off until you allow it.</p>
          </div>
          <button type="button" role="switch" aria-checked="false" id="slimky-consent-analytics" class="slimky-switch" data-consent-switch="analytics" aria-label="Analytics and performance">
            <span class="slimky-switch-knob"></span>
          </button>
        </label>
      </div>
      <div class="slimky-consent-modal-actions">
        <button type="button" class="btn btn-primary slimky-consent-btn" data-consent-action="save">Save choices</button>
        <button type="button" class="btn btn-outline slimky-consent-btn" data-consent-action="accept">Accept all</button>
        <button type="button" class="btn btn-secondary slimky-consent-btn" data-consent-action="reject">Decline non-essential</button>
      </div>
      <p class="slimky-consent-modal-foot">
        <a data-consent-link="cookies" href="#">Cookie Policy</a>
        <span aria-hidden="true">·</span>
        <a data-consent-link="privacy" href="#">Privacy Policy</a>
      </p>
    </div>
  `;

  document.body.appendChild(banner);
  document.body.appendChild(modalWrap);

  els = { banner, modalWrap };

  // Resolve policy links for the current route depth.
  banner.querySelectorAll('[data-consent-link]').forEach((a) => {
    a.href = policyHref(a.getAttribute('data-consent-link'));
  });
  modalWrap.querySelectorAll('[data-consent-link]').forEach((a) => {
    a.href = policyHref(a.getAttribute('data-consent-link'));
  });

  // Wire actions (event delegation across banner + modal).
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-consent-action]');
    // Footer / inline "Cookie Settings" triggers.
    const openTrigger = e.target.closest('[data-open-consent]');
    if (openTrigger) {
      e.preventDefault();
      openPreferences();
      return;
    }
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-consent-action');
    if (action === 'accept') {
      acceptAll();
      closeModal();
      hideBanner();
    } else if (action === 'reject') {
      rejectNonEssential();
      closeModal();
      hideBanner();
    } else if (action === 'manage') {
      openPreferences();
    } else if (action === 'save') {
      const prefs = readSwitches();
      saveCustomChoices(prefs);
      closeModal();
      hideBanner();
    } else if (action === 'close-modal') {
      closeModal();
      // If no valid choice yet, return focus to the banner (choice still needed).
      if (!hasMadeChoice()) showBanner();
    }
  });

  // Switch toggles.
  modalWrap.querySelectorAll('[data-consent-switch]').forEach((sw) => {
    sw.addEventListener('click', (e) => {
      e.preventDefault();
      const on = sw.getAttribute('aria-checked') === 'true';
      sw.setAttribute('aria-checked', on ? 'false' : 'true');
      sw.classList.toggle('is-on', !on);
    });
  });

  // Escape closes the modal (banner stays until a choice is made).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalWrap.hidden) {
      closeModal();
      if (!hasMadeChoice()) showBanner();
    }
  });

  // Keep UI in sync when consent changes elsewhere (e.g. second tab).
  window.addEventListener('storage', (e) => {
    if (e.key === CONSENT_CONFIG.storageKey) {
      currentConsent = loadStoredConsent();
      if (currentConsent && currentConsent.decidedAt) hideBanner();
      syncSwitches();
    }
  });

  onConsentChanged(() => syncSwitches());
}

function readSwitches() {
  const prefs = els.modalWrap?.querySelector('[data-consent-switch="preferences"]');
  const analytics = els.modalWrap?.querySelector('[data-consent-switch="analytics"]');
  return {
    preferences: prefs?.getAttribute('aria-checked') === 'true',
    analytics: analytics?.getAttribute('aria-checked') === 'true',
  };
}

function syncSwitches() {
  if (!els.modalWrap) return;
  const c = getConsent();
  const prefs = els.modalWrap.querySelector('[data-consent-switch="preferences"]');
  const analytics = els.modalWrap.querySelector('[data-consent-switch="analytics"]');
  if (prefs) {
    const on = c ? c.preferences === true : false;
    prefs.setAttribute('aria-checked', on ? 'true' : 'false');
    prefs.classList.toggle('is-on', on);
  }
  if (analytics) {
    const on = c ? c.analytics === true : false;
    analytics.setAttribute('aria-checked', on ? 'true' : 'false');
    analytics.classList.toggle('is-on', on);
  }
}

export function showBanner() {
  if (!els.banner) return;
  els.banner.hidden = false;
  document.body.classList.add('has-consent-banner');
}

export function hideBanner() {
  if (!els.banner) return;
  els.banner.hidden = true;
  document.body.classList.remove('has-consent-banner');
}

export function openPreferences() {
  if (!els.modalWrap) return;
  syncSwitches();
  hideBanner();
  els.modalWrap.hidden = false;
  document.body.classList.add('has-consent-modal');
  const first = els.modalWrap.querySelector('.slimky-consent-modal [data-consent-switch], .slimky-consent-modal-actions .btn');
  if (first) first.focus({ preventScroll: true });
}

export function closeModal() {
  if (!els.modalWrap) return;
  els.modalWrap.hidden = true;
  document.body.classList.remove('has-consent-modal');
}

// ---------------------------------------------------------------------------
// Revisit surfaces: footer link + on-page controls for /cookies and /privacy
// ---------------------------------------------------------------------------

function ensureFooterLink() {
  try {
    const containers = document.querySelectorAll('.footer-legal-links');
    containers.forEach((box) => {
      if (box.querySelector('[data-open-consent]')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-open-consent', '');
      btn.className = 'footer-consent-settings';
      btn.textContent = 'Cookie Settings';
      btn.style.cssText =
        'background:none;border:none;cursor:pointer;font:inherit;color:inherit;padding:0;min-height:44px;display:inline-flex;align-items:center;';
      box.appendChild(btn);
    });
  } catch (_) {}
}

function ensureLegalPageControl() {
  try {
    // Runtime enhancement for existing /cookies and /privacy pages (both the
    // root .html files and the directory index.html variants). No new legal
    // pages are created and no policy wording is altered.
    const target = document.querySelector('#managing-cookies .legal-section-body');
    if (!target || target.querySelector('[data-open-consent]')) return;
    const card = document.createElement('div');
    card.className = 'legal-consent-manage-card';
    card.innerHTML = `
      <p style="margin-bottom:12px;">You can review or change the choice stored on this device at any time. Essential storage stays on so the store keeps working; optional categories only run when you allow them.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button type="button" class="btn btn-outline btn-sm" data-open-consent>Manage preferences on this device</button>
      </div>
      <p class="legal-consent-manage-status" data-consent-status style="margin-top:10px;font-size:0.8125rem;color:var(--color-text-secondary);"></p>
    `;
    target.appendChild(card);
    const update = () => {
      const c = getConsent();
      const line = card.querySelector('[data-consent-status]');
      if (!line) return;
      if (!c || !c.decidedAt) {
        line.textContent = 'No choice saved on this device yet.';
        return;
      }
      const parts = [];
      parts.push('Essential: on');
      parts.push(`Preferences: ${c.preferences ? 'on' : 'off'}`);
      parts.push(`Analytics: ${c.analytics ? 'on' : 'off'}`);
      line.textContent = `Saved on this device (${new Date(c.decidedAt).toLocaleDateString()}): ${parts.join(' · ')}.`;
    };
    update();
    onConsentChanged(update);
  } catch (_) {}
}

/** Idempotent initialiser — safe to call from every entry point. */
let consentInitialised = false;

export function initConsent() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  initAnalyticsRuntime();
  if (consentInitialised) {
    return window.SlimkyConsent || null;
  }
  consentInitialised = true;

  currentConsent = loadStoredConsent();
  applyAnalyticsGate(currentConsent);
  buildUI();
  ensureFooterLink();
  ensureLegalPageControl();

  if (!currentConsent || !currentConsent.decidedAt) {
    // Small delay so first paint (hero, header) is never blocked by the banner.
    window.setTimeout(() => {
      if (!hasMadeChoice()) showBanner();
    }, 600);
  }

  const api = {
    config: { ...CONSENT_CONFIG },
    categories: [...CATEGORIES],
    getConsent,
    hasMadeChoice,
    isAllowed,
    acceptAll: () => {
      const r = acceptAll();
      hideBanner();
      return r;
    },
    rejectNonEssential: () => {
      const r = rejectNonEssential();
      hideBanner();
      return r;
    },
    saveCustomChoices: (prefs) => {
      const r = saveCustomChoices(prefs);
      hideBanner();
      return r;
    },
    openPreferences,
    resetConsent,
    onConsentChanged,
    loadOptionalScript,
  };
  window.SlimkyConsent = api;
  return api;
}
