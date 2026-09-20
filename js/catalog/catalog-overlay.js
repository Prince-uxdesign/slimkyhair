/**
 * Catalog Persistence Overlay - Slimky Hair
 * Phase A3: Admin Product Management
 *
 * The catalogue ships as a static seed (js/catalog-data.js). Admin product
 * mutations are persisted as an overlay keyed by product id, exactly the same
 * pattern js/inventory/inventory-service.js uses for SKU stock levels, so the
 * project keeps ONE storage architecture rather than two.
 *
 * Resolution order for any product id:
 *   overlay record (admin-authored)  >  seed record (shipped catalogue)
 *
 * hydrateCatalog() is called synchronously from the bottom of catalog-data.js.
 * Because ES modules fully evaluate a dependency before any importer body runs,
 * every storefront module (shop, category, search, PDP, cart, wishlist,
 * checkout validator) observes the merged catalogue on its very first read —
 * no race, no per-consumer opt-in.
 *
 * The live PRODUCTS array is mutated IN PLACE (splice) rather than reassigned,
 * because all eleven consumers hold the imported array reference.
 */

import {
  PRODUCT_STATUS,
  isCustomerVisible,
  normalizeProduct,
  resolveStatus
} from './product-model.js';

const OVERLAY_STORAGE_KEY = 'slimky_product_catalog_overlay';
const OVERLAY_VERSION = 1;

/** Module-level catalogue state, populated by hydrateCatalog(). */
const state = {
  seedProducts: [],
  seedCategories: [],
  liveProducts: null,   // the shared PRODUCTS array reference
  liveCategories: null, // the shared CATEGORIES array reference
  liveSuggestions: null,// the shared SEARCH_SUGGESTIONS object reference
  fullCatalog: [],      // every product incl. draft/archived (admin view)
  hydrated: false
};

/* ------------------------------------------------------------------ */
/* Storage primitives                                                  */
/* ------------------------------------------------------------------ */

function readOverlayFile() {
  if (typeof localStorage === 'undefined') return { version: OVERLAY_VERSION, records: {} };
  try {
    const raw = localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return { version: OVERLAY_VERSION, records: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.records !== 'object') {
      return { version: OVERLAY_VERSION, records: {} };
    }
    return { version: parsed.version || OVERLAY_VERSION, records: parsed.records || {} };
  } catch (err) {
    console.warn('[CatalogOverlay] Unable to read overlay, falling back to seed catalogue:', err);
    return { version: OVERLAY_VERSION, records: {} };
  }
}

function writeOverlayFile(file) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(file));
    return true;
  } catch (err) {
    console.warn('[CatalogOverlay] Unable to persist overlay:', err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Merge                                                               */
/* ------------------------------------------------------------------ */

/**
 * Merge seed + overlay into the authoritative full catalogue.
 * @returns {Array<Object>}
 */
function buildFullCatalog() {
  const { records } = readOverlayFile();
  const merged = [];
  const seenIds = new Set();

  state.seedProducts.forEach(seed => {
    const override = records[seed.id];
    if (override && override.__deleted) return; // admin hard-deleted a seed product
    const record = override ? { ...seed, ...override } : seed;
    merged.push({ ...record, status: resolveStatus(record), isSeed: true });
    seenIds.add(seed.id);
  });

  Object.keys(records).forEach(id => {
    if (seenIds.has(id)) return;
    const record = records[id];
    if (!record || record.__deleted) return;
    merged.push({ ...record, status: resolveStatus(record), isSeed: false });
  });

  return merged;
}

/**
 * Recompute derived category product counts from the customer-visible set, so
 * category headers never advertise a count that includes drafts or archives.
 */
function recomputeCategoryCounts(visibleProducts) {
  if (!Array.isArray(state.liveCategories)) return;
  state.liveCategories.forEach(category => {
    category.productCount = visibleProducts.filter(p => p.categorySlug === category.slug).length;
  });

  // Search autosuggest advertises per-category counts too — keep it in step so
  // a draft or archived product never inflates a suggestion badge.
  const suggestionCategories = state.liveSuggestions?.categories;
  if (Array.isArray(suggestionCategories)) {
    suggestionCategories.forEach(entry => {
      entry.count = visibleProducts.filter(p => p.categorySlug === entry.slug).length;
    });
  }
}

/**
 * Replace the contents of the shared live PRODUCTS array with the
 * customer-visible slice of the full catalogue. Mutates in place.
 */
function syncLiveArrays() {
  state.fullCatalog = buildFullCatalog();
  const visible = state.fullCatalog.filter(isCustomerVisible);

  if (Array.isArray(state.liveProducts)) {
    state.liveProducts.splice(0, state.liveProducts.length, ...visible);
  }
  recomputeCategoryCounts(visible);
  return visible;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Bind the shipped seed arrays and apply the persisted overlay.
 * Called once, synchronously, from catalog-data.js.
 *
 * @param {Array<Object>} productsArray Live PRODUCTS array (mutated in place).
 * @param {Array<Object>} categoriesArray Live CATEGORIES array (mutated in place).
 * @param {Object} [suggestions] Live SEARCH_SUGGESTIONS object (counts refreshed).
 */
export function hydrateCatalog(productsArray, categoriesArray, suggestions = null) {
  if (state.hydrated) return state.fullCatalog;

  // Snapshot the pristine seed BEFORE the live array is filtered.
  state.seedProducts = Array.isArray(productsArray) ? productsArray.slice() : [];
  state.seedCategories = Array.isArray(categoriesArray) ? categoriesArray.slice() : [];
  state.liveProducts = productsArray;
  state.liveCategories = categoriesArray;
  state.liveSuggestions = suggestions;
  state.hydrated = true;

  syncLiveArrays();
  return state.fullCatalog;
}

/** Full catalogue including drafts and archives — admin surfaces only. */
export function getFullCatalog() {
  if (!state.hydrated) return [];
  return state.fullCatalog.map(p => ({ ...p }));
}

/** The pristine shipped record for an id, ignoring any overlay. */
export function getSeedProduct(id) {
  return state.seedProducts.find(p => p.id === id) || null;
}

export function isSeedProduct(id) {
  return state.seedProducts.some(p => p.id === id);
}

/** Categories as shipped (admin category dropdown). */
export function getCategories() {
  return state.seedCategories.map(c => ({ ...c }));
}

/**
 * Persist one product record and immediately re-sync the live storefront
 * arrays so the change is visible without a page reload.
 *
 * @param {Object} record Normalized product record.
 * @returns {boolean} persisted
 */
export function persistProduct(record) {
  const file = readOverlayFile();
  const stored = { ...record };
  delete stored.isSeed;
  file.records[record.id] = stored;
  const ok = writeOverlayFile(file);
  syncLiveArrays();
  return ok;
}

/**
 * Remove a product entirely. For a seed product this writes a tombstone,
 * since the seed record cannot be physically removed from the shipped file.
 * Callers must have already confirmed the product has no order history.
 */
export function tombstoneProduct(id) {
  const file = readOverlayFile();
  if (isSeedProduct(id)) {
    file.records[id] = { id, __deleted: true, deletedAt: new Date().toISOString() };
  } else {
    delete file.records[id];
  }
  const ok = writeOverlayFile(file);
  syncLiveArrays();
  return ok;
}

/** Drop every admin change and return to the shipped catalogue. */
export function resetOverlay() {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(OVERLAY_STORAGE_KEY); } catch (err) { /* noop */ }
  }
  syncLiveArrays();
}

export { OVERLAY_STORAGE_KEY, PRODUCT_STATUS, normalizeProduct };
