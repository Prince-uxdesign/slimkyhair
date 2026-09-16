/**
 * Global SEO Metadata System — Slimky Hair (Single Source of Truth)
 *
 * Plain static multi-page site (no framework, no build step).
 * Routing is file-based: `/shop/` -> `shop/index.html` (+ `shop.html` fallback).
 * Dynamic routes (`/product/[slug]`, `/category/[slug]`) are pre-rendered
 * static shells hydrated client-side via catalog-data.js.
 *
 * This module is the ONLY place SEO defaults, titles, descriptions,
 * canonical rules, robots rules, and OG/Twitter builders live.
 * Static HTML heads carry the pre-rendered values; JS controllers call
 * apply*SEO() to keep client-rendered views (product, category, search
 * query URLs) in sync without creating a second SEO system.
 *
 * Rules enforced:
 * - Absolute canonical URLs under https://slimkyhair.com with trailing slash.
 * - Query strings / hashes NEVER appear in canonicals (filters, pagination,
 *   search ?q=, product ?slug=, category ?c= all canonicalize to clean path).
 * - Non-public routes get `noindex, nofollow` and NO canonical / NO OG index signal.
 * - OG images are absolute URLs (never relative, never desktop-only assets).
 * - No medical/clinical claims, no invented certifications or statistics.
 */

export const SITE = {
  name: 'Slimky Hair',
  baseUrl: 'https://slimkyhair.com',
  defaultTitle: 'Slimky Hair | Natural Hair Care Products',
  defaultDescription:
    'Slimky Hair is a premium African hair-care house thoughtfully formulating botanical scalp and hair treatments with indigenous African bio-actives for textured, curly and coily hair.',
  defaultImage: 'https://slimkyhair.com/assets/placeholders/lifestyle/hero-lifestyle.jpg',
  locale: 'en_NG',
  twitterCard: 'summary_large_image',
};

/**
 * Static route table. `path` is the clean canonical path (trailing slash,
 * except none needed — all end with `/` or are `/`).
 * indexable=false => noindex, nofollow, no canonical, no OG/Twitter index signal.
 */
export const ROUTES = {
  '/': {
    title: 'Slimky Hair | Natural Hair Care Products',
    description: SITE.defaultDescription,
    canonicalPath: '/',
    indexable: true,
    ogType: 'website',
  },
  '/shop/': {
    title: 'Shop Hair Care Products | Slimky Hair',
    description:
      "Explore Slimky Hair's range of thoughtfully formulated botanical hair oils, cleansers, restorative conditioners, and styling treatments for textured, curly and coily hair.",
    canonicalPath: '/shop/',
    indexable: true,
    ogType: 'website',
  },
  '/about/': {
    title: 'About Slimky Hair | Our Story',
    description:
      'Learn about Slimky Hair — an independent botanical hair-care maker dedicated to creating thoughtful, in-house formulations for healthy, manageable natural hair.',
    canonicalPath: '/about/',
    indexable: true,
    ogType: 'website',
  },
  '/contact/': {
    title: 'Contact Slimky Hair',
    description:
      'Contact the Slimky Hair customer support and hair care concierge team. Reach out via WhatsApp, phone, email, or our online inquiry form for product and order assistance.',
    canonicalPath: '/contact/',
    indexable: true,
    ogType: 'website',
  },
  '/faq/': {
    title: 'Frequently Asked Questions | Slimky Hair',
    description:
      'Find answers to common questions about Slimky Hair products, ordering, shipping within Nigeria and internationally, formulation safety, and hair care rituals.',
    canonicalPath: '/faq/',
    indexable: true,
    ogType: 'website',
  },
  '/shipping/': {
    title: 'Shipping Information | Slimky Hair',
    description:
      'Learn how product payment, separate delivery fee calculation, and order dispatch work at Slimky Hair for orders in Nigeria and internationally.',
    canonicalPath: '/shipping/',
    indexable: true,
    ogType: 'website',
  },
  '/returns/': {
    title: 'Returns & Refunds | Slimky Hair',
    description:
      "Information about Slimky Hair's return and refund process. Review our pending policy notices and instructions on how to contact customer support for order assistance.",
    canonicalPath: '/returns/',
    indexable: true,
    ogType: 'website',
  },
  '/product-safety/': {
    title: 'Product Safety | Slimky Hair',
    description:
      'Simple guidance for using and caring for your Slimky Hair cosmetic products. Learn about external use, ingredients, storage, and how to choose formulations for your hair routine.',
    canonicalPath: '/product-safety/',
    indexable: true,
    ogType: 'website',
  },
  '/hair-care/': {
    title: 'Hair Care Guide | Slimky Hair',
    description:
      'Simple, useful guidance for building a thoughtful botanical hair-care routine. Learn about hair types, scalp wellness, oil rituals, and protective style care.',
    canonicalPath: '/hair-care/',
    indexable: true,
    ogType: 'website',
  },
  '/privacy/': {
    title: 'Privacy Policy | Slimky Hair',
    description:
      'Read the Privacy Policy for Slimky Hair. Learn how we handle your personal information, order data, and payment security with care.',
    canonicalPath: '/privacy/',
    indexable: true,
    ogType: 'website',
  },
  '/terms/': {
    title: 'Terms & Conditions | Slimky Hair',
    description:
      'Review the Terms & Conditions governing your use of the Slimky Hair website and the purchase of our botanical hair care products.',
    canonicalPath: '/terms/',
    indexable: true,
    ogType: 'website',
  },
  '/cookies/': {
    title: 'Cookie Policy | Slimky Hair',
    description:
      'Learn how Slimky Hair uses cookies and browser storage technologies to maintain your shopping bag, wishlist, and ensure a seamless browsing experience.',
    canonicalPath: '/cookies/',
    indexable: true,
    ogType: 'website',
  },
  '/wishlist/': {
    title: 'Your Wishlist | Slimky Hair',
    description:
      "Save your favourite Slimky Hair botanical formulations and come back to them whenever you're ready.",
    canonicalPath: '/wishlist/',
    indexable: true,
    ogType: 'website',
  },
  '/search/': {
    title: 'Search | Slimky Hair',
    description:
      "Search Slimky Hair's botanical hair oils, cleansers, restorative conditioners, and hair treatments by ingredient, concern, or hair type.",
    canonicalPath: '/search/',
    indexable: true,
    ogType: 'website',
  },
  '/404/': {
    title: 'Page Not Found | Slimky Hair',
    description:
      "The page you're looking for doesn't seem to exist. Explore Slimky Hair botanical formulations or return to our homepage.",
    canonicalPath: null,
    indexable: false,
    ogType: null,
  },
  // Non-public / utility — never index, never canonicalize.
  '/cart/': { title: 'Shopping Bag | Slimky Hair', description: 'Review your selected Slimky Hair botanical formulations before checkout.', canonicalPath: null, indexable: false, ogType: null },
  '/checkout/': { title: 'Checkout | Slimky Hair', description: 'Complete your Slimky Hair order with secure guest checkout and nationwide or international delivery.', canonicalPath: null, indexable: false, ogType: null },
  '/order-confirmation/': { title: 'Order Confirmed | Slimky Hair', description: 'Official order confirmation receipt for your Slimky Hair botanical formulations.', canonicalPath: null, indexable: false, ogType: null },
  '/account/': { title: 'Customer Account Overview | Slimky Hair', description: 'Manage your Slimky Hair customer account, saved delivery addresses, order history, and personal preferences.', canonicalPath: null, indexable: false, ogType: null },
  '/admin/': { title: 'Admin Orders & Fulfillment | Slimky Hair', description: 'Slimky Hair Operations Backoffice - Order management, shipping quote processing, and fulfillment.', canonicalPath: null, indexable: false, ogType: null },
};

const NON_PUBLIC_PREFIXES = ['/account/', '/admin/', '/checkout/', '/cart/', '/order-confirmation/'];

/** Build absolute URL from a clean path. Returns null when no canonical applies. */
export function canonicalUrlForPath(cleanPath) {
  if (!cleanPath) return null;
  const path = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  return `${SITE.baseUrl}${path}`;
}

/** Derive clean pathname (leading + trailing slash) stripping query/hash + index.html. */
export function cleanPathFromLocation(loc = window.location) {
  let path = loc.pathname || '/';
  path = path.replace(/index\.html?$/i, '');
  if (!path.startsWith('/')) path = `/${path}`;
  if (!path.endsWith('/')) path = `${path}/`;
  // Collapse duplicate slashes
  path = path.replace(/\/{2,}/g, '/');
  return path;
}

/** True when a clean path is a non-public route (account, admin, checkout, cart, order-confirm). */
export function isNonPublicPath(cleanPath) {
  return NON_PUBLIC_PREFIXES.some((p) => cleanPath === p || cleanPath.startsWith(p));
}

function upsertMetaByName(name, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertMetaProperty(property, content) {
  if (!content && content !== '') return;
  if (content == null) {
    document.head.querySelector(`meta[property="${property}"]`)?.remove();
    return;
  }
  let el = document.head.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(hrefOrNull) {
  const existing = document.head.querySelector('link[rel="canonical"]');
  if (!hrefOrNull) {
    existing?.remove();
    return;
  }
  if (existing) existing.setAttribute('href', hrefOrNull);
  else {
    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', hrefOrNull);
    document.head.appendChild(link);
  }
}

function upsertRobots(contentOrNull) {
  const existing = document.head.querySelector('meta[name="robots"]');
  if (!contentOrNull) {
    // Indexable pages: no robots tag needed (default index,follow).
    existing?.remove();
    return;
  }
  if (existing) existing.setAttribute('content', contentOrNull);
  else {
    const el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    el.setAttribute('content', contentOrNull);
    document.head.appendChild(el);
  }
}

/**
 * Core applier — the ONLY function that writes title/description/
 * canonical/robots/OG/Twitter. All controllers use this.
 */
export function applySEO({
  title,
  description,
  canonicalPath = null,
  indexable = true,
  ogType = 'website',
  ogImage = SITE.defaultImage,
  twitterCard = SITE.twitterCard,
} = {}) {
  const finalTitle = title || SITE.defaultTitle;
  const finalDesc = description || SITE.defaultDescription;

  document.title = finalTitle;
  upsertMetaByName('description', finalDesc);

  if (!indexable) {
    upsertRobots('noindex, nofollow');
    upsertCanonical(null);
    // Strip social index signals on non-public pages (keep tags absent, not misleading).
    ['og:site_name', 'og:title', 'og:description', 'og:type', 'og:url', 'og:image'].forEach((p) =>
      upsertMetaProperty(p, null)
    );
    ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].forEach((n) =>
      document.head.querySelector(`meta[name="${n}"]`)?.remove()
    );
    return { title: finalTitle, description: finalDesc, canonical: null, indexable: false };
  }

  upsertRobots(null);
  const canonical = canonicalUrlForPath(canonicalPath || cleanPathFromLocation());
  upsertCanonical(canonical);

  upsertMetaProperty('og:site_name', SITE.name);
  upsertMetaProperty('og:title', finalTitle);
  upsertMetaProperty('og:description', finalDesc);
  upsertMetaProperty('og:type', ogType || 'website');
  upsertMetaProperty('og:url', canonical);
  upsertMetaProperty('og:image', ogImage || SITE.defaultImage);

  upsertMetaByName('twitter:card', twitterCard);
  upsertMetaByName('twitter:title', finalTitle);
  upsertMetaByName('twitter:description', finalDesc);
  upsertMetaByName('twitter:image', ogImage || SITE.defaultImage);

  return { title: finalTitle, description: finalDesc, canonical, indexable: true };
}

/** Apply a static route entry by clean path. Falls back to non-public noindex for unknown account/admin/etc. */
export function applyRouteSEO(cleanPath) {
  const entry = ROUTES[cleanPath];
  if (entry) return applySEO(entry);
  if (isNonPublicPath(cleanPath)) {
    return applySEO({ title: `${SITE.name} | Account`, description: SITE.defaultDescription, canonicalPath: null, indexable: false });
  }
  // Unknown public path (e.g. invalid product/category slug shell): canonicalize to self path, indexable.
  return applySEO({ title: SITE.defaultTitle, description: SITE.defaultDescription, canonicalPath: cleanPath, indexable: true });
}

/** Product PDP: `[Product Name] | Slimky Hair`, descriptor-based description, per-product canonical + OG. */
export function applyProductSEO(product) {
  if (!product) {
    return applySEO({ title: 'Page Not Found | Slimky Hair', description: 'The product may have been removed or the link may be incorrect.', canonicalPath: null, indexable: false });
  }
  const title = `${product.name} | Slimky Hair`;
  // Concise (114–136 chars), mobile-friendly, generated strictly from catalog data.
  const description = `${product.descriptor} Shop now at Slimky Hair.`;
  const image = product.images?.packaging
    ? `${SITE.baseUrl}/${product.images.packaging.replace(/^\//, '')}`
    : SITE.defaultImage;
  return applySEO({
    title,
    description,
    canonicalPath: `/product/${product.slug}/`,
    indexable: true,
    ogType: 'product',
    ogImage: image,
  });
}

/** Category page: uses catalog-data metaTitle/metaDescription, per-category canonical + OG. */
export function applyCategorySEO(category) {
  if (!category) {
    return applySEO({ title: 'Category Not Found | Slimky Hair', description: "Let's help you find something else. Explore our complete hair-care catalogue.", canonicalPath: null, indexable: false });
  }
  return applySEO({
    title: category.metaTitle,
    description: category.metaDescription,
    canonicalPath: `/category/${category.slug}/`,
    indexable: true,
    ogType: 'website',
  });
}

/**
 * Search: base `/search/` is indexable with canonical to `/search/`.
 * Query variants (`?q=`) canonicalize to the base (query stripped) so
 * filters/pagination/query params never create duplicate canonicals.
 */
export function applySearchSEO(query = '') {
  const q = (query || '').trim();
  if (!q) return applySEO({ ...ROUTES['/search/'] });
  return applySEO({
    title: `Search results for "${q}" | Slimky Hair`,
    description: ROUTES['/search/'].description,
    canonicalPath: '/search/',
    indexable: true,
    ogType: 'website',
  });
}
