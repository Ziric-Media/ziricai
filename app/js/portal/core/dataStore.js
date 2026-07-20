/**
 * Portal BOS — centralized state + pub/sub cache invalidation.
 * Wraps legacy state.js for backward compatibility with existing modules.
 */
import { state as legacyState, setState as legacySetState } from '../state.js';

/** @type {Map<string, Set<(value: unknown) => void>>} */
const subscribers = new Map();

export const state = legacyState;

/** Extended BOS fields (merged into legacy state object). */
Object.assign(state, {
  hubData: null,
  hubFetchedAt: null,
  workspace: null,
  moduleCache: {},
});

/**
 * @param {Partial<typeof state>} patch
 */
export function setState(patch) {
  legacySetState(patch);
  notify('state', patch);
  if (patch.hubData !== undefined) notify('hubData', state.hubData);
  if (patch.notifications !== undefined) notify('notifications', state.notifications);
  if (patch.unreadNotifications !== undefined) notify('unreadNotifications', state.unreadNotifications);
}

/**
 * @param {string} key
 * @param {(value: unknown) => void} fn
 * @returns {() => void}
 */
export function subscribe(key, fn) {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(fn);
  return () => subscribers.get(key)?.delete(fn);
}

/**
 * @param {string} key
 * @param {unknown} [value]
 */
export function notify(key, value) {
  subscribers.get(key)?.forEach((fn) => {
    try {
      fn(value);
    } catch (err) {
      console.error(`[dataStore] subscriber error (${key}):`, err);
    }
  });
}

/**
 * Invalidate cached API responses and hub snapshot.
 * @param {string | string[]} [keys] — cache keys; omit to clear all
 */
export function invalidateCache(keys) {
  if (!keys) {
    setState({ hubData: null, hubFetchedAt: null, moduleCache: {} });
    notify('cacheInvalidated', null);
    return;
  }
  const list = Array.isArray(keys) ? keys : [keys];
  const moduleCache = { ...state.moduleCache };
  list.forEach((k) => delete moduleCache[k]);
  const patch = { moduleCache };
  if (list.includes('hub')) {
    patch.hubData = null;
    patch.hubFetchedAt = null;
  }
  setState(patch);
  notify('cacheInvalidated', list);
}

export function requireCompanyId() {
  if (!state.companyId) throw new Error('No company context — tenant scope missing.');
  return state.companyId;
}
