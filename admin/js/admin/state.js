/** Shared application state for the Super Admin dashboard. */
export const state = {
  theme: localStorage.getItem('ziricai-theme') || 'light',
  currentPage: 'dashboard',
  /** When set, Customers module opens detail view for this phone/id */
  selectedCustomerPhone: null,
  /** null = platform-wide view; otherwise scoped to one company */
  selectedCompanyId: null,
  user: null,
  profile: null,
  companies: [],
  agents: [],
  customers: [],
  knowledge: [],
  billing: [],
  analytics: [],
  dashboardStats: null,
  backendHealth: null,
  backendConfig: null,
  loading: false,
  error: null,
};

export function setState(patch) {
  Object.assign(state, patch);
}

export function getSelectedCompany() {
  if (!state.selectedCompanyId) return null;
  return state.companies.find((c) => c.id === state.selectedCompanyId) || null;
}

export function companyScopeLabel() {
  const company = getSelectedCompany();
  return company ? company.name : 'All Companies';
}
