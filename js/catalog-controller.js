/**
 * Catalog Controller - Slimky Hair
 * 
 * Manages catalogue filtering, sorting, pagination, and mobile filter modal
 * across both the Shop page and Dynamic Category pages.
 */

import { PRODUCTS, CATEGORIES, getCategoryBySlug } from './catalog-data.js';
import { createCatalogCardHTML, createSkeletonCardsHTML, initCardInteractions, getRootPath } from './catalog-renderer.js';
import { inventoryService } from './inventory/inventory-service.js';

export class CatalogController {
  constructor(options = {}) {
    this.categorySlug = options.categorySlug || null; // null for Shop All
    this.pageSize = options.pageSize || 8;
    this.currentPage = 1;
    this.rootPrefix = options.rootPrefix !== undefined ? options.rootPrefix : getRootPath();

    // Active Filter State
    this.filters = {
      search: '',
      category: this.categorySlug ? [this.categorySlug] : [],
      hairTypes: [],
      scalpTypes: [],
      productTypes: [],
      availability: [],
      minPrice: null,
      maxPrice: null
    };

    this.sortBy = 'featured';

    // DOM Elements
    this.gridEl = document.querySelector('#catalogue-grid');
    this.countEl = document.querySelector('#catalogue-count');
    this.activeChipsBarEl = document.querySelector('#active-filters-bar');
    this.chipsContainerEl = document.querySelector('#active-chips-container');
    this.clearAllBtnEl = document.querySelector('#filter-clear-all');
    this.sortSelectEl = document.querySelector('#catalogue-sort');
    this.searchInputEl = document.querySelector('#catalogue-search');
    this.searchClearEl = document.querySelector('#catalogue-search-clear');
    this.loadMoreWrapEl = document.querySelector('#catalogue-load-more-wrap');
    this.loadMoreBtnEl = document.querySelector('#catalogue-load-more-btn');
    this.progressFillEl = document.querySelector('#catalogue-progress-fill');
    this.progressTextEl = document.querySelector('#catalogue-progress-text');
    this.mobileFilterBtnEl = document.querySelector('#btn-mobile-filter');
    this.mobileFilterBadgeEl = document.querySelector('#filter-badge-count');
    this.filterDrawerEl = document.querySelector('#filter-drawer');
    this.filterBackdropEl = document.querySelector('#filter-drawer-backdrop');
    this.filterCloseBtnEl = document.querySelector('#filter-drawer-close');
    this.filterApplyBtnEl = document.querySelector('#filter-drawer-apply');
    this.filterResetBtnEl = document.querySelector('#filter-drawer-reset');

    this.init();
  }

  init() {
    this.bindEvents();
    this.renderInitial();
  }

  bindEvents() {
    // Sort Select
    this.sortSelectEl?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.currentPage = 1;
      this.render();
    });

    // Inline Search Input (Debounced)
    let searchDebounce;
    this.searchInputEl?.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const val = e.target.value.trim();
      if (this.searchClearEl) {
        if (val) this.searchClearEl.classList.add('is-visible');
        else this.searchClearEl.classList.remove('is-visible');
      }
      searchDebounce = setTimeout(() => {
        this.filters.search = val.toLowerCase();
        this.currentPage = 1;
        this.render();
      }, 250);
    });

    this.searchClearEl?.addEventListener('click', () => {
      if (this.searchInputEl) this.searchInputEl.value = '';
      this.searchClearEl?.classList.remove('is-visible');
      this.filters.search = '';
      this.currentPage = 1;
      this.render();
    });

    // Checkbox Filters (Desktop & Mobile drawer synchronized)
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        this.handleCheckboxChange(cb);
      });
    });

    // Price Range inputs
    const minInput = document.querySelector('#price-min');
    const maxInput = document.querySelector('#price-max');
    const applyPriceBtn = document.querySelector('#apply-price');
    applyPriceBtn?.addEventListener('click', () => {
      const min = minInput?.value ? parseInt(minInput.value, 10) : null;
      const max = maxInput?.value ? parseInt(maxInput.value, 10) : null;
      this.filters.minPrice = min;
      this.filters.maxPrice = max;
      this.currentPage = 1;
      this.render();
    });

    // Clear All Filters
    this.clearAllBtnEl?.addEventListener('click', () => {
      this.clearAllFilters();
    });

    // Filter Accordion Toggles
    const accordionHeaders = document.querySelectorAll('.filter-group-header');
    accordionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const group = header.closest('.filter-group');
        group?.classList.toggle('is-collapsed');
        const isCollapsed = group?.classList.contains('is-collapsed');
        header.setAttribute('aria-expanded', !isCollapsed);
      });
    });

    // Mobile Filter Drawer
    this.mobileFilterBtnEl?.addEventListener('click', () => this.openMobileFilter());
    this.filterCloseBtnEl?.addEventListener('click', () => this.closeMobileFilter());
    this.filterBackdropEl?.addEventListener('click', () => this.closeMobileFilter());
    this.filterApplyBtnEl?.addEventListener('click', () => {
      this.closeMobileFilter();
      this.render();
    });
    this.filterResetBtnEl?.addEventListener('click', () => {
      this.clearAllFilters();
    });

    // Load More Button
    this.loadMoreBtnEl?.addEventListener('click', () => {
      this.currentPage++;
      this.render(true);
    });

    // Global Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeMobileFilter();
      }
    });
  }

  handleCheckboxChange(cb) {
    const filterType = cb.getAttribute('data-filter-type');
    const value = cb.value;

    if (!filterType) return;

    if (cb.checked) {
      if (!this.filters[filterType].includes(value)) {
        this.filters[filterType].push(value);
      }
    } else {
      this.filters[filterType] = this.filters[filterType].filter(v => v !== value);
    }

    // Synchronize matching checkboxes between desktop sidebar and mobile drawer
    const counterparts = document.querySelectorAll(`.filter-checkbox[data-filter-type="${filterType}"][value="${value}"]`);
    counterparts.forEach(c => {
      c.checked = cb.checked;
    });

    this.currentPage = 1;
    this.render();
  }

  clearAllFilters() {
    this.filters.search = '';
    if (!this.categorySlug) {
      this.filters.category = [];
    }
    this.filters.hairTypes = [];
    this.filters.scalpTypes = [];
    this.filters.productTypes = [];
    this.filters.availability = [];
    this.filters.minPrice = null;
    this.filters.maxPrice = null;

    if (this.searchInputEl) this.searchInputEl.value = '';
    this.searchClearEl?.classList.remove('is-visible');

    const minInput = document.querySelector('#price-min');
    const maxInput = document.querySelector('#price-max');
    if (minInput) minInput.value = '';
    if (maxInput) maxInput.value = '';

    const checkboxes = document.querySelectorAll('.filter-checkbox');
    checkboxes.forEach(cb => {
      if (this.categorySlug && cb.getAttribute('data-filter-type') === 'category') return;
      cb.checked = false;
    });

    this.currentPage = 1;
    this.render();
  }

  openMobileFilter() {
    this.filterDrawerEl?.classList.add('is-open');
    this.filterBackdropEl?.classList.add('is-active');
    document.body.classList.add('drawer-open');
    this.filterCloseBtnEl?.focus();
  }

  closeMobileFilter() {
    this.filterDrawerEl?.classList.remove('is-open');
    this.filterBackdropEl?.classList.remove('is-active');
    document.body.classList.remove('drawer-open');
  }

  filterAndSortProducts() {
    let result = [...PRODUCTS];

    // 1. Scoped Category
    if (this.categorySlug) {
      result = result.filter(p => p.categorySlug === this.categorySlug);
    } else if (this.filters.category.length > 0) {
      result = result.filter(p => this.filters.category.includes(p.categorySlug));
    }

    // 2. Inline Search Query
    if (this.filters.search) {
      const q = this.filters.search;
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.productType.toLowerCase().includes(q) ||
        p.descriptor.toLowerCase().includes(q) ||
        (p.ingredientsShort && p.ingredientsShort.toLowerCase().includes(q)) ||
        (p.concerns && p.concerns.some(c => c.toLowerCase().includes(q)))
      );
    }

    // 3. Hair Types
    if (this.filters.hairTypes.length > 0) {
      result = result.filter(p => 
        p.hairTypes && this.filters.hairTypes.some(ht => p.hairTypes.includes(ht) || p.hairTypes.includes('All Hair Types'))
      );
    }

    // 4. Scalp Types
    if (this.filters.scalpTypes.length > 0) {
      result = result.filter(p => 
        p.scalpTypes && this.filters.scalpTypes.some(st => p.scalpTypes.includes(st) || p.scalpTypes.includes('Normal'))
      );
    }

    // 5. Product Types
    if (this.filters.productTypes.length > 0) {
      result = result.filter(p => this.filters.productTypes.includes(p.productType));
    }

    // 6. Availability — Milestone C20.12: check live inventory, not the static catalog literal.
    if (this.filters.availability.length > 0) {
      result = result.filter(p => {
        const inStock = p.variants && p.variants.some(v => inventoryService.getEffectiveStock(v.sku, v.stock) > 0);
        if (this.filters.availability.includes('In Stock') && inStock) return true;
        if (this.filters.availability.includes('Out of Stock') && !inStock) return true;
        return false;
      });
    }

    // 7. Price Range
    if (this.filters.minPrice !== null && !isNaN(this.filters.minPrice)) {
      result = result.filter(p => p.variants && p.variants.some(v => v.priceValue >= this.filters.minPrice));
    }
    if (this.filters.maxPrice !== null && !isNaN(this.filters.maxPrice)) {
      result = result.filter(p => p.variants && p.variants.some(v => v.priceValue <= this.filters.maxPrice));
    }

    // 8. Sorting
    switch (this.sortBy) {
      case 'price_asc':
        result.sort((a, b) => (a.variants[0]?.priceValue || 0) - (b.variants[0]?.priceValue || 0));
        break;
      case 'price_desc':
        result.sort((a, b) => (b.variants[0]?.priceValue || 0) - (a.variants[0]?.priceValue || 0));
        break;
      case 'newest':
        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case 'bestselling':
        result.sort((a, b) => (b.bestseller ? 1 : 0) - (a.bestseller ? 1 : 0));
        break;
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'featured':
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        break;
    }

    return result;
  }

  renderInitial() {
    if (this.gridEl) {
      this.gridEl.innerHTML = createSkeletonCardsHTML(6);
    }
    setTimeout(() => {
      this.render();
    }, 150);
  }

  render(isAppend = false) {
    const allFiltered = this.filterAndSortProducts();
    const totalCount = allFiltered.length;
    const itemsToShow = this.currentPage * this.pageSize;
    const paginatedProducts = allFiltered.slice(0, itemsToShow);

    // Update Counts & Badges
    if (this.countEl) {
      if (this.categorySlug) {
        const cat = getCategoryBySlug(this.categorySlug);
        this.countEl.textContent = `${totalCount} Product${totalCount === 1 ? '' : 's'} in ${cat ? cat.name : 'Category'}`;
      } else {
        this.countEl.textContent = `${totalCount} Product${totalCount === 1 ? '' : 's'}`;
      }
    }

    this.updateActiveChips();
    this.updateMobileBadge();

    // Render Product Grid or Empty State
    if (!this.gridEl) return;

    if (totalCount === 0) {
      this.gridEl.innerHTML = `
        <div class="catalogue-empty-state">
          <svg class="catalogue-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
          <h3 class="catalogue-empty-title">No products found</h3>
          <p class="catalogue-empty-text">Try adjusting your active filters or clear search query to view our complete hair care range.</p>
          <div class="catalogue-empty-actions">
            <button type="button" class="btn btn-primary" id="btn-empty-clear">Clear Filters</button>
            <a href="${this.rootPrefix}shop/" class="btn btn-outline">Explore All Products</a>
          </div>
        </div>
      `;
      document.querySelector('#btn-empty-clear')?.addEventListener('click', () => this.clearAllFilters());
      if (this.loadMoreWrapEl) this.loadMoreWrapEl.style.display = 'none';
      return;
    }

    // Generate Cards
    const cardsHTML = paginatedProducts.map(p => createCatalogCardHTML(p, { rootPrefix: this.rootPrefix })).join('');
    this.gridEl.innerHTML = cardsHTML;
    initCardInteractions(this.gridEl);

    // Update Load More
    if (this.loadMoreWrapEl) {
      if (itemsToShow >= totalCount) {
        this.loadMoreWrapEl.style.display = 'none';
      } else {
        this.loadMoreWrapEl.style.display = 'flex';
        if (this.progressTextEl) {
          this.progressTextEl.textContent = `Showing ${paginatedProducts.length} of ${totalCount} products`;
        }
        if (this.progressFillEl) {
          const pct = Math.min(100, Math.round((paginatedProducts.length / totalCount) * 100));
          this.progressFillEl.style.width = `${pct}%`;
        }
      }
    }
  }

  updateActiveChips() {
    if (!this.activeChipsBarEl || !this.chipsContainerEl) return;

    const chips = [];

    if (this.filters.search) {
      chips.push({ label: `Search: "${this.filters.search}"`, type: 'search', value: '' });
    }

    if (!this.categorySlug && this.filters.category.length > 0) {
      this.filters.category.forEach(c => {
        const cat = getCategoryBySlug(c);
        chips.push({ label: cat ? cat.name : c, type: 'category', value: c });
      });
    }

    this.filters.hairTypes.forEach(h => chips.push({ label: h, type: 'hairTypes', value: h }));
    this.filters.scalpTypes.forEach(s => chips.push({ label: s, type: 'scalpTypes', value: s }));
    this.filters.productTypes.forEach(pt => chips.push({ label: pt, type: 'productTypes', value: pt }));
    this.filters.availability.forEach(a => chips.push({ label: a, type: 'availability', value: a }));

    if (this.filters.minPrice !== null || this.filters.maxPrice !== null) {
      const minStr = this.filters.minPrice !== null ? `₦${this.filters.minPrice.toLocaleString()}` : '₦0';
      const maxStr = this.filters.maxPrice !== null ? `₦${this.filters.maxPrice.toLocaleString()}` : 'Any';
      chips.push({ label: `Price: ${minStr} – ${maxStr}`, type: 'price', value: '' });
    }

    if (chips.length === 0) {
      this.activeChipsBarEl.classList.add('is-hidden');
      this.chipsContainerEl.innerHTML = '';
      return;
    }

    this.activeChipsBarEl.classList.remove('is-hidden');
    this.chipsContainerEl.innerHTML = chips.map(chip => `
      <span class="filter-chip">
        <span>${chip.label}</span>
        <button type="button" class="filter-chip-remove" data-chip-type="${chip.type}" data-chip-value="${chip.value}" aria-label="Remove filter ${chip.label}">×</button>
      </span>
    `).join('');

    // Bind remove click
    const removeBtns = this.chipsContainerEl.querySelectorAll('.filter-chip-remove');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-chip-type');
        const val = btn.getAttribute('data-chip-value');
        this.removeSingleFilter(type, val);
      });
    });
  }

  removeSingleFilter(type, value) {
    if (type === 'search') {
      this.filters.search = '';
      if (this.searchInputEl) this.searchInputEl.value = '';
      this.searchClearEl?.classList.remove('is-visible');
    } else if (type === 'price') {
      this.filters.minPrice = null;
      this.filters.maxPrice = null;
      const minInput = document.querySelector('#price-min');
      const maxInput = document.querySelector('#price-max');
      if (minInput) minInput.value = '';
      if (maxInput) maxInput.value = '';
    } else if (Array.isArray(this.filters[type])) {
      this.filters[type] = this.filters[type].filter(v => v !== value);
      const matchingCbs = document.querySelectorAll(`.filter-checkbox[data-filter-type="${type}"][value="${value}"]`);
      matchingCbs.forEach(c => { c.checked = false; });
    }
    this.currentPage = 1;
    this.render();
  }

  updateMobileBadge() {
    if (!this.mobileFilterBadgeEl) return;
    let count = 0;
    if (!this.categorySlug) count += this.filters.category.length;
    count += this.filters.hairTypes.length;
    count += this.filters.scalpTypes.length;
    count += this.filters.productTypes.length;
    count += this.filters.availability.length;
    if (this.filters.minPrice !== null || this.filters.maxPrice !== null) count += 1;

    if (count > 0) {
      this.mobileFilterBadgeEl.textContent = count;
      this.mobileFilterBadgeEl.style.display = 'inline-flex';
    } else {
      this.mobileFilterBadgeEl.style.display = 'none';
    }
  }
}
