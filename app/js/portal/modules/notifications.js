import { state, setState } from '../core/dataStore.js';
import { escapeHtml, pageHeader, errorState, showToast } from '../../admin/ui.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { fetchTenantNotifications, markAllNotificationsRead } from '../api.js';
import { updateNotificationBadge } from '../auth-guard.js';
import { invalidateHub } from '../core/dataService.js';

const RETRY_BTN = '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>';

function formatNotificationTime(n) {
  if (typeof n?.time === 'string' && n.time.trim()) return n.time.trim();
  const raw = n?.createdAt;
  if (typeof raw === 'string') return raw.slice(0, 16).replace('T', ' ');
  if (raw && typeof raw === 'object') {
    if (typeof raw.toDate === 'function') {
      return raw.toDate().toISOString().slice(0, 16).replace('T', ' ');
    }
    if (raw._seconds != null) {
      return new Date(raw._seconds * 1000).toISOString().slice(0, 16).replace('T', ' ');
    }
  }
  return '';
}

export async function renderNotifications(container) {
  const companyId = state.companyId;

  const res = await fetchTenantNotifications(companyId);

  if (res.error) {
    container.innerHTML = `
      ${pageHeader('Notifications', 'Alerts for workflows, billing, and customer activity.')}
      ${errorState(res.error)}
      <div style="text-align:center;margin-top:12px;">${RETRY_BTN}</div>`;
    return;
  }

  const items = res.data?.items || [];

  setState({ notifications: items, unreadNotifications: items.filter((n) => !n.read).length });
  updateNotificationBadge();

  container.innerHTML = `
    ${pageHeader('Notifications', 'Alerts for workflows, billing, and customer activity.')}
    <div class="notification-list-page">
      ${items.length
        ? items.map((n) => notificationItem(n)).join('')
        : renderEmptyState({ message: 'No notifications.' })}
    </div>
    ${items.length ? `<button class="btn btn-secondary btn-sm" type="button" id="markAllReadBtn" style="margin-top:16px;">Mark all read</button>` : ''}
  `;

  container.querySelector('#markAllReadBtn')?.addEventListener('click', async () => {
    const result = await markAllNotificationsRead(companyId);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
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
    : `<p class="empty-drawer">${renderEmptyState({ message: 'No notifications' })}</p>`;
}

function notificationItem(n, compact = false) {
  return `
    <div class="notification-item ${n.read ? '' : 'unread'} ${compact ? 'compact' : ''}" data-id="${escapeHtml(n.id)}">
      <div class="notification-icon"><i class="fa-solid ${escapeHtml(n.icon || 'fa-bell')}"></i></div>
      <div class="notification-content">
        <div class="notification-title">${escapeHtml(n.title || n.message || 'Notification')}</div>
        <div class="notification-time">${escapeHtml(formatNotificationTime(n))}</div>
      </div>
    </div>`;
}
