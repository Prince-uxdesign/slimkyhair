/**
 * Development-Only Cart Validation Mock & Scenarios - Slimky Hair (C5)
 * 
 * Provides isolated simulation scenarios for testing cart validation without
 * affecting customer-facing production flows.
 * 
 * Supported Scenarios:
 * 1. product_exists: Baseline nominal state (all products & variants available).
 * 2. product_unavailable: Simulates product removal / discontinuation.
 * 3. variant_unavailable: Simulates specific variant discontinuation.
 * 4. price_changed: Simulates price changes (increase / decrease).
 * 5. stock_decreased: Simulates available stock dropping below requested quantity.
 * 6. network_failure: Simulates network / API timeout, proving non-destructive cart preservation.
 */

let activeScenario = null;

export const VALIDATION_SCENARIOS = {
  DEFAULT: 'product_exists',
  PRODUCT_UNAVAILABLE: 'product_unavailable',
  VARIANT_UNAVAILABLE: 'variant_unavailable',
  PRICE_CHANGED: 'price_changed',
  STOCK_DECREASED: 'stock_decreased',
  OUT_OF_STOCK: 'out_of_stock',
  NETWORK_FAILURE: 'network_failure'
};

/**
 * Get active dev scenario from window hook, memory, or URL parameter
 * Kept completely inactive in standard user journeys.
 */
export function getDevValidationScenario() {
  if (typeof window !== 'undefined') {
    if (window.__SLIMKY_DEV_SCENARIO__) {
      return window.__SLIMKY_DEV_SCENARIO__;
    }
    const searchStr = (typeof window.location !== 'undefined' && window.location?.search) ? window.location.search : '';
    const params = new URLSearchParams(searchStr);
    const fromUrl = params.get('cart_scenario') || params.get('dev_scenario');
    if (fromUrl) return fromUrl;
  }
  return activeScenario || VALIDATION_SCENARIOS.DEFAULT;
}

/**
 * Programmatically set active scenario for automated testing
 * @param {string} scenario 
 */
export function setDevValidationScenario(scenario) {
  activeScenario = scenario;
  if (typeof window !== 'undefined') {
    window.__SLIMKY_DEV_SCENARIO__ = scenario;
  }
}

/**
 * Reset to default production behavior
 */
export function clearDevValidationScenario() {
  activeScenario = null;
  if (typeof window !== 'undefined') {
    delete window.__SLIMKY_DEV_SCENARIO__;
  }
}

/**
 * Simulate live backend inventory verification request
 * 
 * @param {Array} cartItems 
 * @param {string} [scenarioOverride]
 * @returns {Promise<{ ok: boolean, data: Array, networkError: boolean }>}
 */
export async function fetchAuthoritativeProductCheck(cartItems, scenarioOverride = null) {
  const scenario = scenarioOverride || getDevValidationScenario();

  // SCENARIO 6: Network / Data Request Failure
  if (scenario === VALIDATION_SCENARIOS.NETWORK_FAILURE) {
    // Simulate failed network call without deleting cart items
    const err = new Error('NetworkError: Failed to fetch authoritative inventory endpoint');
    err.name = 'NetworkError';
    err.isNetworkFailure = true;
    throw err;
  }

  // Small async tick to simulate network roundtrip (instantaneous in test)
  await new Promise(resolve => setTimeout(resolve, 10));

  const results = cartItems.map(item => {
    const pId = item.productId;
    const vId = item.variantId;

    // SCENARIO 2: Product Unavailable / Discontinued
    if (scenario === VALIDATION_SCENARIOS.PRODUCT_UNAVAILABLE) {
      // Mark first product or demo product as unavailable
      return {
        itemKey: item.id,
        productId: pId,
        variantId: vId,
        exists: false,
        isAvailable: false,
        status: 'discontinued',
        currentPrice: item.unitPrice,
        currentStock: 0
      };
    }

    // SCENARIO 3: Variant Unavailable
    if (scenario === VALIDATION_SCENARIOS.VARIANT_UNAVAILABLE) {
      const isTargetVariant = (item.variantName && item.variantName.includes('100')) || (vId && vId.includes('100'));
      return {
        itemKey: item.id,
        productId: pId,
        variantId: vId,
        exists: true,
        isAvailable: !isTargetVariant,
        variantExists: !isTargetVariant,
        status: isTargetVariant ? 'variant_unavailable' : 'active',
        currentPrice: item.unitPrice,
        currentStock: isTargetVariant ? 0 : (item.stock || 10)
      };
    }

    // SCENARIO 4: Price Changed
    if (scenario === VALIDATION_SCENARIOS.PRICE_CHANGED) {
      // Simulate authoritative price revision to ₦44,000
      const adjustedPrice = 44000;
      return {
        itemKey: item.id,
        productId: pId,
        variantId: vId,
        exists: true,
        isAvailable: true,
        currentPrice: adjustedPrice,
        currentStock: item.stock || 10,
        status: 'active'
      };
    }

    // SCENARIO 5: Stock Decreased below requested quantity
    if (scenario === VALIDATION_SCENARIOS.STOCK_DECREASED) {
      // Clamp stock to 1 when requested is >= 2
      const loweredStock = Math.max(1, Math.min(item.quantity - 1, 1));
      return {
        itemKey: item.id,
        productId: pId,
        variantId: vId,
        exists: true,
        isAvailable: true,
        currentPrice: item.unitPrice,
        currentStock: loweredStock,
        status: 'low_stock'
      };
    }

    // SCENARIO 1: Baseline Nominal
    return {
      itemKey: item.id,
      productId: pId,
      variantId: vId,
      exists: true,
      isAvailable: true,
      currentPrice: item.unitPrice,
      currentStock: item.stock !== null ? item.stock : 10,
      status: 'active'
    };
  });

  return {
    ok: true,
    data: results,
    networkError: false
  };
}
