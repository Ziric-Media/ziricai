/**
 * Canonical API route catalog grouped by domain.
 * Source of truth for route documentation — see docs/architecture/API.md.
 *
 * Tenant routes MUST use requireTenantScope() (strict or optional per route).
 * Legacy routes remain unscoped during Phase 1–2 migration.
 */

/** API version sent on all /api/* responses (header: X-API-Version) */
export const API_VERSION = "1";

/**
 * @typedef {object} RouteDefinition
 * @property {string} method
 * @property {string} path
 * @property {string} domain
 * @property {boolean} tenantScoped
 * @property {boolean} [tenantOptional]
 * @property {string} description
 */

/** @type {RouteDefinition[]} */
export const ROUTE_CATALOG = [
    // Health & platform
    { method: "GET", path: "/api/health", domain: "platform", tenantScoped: false, description: "Public liveness probe (status + timestamp)" },
    { method: "GET", path: "/health", domain: "platform", tenantScoped: false, description: "Public liveness probe alias (status + timestamp)" },
    { method: "GET", path: "/api/platform/health", domain: "platform", tenantScoped: false, description: "Full operational diagnostics (platform auth)" },
    { method: "GET", path: "/api/admin/config", domain: "platform", tenantScoped: false, description: "Admin config snapshot (platform auth, masked secrets)" },
    { method: "GET", path: "/api/integrations/health", domain: "integrations", tenantScoped: false, description: "Integration hub diagnostics (platform auth)" },

    // Operations (superadmin)
    { method: "GET", path: "/api/operations/platform-dashboard", domain: "operations", tenantScoped: false, description: "MC platform dashboard read facade (?scope=platform|tenant&companyId= when tenant)" },
    { method: "GET", path: "/api/operations/platform-executive-overview", domain: "operations", tenantScoped: false, description: "Mission Control executive KPI overview (read-only)" },
    { method: "GET", path: "/api/operations/platform-billing-console", domain: "operations", tenantScoped: false, description: "Mission Control platform billing table (read-only)" },
    { method: "GET", path: "/api/operations/platform-integrations", domain: "operations", tenantScoped: false, description: "Mission Control integrations matrix (read-only)" },
    { method: "GET", path: "/api/operations/platform-analytics-overview", domain: "operations", tenantScoped: false, description: "ZiricAI platform analytics overview (read-only)" },
    { method: "GET", path: "/api/operations/platform-support-cases", domain: "operations", tenantScoped: false, description: "Mission Control support cases (read-only)" },
    { method: "POST", path: "/api/operations/sarah/chat", domain: "operations", tenantScoped: false, description: "Mission Control Sarah operator chat" },
    { method: "GET", path: "/api/operations/metrics", domain: "operations", tenantScoped: false, description: "Platform metrics (optional ?companyId= for tenant CRM aggregation)" },
    { method: "GET", path: "/api/operations/tenant/:companyId/metrics", domain: "operations", tenantScoped: false, description: "Read-only tenant CRM metrics for Mission Control" },
    { method: "GET", path: "/api/operations/tenant/:companyId/analytics/timeseries", domain: "operations", tenantScoped: false, description: "Read-only tenant analytics time-series for Mission Control" },
    { method: "GET", path: "/api/operations/activity", domain: "operations", tenantScoped: false, description: "Platform activity feed (optional ?companyId=)" },
    { method: "GET", path: "/api/operations/command-center", domain: "operations", tenantScoped: false, description: "Command center dashboard" },

    // Portal (tenant-scoped)
    { method: "GET", path: "/api/portal/workspace/:companyId", domain: "portal", tenantScoped: true, description: "Full workspace snapshot" },
    { method: "GET", path: "/api/portal/company/:companyId", domain: "portal", tenantScoped: true, description: "Company profile" },
    { method: "PATCH", path: "/api/portal/company/:companyId", domain: "portal", tenantScoped: true, description: "Update branding" },
    { method: "GET", path: "/api/portal/team/:companyId", domain: "portal", tenantScoped: true, description: "Team roster" },
    { method: "GET", path: "/api/portal/notifications/:companyId", domain: "portal", tenantScoped: true, description: "Notifications inbox" },
    { method: "GET", path: "/api/portal/activity/:companyId", domain: "portal", tenantScoped: true, description: "Activity feed" },
    { method: "GET", path: "/api/portal/usage/:companyId", domain: "portal", tenantScoped: true, description: "Usage metrics" },
    { method: "GET", path: "/api/portal/dashboard/:companyId", domain: "portal", tenantScoped: true, description: "Portal dashboard" },
    { method: "GET", path: "/api/portal/hub/:companyId", domain: "portal", tenantScoped: true, description: "Unified BOS hub snapshot" },
    { method: "GET", path: "/api/portal/analytics/:companyId", domain: "portal", tenantScoped: true, description: "Portal analytics snapshot" },

    // Company workspace (tenant-scoped)
    { method: "GET", path: "/api/companies/:companyId", domain: "workspace", tenantScoped: true, description: "Company root document" },
    { method: "PATCH", path: "/api/companies/:companyId", domain: "workspace", tenantScoped: true, description: "Update company" },
    { method: "POST", path: "/api/companies", domain: "workspace", tenantScoped: false, description: "Create + provision company" },
    { method: "POST", path: "/api/companies/:companyId/suspend", domain: "workspace", tenantScoped: true, description: "Suspend company" },
    { method: "POST", path: "/api/companies/:companyId/archive", domain: "workspace", tenantScoped: true, description: "Archive company" },
    { method: "GET", path: "/api/companies/:companyId/departments", domain: "workspace", tenantScoped: true, description: "List departments" },
    { method: "POST", path: "/api/companies/:companyId/departments", domain: "workspace", tenantScoped: true, description: "Create department" },
    { method: "PATCH", path: "/api/companies/:companyId/departments/:deptId", domain: "workspace", tenantScoped: true, description: "Update department" },
    { method: "DELETE", path: "/api/companies/:companyId/departments/:deptId", domain: "workspace", tenantScoped: true, description: "Delete department" },
    { method: "GET", path: "/api/companies/:companyId/team", domain: "workspace", tenantScoped: true, description: "Team roster" },
    { method: "POST", path: "/api/companies/:companyId/team/invite", domain: "workspace", tenantScoped: true, description: "Invite team member (stub)" },
    { method: "PATCH", path: "/api/companies/:companyId/team/:uid", domain: "workspace", tenantScoped: true, description: "Update member role" },

    // Analytics
    { method: "GET", path: "/api/analytics/dashboard/:companyId", domain: "analytics", tenantScoped: true, description: "BI dashboard snapshot" },
    { method: "GET", path: "/api/analytics/events/:companyId", domain: "analytics", tenantScoped: true, description: "Paginated event log" },
    { method: "GET", path: "/api/analytics/popular-questions/:companyId", domain: "analytics", tenantScoped: true, description: "Popular knowledge questions" },

    // Automations (tenant TenantRepository — workflowRegistry)
    { method: "GET", path: "/api/automations/:companyId", domain: "automations", tenantScoped: true, description: "List tenant automations" },
    { method: "POST", path: "/api/automations/:companyId", domain: "automations", tenantScoped: true, description: "Create/update automation" },
    { method: "POST", path: "/api/automations/:companyId/:workflowId/run", domain: "automations", tenantScoped: true, description: "Manual trigger" },
    { method: "GET", path: "/api/automations/:companyId/runs", domain: "automations", tenantScoped: true, description: "Execution log" },

    // Workflow studio (legacy in-memory builder — workflowService)
    { method: "GET", path: "/api/workflows", domain: "workflows", tenantScoped: true, tenantOptional: true, description: "List visual workflows (demo store)" },
    { method: "POST", path: "/api/workflows", domain: "workflows", tenantScoped: true, tenantOptional: true, description: "Create visual workflow" },
    { method: "GET", path: "/api/workflows/templates", domain: "workflows", tenantScoped: false, description: "Workflow templates" },
    { method: "GET", path: "/api/workflows/:id", domain: "workflows", tenantScoped: true, tenantOptional: true, description: "Get visual workflow" },

    // CRM (tenant-scoped)
    { method: "GET", path: "/api/companies/:companyId/crm/customers", domain: "crm", tenantScoped: true, description: "List tenant customers" },
    { method: "GET", path: "/api/companies/:companyId/crm/leads", domain: "crm", tenantScoped: true, description: "List tenant leads" },
    { method: "POST", path: "/api/companies/:companyId/crm/leads", domain: "crm", tenantScoped: true, description: "Create lead" },
    { method: "GET", path: "/api/companies/:companyId/crm/pipeline", domain: "crm", tenantScoped: true, description: "CRM pipeline stages" },
    { method: "GET", path: "/api/companies/:companyId/crm/tasks", domain: "crm", tenantScoped: true, description: "CRM tasks" },

    // Support cases (tenant-scoped — MC-U-4C)
    { method: "GET", path: "/api/companies/:companyId/support/cases", domain: "support", tenantScoped: true, description: "List tenant support cases" },
    { method: "POST", path: "/api/companies/:companyId/support/cases", domain: "support", tenantScoped: true, description: "Create support case" },
    { method: "GET", path: "/api/companies/:companyId/support/cases/:caseId", domain: "support", tenantScoped: true, description: "Get support case" },
    { method: "PATCH", path: "/api/companies/:companyId/support/cases/:caseId", domain: "support", tenantScoped: true, description: "Update support case" },

    // Conversations (tenant unified inbox)
    { method: "GET", path: "/api/companies/:companyId/conversations", domain: "conversations", tenantScoped: true, description: "Unified inbox list" },
    { method: "POST", path: "/api/companies/:companyId/conversations/:id/reply", domain: "conversations", tenantScoped: true, description: "Human reply via Integration Hub" },

    // Appointments
    { method: "GET", path: "/api/companies/:companyId/appointments", domain: "appointments", tenantScoped: true, description: "List appointments" },
    { method: "POST", path: "/api/companies/:companyId/appointments", domain: "appointments", tenantScoped: true, description: "Create appointment" },

    // Notifications (tenant)
    { method: "GET", path: "/api/companies/:companyId/notifications", domain: "notifications", tenantScoped: true, description: "Tenant notifications" },

    // Reports
    { method: "GET", path: "/api/companies/:companyId/reports/weekly", domain: "reporting", tenantScoped: true, description: "Weekly summary report" },

    // Ops summary
    { method: "GET", path: "/api/companies/:companyId/ops/summary", domain: "portal", tenantScoped: true, description: "Customer ops snapshot" },

    // CRM (legacy adapter — migrating to tenant paths)
    { method: "GET", path: "/api/customers", domain: "crm", tenantScoped: true, tenantOptional: true, description: "List customers (legacy adapter)" },
    { method: "GET", path: "/api/customers/:phone", domain: "crm", tenantScoped: true, tenantOptional: true, description: "Customer profile" },
    { method: "PATCH", path: "/api/customers/:phone", domain: "crm", tenantScoped: true, tenantOptional: true, description: "Update customer" },
    { method: "GET", path: "/api/customers/:phone/timeline", domain: "crm", tenantScoped: true, tenantOptional: true, description: "Customer timeline" },

    // Conversations (legacy adapter)
    { method: "GET", path: "/api/conversations", domain: "conversations", tenantScoped: true, tenantOptional: true, description: "List conversations" },
    { method: "GET", path: "/api/conversations/:id/messages", domain: "conversations", tenantScoped: true, tenantOptional: true, description: "Conversation messages" },

    // Knowledge (legacy flat + memory adapter)
    { method: "GET", path: "/api/companies/:companyId/knowledge/documents", domain: "knowledge", tenantScoped: true, description: "List tenant knowledge documents" },
    { method: "POST", path: "/api/companies/:companyId/knowledge/documents", domain: "knowledge", tenantScoped: true, description: "Create tenant knowledge document" },
    { method: "PATCH", path: "/api/companies/:companyId/knowledge/documents/:docId", domain: "knowledge", tenantScoped: true, description: "Update tenant knowledge document" },
    { method: "DELETE", path: "/api/companies/:companyId/knowledge/documents/:docId", domain: "knowledge", tenantScoped: true, description: "Delete tenant knowledge document" },
    { method: "POST", path: "/api/companies/:companyId/knowledge/upload", domain: "knowledge", tenantScoped: true, description: "Upload tenant knowledge file" },
    { method: "GET", path: "/api/knowledge", domain: "knowledge", tenantScoped: true, tenantOptional: true, description: "List knowledge docs (legacy alias)" },
    { method: "POST", path: "/api/knowledge", domain: "knowledge", tenantScoped: true, description: "Create knowledge doc (legacy alias)" },
    { method: "POST", path: "/api/knowledge/upload", domain: "knowledge", tenantScoped: true, description: "Upload knowledge file (legacy alias)" },

    // Sarah AI
    { method: "POST", path: "/api/sarah/chat", domain: "sarah", tenantScoped: true, tenantOptional: true, description: "Sarah chat" },
    { method: "GET", path: "/api/sarah/tools", domain: "sarah", tenantScoped: true, tenantOptional: true, description: "Available Sarah tools" },

    // Billing plans (catalog only — no payment SDK)
    { method: "GET", path: "/api/billing/plans", domain: "billing", tenantScoped: false, description: "Plan catalog" },
    { method: "GET", path: "/api/billing/plans/:planId", domain: "billing", tenantScoped: false, description: "Plan detail" },
    { method: "POST", path: "/api/billing/check-limit", domain: "billing", tenantScoped: false, description: "Plan limit check" },

    // Onboarding
    { method: "GET", path: "/api/onboarding/industries", domain: "onboarding", tenantScoped: false, description: "Industry list" },
    { method: "POST", path: "/api/onboarding/start", domain: "onboarding", tenantScoped: false, description: "Start onboarding session" },
    { method: "POST", path: "/api/onboarding/provision", domain: "onboarding", tenantScoped: false, description: "Provision tenant from wizard" },

    // Platform provisioning
    { method: "POST", path: "/api/platform/provision/company", domain: "platform", tenantScoped: false, description: "Provision company workspace" },
    { method: "POST", path: "/api/platform/provision/agent", domain: "platform", tenantScoped: false, description: "Provision AI employee" },
    { method: "GET", path: "/api/platform/companies", domain: "platform", tenantScoped: false, description: "Super Admin company directory (Firestore)" },
    { method: "GET", path: "/api/platform/companies/:companyId", domain: "platform", tenantScoped: false, description: "Super Admin company record (Firestore)" },
    { method: "POST", path: "/api/platform/companies", domain: "platform", tenantScoped: false, description: "Super Admin create company" },
    { method: "PATCH", path: "/api/platform/companies/:companyId", domain: "platform", tenantScoped: false, description: "Super Admin update company" },
    { method: "DELETE", path: "/api/platform/companies/:companyId", domain: "platform", tenantScoped: false, description: "Super Admin delete company root" },
    { method: "GET", path: "/api/platform/companies/:companyId/links", domain: "platform", tenantScoped: false, description: "Admin navigation links (platform auth)" },
    { method: "GET", path: "/api/platform/companies/:companyId/integrations/whatsapp", domain: "platform", tenantScoped: false, description: "Super Admin read WhatsApp integration (sanitized)" },
    { method: "POST", path: "/api/platform/companies/:companyId/integrations/whatsapp/register", domain: "platform", tenantScoped: false, description: "Super Admin register WhatsApp integration" },
    { method: "PATCH", path: "/api/platform/companies/:companyId/integrations/whatsapp", domain: "platform", tenantScoped: false, description: "Super Admin configure WhatsApp integration" },
    { method: "POST", path: "/api/platform/companies/:companyId/integrations/whatsapp/activate", domain: "platform", tenantScoped: false, description: "Super Admin activate WhatsApp integration" },
    { method: "POST", path: "/api/platform/companies/:companyId/integrations/whatsapp/deactivate", domain: "platform", tenantScoped: false, description: "Super Admin deactivate WhatsApp integration" },

    // Marketplace
    { method: "GET", path: "/api/marketplace/catalog", domain: "marketplace", tenantScoped: false, description: "Browse industry packs" },
    { method: "GET", path: "/api/marketplace/packs/:packId/reviews", domain: "marketplace", tenantScoped: false, description: "Published customer reviews for pack" },
    { method: "GET", path: "/api/marketplace/packs/:packId/rating", domain: "marketplace", tenantScoped: false, description: "Durable rating aggregate for pack" },
    { method: "GET", path: "/api/marketplace/installed/:companyId", domain: "marketplace", tenantScoped: true, description: "Installed packs for tenant" },
    { method: "GET", path: "/api/marketplace/lifecycle/:companyId", domain: "marketplace", tenantScoped: true, description: "Marketplace install lifecycle (all registry statuses)" },
    { method: "GET", path: "/api/marketplace/entitlements/:companyId", domain: "marketplace", tenantScoped: true, description: "Tenant pack entitlement list (read-only)" },
    { method: "GET", path: "/api/marketplace/entitlements/:companyId/:packId", domain: "marketplace", tenantScoped: true, description: "Tenant pack entitlement for one pack (read-only)" },
    { method: "POST", path: "/api/platform/marketplace/entitlements", domain: "platform", tenantScoped: false, description: "Platform grant marketplace pack entitlement" },
    { method: "PATCH", path: "/api/platform/marketplace/entitlements/:companyId/:packId", domain: "platform", tenantScoped: false, description: "Platform revoke or update pack entitlement expiry" },
    { method: "DELETE", path: "/api/platform/marketplace/entitlements/:companyId/:packId", domain: "platform", tenantScoped: false, description: "Platform soft-revoke pack entitlement" },
    { method: "POST", path: "/api/marketplace/install", domain: "marketplace", tenantScoped: true, tenantOptional: true, description: "Install industry pack" },
    { method: "POST", path: "/api/marketplace/review", domain: "marketplace", tenantScoped: true, description: "Submit pack review (installed tenant; server-resolved author)" },

    // Webhooks (no tenant middleware)
    { method: "GET", path: "/webhook", domain: "integrations", tenantScoped: false, description: "Legacy WhatsApp verify" },
    { method: "POST", path: "/webhook", domain: "integrations", tenantScoped: false, description: "Legacy WhatsApp inbound" },
    { method: "GET", path: "/webhooks/:channel", domain: "integrations", tenantScoped: false, description: "Unified webhook verify" },
    { method: "POST", path: "/webhooks/:channel/:companyId?", domain: "integrations", tenantScoped: false, description: "Unified webhook inbound" },
];

/**
 * Group routes by domain for documentation and tooling.
 * @returns {Record<string, RouteDefinition[]>}
 */
export function routesByDomain() {
    return ROUTE_CATALOG.reduce((acc, route) => {
        if (!acc[route.domain]) acc[route.domain] = [];
        acc[route.domain].push(route);
        return acc;
    }, {});
}

/**
 * Express middleware — attach API version header on /api/* responses.
 */
export function applyApiVersionHeader() {
    return (req, res, next) => {
        if (req.path.startsWith("/api/")) {
            res.setHeader("X-API-Version", API_VERSION);
        }
        next();
    };
}

/**
 * Routes that still read legacy flat collections (Phase 2 migration targets).
 */
export const LEGACY_ROUTE_PATHS = [
    "/api/customers",
    "/api/conversations",
    "/api/knowledge",
    "/webhook",
];
