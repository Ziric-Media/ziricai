/**
 * Company Admin Portal — bootstrap entry point.
 *
 * ## Super Admin vs Company Portal
 *
 * | Portal | File | Audience | Data scope |
 * |--------|------|----------|------------|
 * | Super Admin | ziric-superadmin-console.html | ZiricAI platform operators | All tenants, company selector |
 * | Company Portal | company-portal.html | Company admins & staff | Single companyId from user profile |
 *
 * Tenant isolation: every API call and demo-data filter uses `state.companyId`
 * derived from the logged-in user's profile. Super Admin users are redirected
 * to the Super Admin Console. Demo mode maps any Firebase user to
 * `demo-central-motors` (Central Motors) until Firestore profiles are enabled.
 */
import { state, setState } from './core/dataStore.js';
import { applyTheme, toggleTheme, showToast } from '../admin/ui.js';
import { registerApiErrorToast } from '../shared/apiRequest.js';
import { initRouter, navigateTo } from './router.js';
import { initAuthGuard, bindLoginForm, bindLogout } from './auth-guard.js';
import { renderNotificationDrawer } from './modules/notifications.js';
import { initPortalSarah } from './sarah/sarah-ui.js';
import { initAppShell, applySidebarVisibility } from './core/appShell.js';

export async function bootstrap() {
  if (location.protocol === 'file:') {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:sans-serif;">Run a local HTTP server (e.g. <code>npm run dev</code>) — ES modules cannot load from file://.</p>';
    return;
  }

  try {
    applyTheme(state.theme);
    registerApiErrorToast(showToast);
    bindLoginForm();
    bindLogout();
    initRouter();
    bindShellEvents();

    initAuthGuard({
      onReady: () => {
        initAppShell();
        applySidebarVisibility();
        initPortalSarah();
        navigateTo('dashboard');
      },
    });
  } catch (err) {
    console.error('[portal] Bootstrap failed:', err);
    const status = document.getElementById('loginStatus');
    const message = err?.message || 'Failed to load portal. Refresh the page or contact support.';
    if (status) status.textContent = message;
    showToast?.(message, 'error');
  }
}

function bindShellEvents() {
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = toggleTheme();
    setState({ theme: next });
    showToast(`Theme: ${next}`, 'info');
  });

  document.getElementById('notificationBell')?.addEventListener('click', () => {
    const drawer = document.getElementById('notificationDrawer');
    const overlay = document.getElementById('overlay');
    if (drawer) {
      drawer.classList.toggle('open');
      overlay?.classList.toggle('open', drawer.classList.contains('open'));
      renderNotificationDrawer();
    }
  });

  document.querySelector('.view-all-notifications')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('notificationDrawer')?.classList.remove('open');
    document.getElementById('overlay')?.classList.remove('open');
    navigateTo('notifications');
  });

  document.getElementById('closeNotificationDrawer')?.addEventListener('click', () => {
    document.getElementById('notificationDrawer')?.classList.remove('open');
  });

  document.getElementById('overlay')?.addEventListener('click', () => {
    document.getElementById('notificationDrawer')?.classList.remove('open');
    document.getElementById('overlay')?.classList.remove('open');
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      toggleTheme();
    }
    if (e.key === 'Escape') {
      document.getElementById('notificationDrawer')?.classList.remove('open');
      document.getElementById('overlay')?.classList.remove('open');
      document.getElementById('sidebar')?.classList.remove('open');
    }
  });
}

document.addEventListener('DOMContentLoaded', bootstrap);
