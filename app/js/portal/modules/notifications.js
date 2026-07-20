import { state, setState } from '../core/dataStore.js';
import { escapeHtml, pageHeader, emptyState } from '../../admin/ui.js';
import { fetchTenantNotifications, markAllNotificationsRead } from '../api.js';
import { updateNotificationBadge } from '../auth-guard.js';
import { invalidateHub } from '../core/dataService.js';

export async function renderNotifications(container) {
  const companyId = state.companyId;

  const res = await fetchTenantNotifications(companyId);
  const items = res.data?.items || [];

  setState({ notifications: items, unreadNotifications: items.filter((n) => !n.read).length });
  updateNotificationBadge();

  container.innerHTML = `
    ${pageHeader('Notifications', 'Alerts for workflows, billing, and customer activity.')}
    <div class="notification-list-page">
      ${items.length
        ? items.map((n) => notificationItem(n)).join('')
        : emptyState('No notifications.')}
    </div>
    ${items.length ? `<button class="btn btn-secondary btn-sm" type="button" id="markAllReadBtn" style="margin-top:16px;">Mark all read</button>` : ''}
  `;

  container.querySelector('#markAllReadBtn')?.addEventListener('click', async () => {
    await markAllNotificationsRead(companyId);
    invalidateHub();
    renderNotifications(container);
  });
}

export async function renderNotificationDrawer() {
  const drawer = document.getElementById('notificationDrawerBody');
  if (!drawer) return;

  const hubItems = state.hubData?.notifications?.items;
  let items = hubItems?.length ? hubItems : state.notifications;

  if (!items?.length) {
    const companyId = state.companyId;
    const res = await fetchTenantNotifications(companyId);
    items = (res.data?.items || []).slice(0, 5);
  } else {
    items = items.slice(0, 5);
  }

  drawer.innerHTML = items.length
    ? items.map((n) => notificationItem(n, true)).join('')
    : `<p class="empty-drawer">${emptyState('No notifications')}</p>`;
}

function notificationItem(n, compact = false) {
  return `
    <div class="notification-item ${n.read ? '' : 'unread'} ${compact ? 'compact' : ''}" data-id="${escapeHtml(n.id)}">
      <div class="notification-icon ${escapeHtml(n.color || 'blue')}"><i class="fa-solid ${escapeHtml(n.icon || 'fa-bell')}"></i></div>
      <div class="notification-content">
        <div class="notification-title">${escapeHtml(n.title)}</div>
        <div class="notification-message">${escapeHtml(n.message)}</div>
        <div class="notification-time">${escapeHtml(n.time || '')}</div>
      </div>
    </div>
  `;
}
