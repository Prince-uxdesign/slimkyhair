/**
 * Admin Settings Service — Slimky Hair (Phase A9)
 *
 * The ONE browser-side settings store. Every key here has a real consumer
 * (see CONSUMED_BY below); settings without one are deliberately excluded —
 * see WHAT_IS_NOT_HERE. Shape mirrors the `admin_settings` table
 * 1:1 (key/value/label/description + audit stamps) so the Supabase switch is
 * a transport change, not a remodel.
 *
 * WHAT_IS_NOT_HERE (and why):
 * - base_currency: the entire pricing pipeline is NGN-only. A switchable
 *   currency with no converter, no multi-currency ledger and no Edge support
 *   would be decoration, not configuration. It stays a server constant.
 * - Product compliance rules: owned exclusively by validateProduct() in
 *   js/catalog/product-model.js. Duplicating them here would let the two
 *   copies drift; the Products section of /admin/settings names that owner.
 * - Provider secrets (Resend / service-role / tokens): NEVER settings. They
 *   live in Edge Function runtime env (supabase/functions/_shared/resend.ts)
 *   and are refused by saveSettings() even if submitted.
 * - Low-stock threshold VALUE: owned exclusively by the inventory writer
 *   (getLowStockThreshold/setLowStockThreshold). The settings screen edits it
 *   through that writer — it is never stored a second time here.
 *
 * This module is intentionally dependency-free (like product-model.js) so
 * checkout/payment code can read operational values without import cycles.
 * Authorization is NOT performed here; backoffice callers go through
 * adminService.getAdminSettings()/updateAdminSettings(), which own the
 * barrier — the same split as customerService.listAllCustomers().
 */

const SETTINGS_STORAGE_KEY = 'slimky_admin_settings';

/** Refused as a setting name even if ever submitted — secrets are not settings. */
const SECRET_KEY_PATTERN = /api[_-]?key|secret|service[_-]?role|password|passwd|private[_-]?key|auth[_-]?token|access[_-]?token/i;

/**
 * Setting definitions in display order. CONSUMED_BY names the real reader so
 * a future editor can tell live configuration from decoration.
 */
export const SETTING_DEFS = Object.freeze([
  {
    section: 'store',
    key: 'store_name',
    label: 'Store name',
    description: 'Shown in the backoffice brand mark.',
    type: 'text',
    required: true,
    minLength: 2,
    maxLength: 60,
    default: 'Slimky Hair',
    CONSUMED_BY: 'js/admin-page.js renderSidebarNav()'
  },
  {
    section: 'store',
    key: 'support_email',
    label: 'Customer support email',
    description: 'Primary customer channel. Matches the address used across transactional email templates.',
    type: 'email',
    required: true,
    maxLength: 255,
    default: 'care@slimkyhair.com',
    CONSUMED_BY: 'contact surfaces, email footers (server templates)'
  },
  {
    section: 'store',
    key: 'support_phone_display',
    label: 'Support phone (display)',
    description: 'Human-readable form, e.g. +234 816 910 4565. Must contain at least 7 digits.',
    type: 'text',
    required: true,
    minLength: 7,
    maxLength: 32,
    default: '+234 816 910 4565',
    CONSUMED_BY: 'js/contact-page.js, legal contact surfaces'
  },
  {
    section: 'store',
    key: 'whatsapp_number',
    label: 'WhatsApp number (international digits)',
    description: 'Digits only, country code included, no +. Used to build wa.me links. Official number: 2348169104565.',
    type: 'digits',
    required: true,
    minLength: 7,
    maxLength: 15,
    default: '2348169104565',
    CONSUMED_BY: 'js/contact-page.js buildWhatsAppInquiryUrl(), js/track-order-page.js help link'
  },
  {
    section: 'store',
    key: 'support_hours',
    label: 'Support hours',
    description: 'Concierge availability line shown to customers.',
    type: 'text',
    required: true,
    minLength: 2,
    maxLength: 120,
    default: 'Monday–Saturday, 9:00 AM–6:00 PM WAT',
    CONSUMED_BY: 'account login concierge note, contact surfaces'
  },
  {
    section: 'orders',
    key: 'order_number_prefix',
    label: 'Order number prefix',
    description: 'Uppercase letters/digits prefix for human-readable order numbers (e.g. SLM-20260920-XXXX).',
    type: 'prefix',
    required: true,
    minLength: 1,
    maxLength: 8,
    default: 'SLM',
    CONSUMED_BY: 'js/payment/payment-model.js generateOrderNumber()'
  }
]);

const DEFS_BY_KEY = Object.freeze(Object.fromEntries(SETTING_DEFS.map(d => [d.key, d])));

function readStorage(fallback = {}) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn('[SettingsService] Storage read error:', err);
    return fallback;
  }
}

function writeStorage(value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('[SettingsService] Storage write error:', err);
    return false;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate one value against its definition. Pure — no storage touched.
 * @returns {string|null} error message, or null when valid
 */
export function validateSetting(key, value) {
  if (SECRET_KEY_PATTERN.test(key)) return 'Secrets can never be stored as settings.';
  const def = DEFS_BY_KEY[key];
  if (!def) return `Unknown setting "${key}".`;
  const str = String(value ?? '');

  if (def.required && str.trim() === '') return `${def.label} is required.`;
  if (!def.required && str.trim() === '') return null;
  if (def.minLength && str.trim().length < def.minLength) {
    return `${def.label} must be at least ${def.minLength} characters.`;
  }
  if (def.maxLength && str.length > def.maxLength) {
    return `${def.label} must be ${def.maxLength} characters or fewer.`;
  }
  if (def.type === 'email' && !EMAIL_PATTERN.test(str.trim())) {
    return 'Enter a valid email address.';
  }
  if (def.type === 'digits') {
    const digits = str.replace(/\D/g, '');
    if (digits !== str.trim() || digits.length < def.minLength || digits.length > def.maxLength) {
      return `${def.label} must be ${def.minLength}–${def.maxLength} digits with no spaces or symbols.`;
    }
  }
  if (def.type === 'text' && def.key === 'support_phone_display') {
    const digits = str.replace(/\D/g, '');
    if (digits.length < 7) return `${def.label} must contain at least 7 digits.`;
  }
  if (def.type === 'prefix' && !/^[A-Za-z0-9]+$/.test(str.trim())) {
    return `${def.label} may only contain letters and digits.`;
  }
  return null;
}

/** Normalize a value for storage (trim; uppercase prefixes). */
export function normalizeSetting(key, value) {
  const def = DEFS_BY_KEY[key];
  let str = String(value ?? '').trim();
  if (def?.type === 'prefix') str = str.toUpperCase();
  if (def?.type === 'email') str = str.toLowerCase();
  return str;
}

/** Effective value: stored override, else the definition default. */
export function getSetting(key) {
  const def = DEFS_BY_KEY[key];
  if (!def) return null;
  const stored = readStorage({});
  const entry = stored[key];
  if (entry && typeof entry.value === 'string') return entry.value;
  return def.default;
}

/** All effective values as {key: value}. */
export function getAllSettings() {
  const out = {};
  for (const def of SETTING_DEFS) out[def.key] = getSetting(def.key);
  return out;
}

/**
 * Validate + persist a patch. Unknown keys, secret-like keys and invalid
 * values are rejected per-key; nothing is written unless EVERY entry passes
 * (no silent partial saves).
 *
 * @param {Object} patch {key: value}
 * @param {Object} [meta] {actorEmail}
 * @returns {{success: boolean, errors?: Object, saved?: Object}}
 */
export function saveSettings(patch = {}, meta = {}) {
  const errors = {};
  const normalized = {};
  for (const [key, value] of Object.entries(patch)) {
    const error = validateSetting(key, value);
    if (error) errors[key] = error;
    else normalized[key] = normalizeSetting(key, value);
  }
  if (Object.keys(errors).length > 0) return { success: false, errors };

  const stored = readStorage({});
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(normalized)) {
    stored[key] = { value, updatedAt: now, updatedBy: meta.actorEmail || 'admin' };
  }
  if (!writeStorage(stored)) {
    return { success: false, errors: { _form: 'Settings could not be persisted on this device.' } };
  }
  return { success: true, saved: getAllSettings() };
}

/** Test/support helper: wipe stored overrides (defaults remain). */
export function clearOverrides() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(SETTINGS_STORAGE_KEY);
}
