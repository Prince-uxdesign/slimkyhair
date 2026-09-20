/**
 * Product Model, Publication Lifecycle & Validation - Slimky Hair
 * Phase A3: Admin Product Management
 *
 * Single source of truth for:
 * - The publication status lifecycle (Draft -> Published -> Archived)
 * - The canonical product record shape consumed by the storefront
 * - Validation rules that keep invalid products out of the catalogue
 *
 * This module is intentionally dependency-free so it can be imported by both
 * the storefront hydration layer (catalog-overlay.js) and the admin service
 * without creating circular imports.
 */

/* ------------------------------------------------------------------ */
/* Publication Lifecycle                                              */
/* ------------------------------------------------------------------ */

export const PRODUCT_STATUS = {
  DRAFT: 'draft',
  READY_FOR_REVIEW: 'ready_for_review',
  READY_FOR_PUBLICATION: 'ready_for_publication',
  PUBLISHED: 'published',
  ARCHIVED: 'archived'
};

export const PRODUCT_STATUS_LABELS = {
  [PRODUCT_STATUS.DRAFT]: 'Draft',
  [PRODUCT_STATUS.READY_FOR_REVIEW]: 'Ready for Review',
  [PRODUCT_STATUS.READY_FOR_PUBLICATION]: 'Ready for Publication',
  [PRODUCT_STATUS.PUBLISHED]: 'Published',
  [PRODUCT_STATUS.ARCHIVED]: 'Archived'
};

/** Ordered for admin dropdowns / filter tabs (workflow order). */
export const PRODUCT_STATUS_ORDER = [
  PRODUCT_STATUS.DRAFT,
  PRODUCT_STATUS.READY_FOR_REVIEW,
  PRODUCT_STATUS.READY_FOR_PUBLICATION,
  PRODUCT_STATUS.PUBLISHED,
  PRODUCT_STATUS.ARCHIVED
];

/**
 * The ONLY status that is visible to customers. Everything else — including
 * "Ready for Publication" — stays out of shop, category, search, and PDP.
 * Archiving is the deactivation mechanism for products with order history.
 */
export const CUSTOMER_VISIBLE_STATUSES = [PRODUCT_STATUS.PUBLISHED];

export function isCustomerVisible(product) {
  return CUSTOMER_VISIBLE_STATUSES.includes(resolveStatus(product));
}

/**
 * Seed catalogue products predate the status field. They are live on the
 * storefront today, so an absent status resolves to Published — never Draft,
 * which would silently empty the shop on first load.
 */
export function resolveStatus(product) {
  const raw = product && typeof product.status === 'string' ? product.status.trim().toLowerCase() : '';
  return PRODUCT_STATUS_ORDER.includes(raw) ? raw : PRODUCT_STATUS.PUBLISHED;
}

export function getStatusLabel(status) {
  return PRODUCT_STATUS_LABELS[status] || PRODUCT_STATUS_LABELS[PRODUCT_STATUS.PUBLISHED];
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Naira formatter. Deliberately local rather than imported from cart-store.js,
 * which imports catalog-data.js and would create an import cycle.
 */
export function formatPriceNaira(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₦0';
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Split a textarea into trimmed, non-empty lines. */
export function linesToArray(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

export function arrayToLines(value) {
  return Array.isArray(value) ? value.join('\n') : String(value || '');
}

/* ------------------------------------------------------------------ */
/* Field vocabularies (admin form option lists)                        */
/* ------------------------------------------------------------------ */

export const HAIR_TYPE_OPTIONS = [
  'Straight', 'Wavy', 'Curly', 'Coily', 'Fine', 'Medium', 'Thick',
  'Color Treated', 'Chemically Treated', 'Locs', 'Protective Styles'
];

export const SCALP_TYPE_OPTIONS = [
  'Normal', 'Dry', 'Oily', 'Sensitive', 'Flaky', 'Combination'
];

export const PRODUCT_TYPE_OPTIONS = [
  'Hair Oil', 'Shampoo', 'Conditioner', 'Leave-In Conditioner', 'Hair Cream',
  'Hair Butter', 'Hair Mask', 'Scalp Treatment', 'Scalp Serum', 'Styling Gel',
  'Edge Control', 'Curl Custard'
];

/** Product image roles required by Slimky's cosmetic-listing requirements. */
export const IMAGE_ROLES = [
  {
    key: 'packaging',
    label: 'Packaging / Product Image',
    required: true,
    help: 'Primary listing image used on shop cards, search, cart and the PDP hero.'
  },
  {
    key: 'ingredients',
    label: 'Ingredient Label Image',
    required: true,
    help: 'Photograph of the physical INCI / ingredient label. Required for cosmetic compliance.'
  },
  {
    key: 'texture',
    label: 'Texture / Application Image',
    required: false,
    help: 'Optional macro or in-use shot showing product texture.'
  }
];

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

function normalizeVariant(raw, index) {
  const priceValue = Number(raw.priceValue);
  const size = String(raw.size || '').trim();
  return {
    id: String(raw.id || raw.sku || `variant-${index + 1}`).trim(),
    size,
    sku: String(raw.sku || '').trim().toUpperCase(),
    priceValue: Number.isFinite(priceValue) ? priceValue : 0,
    priceFormatted: formatPriceNaira(priceValue),
    stock: Math.max(0, Math.trunc(Number(raw.stock) || 0)),
    availability: Math.max(0, Math.trunc(Number(raw.stock) || 0)) > 0 ? 'In Stock' : 'Out of Stock'
  };
}

/**
 * Build the canonical product record the storefront consumes.
 * Every field the storefront dereferences without a guard (images.packaging,
 * variants[], hairTypes[]) is always present on the output.
 *
 * @param {Object} draft
 * @param {Object} [existing] Previous record, for preserving non-form fields on edit.
 * @returns {Object}
 */
export function normalizeProduct(draft, existing = null) {
  const base = existing || {};
  const now = new Date().toISOString();
  const variants = (Array.isArray(draft.variants) ? draft.variants : []).map(normalizeVariant);
  const status = resolveStatus(draft);

  const images = {
    packaging: String(draft.images?.packaging || '').trim(),
    ingredients: String(draft.images?.ingredients || '').trim(),
    texture: String(draft.images?.texture || '').trim()
  };
  // Texture is optional; fall back to packaging so the PDP gallery never
  // renders a broken <img> for a product that only supplied two images.
  if (!images.texture) images.texture = images.packaging;
  if (!images.ingredients) images.ingredients = images.packaging;

  return {
    // Identity
    id: String(draft.id || base.id || '').trim(),
    slug: slugify(draft.slug || draft.name),
    name: String(draft.name || '').trim(),

    // Classification
    category: String(draft.category || '').trim(),
    categorySlug: String(draft.categorySlug || '').trim(),
    productType: String(draft.productType || '').trim(),

    // Copy
    descriptor: String(draft.descriptor || '').trim(),
    description: String(draft.description || '').trim(),
    suitableFor: String(draft.suitableFor || '').trim(),
    benefits: linesToArray(draft.benefits),
    claims: linesToArray(draft.claims),

    // Merchandising (preserved from seed data when not editable in the form)
    badge: draft.badge || base.badge || null,
    featured: Boolean(draft.featured),
    bestseller: Boolean(draft.bestseller),
    rating: Number(base.rating) || 0,
    reviewCount: Number(base.reviewCount) || 0,
    reviews: Array.isArray(base.reviews) ? base.reviews : [],

    // Suitability & filtering facets
    hairTypes: Array.isArray(draft.hairTypes) ? draft.hairTypes.filter(Boolean) : [],
    scalpTypes: Array.isArray(draft.scalpTypes) ? draft.scalpTypes.filter(Boolean) : [],
    concerns: Array.isArray(draft.concerns) ? draft.concerns.filter(Boolean) : linesToArray(draft.concerns),

    // Formulation / compliance
    ingredientsShort: String(draft.ingredientsShort || '').trim(),
    ingredientsINCI: String(draft.ingredientsINCI || '').trim(),
    netWeight: String(draft.netWeight || '').trim(),
    shelfLife: String(draft.shelfLife || '').trim(),
    manufacturer: String(draft.manufacturer || '').trim(),
    countryOfManufacture: String(draft.countryOfManufacture || '').trim(),
    responsiblePerson: {
      name: String(draft.responsiblePerson?.name || '').trim(),
      email: String(draft.responsiblePerson?.email || '').trim(),
      address: String(draft.responsiblePerson?.address || '').trim()
    },
    fragrance: String(draft.fragrance || '').trim(),
    sulfates: String(draft.sulfates || '').trim(),
    parabens: String(draft.parabens || '').trim(),
    essentialOils: String(draft.essentialOils || '').trim(),
    safetyInformation: String(draft.safetyInformation || '').trim(),
    usageInstructions: Array.isArray(draft.usageInstructions) && draft.usageInstructions.length
      ? draft.usageInstructions
      : (Array.isArray(base.usageInstructions) ? base.usageInstructions : []),

    // Media
    images,

    // Commerce
    variants,

    // Lifecycle
    status,
    createdAt: base.createdAt || draft.createdAt || now.slice(0, 10),
    updatedAt: now,
    archivedAt: status === PRODUCT_STATUS.ARCHIVED ? (base.archivedAt || now) : null
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ------------------------------------------------------------------ */
/* Prohibited medical / drug claims                                     */
/* ------------------------------------------------------------------ */

/**
 * Phrases that turn cosmetic copy into a medical/drug claim. Slimky Hair
 * products are cosmetics: they must never claim to diagnose, treat, cure or
 * prevent disease, regrow hair, or carry drug/regulatory approval.
 * Screened at publication gate only — drafts may hold in-progress copy.
 */
export const PROHIBITED_CLAIM_PATTERNS = [
  /\bcures?\b/i,
  /\bdiagnos(e[sd]?|is|ing)\b/i,
  /\bFDA\b[\s\S]{0,24}\bapprov/i,
  /\bclinically proven\b[\s\S]{0,40}\b(cure|treat|regrow|regrowth|heal)\w*\b/i,
  /\bregrow(s|th)?\b/i,
  /\bminoxidil\b/i,
  /\bfinasteride\b/i,
  /\bantibiotics?\b/i,
  /\bantifungals?\b/i,
  /\bsteroids?\b/i,
  /\bheals?\b[\s\S]{0,30}\b(eczema|psoriasis|dermatitis|lesions?|scalp disorder|alopecia)\b/i,
  /\btreats?\b[\s\S]{0,30}\b(alopecia|eczema|psoriasis|dermatitis|fungal|ringworm|baldness)\b/i
];

/**
 * Scan marketing copy for prohibited medical/drug claims.
 * @param {Object} draft Raw form draft (pre-normalization).
 * @returns {Array<{ field: string, match: string }>} One entry per offending field.
 */
export function findProhibitedClaims(draft) {
  const fields = {
    claims: Array.isArray(draft.claims) ? draft.claims.join('\n') : String(draft.claims || ''),
    benefits: Array.isArray(draft.benefits) ? draft.benefits.join('\n') : String(draft.benefits || ''),
    description: String(draft.description || ''),
    descriptor: String(draft.descriptor || '')
  };
  const hits = [];
  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    for (const pattern of PROHIBITED_CLAIM_PATTERNS) {
      const m = text.match(pattern);
      if (m) {
        hits.push({ field, match: m[0].slice(0, 80) });
        break;
      }
    }
  }
  return hits;
}

/**
 * Validate a product draft. Returns a field-keyed error map so the form can
 * anchor each message to its input.
 *
 * Rules escalate with publication status: a Draft may be incomplete, but a
 * product that is Ready for Publication or Published must carry the full
 * cosmetic-compliance record.
 *
 * @param {Object} draft Raw form draft (pre-normalization).
 * @param {Object} ctx
 * @param {Array<Object>} ctx.allProducts Full catalogue, for uniqueness checks.
 * @param {string|null} ctx.currentId Id being edited, excluded from uniqueness.
 * @returns {{ valid: boolean, errors: Object<string,string> }}
 */
export function validateProduct(draft, ctx = {}) {
  const errors = {};
  const allProducts = Array.isArray(ctx.allProducts) ? ctx.allProducts : [];
  const currentId = ctx.currentId || null;
  const status = resolveStatus(draft);
  // Anything past Draft/Review must be complete enough to sell.
  const requiresFullCompliance = [
    PRODUCT_STATUS.READY_FOR_PUBLICATION,
    PRODUCT_STATUS.PUBLISHED
  ].includes(status);

  const name = String(draft.name || '').trim();
  if (!name) errors.name = 'Product name is required.';
  else if (name.length < 3) errors.name = 'Product name must be at least 3 characters.';
  else if (name.length > 120) errors.name = 'Product name must be 120 characters or fewer.';

  const slug = slugify(draft.slug || draft.name);
  if (!slug) {
    errors.slug = 'Slug is required and must contain letters or numbers.';
  } else {
    const clash = allProducts.find(p => p.slug === slug && p.id !== currentId);
    if (clash) errors.slug = `Slug "${slug}" is already used by "${clash.name}".`;
  }

  if (!String(draft.categorySlug || '').trim()) errors.categorySlug = 'Category is required.';
  if (!String(draft.productType || '').trim()) errors.productType = 'Product type is required.';

  const descriptor = String(draft.descriptor || '').trim();
  if (!descriptor) errors.descriptor = 'Short descriptor is required — it appears on shop cards.';
  else if (descriptor.length > 220) errors.descriptor = 'Descriptor must be 220 characters or fewer.';

  if (requiresFullCompliance && !String(draft.description || '').trim()) {
    errors.description = 'Full description is required before publication.';
  }

  /* ---- Variants (authoritative pricing) ---- */
  const variants = Array.isArray(draft.variants) ? draft.variants : [];
  if (variants.length === 0) {
    errors.variants = 'At least one variant is required — variants carry price, SKU and inventory.';
  } else {
    const seenSkus = new Set();
    const seenSizes = new Set();
    variants.forEach((variant, index) => {
      const key = `variants.${index}`;
      const size = String(variant.size || '').trim();
      const sku = String(variant.sku || '').trim().toUpperCase();
      const price = Number(variant.priceValue);
      const stock = Number(variant.stock);

      if (!size) errors[`${key}.size`] = 'Size / volume is required.';
      else if (seenSizes.has(size.toLowerCase())) errors[`${key}.size`] = `Duplicate size "${size}".`;
      else seenSizes.add(size.toLowerCase());

      if (!sku) {
        errors[`${key}.sku`] = 'Variant SKU is required.';
      } else if (!SKU_PATTERN.test(sku)) {
        errors[`${key}.sku`] = 'SKU must be 3-32 characters: A-Z, 0-9 and hyphens.';
      } else if (seenSkus.has(sku)) {
        errors[`${key}.sku`] = `Duplicate SKU "${sku}" within this product.`;
      } else {
        seenSkus.add(sku);
        const owner = allProducts.find(p =>
          p.id !== currentId && (p.variants || []).some(v => String(v.sku || '').toUpperCase() === sku)
        );
        if (owner) errors[`${key}.sku`] = `SKU "${sku}" already belongs to "${owner.name}".`;
      }

      if (!Number.isFinite(price)) errors[`${key}.priceValue`] = 'Price is required.';
      else if (price <= 0) errors[`${key}.priceValue`] = 'Price must be greater than zero.';
      else if (price > 100000000) errors[`${key}.priceValue`] = 'Price is unrealistically high.';

      if (!Number.isFinite(stock)) errors[`${key}.stock`] = 'Inventory is required.';
      else if (stock < 0) errors[`${key}.stock`] = 'Inventory cannot be negative.';
      else if (!Number.isInteger(stock)) errors[`${key}.stock`] = 'Inventory must be a whole number.';
    });
  }

  /* ---- Images ---- */
  IMAGE_ROLES.forEach(role => {
    const value = String(draft.images?.[role.key] || '').trim();
    if (!value && role.required && requiresFullCompliance) {
      errors[`images.${role.key}`] = `${role.label} is required before publication.`;
    }
    if (value && value.length > 2_000_000) {
      errors[`images.${role.key}`] = 'Image reference is too large to store.';
    }
  });
  // Packaging is the one image the storefront dereferences unconditionally,
  // so it is required at every status — even Draft.
  if (!String(draft.images?.packaging || '').trim()) {
    errors['images.packaging'] = 'Packaging / product image is required.';
  }

  /* ---- Suitability facets ---- */
  const hairTypes = Array.isArray(draft.hairTypes) ? draft.hairTypes.filter(Boolean) : [];
  if (hairTypes.length === 0) errors.hairTypes = 'Select at least one hair type.';
  const scalpTypes = Array.isArray(draft.scalpTypes) ? draft.scalpTypes.filter(Boolean) : [];
  if (requiresFullCompliance && scalpTypes.length === 0) {
    errors.scalpTypes = 'Select at least one scalp type before publication.';
  }

  /* ---- Cosmetic compliance block ---- */
  if (requiresFullCompliance) {
    if (!String(draft.ingredientsINCI || '').trim()) {
      errors.ingredientsINCI = 'Full INCI ingredient list is required before publication.';
    }
    if (!String(draft.netWeight || '').trim()) errors.netWeight = 'Net weight / volume is required.';
    if (!String(draft.shelfLife || '').trim()) errors.shelfLife = 'Shelf life / PAO is required.';
    if (!String(draft.manufacturer || '').trim()) errors.manufacturer = 'Manufacturer is required.';
    if (!String(draft.countryOfManufacture || '').trim()) {
      errors.countryOfManufacture = 'Country of manufacture is required.';
    }
    if (!String(draft.responsiblePerson?.name || '').trim()) {
      errors['responsiblePerson.name'] = 'Responsible person is required.';
    }
    if (!String(draft.safetyInformation || '').trim()) {
      errors.safetyInformation = 'Safety information is required.';
    }
    if (!String(draft.fragrance || '').trim()) {
      errors.fragrance = 'Fragrance information is required (state "Fragrance free" if none).';
    }

    // Cosmetic compliance: never publish medical/drug claims (disease cures,
    // regrowth promises, drug names, regulatory-approval claims).
    for (const hit of findProhibitedClaims(draft)) {
      errors[hit.field] = `Remove the prohibited medical/drug claim ("${hit.match}"): cosmetics must not promise to diagnose, treat, cure or prevent disease.`;
    }
  }

  const rpEmail = String(draft.responsiblePerson?.email || '').trim();
  if (rpEmail && !EMAIL_PATTERN.test(rpEmail)) {
    errors['responsiblePerson.email'] = 'Enter a valid contact email address.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
