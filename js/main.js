/**
 * Slimky Hair - Main JavaScript Entry
 */

import { initNavigation, initFooterAccordions } from './navigation.js';
import { initDrawers } from './drawers.js';
import { PRODUCTS } from './catalog-data.js';
import { createCatalogCardHTML, initCardInteractions } from './catalog-renderer.js';
import { syncWishlistUI } from './wishlist-store.js';
import { initCart, syncCartUI, openCartDrawer, addToCart } from './cart-store.js';

export { initNavigation, initFooterAccordions, initDrawers, initCart, syncCartUI, openCartDrawer, addToCart };

function initMain() {
  // Initialize Header Navigation & Mobile Drawer
  const nav = initNavigation();

  // Initialize Shopping Bag Cart Store
  initCart();

  // Initialize Wishlist UI sync
  syncWishlistUI(document);
  window.addEventListener('slimky:wishlist:updated', () => syncWishlistUI(document));

  // Initialize Search Overlay & Cart Drawers
  const drawers = initDrawers();

  // Section 3: Dynamic Featured Products Showcase
  const featuredGrid = document.querySelector('#featured-products-grid');
  if (featuredGrid) {
    const featuredProducts = PRODUCTS.filter(p => p.featured);
    if (featuredProducts.length > 0) {
      featuredGrid.innerHTML = featuredProducts
        .map(p => createCatalogCardHTML(p, { rootPrefix: '' }))
        .join('');
    }
  }

  // Section 11: Hair Care Essentials Category Filter & Dynamic CTAs
  const essentialsFilterBtns = document.querySelectorAll('.essentials-filter-btn');
  const essentialsGrid = document.querySelector('#essentials-products-grid');
  const essentialsCards = essentialsGrid ? essentialsGrid.querySelectorAll('.product-card') : [];
  const essentialsCount = document.querySelector('#essentials-count');
  const essentialsTabLink = document.querySelector('#essentials-tab-link');
  const essentialsCatalogCta = document.querySelector('#essentials-catalog-cta');
  const essentialsBottomCta = document.querySelector('#essentials-bottom-see-all');

  const categoryRoutingMap = {
    'all': {
      tabText: 'Explore Collection →',
      headerText: 'See All Products',
      bottomText: 'See All Products',
      url: '/shop'
    },
    'oils': {
      tabText: 'Explore Hair Oils Collection →',
      headerText: 'See All Hair Oils',
      bottomText: 'See All Hair Oils',
      url: '/category/hair-oils/'
    },
    'cleansing': {
      tabText: 'Explore Shampoos Collection →',
      headerText: 'See All Shampoos',
      bottomText: 'See All Shampoos',
      url: '/category/shampoo/'
    },
    'conditioning': {
      tabText: 'Explore Conditioners Collection →',
      headerText: 'See All Conditioners',
      bottomText: 'See All Conditioners',
      url: '/category/conditioners/'
    },
    'treatments': {
      tabText: 'Explore Treatments Collection →',
      headerText: 'See All Treatments',
      bottomText: 'See All Treatments',
      url: '/category/hair-masks/'
    },
    'styling': {
      tabText: 'Explore Styling Collection →',
      headerText: 'See All Styling Products',
      bottomText: 'See All Styling Products',
      url: '/category/styling-products/'
    }
  };

  essentialsFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter') || 'all';
      
      // Update active states
      essentialsFilterBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Filter product cards
      let visibleCount = 0;
      essentialsCards.forEach(card => {
        const categories = card.getAttribute('data-category') || '';
        if (filter === 'all' || categories.split(' ').includes(filter)) {
          card.classList.remove('is-hidden');
          visibleCount++;
        } else {
          card.classList.add('is-hidden');
        }
      });

      if (essentialsCount) {
        essentialsCount.textContent = `Showing ${visibleCount} Essential${visibleCount === 1 ? '' : 's'}`;
      }

      // Update dynamic CTAs
      const routeInfo = categoryRoutingMap[filter] || categoryRoutingMap['all'];
      if (essentialsTabLink) {
        essentialsTabLink.textContent = routeInfo.tabText;
        essentialsTabLink.setAttribute('href', routeInfo.url);
      }
      if (essentialsCatalogCta) {
        essentialsCatalogCta.textContent = routeInfo.headerText;
        essentialsCatalogCta.setAttribute('href', routeInfo.url);
      }
      if (essentialsBottomCta) {
        essentialsBottomCta.textContent = routeInfo.bottomText;
        essentialsBottomCta.setAttribute('href', routeInfo.url);
      }
    });
  });

  // Initialize unified card interactions (wishlist, quick-add)
  initCardInteractions(document);

  // Newsletter Submit Simulator
  const newsletterForms = document.querySelectorAll('.footer-newsletter-form, .newsletter-form');
  newsletterForms.forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const btn = form.querySelector('button[type="submit"]');
      if (input && input.value) {
        const originalBtnText = btn ? btn.textContent : '';
        if (btn) btn.textContent = 'SUBSCRIBED';
        input.value = '';
        input.placeholder = 'Welcome to The Hair Journal ✓';
        setTimeout(() => {
          if (btn) btn.textContent = originalBtnText;
          input.placeholder = 'Enter your email address';
        }, 4000);
      }
    });
  });

  // Section 12: Customer Reviews Navigation Controls
  const reviewsPrevBtn = document.querySelector('#reviews-prev');
  const reviewsNextBtn = document.querySelector('#reviews-next');
  const reviewsGrid = document.querySelector('#reviews-grid');

  if (reviewsPrevBtn && reviewsNextBtn && reviewsGrid) {
    reviewsPrevBtn.addEventListener('click', () => {
      reviewsGrid.scrollBy({ left: -340, behavior: 'smooth' });
    });
    reviewsNextBtn.addEventListener('click', () => {
      reviewsGrid.scrollBy({ left: 340, behavior: 'smooth' });
    });
  }

  // Global Mobile Footer Accordions
  initFooterAccordions();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMain);
} else {
  initMain();
}

/**
 * Footer accordions now live in js/navigation.js so every entry point
 * (cart/shop/wishlist/checkout/account) gets them via initNavigation().
 * Re-exported above for backwards compatibility.
 */
