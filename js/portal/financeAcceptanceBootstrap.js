/**
 * Localhost Finance browser acceptance — separate entry (no Firebase login).
 * Active only on finance-acceptance.html served against acceptance API mode.
 */
import { state } from './core/dataStore.js';
import { applyTheme, showToast } from '../admin/ui.js';
import { registerApiErrorToast } from '../shared/apiRequest.js';
import { initRouter, navigateTo } from './router.js';
import { initAppShell, applySidebarVisibility } from './core/appShell.js';
import { bindLogout } from './auth-guard.js';
import {
  establishAcceptancePortalState,
  hideAuthScreens,
} from './financeAcceptanceSession.js';

function showBootstrapError(message) {
  const status = document.getElementById('loginStatus');
  if (status) status.textContent = message;
  showToast(message, 'error');
}

export async function bootstrapFinanceAcceptance() {
  if (location.protocol === 'file:') {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:sans-serif;">Run the finance acceptance server and open <code>/app/finance-acceptance.html</code>.</p>';
    return;
  }

  try {
    registerApiErrorToast(showToast);
    applyTheme(state.theme);
    bindLogout();
    initRouter();

    const params = new URLSearchParams(location.search);
    await establishAcceptancePortalState({
      role: params.get('role') === 'viewer' ? 'viewer' : 'owner',
      seed: params.get('seed') || '',
    });

    hideAuthScreens();
    initAppShell();
    applySidebarVisibility();
    navigateTo('finance');
  } catch (err) {
    console.error('[finance-acceptance]', err);
    showBootstrapError(err?.message || 'Acceptance bootstrap failed');
  }
}

bootstrapFinanceAcceptance();
