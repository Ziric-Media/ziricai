/** Company Admin Portal — tenant-scoped application state.
 * Extended by core/dataStore.js (hubData, moduleCache, pub/sub).
 */

export const state = {
  theme: localStorage.getItem('ziricai-theme') || 'light',
  currentPage: 'dashboard',
  selectedCustomerPhone: null,
  user: null,
  profile: null,
  /** Tenant scope — all queries filter by this ID */
  companyId: null,
  company: null,
  permissions: {},
  branding: null,
  notifications: [],
  unreadNotifications: 0,
  team: [],
  workspace: null,
  usage: null,
  loading: false,
  error: null,
};

export function setState(patch) {
  Object.assign(state, patch);
}

export function requireCompanyId() {
  if (!state.companyId) throw new Error('No company context — tenant scope missing.');
  return state.companyId;
}
