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
    { method: "POST", path: "/api/users/bootstrap", domain: "consumer", tenantScoped: false, description: "Sarah App consumer profile bootstrap" },
    { method: "GET", path: "/api/users/profile", domain: "consumer", tenantScoped: false, description: "Sarah App consumer profile + preferences" },
    { method: "PATCH", path: "/api/users/profile", domain: "consumer", tenantScoped: false, description: "Update Sarah App consumer profile" },
    { method: "POST", path: "/api/personal-sarah/chat", domain: "consumer", tenantScoped: false, description: "Personal Sarah assistant chat" },
    { method: "GET", path: "/api/personal-sarah/sessions", domain: "consumer", tenantScoped: false, description: "List Personal Sarah sessions" },
    { method: "POST", path: "/api/personal-sarah/sessions", domain: "consumer", tenantScoped: false, description: "Create Personal Sarah session" },
    { method: "GET", path: "/api/personal-sarah/sessions/:id", domain: "consumer", tenantScoped: false, description: "Load Personal Sarah session" },
    { method: "GET", path: "/api/personal-sarah/sessions/active", domain: "consumer", tenantScoped: false, description: "Latest Personal Sarah session" },
    { method: "GET", path: "/api/personal-knowledge/sections", domain: "consumer", tenantScoped: false, description: "My Knowledge sections" },
    { method: "PUT", path: "/api/personal-knowledge/sections/:sectionKey", domain: "consumer", tenantScoped: false, description: "Update My Knowledge section" },

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
    { method: "GET", path: "/api/operations/platform-support-escalations", domain: "operations", tenantScoped: false, description: "Mission Control Sarah attention queue (read-only)" },
    { method: "GET", path: "/api/operations/platform-support-attention", domain: "operations", tenantScoped: false, description: "Support Attention Centre queues (read-only)" },
    { method: "POST", path: "/api/operations/platform-proactive-detection/run", domain: "operations", tenantScoped: false, description: "PI-4F-6 proactive detection scan → support lifecycle" },
    { method: "GET", path: "/api/operations/platform-support-operations", domain: "operations", tenantScoped: false, description: "Sarah support activity + remediation audit (read-only)" },
    { method: "GET", path: "/api/operations/platform-support-operations/:companyId/audits/:auditId", domain: "operations", tenantScoped: false, description: "Remediation audit drill-down" },
    { method: "GET", path: "/api/operations/platform-intelligence", domain: "operations", tenantScoped: false, description: "Platform Intelligence unified read facade (PI-4C)" },
    { method: "GET", path: "/api/operations/platform-communications", domain: "operations", tenantScoped: false, description: "Platform Intelligence communication rollups (PI-4A+)" },
    { method: "GET", path: "/api/operations/platform-user-network", domain: "operations", tenantScoped: false, description: "Platform Intelligence user network rollups (PI-4B+)" },
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
    { method: "POST", path: "/api/companies/:companyId/team/members", domain: "workspace", tenantScoped: true, description: "Create team member portal login" },
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

    // Revenue Management (R0)
    { method: "GET", path: "/api/revenue/catalogue/public", domain: "revenue", tenantScoped: false, description: "Public SKU catalogue" },
    { method: "GET", path: "/api/revenue/catalogue/skus/:skuId", domain: "revenue", tenantScoped: false, description: "SKU detail" },
    { method: "GET", path: "/api/revenue/entitlements/me", domain: "revenue", tenantScoped: false, description: "Consumer entitlements" },
    { method: "GET", path: "/api/revenue/config/public", domain: "revenue", tenantScoped: false, description: "Commercial activation flags (read)" },
    { method: "GET", path: "/api/platform/revenue/config", domain: "platform", tenantScoped: false, description: "MC revenue config" },
    { method: "GET", path: "/api/platform/revenue/catalogue", domain: "platform", tenantScoped: false, description: "MC full catalogue" },
    { method: "GET", path: "/api/platform/revenue/ledger", domain: "platform", tenantScoped: false, description: "MC revenue ledger" },
    { method: "POST", path: "/api/platform/revenue/ledger/dry-run", domain: "platform", tenantScoped: false, description: "MC ledger dry-run" },

    // Sarah Network (U4)
    { method: "POST", path: "/api/sarah-network/grants", domain: "consumer", tenantScoped: false, description: "Create consent grant" },
    { method: "GET", path: "/api/sarah-network/grants", domain: "consumer", tenantScoped: false, description: "List my consent grants (SNET-02)" },
    { method: "GET", path: "/api/sarah-network/grants/:grantId", domain: "consumer", tenantScoped: false, description: "Get consent grant" },
    { method: "POST", path: "/api/sarah-network/grants/:grantId/revoke", domain: "consumer", tenantScoped: false, description: "Revoke consent grant (SNET-02)" },
    { method: "POST", path: "/api/sarah-network/enquiries", domain: "consumer", tenantScoped: false, description: "Personal→Company enquiry" },
    { method: "GET", path: "/api/sarah-network/requests", domain: "consumer", tenantScoped: false, description: "List network requests" },
    { method: "GET", path: "/api/sarah-network/requests/:requestId", domain: "consumer", tenantScoped: false, description: "Get network request" },

    // SNET-01a — Network identity (tenant members / superadmin)
    { method: "GET", path: "/api/network/v1/entities", domain: "network", tenantScoped: true, description: "Network entity by companyId (?companyId=)" },
    { method: "GET", path: "/api/network/v1/entities/:snId", domain: "network", tenantScoped: true, description: "Network entity by SN-ID" },

    // SNET-03 — Listing / publish (tenant members; writes owner/manager)
    { method: "GET", path: "/api/network/v1/orgs/:companyId/listing", domain: "network", tenantScoped: true, description: "Listing draft + published state + missing fields" },
    { method: "PUT", path: "/api/network/v1/orgs/:companyId/listing", domain: "network", tenantScoped: true, description: "Save listing draft (validated public/restricted fields)" },
    { method: "POST", path: "/api/network/v1/orgs/:companyId/listing/publish", domain: "network", tenantScoped: true, description: "Publish listing to Discover (eligibility + completeness gate)" },
    { method: "POST", path: "/api/network/v1/orgs/:companyId/listing/unpublish", domain: "network", tenantScoped: true, description: "Remove listing from Discover" },
    { method: "GET", path: "/api/network/v1/entities/:snId/profile", domain: "consumer", tenantScoped: false, description: "Public entity profile (listed, non-suspended only)" },

    // SNET-04 — Verification
    { method: "GET", path: "/api/network/v1/orgs/:companyId/verification", domain: "network", tenantScoped: true, description: "Tenant verification status" },
    { method: "POST", path: "/api/network/v1/orgs/:companyId/verification", domain: "network", tenantScoped: true, description: "Submit for verification (optional evidence refs)" },
    { method: "POST", path: "/api/network/v1/orgs/:companyId/verification/evidence", domain: "network", tenantScoped: true, description: "Attach evidence references (https URL / external ref / uploaded file ref) to the open verification case" },
    { method: "POST", path: "/api/network/v1/orgs/:companyId/verification/evidence-uploads", domain: "network", tenantScoped: true, description: "Request a tenant-scoped signed upload token for a verification evidence file (metadata + sha256 only)" },
    { method: "PUT", path: "/api/network/v1/orgs/:companyId/verification/evidence-uploads/:uploadId", domain: "network", tenantScoped: true, description: "Complete an evidence upload (raw body; records size + sha256; file bytes are not stored)" },
    { method: "GET", path: "/api/platform/network/v1/verification", domain: "platform", tenantScoped: false, description: "Verification queue (platform)" },
    { method: "GET", path: "/api/platform/network/v1/verification/:caseId", domain: "platform", tenantScoped: false, description: "Verification case (platform)" },
    { method: "POST", path: "/api/platform/network/v1/verification/:caseId/decision", domain: "platform", tenantScoped: false, description: "Decide verification case: start_review, request_info, verify/approve, reject, restrict (audited)" },

    // SNET-09 — Mission Control (platform)
    { method: "GET", path: "/api/platform/network/v1/stats", domain: "platform", tenantScoped: false, description: "Sarah Network overview numbers" },
    { method: "GET", path: "/api/platform/network/v1/entities", domain: "platform", tenantScoped: false, description: "Network entities list (?status=&q=)" },
    { method: "GET", path: "/api/platform/network/v1/entities/:snId", domain: "platform", tenantScoped: false, description: "Entity detail + audit trail" },
    { method: "POST", path: "/api/platform/network/v1/entities/:snId/status", domain: "platform", tenantScoped: false, description: "Suspend / reinstate entity (reason required, audited)" },

    // SNET-10 — Trust & safety
    { method: "POST", path: "/api/network/v1/entities/:snId/report", domain: "consumer", tenantScoped: false, description: "Report a listed entity (rate-limited, deduped)" },
    { method: "GET", path: "/api/network/v1/reports", domain: "consumer", tenantScoped: false, description: "My reports (status only)" },
    { method: "GET", path: "/api/platform/network/v1/moderation", domain: "platform", tenantScoped: false, description: "Moderation queue (priority-ordered)" },
    { method: "GET", path: "/api/platform/network/v1/moderation/:caseId", domain: "platform", tenantScoped: false, description: "Moderation case" },
    { method: "POST", path: "/api/platform/network/v1/moderation/:caseId/decision", domain: "platform", tenantScoped: false, description: "start_review | dismiss | suspend_entity (audited)" },

    // SNET-05 — Search
    { method: "GET", path: "/api/network/v1/directory/search", domain: "consumer", tenantScoped: false, description: "Ranked directory search (q, category, verified, cursor); anonymous read of listed entries, per-IP rate limited" },
    { method: "GET", path: "/api/network/v1/directory/suggest", domain: "consumer", tenantScoped: false, description: "Search autocomplete; anonymous read of listed entries, per-IP rate limited" },
    { method: "GET", path: "/api/network/v1/health", domain: "network", tenantScoped: false, description: "Network health (public, non-sensitive)" },

    // SNET-06 — Agent registry
    { method: "GET", path: "/api/network/v1/agents", domain: "consumer", tenantScoped: false, description: "Public agent directory (?capability=)" },
    { method: "GET", path: "/api/network/v1/agents/:agentSnId", domain: "consumer", tenantScoped: false, description: "Public agent card" },
    { method: "GET", path: "/api/network/v1/orgs/:companyId/agent", domain: "network", tenantScoped: true, description: "Company Sarah agent record (owner view)" },
    { method: "PUT", path: "/api/network/v1/orgs/:companyId/agent", domain: "network", tenantScoped: true, description: "Update declared capabilities / pause" },

    // SNET-07 — Relationships
    { method: "GET", path: "/api/network/v1/connections", domain: "consumer", tenantScoped: false, description: "My relationships" },
    { method: "GET", path: "/api/network/v1/connections/:snId", domain: "consumer", tenantScoped: false, description: "Relationship with one entity" },
    { method: "POST", path: "/api/network/v1/connections", domain: "consumer", tenantScoped: false, description: "Follow / subscribe / connect / block (consent-linked)" },
    // Gate 5 — subscriber notification stub (event log only)
    { method: "GET", path: "/api/network/v1/orgs/:companyId/subscriber-events", domain: "network", tenantScoped: true, description: "Subscriber event log (logged_only; nothing delivered)" },
    { method: "POST", path: "/api/network/v1/orgs/:companyId/subscriber-events", domain: "network", tenantScoped: true, description: "Record an announcement / notification / reminder for subscribers (audience size only; no delivery)" },
    // Gate 2 — My Organisations
    { method: "GET", path: "/api/network/v1/my-organisations", domain: "consumer", tenantScoped: false, description: "My Organisations: my relationships joined to public directory cards" },
    { method: "PUT", path: "/api/network/v1/my-organisations/:snId/preferences", domain: "consumer", tenantScoped: false, description: "My Organisations channel preferences (notifications / announcements / reminders)" },
    { method: "GET", path: "/api/network/v1/orgs/:companyId/connections", domain: "network", tenantScoped: true, description: "Business relationship list (pseudonymous)" },
    { method: "POST", path: "/api/network/v1/orgs/:companyId/connections/:connectionId/:action", domain: "network", tenantScoped: true, description: "accept | decline | disconnect | block | unblock" },

    // CH — Unified Chat index
    { method: "GET", path: "/api/chat/conversations", domain: "consumer", tenantScoped: false, description: "Federated chat index (business, people, groups, network); hydrates from the durable store after restart" },
    { method: "GET", path: "/api/network-conversations/:conversationId/messages", domain: "consumer", tenantScoped: false, description: "Network-linked (AI↔AI) thread messages" },
    { method: "GET", path: "/api/chat/conversations/:companyId/handover", domain: "consumer", tenantScoped: false, description: "Handover ownership sync" },

    // U5 — Company conversations
    { method: "GET", path: "/api/discover/companies", domain: "consumer", tenantScoped: false, description: "Discover list: ranked search over the durable directory (q, category, limit, cursor); anonymous read of listed entries only (per-IP rate limit); fixtures never merged" },
    { method: "GET", path: "/api/user-conversations", domain: "consumer", tenantScoped: false, description: "User chat list" },
    { method: "GET", path: "/api/user-conversations/:companyId/messages", domain: "consumer", tenantScoped: false, description: "Company chat history" },
    { method: "GET", path: "/api/user-conversations/id/:conversationId/messages", domain: "consumer", tenantScoped: false, description: "Company chat history by conversation id" },
    { method: "POST", path: "/api/user-conversations/:companyId/messages", domain: "consumer", tenantScoped: false, description: "Send company Sarah message" },

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
