/**
 * Shared HTML-escaping helper for components that interpolate order/customer
 * data into template strings (nigeria-shipping-card.js, shipping-quote-card.js).
 * Extracted because both had byte-identical private copies of this function.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
