/**
 * DEMO CONTENT — NOT FOR PRODUCTION — REPLACE WITH CLIENT/LEGAL-APPROVED POLICY BEFORE LAUNCH
 * 
 * Reusable Legal Page Renderer & Interactions
 * Slimky Hair
 * 
 * Drives the shared LegalPageLayout across:
 * - Privacy Policy (/privacy)
 * - Terms & Conditions (/terms)
 * - Cookie Policy (/cookies)
 */

import { LEGAL_PAGES } from './legal-data.js';

/**
 * Generate complete shared legal page markup
 * @param {string} pageKey - 'privacy', 'terms', or 'cookies'
 * @param {Object} options - { rootPrefix: '../' | '' }
 * @returns {string} HTML markup string
 */
export function generateLegalPageHTML(pageKey, options = {}) {
  const page = LEGAL_PAGES[pageKey];
  if (!page) return '';

  const root = options.rootPrefix !== undefined ? options.rootPrefix : '';

  // Breadcrumbs
  const breadcrumbsHTML = `
    <nav class="legal-breadcrumbs" aria-label="Breadcrumb">
      <div class="container legal-breadcrumbs-inner">
        <a href="${root || './'}">Home</a>
        <span class="legal-breadcrumbs-sep">/</span>
        <span class="legal-breadcrumbs-sep">Legal</span>
        <span class="legal-breadcrumbs-sep">/</span>
        <span class="legal-breadcrumbs-current" aria-current="page">${page.title}</span>
      </div>
    </nav>
  `;

  // Refined Editorial Hero Section (No placeholder banners)
  const heroHTML = `
    <section class="legal-hero" aria-labelledby="legal-page-title">
      <div class="container legal-hero-inner">
        <span class="legal-hero-eyebrow">Slimky Hair Legal &amp; Governance</span>
        <h1 id="legal-page-title" class="legal-hero-title">${page.title}</h1>
        <p class="legal-hero-intro">${page.intro}</p>
        <div class="legal-hero-meta">
          <span class="legal-date-pill">Effective: ${page.effectiveDate}</span>
          <span class="legal-date-pill">Last Updated: ${page.lastUpdated}</span>
        </div>
      </div>
    </section>
  `;

  // Table of Contents List ("On this page")
  const tocItemsHTML = page.sections.map((sec, idx) => `
    <li>
      <a href="#${sec.id}" class="legal-toc-link ${idx === 0 ? 'is-active' : ''}" data-target="${sec.id}">
        <span class="legal-toc-num">${sec.number}</span>
        <span>${sec.title}</span>
      </a>
    </li>
  `).join('');

  // Mobile Select Options
  const mobileOptionsHTML = page.sections.map(sec => `
    <option value="${sec.id}">${sec.number}. ${sec.title}</option>
  `).join('');

  // Cookie Categories Table/Cards (if present on cookies page)
  let cookieCardsHTML = '';
  if (page.cookieCategories && page.cookieCategories.length > 0) {
    cookieCardsHTML = `
      <div class="legal-cookie-grid">
        ${page.cookieCategories.map(cat => `
          <div class="legal-cookie-card">
            <div class="legal-cookie-card-header">
              <h4 class="legal-cookie-card-title">${cat.name}</h4>
              <span class="legal-cookie-card-lifespan">${cat.lifespan}</span>
            </div>
            <p class="legal-cookie-card-desc">${cat.purpose}</p>
            <div class="legal-cookie-card-examples">
              <span class="legal-cookie-example-label">Examples:</span>
              <code>${cat.examples}</code>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Main Sections
  const sectionsHTML = page.sections.map(sec => {
    let sectionBody = sec.content;
    if (root && root !== './') {
      sectionBody = sectionBody.replace(/href="(shipping|returns|product-safety|cookies|wishlist|hair-care)\/"/g, (match, p1) => `href="${root}${p1}/"`);
    }
    if (sec.id === 'types-of-cookies' && cookieCardsHTML) {
      sectionBody = sectionBody.replace('<!-- Structured Cookie Cards rendered via template -->', cookieCardsHTML);
    }
    return `
      <section id="${sec.id}" class="legal-section" aria-labelledby="heading-${sec.id}">
        <div class="legal-section-header">
          <span class="legal-section-number">${sec.number}</span>
          <h2 id="heading-${sec.id}" class="legal-section-title">${sec.title}</h2>
        </div>
        <div class="legal-section-body">
          ${sectionBody}
        </div>
      </section>
    `;
  }).join('');

  return `
    <!-- DEMO CONTENT — NOT FOR PRODUCTION — REPLACE WITH CLIENT/LEGAL-APPROVED POLICY BEFORE LAUNCH -->
    ${breadcrumbsHTML}
    ${heroHTML}

    <div class="container legal-main-section">
      <!-- Mobile Quick Jump -->
      <div class="legal-mobile-nav">
        <label for="legal-mobile-select" class="legal-mobile-select-label">On this page</label>
        <select id="legal-mobile-select" class="legal-mobile-select" aria-label="Select a section">
          ${mobileOptionsHTML}
        </select>
      </div>

      <div class="legal-layout">
        <!-- Desktop Sticky Table of Contents -->
        <aside class="legal-toc-wrapper" aria-label="Table of Contents">
          <div class="legal-toc-title">On this page</div>
          <ul class="legal-toc-list" id="legal-toc-list">
            ${tocItemsHTML}
          </ul>
        </aside>

        <!-- Main Body -->
        <main class="legal-content-body" id="legal-content-main">
          ${sectionsHTML}
        </main>
      </div>
    </div>
  `;
}

/**
 * Initialize scrollspy, anchor clicks, and mobile select jumps
 */
export function initLegalInteractions() {
  const tocLinks = document.querySelectorAll('.legal-toc-link');
  const sections = document.querySelectorAll('.legal-section');
  const mobileSelect = document.querySelector('#legal-mobile-select');

  // 1. Smooth scroll on desktop TOC click
  tocLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#${targetId}`);
      }
    });
  });

  // 2. Mobile Select Jump
  if (mobileSelect) {
    mobileSelect.addEventListener('change', () => {
      const targetId = mobileSelect.value;
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#${targetId}`);
      }
    });
  }

  // 3. Scrollspy active link detection
  if (sections.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          tocLinks.forEach(l => {
            if (l.getAttribute('data-target') === id) {
              l.classList.add('is-active');
            } else {
              l.classList.remove('is-active');
            }
          });
          if (mobileSelect) {
            mobileSelect.value = id;
          }
        }
      });
    }, {
      rootMargin: '-20% 0px -70% 0px'
    });

    sections.forEach(sec => observer.observe(sec));
  }
}
