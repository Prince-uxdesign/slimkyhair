/**
 * Sitemap generator — Slimky Hair (static site, no build step).
 *
 * Generates /sitemap.xml from the ACTUAL site data — never hard-coded:
 *  - Production domain: read from SITE.baseUrl in js/seo.js (single source
 *    of truth, currently https://slimkyhair.com). The script FAILS instead of
 *    inventing a domain if none is configured.
 *  - Categories/products: read from js/catalog-data.js (the live catalog).
 *    A slug is only included when its pre-rendered directory
 *    (/category/[slug]/index.html, /product/[slug]/index.html) exists, so
 *    the sitemap can never contain broken or placeholder URLs.
 *  - No Supabase products table exists in this project (see database/
 *    schema.sql + supabase/migrations/) — js/catalog-data.js IS the actual
 *    product data source. If a products table is introduced later, extend
 *    fetchPublishedProducts() below to query it and union the results.
 *
 * Excluded by design (never indexable — see js/seo.js ROUTES):
 *  /cart/, /checkout/, /order-confirmation/, /account/*, /admin/*,
 *  /search/ + any ?q= search-result variant, /wishlist/ (personalized
 *  utility), /404/ and every other non-public / internal route.
 *
 * Usage:  node scripts/generate-sitemap.mjs
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// 1. Production domain — from js/seo.js ONLY. Never invented here.
// ---------------------------------------------------------------------------
const seoSource = readFileSync(join(ROOT, 'js', 'seo.js'), 'utf8');
const baseUrlMatch = seoSource.match(/baseUrl:\s*['"](https?:\/\/[^'"]+)['"]/);
if (!baseUrlMatch) {
  console.error(
    'FATAL: no production domain configured (SITE.baseUrl missing in js/seo.js). ' +
      'Set it there first — refusing to generate a sitemap with an invented domain.'
  );
  process.exit(1);
}
const BASE_URL = baseUrlMatch[1].replace(/\/+$/, '');
if (/example\.(com|org|net)/i.test(BASE_URL) || /YOUR_/i.test(BASE_URL)) {
  console.error(`FATAL: SITE.baseUrl is still a placeholder ("${BASE_URL}"). Configure the real production domain first.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Actual catalog data — parsed from js/catalog-data.js (live source).
// ---------------------------------------------------------------------------
const catalogSource = readFileSync(join(ROOT, 'js', 'catalog-data.js'), 'utf8');

function extractBlock(exportName) {
  const m = catalogSource.match(new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\n\\];`));
  if (!m) throw new Error(`Could not locate "export const ${exportName}" in js/catalog-data.js`);
  return m[1];
}

const categorySlugs = [...extractBlock('CATEGORIES').matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);

const productEntries = [...extractBlock('PRODUCTS').matchAll(
  /id:\s*"prod-\d+"[\s\S]*?slug:\s*"([a-z0-9-]+)"[\s\S]*?createdAt:\s*"(\d{4}-\d{2}-\d{2})"/g
)].map((m) => ({ slug: m[1], createdAt: m[2] }));

if (categorySlugs.length === 0 || productEntries.length === 0) {
  console.error('FATAL: no categories/products parsed from js/catalog-data.js — refusing to write an empty sitemap.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Static indexable pages (must each have a real directory + index.html).
// ---------------------------------------------------------------------------
const STATIC_PAGES = [
  { path: '/', file: 'index.html', changefreq: 'weekly', priority: '1.0' },
  { path: '/shop/', changefreq: 'daily', priority: '0.9' },
  { path: '/about/', changefreq: 'monthly', priority: '0.7' },
  { path: '/faq/', changefreq: 'monthly', priority: '0.7' },
  { path: '/contact/', changefreq: 'monthly', priority: '0.7' },
  { path: '/shipping/', changefreq: 'monthly', priority: '0.6' },
  { path: '/returns/', changefreq: 'monthly', priority: '0.6' },
  { path: '/product-safety/', changefreq: 'monthly', priority: '0.6' },
  { path: '/hair-care/', changefreq: 'monthly', priority: '0.7' },
  { path: '/privacy/', changefreq: 'yearly', priority: '0.4' },
  { path: '/terms/', changefreq: 'yearly', priority: '0.4' },
  { path: '/cookies/', changefreq: 'yearly', priority: '0.3' },
];

// Routes that must NEVER appear in the sitemap (private / utility / internal).
const BLOCKLIST = [
  '/cart/', '/checkout/', '/order-confirmation/', '/account/', '/admin/',
  '/search/', '/wishlist/', '/404/',
  '/login', '/register', '/registration', '/password', '/reset',
  '/payment', '/order-confirmation', '/orders',
];

// ---------------------------------------------------------------------------
// 4. Helpers.
// ---------------------------------------------------------------------------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lastmodForFile(relPath) {
  const t = statSync(join(ROOT, relPath)).mtime;
  return t.toISOString().slice(0, 10); // YYYY-MM-DD
}

function assertPublic(cleanPath) {
  const lower = cleanPath.toLowerCase();
  if (BLOCKLIST.some((b) => lower === b || lower.startsWith(b))) {
    throw new Error(`Blocked non-public URL would be included: ${cleanPath}`);
  }
  if (lower.includes('?') || lower.includes('#')) throw new Error(`Query/hash URL would be included: ${cleanPath}`);
}

// ---------------------------------------------------------------------------
// 5. Build URL set (dedupe + verify backing files exist).
// ---------------------------------------------------------------------------
const urls = new Map(); // loc -> { lastmod, changefreq, priority }
const warnings = [];

function addUrl(cleanPath, entry) {
  assertPublic(cleanPath);
  if (urls.has(BASE_URL + cleanPath)) {
    warnings.push(`duplicate skipped: ${cleanPath}`);
    return;
  }
  urls.set(BASE_URL + cleanPath, entry);
}

for (const page of STATIC_PAGES) {
  const rel = page.path === '/' ? 'index.html' : `${page.path.replace(/^\//, '')}index.html`;
  if (!existsSync(join(ROOT, rel))) throw new Error(`Missing backing file for ${page.path} (expected ${rel})`);
  addUrl(page.path, { lastmod: lastmodForFile(rel), changefreq: page.changefreq, priority: page.priority });
}

for (const slug of categorySlugs) {
  const rel = `category/${slug}/index.html`;
  if (!existsSync(join(ROOT, rel))) {
    warnings.push(`category slug without pre-rendered page, excluded: ${slug}`);
    continue;
  }
  addUrl(`/category/${slug}/`, { lastmod: lastmodForFile(rel), changefreq: 'weekly', priority: '0.8' });
}

for (const { slug, createdAt } of productEntries) {
  const rel = `product/${slug}/index.html`;
  if (!existsSync(join(ROOT, rel))) {
    warnings.push(`product slug without pre-rendered page, excluded: ${slug}`);
    continue;
  }
  addUrl(`/product/${slug}/`, { lastmod: createdAt, changefreq: 'monthly', priority: '0.8' });
}

// ---------------------------------------------------------------------------
// 6. Write sitemap.xml.
// ---------------------------------------------------------------------------
const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [...urls.entries()]
    .map(
      ([loc, e]) =>
        `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
    )
    .join('\n') +
  `\n</urlset>\n`;

writeFileSync(join(ROOT, 'sitemap.xml'), xml);

for (const w of warnings) console.warn(`WARN: ${w}`);
console.log(`OK: sitemap.xml written — ${urls.size} URLs under ${BASE_URL}`);
console.log(`    static=${STATIC_PAGES.length} categories=${categorySlugs.length} products=${productEntries.length}`);
