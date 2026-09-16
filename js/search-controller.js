/**
 * Dedicated Search Controller - Slimky Hair
 * 
 * Handles real-time autocomplete suggestions, keyboard navigation,
 * query execution, and integration with the catalog grid and filters.
 */

import { PRODUCTS, CATEGORIES, SEARCH_SUGGESTIONS } from './catalog-data.js';
import { createCatalogCardHTML, createSkeletonCardsHTML, initCardInteractions, getRootPath } from './catalog-renderer.js';
import { applySearchSEO } from './seo.js';

export class SearchController {
  constructor() {
    this.rootPrefix = getRootPath();
    this.currentQuery = '';
    this.selectedIndex = -1;

    // DOM Elements
    this.formEl = document.querySelector('#search-form-hero');
    this.inputEl = document.querySelector('#search-input-hero');
    this.clearBtnEl = document.querySelector('#search-hero-clear');
    this.popoverEl = document.querySelector('#search-suggestions-popover');
    this.initialStateEl = document.querySelector('#search-initial-state');
    this.resultsWrapEl = document.querySelector('#search-results-wrap');
    this.bannerEl = document.querySelector('#search-results-banner');
    this.queryHeadingEl = document.querySelector('#search-query-heading');
    this.countEl = document.querySelector('#search-results-count');
    this.gridEl = document.querySelector('#search-grid');
    this.noResultsEl = document.querySelector('#search-no-results-box');
    this.noResultsQueryEl = document.querySelector('#search-no-results-query');

    this.init();
  }

  init() {
    this.bindEvents();

    // Check for existing query in URL parameter.
    // Canonical always stays /search/ (query stripped) via js/seo.js.
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('q') || '';
    if (initialQuery) {
      if (this.inputEl) this.inputEl.value = initialQuery;
      this.executeSearch(initialQuery, true);
    } else {
      applySearchSEO('');
      this.showInitialState();
    }
  }

  bindEvents() {
    // Input typing with debounce for autocomplete
    let debounceTimer;
    this.inputEl?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (q) {
        this.clearBtnEl?.classList.add('is-visible');
      } else {
        this.clearBtnEl?.classList.remove('is-visible');
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (q.length >= 2) {
          this.generateSuggestions(q);
        } else {
          this.closePopover();
        }
      }, 150);
    });

    // Clear Button
    this.clearBtnEl?.addEventListener('click', () => {
      if (this.inputEl) this.inputEl.value = '';
      this.clearBtnEl?.classList.remove('is-visible');
      this.closePopover();
      this.showInitialState();
      applySearchSEO('');
      window.history.replaceState({}, '', window.location.pathname);
    });

    // Form Submission
    this.formEl?.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = this.inputEl?.value.trim() || '';
      if (q) {
        this.closePopover();
        this.executeSearch(q);
      }
    });

    // Keyboard navigation in suggestions list
    this.inputEl?.addEventListener('keydown', (e) => {
      const items = this.popoverEl?.querySelectorAll('.suggestion-item') || [];
      if (!this.popoverEl?.classList.contains('is-open') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % items.length;
        this.highlightSuggestion(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
        this.highlightSuggestion(items);
      } else if (e.key === 'Enter') {
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
          e.preventDefault();
          items[this.selectedIndex].click();
        }
      } else if (e.key === 'Escape') {
        this.closePopover();
      }
    });

    // Dismiss popover on outside click
    document.addEventListener('click', (e) => {
      if (!this.formEl?.contains(e.target)) {
        this.closePopover();
      }
    });
  }

  highlightSuggestion(items) {
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add('is-selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('is-selected');
      }
    });
  }

  generateSuggestions(q) {
    if (!this.popoverEl) return;
    const qLower = q.toLowerCase();

    // 1. Matching Products
    const matchedProducts = PRODUCTS.filter(p => 
      p.name.toLowerCase().includes(qLower) || 
      p.category.toLowerCase().includes(qLower)
    ).slice(0, 4);

    // 2. Matching Categories
    const matchedCategories = CATEGORIES.filter(c => 
      c.name.toLowerCase().includes(qLower) ||
      c.headline.toLowerCase().includes(qLower)
    ).slice(0, 3);

    // 3. Matching Concerns & Ingredients
    const matchedConcerns = SEARCH_SUGGESTIONS.hairConcerns.filter(hc =>
      hc.label.toLowerCase().includes(qLower) || hc.filter.toLowerCase().includes(qLower)
    ).slice(0, 3);

    const matchedIngredients = SEARCH_SUGGESTIONS.popularIngredients.filter(ing =>
      ing.toLowerCase().includes(qLower)
    ).slice(0, 3);

    const hasAny = matchedProducts.length > 0 || matchedCategories.length > 0 || matchedConcerns.length > 0 || matchedIngredients.length > 0;

    if (!hasAny) {
      this.closePopover();
      return;
    }

    let html = '';

    // Products Group
    if (matchedProducts.length > 0) {
      html += `
        <div class="suggestion-group">
          <div class="suggestion-group-title">Products</div>
          ${matchedProducts.map(p => `
            <a href="${this.rootPrefix}product/?slug=${encodeURIComponent(p.slug)}" class="suggestion-item">
              <span>${this.highlightMatch(p.name, q)}</span>
              <span class="suggestion-tag">${p.category}</span>
            </a>
          `).join('')}
        </div>
      `;
    }

    // Categories Group
    if (matchedCategories.length > 0) {
      html += `
        <div class="suggestion-group">
          <div class="suggestion-group-title">Categories</div>
          ${matchedCategories.map(c => `
            <a href="${this.rootPrefix}category/?c=${encodeURIComponent(c.slug)}" class="suggestion-item">
              <span>${this.highlightMatch(c.name, q)}</span>
              <span class="suggestion-tag">Category</span>
            </a>
          `).join('')}
        </div>
      `;
    }

    // Hair Concerns & Ingredients Group
    if (matchedConcerns.length > 0 || matchedIngredients.length > 0) {
      html += `<div class="suggestion-group"><div class="suggestion-group-title">Hair Care & Ingredients</div>`;
      matchedConcerns.forEach(mc => {
        html += `
          <a href="#" class="suggestion-item suggestion-query-click" data-query="${mc.filter}">
            <span>${this.highlightMatch(mc.label, q)}</span>
            <span class="suggestion-tag">Hair Concern</span>
          </a>
        `;
      });
      matchedIngredients.forEach(ing => {
        html += `
          <a href="#" class="suggestion-item suggestion-query-click" data-query="${ing}">
            <span>${this.highlightMatch(ing, q)}</span>
            <span class="suggestion-tag">Ingredient</span>
          </a>
        `;
      });
      html += `</div>`;
    }

    this.popoverEl.innerHTML = html;
    this.popoverEl.classList.add('is-open');
    this.selectedIndex = -1;

    // Attach click triggers on concern/ingredient suggestions
    const queryLinks = this.popoverEl.querySelectorAll('.suggestion-query-click');
    queryLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const query = link.getAttribute('data-query');
        if (this.inputEl) this.inputEl.value = query;
        this.closePopover();
        this.executeSearch(query);
      });
    });
  }

  highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  closePopover() {
    this.popoverEl?.classList.remove('is-open');
    if (this.popoverEl) this.popoverEl.innerHTML = '';
    this.selectedIndex = -1;
  }

  showInitialState() {
    if (this.initialStateEl) this.initialStateEl.style.display = 'block';
    if (this.resultsWrapEl) this.resultsWrapEl.style.display = 'none';
  }

  executeSearch(query, skipHistory = false) {
    this.currentQuery = query.trim();
    if (!this.currentQuery) {
      applySearchSEO('');
      this.showInitialState();
      return;
    }

    // Single source of truth: title updates, canonical stays /search/.
    applySearchSEO(this.currentQuery);

    // Update URL without page reload
    if (!skipHistory) {
      const newUrl = `${window.location.pathname}?q=${encodeURIComponent(this.currentQuery)}`;
      window.history.replaceState({}, '', newUrl);
    }

    if (this.clearBtnEl) this.clearBtnEl.classList.add('is-visible');
    if (this.initialStateEl) this.initialStateEl.style.display = 'none';
    if (this.resultsWrapEl) this.resultsWrapEl.style.display = 'block';

    if (this.queryHeadingEl) {
      this.queryHeadingEl.innerHTML = `Search results for: <em>"${this.escapeHTML(this.currentQuery)}"</em>`;
    }

    // Show skeletons first
    if (this.gridEl) {
      this.gridEl.innerHTML = createSkeletonCardsHTML(4);
    }

    setTimeout(() => {
      this.renderResults();
    }, 150);
  }

  renderResults() {
    const qLower = this.currentQuery.toLowerCase();

    // Query matching
    const matches = PRODUCTS.filter(p => 
      p.name.toLowerCase().includes(qLower) ||
      p.category.toLowerCase().includes(qLower) ||
      p.productType.toLowerCase().includes(qLower) ||
      p.descriptor.toLowerCase().includes(qLower) ||
      (p.ingredientsShort && p.ingredientsShort.toLowerCase().includes(qLower)) ||
      (p.ingredientsINCI && p.ingredientsINCI.toLowerCase().includes(qLower)) ||
      (p.concerns && p.concerns.some(c => c.toLowerCase().includes(qLower))) ||
      (p.hairTypes && p.hairTypes.some(h => h.toLowerCase().includes(qLower)))
    );

    const totalCount = matches.length;

    if (this.countEl) {
      this.countEl.textContent = `${totalCount} Product${totalCount === 1 ? '' : 's'} Found`;
    }

    if (totalCount === 0) {
      if (this.gridEl) this.gridEl.style.display = 'none';
      if (this.bannerEl) this.bannerEl.style.display = 'none';
      if (this.noResultsEl) {
        this.noResultsEl.style.display = 'block';
        if (this.noResultsQueryEl) {
          this.noResultsQueryEl.textContent = `"${this.currentQuery}"`;
        }
      }
    } else {
      if (this.noResultsEl) this.noResultsEl.style.display = 'none';
      if (this.bannerEl) this.bannerEl.style.display = 'flex';
      if (this.gridEl) {
        this.gridEl.style.display = 'grid';
        this.gridEl.innerHTML = matches.map(p => createCatalogCardHTML(p, { rootPrefix: this.rootPrefix })).join('');
        initCardInteractions(this.gridEl);
      }
    }
  }

  escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
  }
}
