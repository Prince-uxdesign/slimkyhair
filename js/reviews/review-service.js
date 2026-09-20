/**
 * Customer Review Service — Slimky Hair (Phase A8)
 *
 * The ONE review architecture. Customer submissions live here (localStorage,
 * modelled 1:1 on the `product_reviews` table in database/schema.sql); the
 * static `reviews[]` arrays in catalog-data.js remain the curated catalogue
 * excerpts they have always been and are never mutated by this module.
 *
 * Visibility contract (the PDP already promises "editorial moderation prior
 * to publication"):
 * - PENDING / REJECTED / HIDDEN submissions are never public.
 * - APPROVED submissions join the seed excerpts on the storefront.
 * - Aggregates recompute as a weighted blend so the display is byte-identical
 *   to today until the first approval lands.
 *
 * Security: moderation demands an EXPLICIT admin session token
 * (adminService.isAdminAuthorized), mirroring the inventory write barrier —
 * no ambient-session fallback. submitReview() can only ever create PENDING;
 * any caller-supplied status is ignored, so customers cannot alter
 * moderation state. No fake reviews are ever seeded (§6).
 */

import { adminService } from '../auth/admin-service.js';

const REVIEWS_STORAGE_KEY = 'slimky_reviews';

/** Moderation vocabulary. No other status strings exist in this system. */
export const REVIEW_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  HIDDEN: 'hidden'
});

/** Moderator actions and the status each produces. */
export const REVIEW_ACTIONS = Object.freeze({
  APPROVE: 'approve',
  REJECT: 'reject',
  HIDE: 'hide',
  REOPEN: 'reopen'
});

const ACTION_STATUS = Object.freeze({
  [REVIEW_ACTIONS.APPROVE]: REVIEW_STATUS.APPROVED,
  [REVIEW_ACTIONS.REJECT]: REVIEW_STATUS.REJECTED,
  [REVIEW_ACTIONS.HIDE]: REVIEW_STATUS.HIDDEN,
  [REVIEW_ACTIONS.REOPEN]: REVIEW_STATUS.PENDING
});

/**
 * Legal moderation transitions. Corrections stay possible (a wrongly rejected
 * review can be approved) but every move is recorded in the review history.
 */
const VALID_MODERATION = Object.freeze({
  [REVIEW_STATUS.PENDING]: [REVIEW_ACTIONS.APPROVE, REVIEW_ACTIONS.REJECT],
  [REVIEW_STATUS.APPROVED]: [REVIEW_ACTIONS.HIDE, REVIEW_ACTIONS.REJECT],
  [REVIEW_STATUS.REJECTED]: [REVIEW_ACTIONS.APPROVE, REVIEW_ACTIONS.REOPEN],
  [REVIEW_STATUS.HIDDEN]: [REVIEW_ACTIONS.APPROVE, REVIEW_ACTIONS.REOPEN]
});

export const REVIEW_TEXT_MAX = 2000;
export const REVIEW_TEXT_MIN = 10;
export const REVIEW_TITLE_MAX = 120;

function readStorage(key, fallback = []) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`[ReviewService] Error reading ${key}:`, err);
    return fallback;
  }
}

function writeStorage(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[ReviewService] Error writing ${key}:`, err);
    return false;
  }
}

function generateReviewId() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  return `REV-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

/**
 * Explicit-token admin check. Mirrors the inventory barrier: a caller that
 * cannot produce a session token is refused even if an admin happens to be
 * signed in elsewhere in the same browser.
 */
function isAuthorizedModerator(token) {
  if (typeof token !== 'string' || token.trim() === '') return false;
  return adminService.isAdminAuthorized(token);
}

/** All customer-submitted reviews, newest first. Never seeded — starts empty. */
export function listReviews() {
  const all = readStorage(REVIEWS_STORAGE_KEY, []);
  return Array.isArray(all) ? all : [];
}

export function getReview(id) {
  if (!id) return null;
  return listReviews().find(r => r.id === id) || null;
}

export function getReviewsByProduct(productId) {
  if (!productId) return [];
  return listReviews().filter(r => r.productId === productId);
}

export function getApprovedByProduct(productId) {
  return getReviewsByProduct(productId).filter(r => r.status === REVIEW_STATUS.APPROVED);
}

export function getPendingCount() {
  return listReviews().filter(r => r.status === REVIEW_STATUS.PENDING).length;
}

/**
 * Submit a customer review. Always lands in PENDING — a caller-supplied
 * `status` is ignored so storefront input can never self-approve.
 *
 * @param {Object} input {productId, author, rating, title?, text?, customerId?, customerEmail?}
 * @returns {{success: boolean, review?: Object, error?: string}}
 */
export function submitReview(input = {}) {
  const productId = String(input.productId || '').trim();
  const author = String(input.author || '').trim();
  const title = String(input.title || '').trim();
  const text = String(input.text || '').trim();
  const rating = Number(input.rating);

  if (!productId) return { success: false, error: 'A product reference is required.' };
  if (author.length < 2 || author.length > 60) {
    return { success: false, error: 'Please share your name (2–60 characters).' };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, error: 'Please choose a rating from 1 to 5 stars.' };
  }
  if (title.length > REVIEW_TITLE_MAX) {
    return { success: false, error: `Headline must be ${REVIEW_TITLE_MAX} characters or fewer.` };
  }
  if (text.length < REVIEW_TEXT_MIN || text.length > REVIEW_TEXT_MAX) {
    return { success: false, error: `Review must be ${REVIEW_TEXT_MIN}–${REVIEW_TEXT_MAX} characters.` };
  }

  const now = new Date().toISOString();
  const review = {
    id: generateReviewId(),
    productId,
    author,
    rating,
    title,
    text,
    customerId: input.customerId || null,
    customerEmail: input.customerEmail || null,
    verified: false, // moderators may confirm verified purchase at approval time
    status: REVIEW_STATUS.PENDING,
    history: [{ from: null, to: REVIEW_STATUS.PENDING, timestamp: now, actor: 'customer', note: 'Submitted for moderation' }],
    createdAt: now,
    updatedAt: now
  };

  const all = listReviews();
  all.unshift(review);
  writeStorage(REVIEWS_STORAGE_KEY, all);
  return { success: true, review };
}

/**
 * Moderate a review. Admin token required — customers and anonymous callers
 * are refused before any state is read.
 *
 * @param {string} id
 * @param {string} action approve | reject | hide | reopen
 * @param {Object} [options] {token, note}
 * @returns {{success: boolean, review?: Object, error?: string}}
 */
export function moderateReview(id, action, options = {}) {
  if (!isAuthorizedModerator(options.token)) {
    return { success: false, error: 'Unauthorized: admin moderation requires a verified admin session.' };
  }
  const target = ACTION_STATUS[action];
  if (!target) {
    return { success: false, error: `Unknown moderation action "${action}".` };
  }
  const all = listReviews();
  const review = all.find(r => r.id === id);
  if (!review) {
    return { success: false, error: `Review "${id}" not found.` };
  }
  const allowed = VALID_MODERATION[review.status] || [];
  if (!allowed.includes(action)) {
    return { success: false, error: `Cannot "${action}" a ${review.status} review.` };
  }

  const now = new Date().toISOString();
  review.history = Array.isArray(review.history) ? review.history : [];
  review.history.push({
    from: review.status,
    to: target,
    timestamp: now,
    actor: 'admin',
    note: String(options.note || '').trim() || `Moderated: ${action}`
  });
  review.status = target;
  review.updatedAt = now;
  writeStorage(REVIEWS_STORAGE_KEY, all);
  return { success: true, review };
}

/**
 * Public storefront aggregate for a product: seed base blended with approved
 * submissions. With zero approvals the result is exactly the catalogue's own
 * rating/reviewCount, so nothing on the storefront shifts until moderation
 * actually happens.
 *
 * @param {Object} product Catalogue product ({id, rating, reviewCount})
 * @param {Array<Object>} [approved] Pre-fetched approvals (avoids re-reading
 *   storage in hot loops like the product grid). When omitted, approvals are
 *   read for product.id — callers must not rely on the base values alone.
 * @returns {{rating: number, reviewCount: number}}
 */
export function getPublicAggregate(product, approved = null) {
  const baseRating = Number(product?.rating) || 0;
  const baseCount = Number(product?.reviewCount) || 0;
  const list = Array.isArray(approved) ? approved : getApprovedByProduct(product?.id);
  if (list.length === 0) return { rating: baseRating, reviewCount: baseCount };
  const sum = list.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  const count = baseCount + list.length;
  return {
    rating: Math.round(((baseRating * baseCount + sum) / count) * 10) / 10,
    reviewCount: count
  };
}

/**
 * Public review list for a product: curated seed excerpts first, then approved
 * customer submissions newest-first. Anything not approved never appears.
 *
 * @param {Object} product Catalogue product ({reviews})
 * @param {string} productId
 * @returns {Array<Object>}
 */
export function getPublicReviews(product, productId) {
  const seeds = Array.isArray(product?.reviews) ? product.reviews : [];
  const approved = getApprovedByProduct(productId)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return [...seeds, ...approved];
}

/** Test/support helper: wipe the submission store. */
export function clearAll() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(REVIEWS_STORAGE_KEY);
}
