/**
 * Portal BOS — app shell: sidebar, topbar, mobile drawer, nav badges.
 */
import { state, subscribe } from './dataStore.js';
import { canAccessModule } from '../permissions.js';

export const NAV_SECTIONS = [
  {
    id: 'operate',
    label: 'Operate',
    items: [
      { id: 'dashboard', label: 'Overview', icon: 'fa-gauge-high' },
      { id: 'conversations', label: 'Inbox', icon: 'fa-inbox', live: true },
      { id: 'customers', label: 'CRM', icon: 'fa-users' },
      { id: 'appointments', label: 'Appointments', icon: 'fa-calendar-check' },
      { id: 'agents', label: 'AI Employees', icon: 'fa-robot' },
      { id: 'knowledge', label: 'Knowledge Base', icon: 'fa-book' },
      { id: 'automation', label: 'Automation', icon: 'fa-diagram-project' },
    ],
  },
  {
    id: 'grow',
    label: 'Grow',
    items: [
      { id: 'analytics', label: 'Analytics', icon: 'fa-chart-line' },
      { id: 'marketplace', label: 'Marketplace', icon: 'fa-store' },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { id: 'billing', label: 'Billing', icon: 'fa-credit-card' },
      { id: 'integrations', label: 'Integrations', icon: 'fa-plug' },
      { id: 'team', label: 'Team', icon: 'fa-user-group' },
      { id: 'notifications', label: 'Notifications', icon: 'fa-bell', badgeKey: 'notifications' },
      { id: 'activity', label: 'Activity Log', icon: 'fa-clock-rotate-left' },
      { id: 'settings', label: 'Settings', icon: 'fa-gear' },
      { id: 'support', label: 'Support', icon: 'fa-life-ring' },
    ],
  },
];

export const MODULE_LABELS = Object.fromEntries(
  NAV_SECTIONS.flatMap((s) => s.items.map((i) => [i.id, i.label]))
);
MODULE_LABELS.dashboard = 'Overview';

let shellInitialized = false;

export function initAppShell() {
  if (shellInitialized) return;
  shellInitialized = true;

  bindMobileDrawer();
  bindSidebarCollapse();
  bindSarahTopbar();
  bindUserMenu();
  renderSidebarNav();
  subscribe('unreadNotifications', updateNavBadges);
  subscribe('hubData', updateNavBadges);
}

export function renderSidebarNav() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;

  const role = state.profile?.role;
  nav.innerHTML = NAV_SECTIONS.map((section) => {
    const items = section.items.filter((item) => canAccessModule(role, item.id));
    if (!items.length) return '';

    return `
      <div class="bos-nav-section" data-section="${section.id}">
        <button type="button" class="section-label bos-section-toggle" aria-expanded="true">
          <span>${section.label}</span>
          <i class="fa-solid fa-chevron-down"></i>
        </button>
        <div class="bos-nav-items">
          ${items.map((item) => navLink(item)).join('')}
        </div>
      </div>`;
  }).join('');

  nav.querySelectorAll('.bos-section-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.bos-nav-section');
      const expanded = section?.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    });
  });

  updateNavBadges();
}

function navLink(item) {
  const badge =
    item.badgeKey === 'notifications'
      ? `<span class="badge nav-badge hidden" data-badge="notifications"></span>`
      : item.live
        ? '<span class="indicator online"></span>'
        : '';

  return `
    <a href="#" data-page="${item.id}" ${state.currentPage === item.id ? 'class="active"' : ''}>
      <span class="icon"><i class="fa-solid ${item.icon}"></i></span>
      <span>${item.label}</span>
      ${badge}
    </a>`;
}

export function updateNavBadges() {
  const unread = state.unreadNotifications ?? state.hubData?.notifications?.unreadCount ?? 0;

  document.querySelectorAll('[data-badge="notifications"]').forEach((el) => {
    el.textContent = unread > 0 ? String(unread) : '';
    el.classList.toggle('hidden', unread <= 0);
  });

  const topBadge = document.getElementById('notificationBadge');
  if (topBadge) {
    topBadge.textContent = unread > 0 ? String(unread) : '';
    topBadge.classList.toggle('hidden', unread <= 0);
  }
}

/**
 * @param {string} page
 */
export function updateBreadcrumb(page) {
  const titleEl = document.getElementById('pageTitle');
  const crumbEl = document.getElementById('breadcrumb');
  const companyName = state.company?.name || 'Company';

  const label = MODULE_LABELS[page] || 'Overview';
  if (titleEl) titleEl.textContent = label;

  if (crumbEl) {
    crumbEl.innerHTML = `
      <button type="button" class="bos-crumb-home" data-page="dashboard" title="Overview">
        <i class="fa-solid fa-building"></i> ${escapeHtmlShort(companyName)}
      </button>
      <span class="bos-crumb-sep">/</span>
      <span class="bos-crumb-current">${escapeHtmlShort(label)}</span>`;

    crumbEl.querySelector('.bos-crumb-home')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector('[data-page="dashboard"]')?.click();
    });
  }
}

function escapeHtmlShort(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function bindMobileDrawer() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const toggle = document.getElementById('sidebarToggle');

  toggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('open', sidebar?.classList.contains('open'));
  });

  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    overlay.classList.remove('open');
    document.getElementById('notificationDrawer')?.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.sidebar-nav a[data-page]')) {
      sidebar?.classList.remove('open');
      overlay?.classList.remove('open');
    }
  });
}

function bindSidebarCollapse() {
  const btn = document.getElementById('sidebarCollapseBtn');
  const sidebar = document.getElementById('sidebar');
  btn?.addEventListener('click', () => {
    sidebar?.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed', sidebar?.classList.contains('collapsed'));
  });
}

function bindSarahTopbar() {
  document.getElementById('topbarSarahBtn')?.addEventListener('click', async () => {
    const { openPortalSarah } = await import('../sarah/sarah-ui.js');
    openPortalSarah();
  });
}

function bindUserMenu() {
  const menu = document.getElementById('userMenu');
  menu?.addEventListener('click', () => {
    document.querySelector('[data-page="settings"]')?.click();
  });
}

export function applySidebarVisibility() {
  renderSidebarNav();
}
