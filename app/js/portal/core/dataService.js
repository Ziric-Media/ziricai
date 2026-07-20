/**
 * Portal BOS — unified API layer with request deduplication + TTL cache.
 */
import { setState, state, invalidateCache } from './dataStore.js';

const HUB_TTL_MS = 60_000;
const DEFAULT_TTL_MS = 60_000;

/** @type {Map<string, Promise<{ data?: unknown, error?: string }>>} */
const inflight = new Map();

/** @type {Map<string, { expires: number, data: unknown }>} */
const cache = new Map();

async function request(path, options = {}) {
  try {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `Request failed (${res.status})` };
    return { data };
  } catch (error) {
    return { error: error.message || 'Network error' };
  }
}

/**
 * @param {string} key
 * @param {() => Promise<{ data?: unknown, error?: string }>} fetcher
 * @param {{ ttl?: number, force?: boolean }} [opts]
 */
export async function fetchCached(key, fetcher, opts = {}) {
  const ttl = opts.ttl ?? DEFAULT_TTL_MS;
  const now = Date.now();

  if (!opts.force) {
    const hit = cache.get(key);
    if (hit && hit.expires > now) return { data: hit.data };
    if (inflight.has(key)) return inflight.get(key);
  }

  const promise = fetcher().then((result) => {
    inflight.delete(key);
    if (result.data !== undefined && !result.error) {
      cache.set(key, { data: result.data, expires: now + ttl });
    }
    return result;
  });

  inflight.set(key, promise);
  return promise;
}

export function clearCacheKey(key) {
  cache.delete(key);
  inflight.delete(key);
}

export function clearAllCache() {
  cache.clear();
  inflight.clear();
}

/**
 * Prefetch hub snapshot on login (60s TTL).
 * @param {string} companyId
 * @param {{ force?: boolean }} [opts]
 */
export async function prefetchHub(companyId, opts = {}) {
  if (!companyId) return { error: 'No companyId' };

  const key = `hub:${companyId}`;
  const result = await fetchCached(
    key,
    () => request(`/api/portal/hub/${encodeURIComponent(companyId)}`),
    { ttl: HUB_TTL_MS, force: opts.force }
  );

  if (result.data) {
    const hub = result.data;
    const useDemoFallback = hub.isDemo === true && !hub.isProvisioned;

    setState({
      hubData: hub,
      hubFetchedAt: Date.now(),
      unreadNotifications: hub.notifications?.unreadCount ?? state.unreadNotifications,
      notifications: hub.notifications?.items?.length
        ? mergeNotifications(state.notifications, hub.notifications.items)
        : state.notifications,
      usage: useDemoFallback ? state.usage : (hub.usage || state.usage),
    });
  }

  if (result.error) {
    console.warn('[dataService] hub prefetch:', result.error);
  }

  return result;
}

function mergeNotifications(existing, hubItems) {
  const byId = new Map((existing || []).map((n) => [n.id, n]));
  hubItems.forEach((n) => byId.set(n.id, { ...byId.get(n.id), ...n }));
  return [...byId.values()];
}

/**
 * @param {string} companyId
 * @param {{ force?: boolean }} [opts]
 */
export async function getHubData(companyId, opts = {}) {
  const fresh =
    !opts.force &&
    state.hubData &&
    state.hubFetchedAt &&
    Date.now() - state.hubFetchedAt < HUB_TTL_MS &&
    state.hubData.companyId === companyId;

  if (fresh) return { data: state.hubData };

  return prefetchHub(companyId, opts);
}

export async function fetchPortalNotifications(companyId, opts = {}) {
  const key = `notifications:${companyId}`;
  return fetchCached(key, () => request(`/api/portal/notifications/${encodeURIComponent(companyId)}`), opts);
}

export async function fetchPortalDashboard(companyId, opts = {}) {
  const key = `dashboard:${companyId}`;
  return fetchCached(key, () => request(`/api/portal/dashboard/${encodeURIComponent(companyId)}`), opts);
}

export async function fetchConversations(companyId, opts = {}) {
  const key = `conversations:${companyId}`;
  return fetchCached(
    key,
    () => request(`/api/companies/${encodeURIComponent(companyId)}/conversations`),
    opts
  );
}

export function invalidateHub() {
  clearCacheKey(`hub:${state.companyId}`);
  invalidateCache('hub');
  setState({ hubData: null, hubFetchedAt: null });
}

export function invalidateAllPortalCache() {
  clearAllCache();
  invalidateCache();
}

/** Re-export common portal endpoints with caching. */
export async function fetchPortalCompany(companyId) {
  return fetchCached(`company:${companyId}`, () =>
    request(`/api/portal/company/${encodeURIComponent(companyId)}`)
  );
}

export async function fetchPortalTeam(companyId) {
  return fetchCached(`team:${companyId}`, () =>
    request(`/api/portal/team/${encodeURIComponent(companyId)}`)
  );
}

export async function fetchPortalUsage(companyId) {
  return fetchCached(`usage:${companyId}`, () =>
    request(`/api/portal/usage/${encodeURIComponent(companyId)}`)
  );
}

export async function fetchWorkspaceSnapshot(companyId, opts = {}) {
  const key = `workspace:${companyId}`;
  return fetchCached(
    key,
    () => request(`/api/portal/workspace/${encodeURIComponent(companyId)}`),
    opts
  );
}

export async function fetchPortalActivity(companyId) {
  return fetchCached(`activity:${companyId}`, () =>
    request(`/api/portal/activity/${encodeURIComponent(companyId)}`)
  );
}
