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
