/**
 * FAQ Page Interactive Controller
 * Slimky Hair
 * 
 * Handles:
 * - Live keyword search across questions and answers
 * - Category filter tabs
 * - Search match auto-expansion and clear functionality
 * - Empty state with concierge contact CTA
 * - Accessibility (ARIA & keyboard support)
 */

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('faq-search-input');
  const searchClear = document.getElementById('faq-search-clear');
  const searchStatus = document.getElementById('faq-search-status');
  const filterBtns = document.querySelectorAll('.faq-filter-btn');
  const faqGroups = document.querySelectorAll('.faq-group');
  const faqItems = document.querySelectorAll('.faq-page-item');
  const emptyState = document.getElementById('faq-empty-state');
  const emptyQuerySpan = document.getElementById('faq-empty-query');

  let activeCategory = 'all';
  let searchQuery = '';

  // Calculate and update category badges
  function updateCategoryBadges() {
    const counts = {
      all: faqItems.length,
      products: 0,
      orders: 0,
      shipping: 0,
      safety: 0
    };

    faqItems.forEach(item => {
      const cat = item.dataset.category;
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });

    filterBtns.forEach(btn => {
      const cat = btn.dataset.category;
      const badge = btn.querySelector('.faq-filter-badge');
      if (badge && counts[cat] !== undefined) {
        badge.textContent = counts[cat];
      }
    });
  }

  // Filter items based on activeCategory and searchQuery
  function filterFaq() {
    let totalVisible = 0;
    const query = searchQuery.toLowerCase().trim();

    faqGroups.forEach(group => {
      const groupCategory = group.dataset.category;
      const groupItems = group.querySelectorAll('.faq-page-item');
      let visibleInGroup = 0;

      // Check if group is relevant to active category
      const categoryMatches = activeCategory === 'all' || activeCategory === groupCategory;

      if (!categoryMatches) {
        group.style.display = 'none';
        return;
      }

      groupItems.forEach(item => {
        const questionText = item.querySelector('.faq-page-question')?.textContent.toLowerCase() || '';
        const answerText = item.querySelector('.faq-page-answer')?.textContent.toLowerCase() || '';
        const keywords = item.dataset.keywords ? item.dataset.keywords.toLowerCase() : '';

        const textMatches = !query || questionText.includes(query) || answerText.includes(query) || keywords.includes(query);

        if (textMatches) {
          item.style.display = '';
          visibleInGroup++;
          totalVisible++;

          // Auto-expand item if active search query exists
          if (query.length >= 2) {
            item.setAttribute('open', '');
          }
        } else {
          item.style.display = 'none';
          if (query.length >= 2) {
            item.removeAttribute('open');
          }
        }
      });

      // Update group visibility based on whether any item inside matches
      if (visibleInGroup > 0) {
        group.style.display = '';
        const countSpan = group.querySelector('.faq-group-count');
        if (countSpan) {
          countSpan.textContent = `(${visibleInGroup} ${visibleInGroup === 1 ? 'question' : 'questions'})`;
        }
      } else {
        group.style.display = 'none';
      }
    });

    // Handle Empty State
    if (totalVisible === 0) {
      if (emptyState) {
        emptyState.classList.add('is-visible');
        if (emptyQuerySpan) {
          emptyQuerySpan.textContent = query ? `"${query}"` : 'your selection';
        }
      }
      if (searchStatus) {
        searchStatus.textContent = 'No questions found matching your search.';
      }
    } else {
      if (emptyState) {
        emptyState.classList.remove('is-visible');
      }
      if (searchStatus) {
        if (query) {
          searchStatus.textContent = `Showing ${totalVisible} ${totalVisible === 1 ? 'question' : 'questions'} matching "${query}"`;
        } else if (activeCategory !== 'all') {
          searchStatus.textContent = `Showing ${totalVisible} ${totalVisible === 1 ? 'question' : 'questions'} in this category`;
        } else {
          searchStatus.textContent = `Showing all ${totalVisible} questions`;
        }
      }
    }
  }

  // Search input handler
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (searchClear) {
        if (searchQuery.length > 0) {
          searchClear.classList.add('is-visible');
        } else {
          searchClear.classList.remove('is-visible');
        }
      }
      filterFaq();
    });

    // Search input keydown (Escape clears)
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchQuery = '';
        if (searchClear) searchClear.classList.remove('is-visible');
        filterFaq();
        searchInput.blur();
      }
    });
  }

  // Clear search button
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      searchQuery = '';
      searchClear.classList.remove('is-visible');
      filterFaq();
    });
  }

  // Category filter tabs
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeCategory = btn.dataset.category || 'all';
      filterFaq();

      // Scroll smoothly to relevant group if specific category selected
      if (activeCategory !== 'all') {
        const targetGroup = document.querySelector(`.faq-group[data-category="${activeCategory}"]`);
        if (targetGroup) {
          targetGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // URL hash navigation support (e.g. #products, #shipping, #orders, #safety)
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (['products', 'orders', 'shipping', 'safety'].includes(hash)) {
    const matchingBtn = document.querySelector(`.faq-filter-btn[data-category="${hash}"]`);
    if (matchingBtn) {
      matchingBtn.click();
    }
  }

  // Initialize
  updateCategoryBadges();
  filterFaq();
});
