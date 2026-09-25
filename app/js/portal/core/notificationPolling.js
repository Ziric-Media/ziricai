import { state, setState } from './dataStore.js';
import { fetchTenantNotifications } from '../api.js';
import { fetchPortalNotifications } from './dataService.js';
import { shouldUseDemoFallback } from '../../shared/dataMode.js';

const POLL_MS = 25000;

/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;

/** @type {(() => void) | null} */
let onRefresh = null;

export function registerNotificationRefresh(fn) {
  onRefresh = fn;
}

export async function refreshNotificationsFromApi() {
  const companyId = state.companyId;
  if (!companyId) return null;

  const [tenantRes, portalRes] = await Promise.all([
    fetchTenantNotifications(companyId),
    fetchPortalNotifications(companyId, { force: true }),
  ]);

  const useDemo =
    portalRes.data?.isDemo ??
    tenantRes.data?.isDemo ??
    shouldUseDemoFallback({
      companyId,
      isDemo: state.hubData?.isDemo,
      isProvisioned: state.hubData?.isProvisioned,
    });

  if (tenantRes.error && !useDemo) return tenantRes;

  const items = tenantRes.data?.items || portalRes.data?.items || [];
  const unread = tenantRes.data?.unreadCount ?? items.filter((n) => !n.read).length;
  setState({ notifications: items, unreadNotifications: unread });
  onRefresh?.();
  return { items, unread, error: null };
}

export function startNotificationPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    refreshNotificationsFromApi().catch(() => {});
  }, POLL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshNotificationsFromApi().catch(() => {});
    }
  });
}

export function stopNotificationPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
