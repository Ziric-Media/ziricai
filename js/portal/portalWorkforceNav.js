/**
 * Deep-link from workforce instruction notifications into module Sarah workspaces.
 */

const MODULE_PORTAL_NAV = {
  sales: { page: 'conversations', workspace: 'sarah' },
  finance: { page: 'finance', workspace: 'sarah' },
  operations: { page: 'operations', workspace: 'sarah' },
  hr: { page: 'hr', workspace: 'sarah' },
};

const STORAGE_KEY = 'portal-pending-sarah-nav';

export function portalNavForWorkforceModule(targetModule) {
  const mod = String(targetModule || '').trim().toLowerCase();
  return MODULE_PORTAL_NAV[mod] || null;
}

/** @param {string} targetModule */
export function stashWorkforceModuleNav(targetModule) {
  const nav = portalNavForWorkforceModule(targetModule);
  if (!nav) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nav));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {string} expectedPage portal router page id
 * @returns {string|null} workspace id (usually "sarah")
 */
export function consumePendingSarahNav(expectedPage) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const nav = JSON.parse(raw);
    if (!nav || nav.page !== expectedPage) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return nav.workspace || 'sarah';
  } catch {
    return null;
  }
}

/**
 * @param {{ page?: string, targetModule?: string, workspace?: string }} meta
 */
export function navigateFromNotificationMeta(meta = {}) {
  let page = meta.page;
  let workspace = meta.workspace || 'sarah';
  if (!page && meta.targetModule) {
    const nav = portalNavForWorkforceModule(meta.targetModule);
    if (nav) {
      page = nav.page;
      workspace = nav.workspace;
    }
  }
  if (!page) return null;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ page, workspace }));
  } catch {
    /* ignore */
  }
  return { page, workspace };
}
