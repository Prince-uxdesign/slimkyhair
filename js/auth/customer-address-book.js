/**
 * Customer Saved Addresses & Checkout Integration Utilities - Slimky Hair
 * Milestone C19.6: Customer Saved Addresses & Future Checkout Bridge
 *
 * Provides shared address formatting, country-adaptive validation,
 * catalogs, and conversion to checkout payload formats without modifying
 * or breaking existing checkout architecture.
 */

export const SUPPORTED_COUNTRIES = [
  'Nigeria',
  'United States',
  'United Kingdom',
  'Canada',
  'Ghana',
  'South Africa',
  'Kenya',
  'Germany',
  'France',
  'United Arab Emirates',
  'Other'
];

export const NIGERIAN_STATES = [
  'Lagos',
  'Abuja (FCT)',
  'Rivers',
  'Oyo',
  'Delta',
  'Edo',
  'Enugu',
  'Anambra',
  'Ogun',
  'Kano',
  'Kaduna',
  'Kwara',
  'Ondo',
  'Akwa Ibom',
  'Abia',
  'Adamawa',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Ebonyi',
  'Ekiti',
  'Gombe',
  'Imo',
  'Jigawa',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Nasarawa',
  'Niger',
  'Osun',
  'Plateau',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
  'Other'
];

export const ADDRESS_LABELS = ['Home', 'Office', 'Apartment', 'Family', 'Other'];

/**
 * Validate customer address fields based on country rules.
 * @param {Object} data 
 * @returns {{ isValid: boolean, errors: Object }}
 */
export function validateAddressData(data = {}) {
  const errors = {};

  const recipientName = (data.recipientName || '').trim();
  if (!recipientName || recipientName.length < 2) {
    errors['recipientName'] = 'Recipient full name is required (minimum 2 characters).';
  }

  const phone = (data.phone || '').trim();
  const digitsOnly = phone.replace(/\D/g, '');
  if (!phone) {
    errors['phone'] = 'Phone / WhatsApp number is required for delivery coordination.';
  } else if (digitsOnly.length < 7) {
    errors['phone'] = 'Please enter a valid phone number (at least 7 digits).';
  }

  const country = (data.country || '').trim();
  if (!country) {
    errors['country'] = 'Please select a destination country.';
  }

  const isNigeria = country.toLowerCase() === 'nigeria';

  const streetAddress = (data.streetAddress || '').trim();
  if (!streetAddress || streetAddress.length < 5) {
    errors['streetAddress'] = 'Please provide a complete street address (minimum 5 characters).';
  }

  const city = (data.city || '').trim();
  if (!city || city.length < 2) {
    errors['city'] = 'Please specify the delivery city or town.';
  }

  const state = (data.state || '').trim();
  if (!state) {
    errors['state'] = isNigeria 
      ? 'Please select your delivery state in Nigeria.' 
      : 'Please specify your state, province, or region.';
  }

  const postalCode = (data.postalCode || '').trim();
  if (!isNigeria && (!postalCode || postalCode.length < 2)) {
    errors['postalCode'] = 'Postal / ZIP code is required for international deliveries.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Format address as a clean single-line string.
 * @param {Object} addr 
 * @returns {string}
 */
export function formatAddressSingleLine(addr) {
  if (!addr) return '';
  const parts = [];
  if (addr.streetAddress) parts.push(addr.streetAddress.trim());
  if (addr.city) parts.push(addr.city.trim());
  if (addr.state) {
    const st = addr.postalCode ? `${addr.state.trim()} ${addr.postalCode.trim()}` : addr.state.trim();
    parts.push(st);
  }
  if (addr.country) parts.push(addr.country.trim());
  return parts.join(', ');
}

/**
 * Format address as structured multi-line array of strings.
 * @param {Object} addr 
 * @returns {Array<string>}
 */
export function formatAddressLines(addr) {
  if (!addr) return [];
  const lines = [];
  if (addr.streetAddress) lines.push(addr.streetAddress.trim());
  
  const locality = [];
  if (addr.city) locality.push(addr.city.trim());
  if (addr.state) locality.push(addr.state.trim());
  if (addr.postalCode) locality.push(addr.postalCode.trim());
  if (locality.length > 0) lines.push(locality.join(', '));

  if (addr.country) lines.push(addr.country.trim());
  return lines;
}

/**
 * Future Checkout Bridge: Converts a saved address into the exact delivery payload
 * consumed by checkout.js without altering current checkout flow.
 * @param {Object} address 
 * @returns {Object} Checkout delivery session payload
 */
export function prepareCheckoutAddressPayload(address) {
  if (!address) return null;
  const isNigeria = (address.country || 'Nigeria').trim().toLowerCase() === 'nigeria';

  return {
    addressId: address.id || null,
    fullName: address.recipientName || '',
    phone: address.phone || '',
    country: isNigeria ? 'Nigeria' : address.country || 'International',
    state: address.state || '',
    city: address.city || '',
    postalCode: address.postalCode || '',
    address: address.streetAddress || '',
    instructions: address.deliveryInstructions || '',
    isSavedAddress: true
  };
}
