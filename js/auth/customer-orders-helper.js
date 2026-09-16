/**
 * Customer Orders Helpers & Formatting Utilities - Slimky Hair
 * Milestone C19.7: Customer Orders & Order Details
 */

export const ORDER_STATUS_CONFIG = {
  draft: { label: 'Draft', class: 'status-pending' },
  pending_payment: { label: 'Pending Payment', class: 'status-pending' },
  paid: { label: 'Paid', class: 'status-paid' },
  shipping_quote_required: { label: 'Shipping Quote Required', class: 'status-quote' },
  shipping_quote_sent: { label: 'Shipping Quote Sent', class: 'status-quote' },
  shipping_payment_pending: { label: 'Shipping Payment Pending', class: 'status-pending' },
  ready_for_dispatch: { label: 'Ready for Dispatch', class: 'status-paid' },
  shipped: { label: 'Shipped', class: 'status-paid' },
  delivered: { label: 'Delivered', class: 'status-paid' },
  payment_failed: { label: 'Payment Failed', class: 'status-failed' },
  cancelled: { label: 'Cancelled', class: 'status-failed' }
};

export const PAYMENT_STATUS_CONFIG = {
  pending: { label: 'Pending', class: 'status-pending' },
  processing: { label: 'Processing', class: 'status-pending' },
  successful: { label: 'Successful', class: 'status-paid' },
  failed: { label: 'Failed', class: 'status-failed' }
};

/**
 * Get human-readable order status label.
 * @param {string} status 
 * @returns {string}
 */
export function formatOrderStatus(status) {
  if (!status) return 'Pending';
  return ORDER_STATUS_CONFIG[status]?.label || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Get CSS badge class for order status.
 * @param {string} status 
 * @returns {string}
 */
export function getOrderStatusClass(status) {
  return ORDER_STATUS_CONFIG[status]?.class || 'status-pending';
}

/**
 * Get human-readable payment status label.
 * @param {string} status 
 * @returns {string}
 */
export function formatPaymentStatus(status) {
  if (!status) return 'Pending';
  return PAYMENT_STATUS_CONFIG[status]?.label || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Calculate total quantity of items in an order.
 * @param {Array} items 
 * @returns {number}
 */
export function calculateTotalItemCount(items = []) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, it) => total + (Number(it.quantity) || 1), 0);
}

/**
 * Format items into a concise summary string for order cards.
 * @param {Array} items 
 * @returns {string}
 */
export function formatOrderItemsSummary(items = []) {
  if (!Array.isArray(items) || items.length === 0) return 'No items';
  return items.map(it => {
    const variantStr = it.variantName ? ` (${it.variantName})` : (it.size ? ` (${it.size})` : '');
    const qty = Number(it.quantity) || 1;
    return `${it.productName || 'Botanical Product'}${variantStr} × ${qty}`;
  }).join(', ');
}

/**
 * Format date in clean British/African English format (e.g. 12 Sep 2026).
 * @param {string|Date} dateVal 
 * @param {boolean} [includeTime=false]
 * @returns {string}
 */
export function formatOrderDate(dateVal, includeTime = false) {
  if (!dateVal) return 'Recent';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Recent';
    const options = {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    };
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return d.toLocaleDateString('en-GB', options);
  } catch (err) {
    return 'Recent';
  }
}

/**
 * Format currency amount in Nigerian Naira (₦).
 * @param {number} amount 
 * @returns {string}
 */
export function formatOrderNaira(amount) {
  const num = Number(amount) || 0;
  return '₦' + num.toLocaleString('en-NG');
}

/**
 * Generate accurate shipping information notice respecting Nigeria vs International flow.
 * Does NOT invent fake shipping fees.
 * @param {Object} order 
 * @returns {{ title: string, description: string, badge: string, isSeparate: boolean }}
 */
export function getOrderShippingNotice(order) {
  if (!order) {
    return {
      title: 'Standard Dispatch',
      description: 'Standard delivery via approved logistics provider.',
      badge: 'Standard',
      isSeparate: false
    };
  }

  const isNigeria = order.flow === 'nigeria_checkout' || 
    (order.delivery?.country || '').toLowerCase() === 'nigeria';

  if (isNigeria) {
    const hasShippingFee = !!(order.pricing?.shippingFee && order.pricing.shippingFee > 0);
    return {
      title: 'Nigeria Domestic Dispatch',
      description: hasShippingFee 
        ? `Delivery fee of ${formatOrderNaira(order.pricing.shippingFee)} included in payment total.`
        : 'Courier delivery fee may be separate or collected upon delivery coordination depending on local dispatch route.',
      badge: 'Domestic',
      isSeparate: !hasShippingFee
    };
  } else {
    const destinationCountry = order.delivery?.country || 'International Destination';
    return {
      title: 'International Botanical Dispatch',
      description: `International shipping quote is assessed for destination: ${destinationCountry}. Applicable local customs duties, import tariffs, or clearance charges may be assessed upon arrival by destination authorities.`,
      badge: 'International Quote',
      isSeparate: true
    };
  }
}
