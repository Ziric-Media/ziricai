/**
 * Mega-menu nav: desktop hover + mobile toggle for marketing header.
 */
(function () {
  'use strict';

  function closeMarketingNavMenus() {
    document.querySelectorAll('[data-nav-dropdown].is-open').forEach((d) => {
      d.classList.remove('is-open');
      d.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
    });
    document.getElementById('headerNavPanel')?.classList.remove('open');
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function initMarketingSiteNav() {
    const panel = document.getElementById('headerNavPanel');
    const menuBtn = document.getElementById('mobileMenuBtn');
    menuBtn?.addEventListener('click', () => panel?.classList.toggle('open'));

    panel?.querySelectorAll('a[href]').forEach((link) => {
      link.addEventListener('click', () => {
        if (link.classList.contains('nav-dropdown-toggle') && window.matchMedia('(max-width: 1023px)').matches) {
          return;
        }
        closeMarketingNavMenus();
      });
    });

    document.querySelectorAll('[data-nav-dropdown]').forEach((dropdown) => {
      const toggle = dropdown.querySelector('.nav-dropdown-toggle');
      if (!toggle) return;

      toggle.addEventListener('click', (e) => {
        if (window.matchMedia('(min-width: 1024px)').matches && !toggle.getAttribute('href')?.endsWith('.html')) {
          return;
        }
        if (window.matchMedia('(max-width: 1023px)').matches) {
          e.preventDefault();
          const open = dropdown.classList.toggle('is-open');
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-nav-dropdown]')) {
        document.querySelectorAll('[data-nav-dropdown].is-open').forEach((d) => {
          d.classList.remove('is-open');
          d.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarketingSiteNav);
  } else {
    initMarketingSiteNav();
  }
})();
