/**
 * Click-to-navigate for in-app notifications (workforce instructions, etc.).
 */
import { state } from './core/dataStore.js';
import { navigateTo } from './router.js';
import { navigateFromNotificationMeta } from './portalWorkforceNav.js';
import { dismissShellOverlays } from './core/shellOverlay.js';

function notificationById(id) {
  return (state.notifications || []).find((n) => n.id === id);
}

/**
 * @param {HTMLElement} root
 */
export function bindNotificationItemNavigation(root) {
  if (!root || root.dataset.notificationNavBound === '1') return;
  root.dataset.notificationNavBound = '1';

  root.addEventListener('click', (e) => {
    const item = e.target.closest('.notification-item[data-id]');
    if (!item) return;
    const id = item.getAttribute('data-id');
    const notification = notificationById(id);
    const navigate = notification?.meta?.navigate;
    if (!navigate?.page) return;

    e.preventDefault();
    const resolved = navigateFromNotificationMeta(navigate);
    if (!resolved?.page) return;
    dismissShellOverlays();
    navigateTo(resolved.page);
  });
}
