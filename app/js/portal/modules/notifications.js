import { state, setState } from '../core/dataStore.js';
import { escapeHtml, pageHeader, errorState, showToast } from '../../admin/ui.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { fetchTenantNotifications, markAllNotificationsRead } from '../api.js';
import { updateNotificationBadge } from '../auth-guard.js';
import { invalidateHub } from '../core/dataService.js';
import {
  refreshNotificationsFromApi,
  startNotificationPolling,
  registerNotificationRefresh,
} from '../core/notificationPolling.js';

export { startNotificationPolling, stopNotificationPolling } from '../core/notificationPolling.js';

const RETRY_BTN = '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>';

function parseNotificationDate(n) {
  const raw = n?.createdAt;
  if (typeof raw === 'string') {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (raw && typeof raw === 'object') {
    if (typeof raw.toDate === 'function') return raw.toDate();
    if (raw._seconds != null) return new Date(raw._seconds * 1000);
  }
  return null;
}

function formatNotificationTime(n) {
  if (typeof n?.time === 'string' && n.time.trim() && n.time !== 'Just now') {
    if (!/^\d{4}-\d{2}-\d{2}/.test(n.time)) return n.time.trim();
  }
  const date = parseNotificationDate(n);
  if (!date) return '';
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

registerNotificationRefresh(() => updateNotificationBadge());

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

  setState({
    notifications: items,
    unreadNotifications: res.data?.unreadCount ?? items.filter((n) => !n.read).length,
  });
  updateNotificationBadge();
  startNotificationPolling();

  container.innerHTML = `
    ${pageHeader(
      'Notifications',
      'Live alerts from WhatsApp, appointments, and automations.',
      `<button class="btn btn-secondary btn-sm" type="button" id="refreshNotifications"><i class="fa-solid fa-rotate"></i> Refresh</button>`
    )}
    <div class="notification-list-page">
      ${items.length
        ? items.map((n) => notificationItem(n)).join('')
        : renderEmptyState({
            message: 'No notifications yet.',
            actionHtml:
              '<p class="muted" style="margin-top:8px;">New WhatsApp messages and bookings appear here automatically.</p>',
          })}
    </div>
    ${items.length ? `<button class="btn btn-secondary btn-sm" type="button" id="markAllReadBtn" style="margin-top:16px;">Mark all read</button>` : ''}
  `;

  container.querySelector('#refreshNotifications')?.addEventListener('click', async () => {
    await refreshNotificationsFromApi();
    renderNotifications(container);
  });

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

  await refreshNotificationsFromApi().catch(() => {});

  const items = (state.notifications || []).slice(0, 8);

  drawer.innerHTML = items.length
    ? items.map((n) => notificationItem(n, true)).join('')
    : `<p class="empty-drawer">${renderEmptyState({ message: 'No notifications yet' })}</p>`;
}

function notificationItem(n, compact = false) {
  const colorClass = n.color === 'red' ? 'red' : n.color === 'green' ? 'green' : n.color === 'yellow' ? 'yellow' : 'blue';
  const body = n.message && n.title && n.message !== n.title ? n.message : n.message || '';
  return `
    <div class="notification-item ${n.read ? '' : 'unread'} ${compact ? 'compact' : ''}" data-id="${escapeHtml(n.id)}">
      <div class="notification-icon ${escapeHtml(colorClass)}"><i class="fa-solid ${escapeHtml(n.icon || 'fa-bell')}"></i></div>
      <div class="notification-content">
        <div class="notification-title">${escapeHtml(n.title || 'Notification')}</div>
        ${body && !compact ? `<div class="notification-body muted">${escapeHtml(body)}</div>` : ''}
        <div class="notification-time">${escapeHtml(formatNotificationTime(n))}</div>
      </div>
    </div>`;
}
