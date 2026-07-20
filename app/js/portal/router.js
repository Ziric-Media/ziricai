import { state, setState } from '../core/dataStore.js';
import { canAccessModule } from '../permissions.js';
import { errorState } from '../../admin/ui.js';
import { loadModule, showModuleSkeleton, prefetchModules } from '../core/lazyLoader.js';
import {
  applySidebarVisibility,
  updateBreadcrumb,
  MODULE_LABELS,
  renderSidebarNav,
} from '../core/appShell.js';

export { MODULE_LABELS, applySidebarVisibility };

export function navigateTo(page, params = {}) {
  const role = state.profile?.role;
  if (!canAccessModule(role, page)) {
    page = 'dashboard';
  }

  if (params.phone) setState({ selectedCustomerPhone: params.phone });

  setState({ currentPage: page });

  document.querySelectorAll('.sidebar-nav a[data-page]').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  updateBreadcrumb(page);

  const container = document.getElementById('pageContent');
  if (!container) return;

  showModuleSkeleton(container, `Loading ${MODULE_LABELS[page] || page}…`);

  loadModule(page)
    .then((render) => render(container))
    .catch((err) => {
      console.error(`Failed to render ${page}:`, err);
      container.innerHTML = errorState(err?.message || 'Failed to load this page.');
    });

  prefetchModules(['conversations', 'customers', 'notifications']);
}

export function initRouter() {
  const nav = document.getElementById('sidebarNav');
  nav?.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-page]');
    if (!link) return;
    e.preventDefault();
    navigateTo(link.dataset.page);
  });

  document.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-nav]');
    if (!navEl || navEl.tagName === 'A') return;
    e.preventDefault();
    const target = navEl.dataset.nav;
    if (target) navigateTo(target);
  });
}

/** Re-render sidebar after auth (permissions). */
export function refreshNav() {
  renderSidebarNav();
  initRouter();
}
