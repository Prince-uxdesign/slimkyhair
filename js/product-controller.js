/**
 * Product Detail Page (PDP) Controller - Slimky Hair
 * 
 * Manages PDP gallery navigation, variant selection, quantity stepper,
 * cart integration, accordions, reviews, and related products.
 */

import { PRODUCTS, getProductBySlug, getCategoryBySlug, getRelatedProducts } from './catalog-data.js';
import { renderStarsHTML, createCatalogCardHTML, initCardInteractions, getRootPath } from './catalog-renderer.js';
import { isInWishlist, toggleWishlist, syncWishlistUI } from './wishlist-store.js';
import { addToCart, openCartDrawer } from './cart-store.js';
import { inventoryService } from './inventory/inventory-service.js';
import { applyProductSEO } from './seo.js';
import { getApproximateForeignCurrencies } from './utils/currency-converter.js';

export class ProductController {
  constructor(options = {}) {
    this.rootPrefix = options.rootPrefix !== undefined ? options.rootPrefix : getRootPath();
    this.productSlug = options.slug || this.detectSlugFromURL();
    this.product = getProductBySlug(this.productSlug);

    this.currentImageIndex = 0;
    this.selectedVariant = null;
    this.quantity = 1;
    this.imagesList = [];

    this.init();
  }

  detectSlugFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const slugParam = urlParams.get('slug');
    if (slugParam) return slugParam;

    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    const prodIdx = pathSegments.indexOf('product');
    if (prodIdx !== -1 && pathSegments[prodIdx + 1] && pathSegments[prodIdx + 1] !== 'index.html') {
      return pathSegments[prodIdx + 1];
    }

    // Default fallback to first product if none specified
    return 'nourishing-scalp-oil';
  }

  init() {
    if (!this.product) {
      applyProductSEO(null);
      this.renderNotFound();
      return;
    }

    this.selectedVariant = this.product.variants[0] || null;
    this.setupImagesList();
    this.updatePageMeta();
    this.renderProductDetails();
    this.bindEvents();
    this.initStickyCTA();
    this.renderRelatedProducts();
  }

  setupImagesList() {
    const p = this.product;
    this.imagesList = [
      { type: 'Packaging Packshot', src: `${this.rootPrefix}${p.images.packaging}`, alt: `${p.name} - Front View Packaging` },
      { type: 'Ingredient View', src: `${this.rootPrefix}${p.images.ingredients}`, alt: `${p.name} - Botanical Ingredient Profile` },
      { type: 'Texture & Ritual', src: `${this.rootPrefix}${p.images.texture}`, alt: `${p.name} - Texture and Application` }
    ];
  }

  updatePageMeta() {
    // Single source of truth: js/seo.js (title, description, canonical, OG, Twitter).
    // Description template lives in applyProductSEO: `{descriptor} Shop now at Slimky Hair.`
    applyProductSEO(this.product);
  }

  renderNotFound() {
    const container = document.querySelector('#pdp-main-content');
    if (container) {
      container.innerHTML = `
        <div class="pdp-not-found" role="alert" aria-live="polite">
          <svg class="pdp-not-found-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h1 class="pdp-not-found-title">We Couldn't Find That Product</h1>
          <p class="pdp-not-found-text">The product may have been removed or the link may be incorrect.</p>
          <a href="${this.rootPrefix}shop/" class="btn btn-primary btn-lg">Explore Products</a>
        </div>
      `;
    }
  }

  renderProductDetails() {
    const p = this.product;
    const cat = getCategoryBySlug(p.categorySlug);

    // 1. Breadcrumbs
    const breadcrumbsEl = document.querySelector('#pdp-breadcrumbs');
    if (breadcrumbsEl) {
      breadcrumbsEl.innerHTML = `
        <a href="${this.rootPrefix}">Home</a>
        <span class="shop-breadcrumb-sep">/</span>
        <a href="${this.rootPrefix}shop/">Shop</a>
        <span class="shop-breadcrumb-sep">/</span>
        <a href="${this.rootPrefix}category/?c=${encodeURIComponent(p.categorySlug)}">${cat ? cat.name : p.category}</a>
        <span class="shop-breadcrumb-sep">/</span>
        <span class="pdp-breadcrumb-active">${p.name}</span>
      `;
    }

    // 2. Main Gallery Image (LCP element: keep eager + fetchpriority from
    // the static shell; refresh src AND srcsets so ?slug= deep links that
    // resolve to a different product never serve mismatched candidates).
    const mainImgEl = document.querySelector('#pdp-main-image');
    if (mainImgEl && this.imagesList.length > 0) {
      const first = this.imagesList[0];
      const stem = first.src.replace(/\.(jpe?g)$/i, '');
      mainImgEl.src = first.src;
      mainImgEl.alt = first.alt;
      mainImgEl.srcset = `${stem}-480.jpg 480w, ${stem}-768.jpg 768w, ${first.src} 896w`;
      const mainSourceEl = document.querySelector('#pdp-main-source');
      if (mainSourceEl) {
        mainSourceEl.srcset = `${stem}-480.webp 480w, ${stem}-768.webp 768w, ${stem}.webp 896w`;
      }
    }

    // 3. Thumbnails (decorative-adjacent gallery nav: right-sized sources,
    // lazy so they never compete with the LCP main image; hidden by CSS on
    // mobile but still reachable via gallery dots/swipe context).
    const thumbsContainer = document.querySelector('#pdp-thumbnails');
    if (thumbsContainer) {
      thumbsContainer.innerHTML = this.imagesList.map((img, idx) => {
        const thumbStem = img.src.replace(/\.(jpe?g)$/i, '');
        return `
        <button type="button" class="pdp-thumbnail-item ${idx === 0 ? 'is-active' : ''}" data-index="${idx}" aria-label="View ${img.type}">
          <img src="${thumbStem}-480.jpg" srcset="${thumbStem}-480.jpg 480w, ${thumbStem}-768.jpg 768w" sizes="80px" alt="${img.alt}" width="80" height="100" loading="lazy" decoding="async">
        </button>
      `;
      }).join('');
    }

    // 4. Mobile Dots
    const dotsContainer = document.querySelector('#pdp-mobile-dots');
    if (dotsContainer) {
      dotsContainer.innerHTML = this.imagesList.map((_, idx) => `
        <span class="pdp-dot ${idx === 0 ? 'is-active' : ''}" data-index="${idx}"></span>
      `).join('');
    }

    // 5. Hero Information
    const eyebrowEl = document.querySelector('#pdp-eyebrow');
    if (eyebrowEl) eyebrowEl.textContent = p.category;

    const titleEl = document.querySelector('#pdp-title');
    if (titleEl) titleEl.textContent = p.name;

    const ratingStarsEl = document.querySelector('#pdp-rating-stars');
    if (ratingStarsEl) ratingStarsEl.innerHTML = renderStarsHTML(p.rating);

    const ratingCountEl = document.querySelector('#pdp-rating-count');
    if (ratingCountEl) ratingCountEl.textContent = `${p.rating.toFixed(1)} (${p.reviewCount} reviews)`;

    const descEl = document.querySelector('#pdp-descriptor');
    if (descEl) descEl.textContent = p.descriptor;

    // 6. Variants
    this.updateVariantDisplay();

    // 7. Accordions Data Fill
    const benefitsListEl = document.querySelector('#pdp-benefits-list');
    if (benefitsListEl) {
      benefitsListEl.innerHTML = p.benefits.map(b => `<li>${b}</li>`).join('');
    }

    const suitableForEl = document.querySelector('#pdp-suitable-for');
    if (suitableForEl) suitableForEl.textContent = p.suitableFor;

    const inciBoxEl = document.querySelector('#pdp-inci-content');
    if (inciBoxEl) inciBoxEl.textContent = p.ingredientsINCI;

    const specNetWeight = document.querySelector('#pdp-spec-net-weight');
    if (specNetWeight) specNetWeight.textContent = p.netWeight;

    const specShelfLife = document.querySelector('#pdp-spec-shelf-life');
    if (specShelfLife) specShelfLife.textContent = p.shelfLife;

    const specHairTypes = document.querySelector('#pdp-spec-hair-types');
    if (specHairTypes) specHairTypes.textContent = p.hairTypes.join(', ');

    const specScalpTypes = document.querySelector('#pdp-spec-scalp-types');
    if (specScalpTypes) specScalpTypes.textContent = p.scalpTypes.join(', ');

    const specFragrance = document.querySelector('#pdp-spec-fragrance');
    if (specFragrance) specFragrance.textContent = p.fragrance;

    const specSulfates = document.querySelector('#pdp-spec-sulfates');
    if (specSulfates) specSulfates.textContent = p.sulfates;

    // 8. Usage Steps
    const usageContainer = document.querySelector('#pdp-usage-steps');
    if (usageContainer) {
      usageContainer.innerHTML = p.usageInstructions.map(u => `
        <div class="pdp-usage-step-row">
          <div class="pdp-step-number">${u.step}</div>
          <div class="pdp-step-body">
            <h4>${u.title}</h4>
            <p>${u.text}</p>
          </div>
        </div>
      `).join('');
    }

    // 9. Safety Disclaimer
    const safetyBoxEl = document.querySelector('#pdp-safety-content');
    if (safetyBoxEl) safetyBoxEl.textContent = p.safetyInformation;

    // Wishlist Button Sync
    const wishBtn = document.querySelector('#pdp-btn-wishlist');
    if (wishBtn && p) {
      wishBtn.setAttribute('data-product-id', p.id);
      syncWishlistUI();
    }

    // 10. Reviews Breakdown & List
    this.renderReviews();
  }

  /**
   * Resolve the live, authoritative stock count for a variant.
   * Milestone C20.12: read through inventoryService (post-deduction ledger)
   * rather than the static catalog literal, so the PDP reflects real-time stock.
   * @param {Object} variant
   * @returns {number}
   */
  getVariantStock(variant) {
    if (!variant) return 0;
    return inventoryService.getEffectiveStock(variant.sku, variant.stock);
  }

  updateVariantDisplay() {
    const p = this.product;
    const v = this.selectedVariant;
    if (!v) return;

    const liveStock = this.getVariantStock(v);

    // Price
    const priceEl = document.querySelector('#pdp-price');
    if (priceEl) priceEl.textContent = v.priceFormatted;

    // International Currency Indicator (approximate USD / GBP reference)
    let currencyRefEl = document.querySelector('#pdp-currency-reference');
    if (!currencyRefEl) {
      const priceWrap = document.querySelector('.pdp-price-wrap');
      if (priceWrap) {
        currencyRefEl = document.createElement('div');
        currencyRefEl.id = 'pdp-currency-reference';
        currencyRefEl.className = 'pdp-currency-reference';
        currencyRefEl.setAttribute('role', 'note');
        currencyRefEl.setAttribute('aria-label', 'International currency estimate');
        priceWrap.appendChild(currencyRefEl);
      }
    }
    const variantPrice = v.priceValue || v.price || (typeof v.priceFormatted === 'string' ? parseInt(v.priceFormatted.replace(/[^0-9]/g, ''), 10) : 0);
    if (currencyRefEl && variantPrice) {
      const info = getApproximateForeignCurrencies(variantPrice);
      currencyRefEl.innerHTML = `
        <span class="pdp-currency-approx">${info.combinedFormatted}</span>
        <span class="pdp-currency-disclaimer">(${info.disclaimer})</span>
      `;
    }

    // Stock
    const stockEl = document.querySelector('#pdp-stock-status');
    const addBtn = document.querySelector('#pdp-btn-add-cart');
    const buyBtn = document.querySelector('#pdp-btn-buy-now');

    if (stockEl) {
      if (liveStock <= 0) {
        stockEl.className = 'pdp-stock-status out-of-stock';
        stockEl.innerHTML = `<span class="pdp-stock-indicator-dot"></span><span class="pdp-stock-text">Out of Stock</span>`;
        if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Out of Stock'; }
        if (buyBtn) buyBtn.disabled = true;
      } else if (liveStock <= 8) {
        stockEl.className = 'pdp-stock-status low-stock';
        stockEl.innerHTML = `<span class="pdp-stock-indicator-dot"></span><span class="pdp-stock-text">Low Stock (Only ${liveStock} left)</span>`;
        if (addBtn) { addBtn.disabled = false; addBtn.textContent = `Add to Bag · ${v.priceFormatted}`; }
        if (buyBtn) buyBtn.disabled = false;
      } else {
        stockEl.className = 'pdp-stock-status in-stock';
        stockEl.innerHTML = `<span class="pdp-stock-indicator-dot"></span><span class="pdp-stock-text">In Stock</span>`;
        if (addBtn) { addBtn.disabled = false; addBtn.textContent = `Add to Bag · ${v.priceFormatted}`; }
        if (buyBtn) buyBtn.disabled = false;
      }
    }

    // Sticky CTA mirrors the primary action exactly (variant, qty, stock).
    this.syncStickyCTA();

    // SKU
    const skuEl = document.querySelector('#pdp-sku');
    if (skuEl) skuEl.textContent = `SKU: ${v.sku}`;

    // Selected size name
    const selectedNameEl = document.querySelector('#pdp-selected-variant-name');
    if (selectedNameEl) selectedNameEl.textContent = v.size;

    // Variant Pills
    const variantContainer = document.querySelector('#pdp-variant-options');
    if (variantContainer) {
      variantContainer.innerHTML = p.variants.map((varItem) => `
        <button
          type="button"
          class="pdp-variant-pill ${varItem.sku === v.sku ? 'is-selected' : ''}"
          data-sku="${varItem.sku}"
          ${this.getVariantStock(varItem) <= 0 ? 'disabled' : ''}
        >
          <span>${varItem.size}</span>
          <small>(${varItem.priceFormatted})</small>
        </button>
      `).join('');

      // Bind variant pills click
      variantContainer.querySelectorAll('.pdp-variant-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const sku = btn.getAttribute('data-sku');
          const found = p.variants.find(item => item.sku === sku);
          if (found) {
            this.selectedVariant = found;
            this.quantity = 1;
            const validationEl = document.querySelector('#pdp-variant-validation');
            if (validationEl) {
              validationEl.textContent = '';
              validationEl.style.display = 'none';
            }
            this.updateQuantityDisplay();
            this.updateVariantDisplay();
          }
        });
      });
    }
  }

  updateQuantityDisplay() {
    const qtyValEl = document.querySelector('#pdp-qty-val');
    if (qtyValEl) qtyValEl.textContent = this.quantity;

    const minusBtn = document.querySelector('#pdp-qty-minus');
    const plusBtn = document.querySelector('#pdp-qty-plus');

    if (minusBtn) minusBtn.disabled = this.quantity <= 1;
    if (plusBtn && this.selectedVariant) {
      plusBtn.disabled = this.quantity >= this.getVariantStock(this.selectedVariant);
    }

    this.syncStickyCTA();
  }

  /**
   * Keep the sticky CTA an exact mirror of the primary purchase action:
   * same variant, same quantity, same live stock, same disabled state.
   * Text stays compact ("Add to Bag" / "Out of Stock"); the full detail
   * (qty x variant, total) lives in the accessible label.
   */
  syncStickyCTA() {
    const stickyBtn = document.querySelector('#pdp-sticky-add-cart');
    if (!stickyBtn || !this.product) return;
    const v = this.selectedVariant;
    if (!v) {
      stickyBtn.disabled = true;
      stickyBtn.textContent = 'Select a Size';
      stickyBtn.setAttribute('aria-label', `${this.product.name}: please select a size before adding to bag`);
      return;
    }
    const liveStock = this.getVariantStock(v);
    const unitPrice = v.priceFormatted || '';
    if (liveStock <= 0) {
      stickyBtn.disabled = true;
      stickyBtn.textContent = 'Out of Stock';
      stickyBtn.setAttribute('aria-label', `${this.product.name}, ${v.size}: out of stock`);
    } else {
      stickyBtn.disabled = false;
      stickyBtn.textContent = 'Add to Bag';
      const qtyNote = this.quantity > 1 ? `${this.quantity} × ` : '';
      stickyBtn.setAttribute(
        'aria-label',
        `Add ${qtyNote}${this.product.name} (${v.size}, ${unitPrice}) to bag`
      );
    }
    const stickyPriceEl = document.querySelector('#pdp-sticky-price');
    if (stickyPriceEl) stickyPriceEl.textContent = unitPrice;
  }

  bindEvents() {
    // Gallery Touch Swiping
    const imageFrame = document.querySelector('.pdp-main-image-frame');
    if (imageFrame) {
      let touchStartX = 0;
      let touchStartY = 0;
      let touchEndX = 0;
      let touchEndY = 0;

      imageFrame.addEventListener('touchstart', (e) => {
        const touch = e.changedTouches[0];
        touchStartX = touch.clientX || touch.screenX || 0;
        touchStartY = touch.clientY || touch.screenY || 0;
      }, { passive: true });

      imageFrame.addEventListener('touchend', (e) => {
        const touch = e.changedTouches[0];
        touchEndX = touch.clientX || touch.screenX || 0;
        touchEndY = touch.clientY || touch.screenY || 0;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Ensure horizontal intent (horizontal distance > 35px and greater than vertical drift)
        if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX < 0) {
            this.changeImage(this.currentImageIndex + 1);
          } else {
            this.changeImage(this.currentImageIndex - 1);
          }
        }
      }, { passive: true });
    }

    // Gallery Navigation: Prev & Next Buttons
    const prevBtn = document.querySelector('#pdp-gallery-prev');
    const nextBtn = document.querySelector('#pdp-gallery-next');
    prevBtn?.addEventListener('click', () => this.changeImage(this.currentImageIndex - 1));
    nextBtn?.addEventListener('click', () => this.changeImage(this.currentImageIndex + 1));

    // Thumbnail Clicks
    const thumbBtns = document.querySelectorAll('.pdp-thumbnail-item');
    thumbBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        this.changeImage(idx);
      });
    });

    // Mobile Dots
    const dotBtns = document.querySelectorAll('.pdp-dot');
    dotBtns.forEach(dot => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.getAttribute('data-index'), 10);
        this.changeImage(idx);
      });
    });

    // Quantity Stepper
    const minusBtn = document.querySelector('#pdp-qty-minus');
    const plusBtn = document.querySelector('#pdp-qty-plus');

    minusBtn?.addEventListener('click', () => {
      if (this.quantity > 1) {
        this.quantity--;
        this.updateQuantityDisplay();
      }
    });

    plusBtn?.addEventListener('click', () => {
      if (this.selectedVariant && this.quantity < this.getVariantStock(this.selectedVariant)) {
        this.quantity++;
        this.updateQuantityDisplay();
      }
    });

    // Add to Cart
    const addBtn = document.querySelector('#pdp-btn-add-cart');
    addBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      
      let validationEl = document.querySelector('#pdp-variant-validation');
      if (!validationEl) {
        validationEl = document.createElement('div');
        validationEl.id = 'pdp-variant-validation';
        validationEl.style.cssText = 'color: #8F3B3B; font-size: 0.8125rem; margin-bottom: 8px; font-weight: 500;';
        const actionsContainer = document.querySelector('.pdp-purchase-actions');
        if (actionsContainer) {
          actionsContainer.insertBefore(validationEl, actionsContainer.firstChild);
        }
      }

      if (!this.selectedVariant) {
        validationEl.textContent = 'Please select a size / variant before adding to bag.';
        validationEl.style.display = 'block';
        return;
      }

      if (this.getVariantStock(this.selectedVariant) <= 0) {
        validationEl.textContent = 'This variant is currently out of stock.';
        validationEl.style.display = 'block';
        return;
      }

      validationEl.textContent = '';
      validationEl.style.display = 'none';

      const origText = addBtn.textContent;
      addBtn.textContent = 'ADDED TO BAG ✓';
      addBtn.classList.add('btn-secondary');
      addBtn.classList.remove('btn-primary');
      addBtn.disabled = true;

      // Add to centralized cart store
      addToCart(this.product, this.quantity, this.selectedVariant);

      setTimeout(() => {
        addBtn.textContent = origText;
        addBtn.classList.remove('btn-secondary');
        addBtn.classList.add('btn-primary');
        addBtn.disabled = false;

        // Open Cart Drawer preview
        openCartDrawer();
      }, 400);
    });

    // Buy Now simulator
    const buyBtn = document.querySelector('#pdp-btn-buy-now');
    buyBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      const orig = buyBtn.textContent;
      buyBtn.textContent = 'Store Launching Soon · Catalog Preview Active';
      setTimeout(() => {
        buyBtn.textContent = orig;
      }, 3000);
    });

    // Wishlist Toggle
    const wishBtn = document.querySelector('#pdp-btn-wishlist');
    wishBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.product && this.product.id) {
        toggleWishlist(this.product.id);
        syncWishlistUI();
      }
    });

    // Accordions
    const accordionTriggers = document.querySelectorAll('.pdp-accordion-trigger');
    accordionTriggers.forEach(trig => {
      trig.addEventListener('click', () => {
        const item = trig.closest('.pdp-accordion-item');
        item?.classList.toggle('is-open');
        const isOpen = item?.classList.contains('is-open');
        trig.setAttribute('aria-expanded', isOpen);
      });
    });

    // Review Form Simulation
    const reviewForm = document.querySelector('#pdp-review-form');
    reviewForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = reviewForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.textContent = 'Review Submitted for Moderation ✓';
        submitBtn.disabled = true;
        reviewForm.reset();
        setTimeout(() => {
          submitBtn.textContent = 'Submit Review';
          submitBtn.disabled = false;
        }, 4000);
      }
    });
  }

  changeImage(index) {
    if (this.imagesList.length === 0) return;
    if (index < 0) index = this.imagesList.length - 1;
    if (index >= this.imagesList.length) index = 0;

    this.currentImageIndex = index;
    const targetImage = this.imagesList[index];

    const mainImgEl = document.querySelector('#pdp-main-image');
    if (mainImgEl) {
      mainImgEl.classList.add('is-animating');
      setTimeout(() => {
        mainImgEl.src = targetImage.src;
        mainImgEl.alt = targetImage.alt;
        mainImgEl.classList.remove('is-animating');
      }, 150);
    }

    // Update Thumbnails Active
    const thumbs = document.querySelectorAll('.pdp-thumbnail-item');
    thumbs.forEach((t, idx) => {
      if (idx === index) t.classList.add('is-active');
      else t.classList.remove('is-active');
    });

    // Update Mobile Dots
    const dots = document.querySelectorAll('.pdp-dot');
    dots.forEach((d, idx) => {
      if (idx === index) d.classList.add('is-active');
      else d.classList.remove('is-active');
    });
  }

  renderReviews() {
    const p = this.product;
    const bigScoreEl = document.querySelector('#pdp-big-score');
    if (bigScoreEl) bigScoreEl.textContent = p.rating.toFixed(1);

    const bigStarsEl = document.querySelector('#pdp-big-stars');
    if (bigStarsEl) bigStarsEl.innerHTML = renderStarsHTML(p.rating);

    const totalReviewsEl = document.querySelector('#pdp-total-reviews-count');
    if (totalReviewsEl) totalReviewsEl.textContent = `Based on ${p.reviewCount} verified reviews`;

    const reviewsListEl = document.querySelector('#pdp-reviews-list');
    if (reviewsListEl && p.reviews && p.reviews.length > 0) {
      reviewsListEl.innerHTML = p.reviews.map(r => `
        <article class="pdp-review-card">
          <div class="pdp-review-top">
            <div>
              <span class="pdp-review-author">${r.author}</span>
              ${r.verified ? `<span class="pdp-verified-badge">Verified Buyer ✓</span>` : ''}
            </div>
            <span class="pdp-review-date">${r.date}</span>
          </div>
          <div class="pdp-rating-stars" style="margin-bottom: 8px;">
            ${renderStarsHTML(r.rating)}
          </div>
          <h4 class="pdp-review-heading">${r.title}</h4>
          <p class="pdp-review-body">${r.text}</p>
        </article>
      `).join('');
    }
  }

  renderRelatedProducts() {
    const container = document.querySelector('#pdp-related-grid');
    if (!container || !this.product) return;

    const related = getRelatedProducts(this.product, 4);
    if (related.length === 0) {
      const section = document.querySelector('#pdp-related-section');
      if (section) section.style.display = 'none';
      return;
    }

    container.innerHTML = related.map(p => createCatalogCardHTML(p, { rootPrefix: this.rootPrefix })).join('');
    initCardInteractions(container);
  }

  initStickyCTA() {
    if (!this.product) return;

    // Mobile-only: the CSS breakpoint is <768px and visibility is gated
    // on mobileQuery below. Tablet and desktop keep the two-column PDP
    // where the primary actions stay reachable, so the bar stays parked
    // there (and CSS forces display:none at >=768px).
    const mobileQuery = window.matchMedia
      ? window.matchMedia('(max-width: 767px)')
      : { matches: window.innerWidth < 768, addEventListener: null };

    let stickyEl = document.querySelector('.pdp-sticky-cta');
    if (!stickyEl) {
      stickyEl = document.createElement('div');
      stickyEl.className = 'pdp-sticky-cta';
      // Hidden bars must not be focusable: visibility is toggled via CSS
      // (.is-visible) and aria-hidden mirrors it in updateStickyVisibility.
      stickyEl.setAttribute('aria-hidden', 'true');
      stickyEl.innerHTML = `
        <div class="pdp-sticky-cta-info">
          <img class="pdp-sticky-cta-thumb" src="${this.rootPrefix}${this.product.images.packaging.replace(/\.(jpe?g)$/i, '-480.$1')}" alt="" aria-hidden="true" loading="lazy" decoding="async" width="44" height="44">
          <div class="pdp-sticky-cta-text">
            <div class="pdp-sticky-cta-title">${this.product.name}</div>
            <div class="pdp-sticky-cta-price" id="pdp-sticky-price">${this.selectedVariant ? this.selectedVariant.priceFormatted : ''}</div>
          </div>
        </div>
        <button type="button" class="btn btn-primary pdp-sticky-cta-btn" id="pdp-sticky-add-cart" tabindex="-1">Add to Bag</button>
      `;
      document.body.appendChild(stickyEl);
    }

    // Mirror current variant/qty/stock into the sticky button immediately.
    this.syncStickyCTA();

    // The sticky CTA reuses the existing product action architecture: it
    // delegates to the primary "Add to Bag" button, so variant selection,
    // quantity, live stock, availability, and validation all stay in one
    // place instead of being duplicated.
    const stickyAddBtn = document.querySelector('#pdp-sticky-add-cart');
    stickyAddBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector('#pdp-btn-add-cart')?.click();
    });

    const purchaseActions = document.querySelector('.pdp-purchase-actions');
    const footerEl = document.querySelector('.site-footer');
    let purchaseOutOfView = false;
    let footerInView = false;

    const updateStickyVisibility = () => {
      if (!mobileQuery.matches) {
        stickyEl.classList.remove('is-visible');
        return;
      }
      // Never overlay the keyboard, an open drawer/modal, or the footer.
      const keyboardOpen = document.body.classList.contains('is-keyboard-open');
      const overlayOpen = document.body.classList.contains('has-overlay-open')
        || document.querySelector('.drawer.is-open, .drawer-backdrop.is-open');
      const shouldShow = purchaseOutOfView && !footerInView && !keyboardOpen && !overlayOpen;
      stickyEl.classList.toggle('is-visible', shouldShow);
      stickyEl.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
      if (stickyAddBtn) stickyAddBtn.tabIndex = shouldShow ? 0 : -1;
    };

    this.updateStickyVisibility = updateStickyVisibility;

    if (purchaseActions && 'IntersectionObserver' in window) {
      const purchaseObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          purchaseOutOfView = !entry.isIntersecting && entry.boundingClientRect.top < 0;
          updateStickyVisibility();
        });
      }, { threshold: 0 });
      purchaseObserver.observe(purchaseActions);
    } else if (purchaseActions) {
      // Fallback for older browsers: scroll-position check.
      let ticking = false;
      window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const rect = purchaseActions.getBoundingClientRect();
          purchaseOutOfView = rect.bottom < 0 && window.scrollY > 300;
          updateStickyVisibility();
          ticking = false;
        });
      }, { passive: true });
    }

    // Park the bar while the footer is visible so it never covers
    // footer links, legal text, or bottom content.
    if (footerEl && 'IntersectionObserver' in window) {
      const footerObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          footerInView = entry.isIntersecting;
          updateStickyVisibility();
        });
      }, { threshold: 0.05 });
      footerObserver.observe(footerEl);
    }

    // Virtual keyboard: hide the bar while a field is focused so it can
    // never cover form fields, validation errors, or the review form.
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
        document.body.classList.add('is-keyboard-open');
        updateStickyVisibility();
      }
    });
    document.addEventListener('focusout', () => {
      // Defer: focus moves between fields without the keyboard closing.
      setTimeout(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
          document.body.classList.remove('is-keyboard-open');
          updateStickyVisibility();
        }
      }, 100);
    });

    // Track drawer/modal state (cart drawer, mobile nav) via class changes.
    const overlayObserver = new MutationObserver(() => updateStickyVisibility());
    overlayObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.querySelectorAll('.drawer, .drawer-backdrop').forEach(el => {
      overlayObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
    });

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', updateStickyVisibility);
    }
    window.addEventListener('resize', updateStickyVisibility, { passive: true });
    updateStickyVisibility();
  }
}
