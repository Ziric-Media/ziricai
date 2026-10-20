/**
 * Allowed Client Portal navigation targets for Sarah uiHints (matches router page ids).
 */
export const PORTAL_NAV_TARGETS = {
    dashboard: { label: "Overview", permission: null },
    sarah: { label: "Sarah", permission: null },
    conversations: { label: "Sarah Sales", permission: "canViewInbox" },
    finance: { label: "Sarah Finance", permission: "canViewFinance" },
    hr: { label: "Sarah HR", permission: "canViewTasks" },
    customers: { label: "CRM", permission: "canViewInbox" },
    appointments: { label: "Appointments", permission: "canViewInbox" },
    operations: { label: "Operations", permission: "canViewTasks" },
    agents: { label: "AI Employees", permission: "canEditAI" },
    knowledge: { label: "Knowledge Base", permission: "canEditAI" },
    automation: { label: "Automation", permission: "canEditAI" },
    analytics: { label: "Analytics", permission: "canExportData" },
    marketplace: { label: "Marketplace", permission: "canEditAI" },
    billing: { label: "Billing", permission: "canViewBilling" },
    integrations: { label: "Integrations", permission: "canManageIntegrations" },
    team: { label: "Team", permission: "canManageStaff" },
    notifications: { label: "Notifications", permission: null },
    activity: { label: "Activity Log", permission: "canManageStaff" },
    settings: { label: "Settings", permission: "canManageStaff" },
    support: { label: "Support", permission: null },
};

export function resolvePortalNavTarget(pageId) {
    const key = String(pageId || "").trim().toLowerCase();
    return PORTAL_NAV_TARGETS[key] ? { page: key, ...PORTAL_NAV_TARGETS[key] } : null;
}

/** Portal lazyLoader module ids (keep in sync with js/portal/core/lazyLoader.js). */
export const PORTAL_MODULE_IDS = [
    "dashboard",
    "sarah",
    "agents",
    "knowledge",
    "customers",
    "conversations",
    "finance",
    "hr",
    "appointments",
    "operations",
    "automation",
    "analytics",
    "marketplace",
    "billing",
    "integrations",
    "settings",
    "notifications",
    "support",
    "team",
    "activity",
];

/**
 * Filter uiHints to registered portal routes the role may open (server-side).
 * @param {Array<{ navigate?: string, openWizard?: string }>} hints
 * @param {string} role
 * @param {(role: string, perm: string) => boolean} canFn
 */
export function sanitizeNavigateUiHints(hints, role, canFn) {
    const out = [];
    for (const hint of hints || []) {
        if (hint.openWizard) {
            out.push(hint);
            continue;
        }
        if (!hint.navigate) continue;
        const target = resolvePortalNavTarget(hint.navigate);
        if (!target || !PORTAL_MODULE_IDS.includes(target.page)) continue;
        if (target.permission && !canFn(role, target.permission)) continue;
        out.push({ navigate: target.page });
    }
    return out;
}
