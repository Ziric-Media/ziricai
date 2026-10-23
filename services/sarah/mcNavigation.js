/**
 * Mission Control console navigation targets (admin router page ids).
 * Not used by Client Portal — separate from portalNavigation.js.
 */

export const MC_NAV_TARGETS = {
    dashboard: { label: "Dashboard" },
    companies: { label: "Companies" },
    crm: { label: "CRM" },
    sarah: { label: "Sarah" },
    billing: { label: "Billing" },
    platformAnalytics: { label: "ZiricAI Analytics" },
    supportInbox: { label: "Support Inbox" },
    integrations: { label: "Integrations" },
    support: { label: "Support" },
    agents: { label: "AI Employees" },
    knowledge: { label: "Knowledge Base" },
    settings: { label: "Settings" },
};

const ALIASES = {
    overview: "dashboard",
    home: "dashboard",
    tenant: "companies",
    tenants: "companies",
    "all tenants": "companies",
    analytics: "platformAnalytics",
    "platform analytics": "platformAnalytics",
    "ziricai analytics": "platformAnalytics",
    "support inbox": "supportInbox",
    inbox: "supportInbox",
    "ai employees": "agents",
    employees: "agents",
    "knowledge base": "knowledge",
    whatsapp: "integrations",
};

export const MC_NAV_PAGE_IDS = Object.keys(MC_NAV_TARGETS);

/**
 * @param {string} pageKey
 * @returns {{ page: string, label: string } | null}
 */
export function resolveMcNavTarget(pageKey) {
    let key = String(pageKey || "").trim().toLowerCase();
    key = ALIASES[key] || key;
    if (!MC_NAV_TARGETS[key]) return null;
    return { page: key, label: MC_NAV_TARGETS[key].label };
}

export function isMcNavigationUiHint(hint) {
    return Boolean(hint && hint.navigateMc);
}

export function filterMcNavigationUiHints(hints = []) {
    return (hints || []).filter(isMcNavigationUiHint);
}
