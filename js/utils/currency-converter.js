/**
 * Currency Converter & International Display Indicator - Slimky Hair
 * 
 * Provides transparent, approximate foreign currency equivalents (USD, GBP)
 * for catalog formulations and checkout totals strictly denominated in Nigerian Naira (₦).
 * 
 * Invariant: All transactions are processed and charged strictly in NGN.
 * Approximate exchange rates are indicative for client reassurance.
 */

export const APPROX_EXCHANGE_RATES = {
  USD: 1550, // 1 USD ≈ 1,550 NGN
  GBP: 1950, // 1 GBP ≈ 1,950 NGN
  EUR: 1680  // 1 EUR ≈ 1,680 NGN
};

export const CURRENCY_DISCLAIMER = 'Charged in NGN; approximate exchange rates depend on your card issuer.';

/**
 * Calculates approximate USD and GBP equivalent for a given Naira amount.
 * @param {number} ngnAmount - Amount in Nigerian Naira
 * @returns {{ usd: number, gbp: number, usdFormatted: string, gbpFormatted: string, combinedFormatted: string, disclaimer: string }}
 */
export function getApproximateForeignCurrencies(ngnAmount) {
  const num = typeof ngnAmount === 'number' && !isNaN(ngnAmount) ? Math.max(0, ngnAmount) : 0;
  
  const usdApprox = Math.round(num / APPROX_EXCHANGE_RATES.USD);
  const gbpApprox = Math.round(num / APPROX_EXCHANGE_RATES.GBP);
  
  const usdFormatted = `~$${usdApprox.toLocaleString('en-US')} USD`;
  const gbpFormatted = `~£${gbpApprox.toLocaleString('en-GB')} GBP`;
  const combinedFormatted = `Approx. ${usdFormatted} · ${gbpFormatted}`;

  return {
    usd: usdApprox,
    gbp: gbpApprox,
    usdFormatted,
    gbpFormatted,
    combinedFormatted,
    disclaimer: CURRENCY_DISCLAIMER
  };
}

/**
 * Generates semantic HTML string for PDP currency indicator.
 * @param {number} ngnAmount 
 * @returns {string}
 */
export function renderPdpCurrencyIndicatorHTML(ngnAmount) {
  const info = getApproximateForeignCurrencies(ngnAmount);
  return `
    <div class="pdp-currency-reference" id="pdp-currency-reference" role="note" aria-label="International currency estimate">
      <span class="pdp-currency-approx">${info.combinedFormatted}</span>
      <span class="pdp-currency-disclaimer">(${info.disclaimer})</span>
    </div>
  `.trim();
}

/**
 * Generates semantic HTML string for International Checkout currency indicator.
 * @param {number} ngnAmount 
 * @param {boolean} isInternational 
 * @returns {string}
 */
export function renderCheckoutCurrencyIndicatorHTML(ngnAmount, isInternational = false) {
  if (!isInternational) return '';
  const info = getApproximateForeignCurrencies(ngnAmount);
  return `
    <div class="checkout-currency-box" id="checkout-currency-box" role="note" aria-label="International currency reference">
      <div class="checkout-currency-row">
        <span class="checkout-currency-tag">International Reference</span>
        <span class="checkout-currency-approx" id="checkout-currency-approx-val">${info.combinedFormatted}</span>
      </div>
      <p class="checkout-currency-note">
        All orders are billed in Nigerian Naira (₦). ${info.disclaimer}
      </p>
    </div>
  `.trim();
}
