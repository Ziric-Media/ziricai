import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";

import {
    parseUploadedFile,
    saveKnowledgeDocument,
    listKnowledgeDocuments,
    deleteKnowledgeDocument,
} from "../services/tenants/knowledgeService.js";
import {
    listAiEmployees,
    getAiEmployee,
    createAiEmployee,
    updateAiEmployee,
    deleteAiEmployee,
    getDefaultAiEmployee,
} from "../services/tenants/aiEmployeeService.js";
import {
    getConversation,
    listConversations,
} from "../services/conversationService.js";
import { getStorageAdapter, getConfiguredStorageBackend } from "../services/storage/storageAdapter.js";
import { seedDemoCustomersIfEmpty } from "../services/storage/seedDemoCustomers.js";
import { seedCustomerOpsDemoIfEmpty } from "../services/storage/seedCustomerOpsDemo.js";
import {
    listCustomers,
    getCustomerProfile,
    updateCustomer,
    addNote,
    addTask,
    updateTask,
    deleteNote,
    getTimeline,
    normalizePhone,
} from "../services/customerService.js";
import { getQueueStats } from "../services/queue/jobQueue.js";
import { startMessageWorker } from "../services/queue/workers/messageWorker.js";
import {
    getPlatformMetrics,
    getPlatformActivity,
} from "../services/operations/platformOperations.js";
import {
    listWorkflows,
    getWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    duplicateWorkflow,
    publishWorkflow,
    rollbackWorkflow,
    listTemplates,
    installTemplate,
} from "../services/workflows/workflowService.js";
import {
    getPortalCompanyAsync,
    updatePortalBranding,
    getPortalTeamAsync,
    getPortalNotificationsAsync,
    getPortalActivityAsync,
    getPortalUsage,
    getPortalDashboard,
    PORTAL_DEMO_NOTIFICATIONS,
} from "../services/portal/portalDemo.js";
import { getPortalHub, getWorkspaceSnapshot } from "../services/portal/portalDataHub.js";
import {
    getCompany,
    createCompany,
    updateCompany,
    suspendCompany,
    archiveCompany,
    saveCompanyBranding,
    saveCompanyGeneralSettings,
} from "../services/tenants/companyService.js";
import {
    listDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
} from "../services/tenants/departmentService.js";
import {
    listTeamMembers,
    inviteTeamMember,
    updateTeamMemberRole,
} from "../services/tenants/userService.js";
import {
    provisionCompany,
    provisionAgent,
    getCompanyLinks,
} from "../services/platform/provisioningService.js";
import {
    getMarketplaceCatalog,
    getInstalledPacks,
    getPackDetail,
    checkForUpdates,
    applyUpdate,
    runInstallWizard,
} from "../services/platform/industryPackService.js";
import { submitReview } from "../services/platform/marketplaceInstaller.js";
import { seedPackVersions } from "../services/platform/marketplaceVersioning.js";
import {
    listSupervisorReviews,
    getSupervisorSummary,
} from "../services/intelligence/aiSupervisor.js";
import {
    startOnboarding,
    completeOnboardingStep,
    provisionOnboarding,
    listOnboardingIndustries,
    getOnboardingSession,
    getWhatsAppConfig,
} from "../services/platform/onboardingService.js";
import { completeOnboarding } from "../services/platform/onboardingOrchestrator.js";
import { listPlatformCompanies, getPlatformCompany } from "../services/platform/platformRegistry.js";
import { getAllPlans, getPlan, checkPlanLimit } from "../services/platform/billingPlans.js";
import { getCommandCenterDashboard } from "../services/operations/commandCenterService.js";
import { attachTenantContext, requireTenantScope } from "../services/core/tenantContext.js";
import { resolveAuthFromRequest } from "../services/auth/authService.js";
import { trackSession, invalidateSession, buildSessionResponse } from "../services/auth/sessionService.js";
import { checkPermission } from "../services/auth/permissionsService.js";
import { requirePlatformAccess } from "../services/auth/platformAuth.js";
import { validateCompanyIdParam, requireBodyFields } from "../services/auth/validateInput.js";
import { authRateLimit } from "../services/auth/authRateLimiter.js";
import { auditLog } from "../services/audit/auditLog.js";
import { isDemoTenant } from "../services/core/dataMode.js";
import { buildSarahContext } from "../services/sarah/sarahContext.js";
import { handleSarahChat } from "../services/sarah/sarahOrchestrator.js";
import { getToolsForContext } from "../services/sarah/toolRegistry.js";
import { initSarahTools } from "../services/sarah/tools/index.js";
import {
    searchKnowledge,
    getKnowledgeStats,
    getPlatformKnowledgeSummary,
} from "../services/knowledge/platformKnowledgeLoader.js";
import {
    initIntegrationHub,
    mountIntegrationRoutes,
    handleLegacyWhatsAppWebhook,
} from "../services/integrations/integrationHub.js";
import { initEventSystem } from "../services/events/index.js";
import { applyApiVersionHeader } from "../services/api/routeRegistry.js";
import { mountCustomerOpsRoutes } from "../services/api/customerOpsRoutes.js";
import { getDashboardSnapshot, getPopularQuestionsSnapshot } from "../services/analytics/dashboardService.js";
import { listEvents } from "../services/events/eventStore.js";
import {
    listWorkflows as listRegistryWorkflows,
    upsertWorkflow,
    getWorkflow as getRegistryWorkflow,
} from "../services/automation/workflowRegistry.js";
import { runWorkflow, listAutomationRuns } from "../services/automation/automationEngine.js";
import { createEvent, EventTypes } from "../services/events/eventTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

async function healthHandler(req, res) {
    try {
        const adapter = await getStorageAdapter();
        res.json({
            status: "ok",
            whatsapp: Boolean(process.env.PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN),
            openai: Boolean(process.env.OPENAI_API_KEY),
            storage: adapter.name,
            queue: getQueueStats(),
            tenantScopeEnforcement: (process.env.TENANT_SCOPE_ENFORCEMENT || "lax").toLowerCase(),
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(503).json({
            status: "starting",
            error: err.message,
            timestamp: new Date().toISOString(),
        });
    }
}

export function createHealthHandler() {
    return healthHandler;
}

export async function setupApp(app) {

/** CORS for multi-site static frontends (marketing / app / admin). */
app.use((req, res, next) => {
    const allowed = [
        process.env.MARKETING_BASE_URL,
        process.env.APP_BASE_URL,
        process.env.ADMIN_BASE_URL,
        process.env.ZIRICAI_ROOT_URL,
        process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`,
        'https://marketing.ziricai.com',
        'https://app.ziricai.com',
        'https://admin.ziricai.com',
        'https://ziricai.com',
        'https://www.ziricai.com',
        'https://ziricai-production.up.railway.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ].filter(Boolean);
    const origin = req.get('origin');
    if (origin && (allowed.some((o) => origin.startsWith(o.replace(/\/$/, ''))) || process.env.NODE_ENV !== 'production')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Platform-Api-Key, X-Company-Id');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use(express.json());

/** Cache static assets in production (HTML stays fresh). */
app.use((req, res, next) => {
    if (process.env.NODE_ENV === "production" && req.method === "GET") {
        const ext = path.extname(req.path).toLowerCase();
        if ([".js", ".css", ".svg", ".png", ".jpg", ".webp", ".woff2"].includes(ext)) {
            res.setHeader("Cache-Control", "public, max-age=86400, immutable");
        }
    }
    next();
});

/** Multi-site static assets (marketing / app / admin) + legacy root fallback. */
app.use(express.static(path.join(ROOT, 'marketing')));
app.use('/app', express.static(path.join(ROOT, 'app')));
app.use('/admin', express.static(path.join(ROOT, 'admin')));
app.use(express.static(ROOT));
app.use(attachTenantContext());
app.use(applyApiVersionHeader());

app.use((req, res, next) => {
    const ua = req.get("user-agent") || "(no user-agent)";
    console.log("==================================");
    console.log(`${req.method} ${req.url}`);
    console.log(new Date().toLocaleString());
    console.log("[request] User-Agent:", ua);
    next();
});

/** Legacy HTML entry points → new site structure */
app.get("/ziricai.html", (req, res) => res.redirect(301, "/"));
app.get("/index.html", (req, res) => res.redirect(301, "/"));
app.get("/company-portal.html", (req, res) => {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    res.redirect(301, `/app/${qs}`);
});
app.get("/ziric-superadmin-console.html", (req, res) => res.redirect(301, "/admin/"));
app.get("/onboarding.html", (req, res) => res.redirect(301, "/#start"));

/** Auth — current session profile */
app.get("/api/auth/session", attachTenantContext(), async (req, res) => {
    try {
        const auth = await resolveAuthFromRequest(req);
        if (!auth.uid) {
            return res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
        }
        auditLog("session_loaded", { uid: auth.uid, email: auth.email });
        const sessionId = trackSession(auth.uid, { userAgent: req.get("user-agent") });
        res.json(buildSessionResponse(auth, { sessionId }));
    } catch (err) {
        console.error("[api/auth/session] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load session" });
    }
});

/** Auth — invalidate server-side session hook (demo in-memory) */
app.post("/api/auth/logout", attachTenantContext(), async (req, res) => {
    try {
        const auth = await resolveAuthFromRequest(req);
        if (auth.uid) {
            invalidateSession(auth.uid);
        }
        res.json({ success: true });
    } catch (err) {
        console.error("[api/auth/logout] error:", err.message);
        res.status(500).json({ error: err.message || "Logout failed" });
    }
});

/** AI Operations Center — aggregated platform metrics (superadmin or API key) */
app.get("/api/operations/metrics", requirePlatformAccess(), async (req, res) => {
    try {
        const data = await getPlatformMetrics();
        res.json(data);
    } catch (err) {
        console.error("[api/operations/metrics] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load operations metrics" });
    }
});

/** AI Operations Center — live activity feed (superadmin or API key) */
app.get("/api/operations/activity", requirePlatformAccess(), async (req, res) => {
    try {
        const data = await getPlatformActivity();
        res.json(data);
    } catch (err) {
        console.error("[api/operations/activity] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load activity feed" });
    }
});

/** Company workspace — tenant root lifecycle */
app.get("/api/companies/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const company = await getCompany(req.params.companyId);
        if (!company) return res.status(404).json({ error: "Company not found" });
        res.json({ company });
    } catch (err) {
        console.error("[api/companies GET] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load company" });
    }
});

app.patch("/api/companies/:companyId", requireTenantScope(), checkPermission("canManageStaff"), async (req, res) => {
    try {
        const company = await updateCompany(req.params.companyId, req.body || {});
        res.json({ success: true, company });
    } catch (err) {
        console.error("[api/companies PATCH] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to update company" });
    }
});

app.post("/api/companies/:companyId/suspend", requireTenantScope(), checkPermission("canManageStaff"), async (req, res) => {
    try {
        const company = await suspendCompany(req.params.companyId, req.body?.reason || "");
        res.json({ success: true, company });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to suspend company" });
    }
});

app.post("/api/companies/:companyId/archive", requireTenantScope(), checkPermission("canManageStaff"), async (req, res) => {
    try {
        const company = await archiveCompany(req.params.companyId, req.body?.reason || "");
        res.json({ success: true, company });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to archive company" });
    }
});

app.post("/api/companies", async (req, res) => {
    try {
        const body = req.body || {};
        const companyId = body.companyId || body.id;
        if (!companyId) return res.status(400).json({ error: "companyId is required" });

        if (body.provision !== false) {
            const result = await provisionCompany(companyId, body);
            return res.status(201).json({ success: true, ...result });
        }

        const company = await createCompany(companyId, body);
        res.status(201).json({ success: true, company });
    } catch (err) {
        console.error("[api/companies POST] error:", err.message);
        res.status(400).json({ error: err.message || "Failed to create company" });
    }
});

/** Departments — org structure under tenant */
app.get("/api/companies/:companyId/departments", requireTenantScope(), async (req, res) => {
    try {
        const items = await listDepartments(req.params.companyId);
        res.json({ items });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to list departments" });
    }
});

app.post("/api/companies/:companyId/departments", requireTenantScope(), checkPermission("canManageStaff"), async (req, res) => {
    try {
        const dept = await createDepartment(req.params.companyId, req.body || {});
        res.status(201).json({ success: true, department: dept });
    } catch (err) {
        res.status(400).json({ error: err.message || "Failed to create department" });
    }
});

app.patch("/api/companies/:companyId/departments/:deptId", requireTenantScope(), checkPermission("canManageStaff"), async (req, res) => {
    try {
        const department = await updateDepartment(req.params.companyId, req.params.deptId, req.body || {});
        res.json({ success: true, department });
    } catch (err) {
        res.status(400).json({ error: err.message || "Failed to update department" });
    }
});

app.delete("/api/companies/:companyId/departments/:deptId", requireTenantScope(), checkPermission("canManageStaff"), async (req, res) => {
    try {
        await deleteDepartment(req.params.companyId, req.params.deptId);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message || "Failed to delete department" });
    }
});

/** Team — tenant membership */
app.get("/api/companies/:companyId/team", requireTenantScope(), async (req, res) => {
    try {
        const items = await listTeamMembers(req.params.companyId);
        res.json({ items, count: items.length });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to load team" });
    }
});

app.post("/api/companies/:companyId/team/invite", requireTenantScope(), checkPermission("canManageStaff"), async (req, res) => {
    try {
        const invite = await inviteTeamMember(req.params.companyId, {
            email: req.body?.email,
            role: req.body?.role,
            departmentId: req.body?.departmentId,
            invitedBy: req.tenant?.uid || null,
        });
        res.status(201).json({ success: true, invite });
    } catch (err) {
        res.status(400).json({ error: err.message || "Failed to invite member" });
    }
});

app.patch("/api/companies/:companyId/team/:uid", requireTenantScope(), checkPermission("canManageStaff"), async (req, res) => {
    try {
        const member = await updateTeamMemberRole(req.params.companyId, req.params.uid, req.body?.role, req.body || {});
        res.json({ success: true, member });
    } catch (err) {
        res.status(400).json({ error: err.message || "Failed to update team member" });
    }
});

/** Workspace snapshot for portal bootstrap */
app.get("/api/portal/workspace/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const snapshot = await getWorkspaceSnapshot(req.params.companyId);
        if (!snapshot) return res.status(404).json({ error: "Workspace not found" });
        res.json(snapshot);
    } catch (err) {
        console.error("[api/portal/workspace] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load workspace" });
    }
});

/** Company Admin Portal — tenant-scoped demo API */
app.get("/api/portal/company/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const data = await getPortalCompanyAsync(req.params.companyId);
        res.json(data);
    } catch (err) {
        console.error("[api/portal/company] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load company" });
    }
});

app.patch("/api/portal/company/:companyId", requireTenantScope(), checkPermission("canManageStaff"), async (req, res) => {
    try {
        const companyId = req.params.companyId;
        const { branding, settings } = req.body || {};
        let savedBranding = null;
        let savedGeneral = null;

        if (branding) {
            savedBranding = await updatePortalBranding(companyId, branding);
        }
        if (settings?.general) {
            savedGeneral = await saveCompanyGeneralSettings(companyId, settings.general);
        }

        res.json({ success: true, branding: savedBranding, settings: savedGeneral ? { general: savedGeneral } : undefined });
    } catch (err) {
        console.error("[api/portal/company PATCH] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to update company" });
    }
});

app.get("/api/portal/team/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const data = await getPortalTeamAsync(req.params.companyId);
        res.json(data);
    } catch (err) {
        console.error("[api/portal/team] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load team" });
    }
});

app.get("/api/portal/notifications/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const companyId = req.params.companyId;
        const items = await getPortalNotificationsAsync(companyId);
        const isDemo = isDemoTenant(companyId) && items.length <= PORTAL_DEMO_NOTIFICATIONS.length;
        res.json({ items, isDemo });
    } catch (err) {
        console.error("[api/portal/notifications] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load notifications" });
    }
});

app.get("/api/portal/activity/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const items = await getPortalActivityAsync(req.params.companyId);
        res.json({ items, isDemo: !items.length });
    } catch (err) {
        console.error("[api/portal/activity] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load activity" });
    }
});

app.get("/api/portal/usage/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const data = await getPortalUsage(req.params.companyId);
        res.json(data);
    } catch (err) {
        console.error("[api/portal/usage] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load usage" });
    }
});

/** SaaS billing tier definitions */
app.get("/api/billing/plans", (req, res) => {
    res.json({ plans: getAllPlans() });
});

app.get("/api/billing/plans/:planId", (req, res) => {
    const plan = getPlan(req.params.planId);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json(plan);
});

app.post("/api/billing/check-limit", (req, res) => {
    try {
        const { planId, resource, usage, increment } = req.body || {};
        if (!planId || !resource) {
            return res.status(400).json({ error: "planId and resource are required" });
        }
        const result = checkPlanLimit(planId, resource, Number(usage) || 0, Number(increment) || 1);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/** SaaS onboarding wizard */
app.get("/api/onboarding/industries", (req, res) => {
    res.json({ industries: listOnboardingIndustries(), whatsapp: getWhatsAppConfig() });
});

app.get("/api/onboarding/session/:sessionId", (req, res) => {
    const session = getOnboardingSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json({ session, whatsapp: getWhatsAppConfig() });
});

app.post("/api/onboarding/start", authRateLimit("onboarding"), requireBodyFields(["companyName", "ownerEmail", "ownerName"]), async (req, res) => {
    try {
        const result = await startOnboarding(req.body || {});
        res.status(201).json(result);
    } catch (err) {
        console.error("[api/onboarding/start] error:", err.message);
        res.status(400).json({ error: err.message || "Failed to start onboarding" });
    }
});

app.post("/api/onboarding/complete-step", authRateLimit("onboarding"), async (req, res) => {
    try {
        const { sessionId, step, data } = req.body || {};
        if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
        if (!step) return res.status(400).json({ error: "step is required" });
        const result = await completeOnboardingStep(sessionId, step, data || {});
        res.json(result);
    } catch (err) {
        console.error("[api/onboarding/complete-step] error:", err.message);
        res.status(400).json({ error: err.message || "Failed to complete step" });
    }
});

app.post("/api/onboarding/provision", async (req, res) => {
    try {
        const result = await provisionOnboarding(req.body || {});
        res.status(201).json(result);
    } catch (err) {
        console.error("[api/onboarding/provision] error:", err.message);
        res.status(400).json({ error: err.message || "Failed to provision" });
    }
});

/** One-shot onboarding — full signup → live platform chain */
app.post("/api/onboarding/complete", authRateLimit("onboarding"), requireBodyFields(["companyName", "ownerEmail", "ownerName"]), async (req, res) => {
    try {
        const result = await completeOnboarding(req.body || {});
        res.status(201).json(result);
    } catch (err) {
        console.error("[api/onboarding/complete] error:", err.message);
        res.status(400).json({ error: err.message || "Failed to complete onboarding" });
    }
});

/** Super Admin — server-side tenant registry (memory-backed for demo) */
app.get("/api/platform/companies", async (req, res) => {
    try {
        const adapter = await getStorageAdapter();
        const items = listPlatformCompanies();
        res.json({
            items,
            total: items.length,
            isDemo: items.length === 0,
            storage: adapter.name,
        });
    } catch (err) {
        console.error("[api/platform/companies] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list platform companies" });
    }
});

app.get("/api/platform/companies/:companyId", async (req, res) => {
    try {
        const record = getPlatformCompany(req.params.companyId);
        if (!record) return res.status(404).json({ error: "Company not found in platform registry" });
        res.json({ company: record });
    } catch (err) {
        console.error("[api/platform/companies GET] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load platform company" });
    }
});

/** AI Command Center — Super Admin strategic dashboard */
app.get("/api/operations/command-center", requirePlatformAccess(), async (req, res) => {
    try {
        const data = await getCommandCenterDashboard();
        res.json(data);
    } catch (err) {
        console.error("[api/operations/command-center] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load command center" });
    }
});

app.get("/api/portal/dashboard/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const data = await getPortalDashboard(req.params.companyId);
        res.json(data);
    } catch (err) {
        console.error("[api/portal/dashboard] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load dashboard" });
    }
});

/** Portal BOS — unified hub snapshot (metrics, conversations, activity) */
app.get("/api/portal/hub/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const data = await getPortalHub(req.params.companyId);
        res.json(data);
    } catch (err) {
        console.error("[api/portal/hub] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load portal hub" });
    }
});

app.get("/api/portal/analytics/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const snapshot = await getDashboardSnapshot(req.params.companyId, {
            days: parseInt(req.query.days || "14", 10),
        });
        res.json(snapshot);
    } catch (err) {
        console.error("[api/portal/analytics] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load analytics" });
    }
});

/** Analytics — full BI dashboard snapshot */
app.get("/api/analytics/dashboard/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const data = await getDashboardSnapshot(req.params.companyId, {
            days: parseInt(req.query.days || "14", 10),
        });
        res.json(data);
    } catch (err) {
        console.error("[api/analytics/dashboard] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load analytics dashboard" });
    }
});

/** Analytics — paginated event log */
app.get("/api/analytics/events/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const data = await listEvents(req.params.companyId, {
            limit: parseInt(req.query.limit || "50", 10),
            cursor: req.query.cursor || null,
            type: req.query.type || null,
        });
        res.json(data);
    } catch (err) {
        console.error("[api/analytics/events] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list events" });
    }
});

/** Analytics — popular knowledge questions */
app.get("/api/analytics/popular-questions/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const data = await getPopularQuestionsSnapshot(
            req.params.companyId,
            parseInt(req.query.limit || "10", 10)
        );
        res.json(data);
    } catch (err) {
        console.error("[api/analytics/popular-questions] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load popular questions" });
    }
});

/** Automations — list tenant workflows */
app.get("/api/automations/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const items = await listRegistryWorkflows(req.params.companyId);
        res.json({ items, companyId: req.params.companyId });
    } catch (err) {
        console.error("[api/automations] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list automations" });
    }
});

/** Automations — create or update workflow */
app.post("/api/automations/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const workflowId = req.body?.id || req.query.workflowId || null;
        const saved = await upsertWorkflow(req.params.companyId, workflowId, req.body || {});
        res.json(saved);
    } catch (err) {
        console.error("[api/automations POST] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to save automation" });
    }
});

/** Automations — manual trigger */
app.post("/api/automations/:companyId/:workflowId/run", requireTenantScope(), async (req, res) => {
    try {
        const { companyId, workflowId } = req.params;
        const workflow = await getRegistryWorkflow(companyId, workflowId);
        if (!workflow) {
            return res.status(404).json({ error: "Workflow not found" });
        }
        const event = createEvent(companyId, req.body?.eventType || EventTypes.MESSAGE_RECEIVED, req.body?.payload || {}, {
            actorId: req.body?.actorId || "manual",
        });
        const run = await runWorkflow(companyId, workflow, event, { source: "manual", actorId: req.body?.actorId });
        res.json(run);
    } catch (err) {
        console.error("[api/automations/run] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to run automation" });
    }
});

/** Automations — execution log */
app.get("/api/automations/:companyId/runs", requireTenantScope(), async (req, res) => {
    try {
        const items = await listAutomationRuns(req.params.companyId, {
            limit: parseInt(req.query.limit || "50", 10),
        });
        res.json({ items, companyId: req.params.companyId });
    } catch (err) {
        console.error("[api/automations/runs] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list automation runs" });
    }
});

/** Sarah — AI Operating Assistant */
initSarahTools();

app.post("/api/sarah/chat", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const { message, sessionId, companyId: bodyCompanyId } = req.body || {};
        const ctx = await buildSarahContext(req, {
            companyId: bodyCompanyId || req.tenant?.companyId,
            sessionId,
            surface: req.body?.surface || "portal",
        });

        const result = await handleSarahChat(ctx, { message, sessionId });
        res.json(result);
    } catch (err) {
        console.error("[api/sarah/chat] error:", err.message);
        res.status(err.status || 500).json({ error: err.message || "Sarah chat failed" });
    }
});

app.get("/api/sarah/tools", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const ctx = await buildSarahContext(req, {
            companyId: req.query?.companyId || req.tenant?.companyId,
        });
        const tools = getToolsForContext(ctx).map((t) => ({
            name: t.name,
            description: t.description,
            requiredPermissions: t.requiredPermissions || [],
            platformOnly: Boolean(t.platformOnly),
        }));
        res.json({ tools, role: ctx.role, companyId: ctx.companyId });
    } catch (err) {
        console.error("[api/sarah/tools] error:", err.message);
        res.status(err.status || 500).json({ error: err.message || "Failed to list Sarah tools" });
    }
});

/** Sarah — platform knowledge search (landing + portal FAQ) */
app.get("/api/sarah/knowledge", async (req, res) => {
    try {
        const query = String(req.query.q || req.query.query || "").trim();
        const category = req.query.category || null;
        const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);

        if (!query) {
            const stats = getKnowledgeStats();
            return res.json({
                stats,
                summary: getPlatformKnowledgeSummary({ maxChars: 2000 }),
            });
        }

        const results = searchKnowledge(query, { limit, category, minScore: 10 });
        res.json({ query, category, results, count: results.length });
    } catch (err) {
        console.error("[api/sarah/knowledge] error:", err.message);
        res.status(500).json({ error: err.message || "Knowledge search failed" });
    }
});

/** AI Employees — tenant-scoped CRUD */
app.get("/api/companies/:companyId/ai-employees", requireTenantScope(), async (req, res) => {
    try {
        const items = await listAiEmployees(req.params.companyId);
        const defaultAgent = await getDefaultAiEmployee(req.params.companyId);
        res.json({ items, companyId: req.params.companyId, defaultAgentId: defaultAgent?.id || null });
    } catch (err) {
        console.error("[api/ai-employees] list error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list AI employees" });
    }
});

app.get("/api/companies/:companyId/ai-employees/:agentId", requireTenantScope(), async (req, res) => {
    try {
        const agent = await getAiEmployee(req.params.companyId, req.params.agentId);
        if (!agent) return res.status(404).json({ error: "AI employee not found" });
        res.json({ agent });
    } catch (err) {
        console.error("[api/ai-employees] get error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load AI employee" });
    }
});

app.post("/api/companies/:companyId/ai-employees", requireTenantScope(), checkPermission("canEditAI"), async (req, res) => {
    try {
        const body = req.body || {};
        const agent = await createAiEmployee(req.params.companyId, {
            ...body,
            companyName: body.companyName || req.params.companyId,
        });
        res.status(201).json({ success: true, agent });
    } catch (err) {
        console.error("[api/ai-employees] create error:", err.message);
        res.status(500).json({ error: err.message || "Failed to create AI employee" });
    }
});

app.patch("/api/companies/:companyId/ai-employees/:agentId", requireTenantScope(), checkPermission("canEditAI"), async (req, res) => {
    try {
        const agent = await updateAiEmployee(req.params.companyId, req.params.agentId, req.body || {});
        res.json({ success: true, agent });
    } catch (err) {
        console.error("[api/ai-employees] patch error:", err.message);
        res.status(err.status || 500).json({ error: err.message || "Failed to update AI employee" });
    }
});

app.delete("/api/companies/:companyId/ai-employees/:agentId", requireTenantScope(), checkPermission("canEditAI"), async (req, res) => {
    try {
        await deleteAiEmployee(req.params.companyId, req.params.agentId);
        res.json({ success: true, id: req.params.agentId });
    } catch (err) {
        console.error("[api/ai-employees] delete error:", err.message);
        res.status(500).json({ error: err.message || "Failed to delete AI employee" });
    }
});

/** Knowledge — tenant document listing */
app.get("/api/companies/:companyId/knowledge/documents", requireTenantScope(), async (req, res) => {
    try {
        const knowledgeBaseId = req.query.knowledgeBaseId || null;
        const items = await listKnowledgeDocuments(req.params.companyId, {
            knowledgeBaseId,
            limit: parseInt(req.query.limit || "100", 10),
        });
        res.json({ items, companyId: req.params.companyId, knowledgeBaseId: knowledgeBaseId || `kb-${req.params.companyId}` });
    } catch (err) {
        console.error("[api/knowledge/documents] list error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list knowledge documents" });
    }
});

app.delete("/api/companies/:companyId/knowledge/documents/:docId", requireTenantScope(), checkPermission("canUploadKnowledge"), async (req, res) => {
    try {
        const result = await deleteKnowledgeDocument(req.params.companyId, req.params.docId);
        res.json(result);
    } catch (err) {
        console.error("[api/knowledge/documents] delete error:", err.message);
        res.status(500).json({ error: err.message || "Failed to delete document" });
    }
});

app.get("/api/admin/config", (req, res) => {
    const phoneId = process.env.PHONE_NUMBER_ID || "";
    res.json({
        firebase: { projectId: "ziricai" },
        whatsapp: {
            configured: Boolean(phoneId && process.env.WHATSAPP_TOKEN),
            phoneNumberId: phoneId ? `***${phoneId.slice(-4)}` : null,
        },
        openai: {
            configured: Boolean(process.env.OPENAI_API_KEY),
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        },
        storage: getConfiguredStorageBackend(),
        tenantScopeEnforcement: (process.env.TENANT_SCOPE_ENFORCEMENT || "lax").toLowerCase(),
        mfaEnforcement: (process.env.MFA_ENFORCEMENT || "off").toLowerCase(),
    });
});

/** Platform provisioning — company workspace (superadmin or API key) */
app.post(
    "/api/platform/provision/company",
    requirePlatformAccess(),
    authRateLimit("provision"),
    validateCompanyIdParam("body"),
    async (req, res) => {
    try {
        const body = req.body || {};
        const companyId = body.companyId || body.id;
        if (!companyId) {
            return res.status(400).json({ error: "companyId is required" });
        }
        auditLog("provision_company", { companyId, via: req.platformAuth?.via });
        const result = await provisionCompany(companyId, body);
        res.status(201).json({ success: true, ...result });
    } catch (err) {
        console.error("[api/platform/provision/company] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to provision company" });
    }
});

/** Platform provisioning — AI employee resources (superadmin or API key) */
app.post(
    "/api/platform/provision/agent",
    requirePlatformAccess(),
    authRateLimit("provision"),
    validateCompanyIdParam("body"),
    async (req, res) => {
    try {
        const body = req.body || {};
        const { companyId, agentId } = body;
        if (!companyId) {
            return res.status(400).json({ error: "companyId is required" });
        }
        auditLog("provision_agent", { companyId, agentId, via: req.platformAuth?.via });
        const result = await provisionAgent(companyId, agentId || null, body);
        res.status(201).json({ success: true, ...result });
    } catch (err) {
        console.error("[api/platform/provision/agent] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to provision agent" });
    }
});

/** Cross-links for admin UI navigation */
app.get("/api/platform/companies/:companyId/links", async (req, res) => {
    try {
        const data = await getCompanyLinks(req.params.companyId);
        res.json(data);
    } catch (err) {
        console.error("[api/platform/companies/:id/links] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load company links" });
    }
});

/** AI Marketplace — browse curated industry packs */
app.get("/api/marketplace/catalog", async (req, res) => {
    try {
        const { q, category, price, sort } = req.query;
        const data = getMarketplaceCatalog({ q, category, price, sort });
        res.json(data);
    } catch (err) {
        console.error("[api/marketplace/catalog] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load marketplace catalog" });
    }
});

/** AI Marketplace — pack detail with contents, reviews, inheritance */
app.get("/api/marketplace/pack/:packId", async (req, res) => {
    try {
        const data = getPackDetail(req.params.packId);
        res.json(data);
    } catch (err) {
        console.error("[api/marketplace/pack] error:", err.message);
        res.status(err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
    }
});

/** AI Marketplace — installed packs for a tenant */
app.get("/api/marketplace/installed/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const data = await getInstalledPacks(req.params.companyId);
        res.json(data);
    } catch (err) {
        console.error("[api/marketplace/installed] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load installed packs" });
    }
});

/** AI Marketplace — check for pack updates */
app.get("/api/marketplace/installed/:companyId/updates", requireTenantScope(), async (req, res) => {
    try {
        const { packId } = req.query;
        const data = await checkForUpdates(req.params.companyId, packId || null);
        res.json(data);
    } catch (err) {
        console.error("[api/marketplace/updates] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to check updates" });
    }
});

/** AI Marketplace — install industry pack (supports wizard steps) */
app.post("/api/marketplace/install", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const body = req.body || {};
        const { companyId, packId, step, branding, integrations, demoMode, skipPayment } = body;
        if (!companyId && step !== "preview") {
            return res.status(400).json({ error: "companyId is required" });
        }
        if (!packId) return res.status(400).json({ error: "packId is required" });

        if (step && step !== "install") {
            const result = await runInstallWizard(companyId, packId, {
                step,
                customizations: { branding },
                integrations,
                demoMode,
                skipPayment,
            });
            return res.json(result);
        }

        const result = await runInstallWizard(companyId, packId, {
            step: "install",
            branding,
            integrations,
            demoMode: demoMode !== false,
            skipPayment,
        });

        if (result.requiresPayment) {
            return res.status(402).json(result);
        }

        res.status(result.alreadyInstalled ? 200 : 201).json(result);
    } catch (err) {
        console.error("[api/marketplace/install] error:", err.message);
        res.status(400).json({ error: err.message || "Failed to install pack" });
    }
});

/** AI Marketplace — apply pack version update */
app.post("/api/marketplace/update", requireTenantScope(), async (req, res) => {
    try {
        const { companyId, packId, targetVersion } = req.body || {};
        if (!companyId) return res.status(400).json({ error: "companyId is required" });
        if (!packId) return res.status(400).json({ error: "packId is required" });
        if (!targetVersion) return res.status(400).json({ error: "targetVersion is required" });
        const result = await applyUpdate(companyId, packId, targetVersion);
        res.json(result);
    } catch (err) {
        console.error("[api/marketplace/update] error:", err.message);
        res.status(400).json({ error: err.message || "Failed to apply update" });
    }
});

/** AI Marketplace — submit tenant review */
app.post("/api/marketplace/review", requireTenantScope(), async (req, res) => {
    try {
        const { companyId, packId, rating, title, body, author } = req.body || {};
        if (!companyId) return res.status(400).json({ error: "companyId is required" });
        if (!packId) return res.status(400).json({ error: "packId is required" });
        const result = await submitReview(companyId, packId, { rating, title, body, author });
        res.status(201).json(result);
    } catch (err) {
        console.error("[api/marketplace/review] error:", err.message);
        res.status(400).json({ error: err.message || "Failed to submit review" });
    }
});

/** AI Supervisor — recent quality reviews (admin) */
app.get("/api/supervisor/reviews/:companyId", requireTenantScope(), async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 20;
        const [reviews, summary] = await Promise.all([
            listSupervisorReviews(req.params.companyId, limit),
            getSupervisorSummary(req.params.companyId),
        ]);
        res.json({ ...reviews, summary });
    } catch (err) {
        console.error("[api/supervisor/reviews] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load supervisor reviews" });
    }
});

app.get("/api/knowledge", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const companyId = req.query.companyId || null;
        const items = await listKnowledgeDocuments(companyId);
        res.json({ items });
    } catch (err) {
        console.error("[api/knowledge] list error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list knowledge" });
    }
});

app.post("/api/knowledge", requireTenantScope(), checkPermission("canUploadKnowledge"), async (req, res) => {
    try {
        const { companyId, title, type, content, url } = req.body || {};
        if (!companyId || !title || !type) {
            return res.status(400).json({ error: "companyId, title, and type are required" });
        }
        const saved = await saveKnowledgeDocument({ companyId, title, type, content, url });
        res.json({ success: true, ...saved });
    } catch (err) {
        console.error("[api/knowledge] create error:", err.message);
        res.status(500).json({ error: err.message || "Failed to save knowledge" });
    }
});

app.post("/api/knowledge/upload", requireTenantScope(), checkPermission("canUploadKnowledge"), upload.single("file"), async (req, res) => {
    try {
        const { companyId, title, type } = req.body || {};
        if (!companyId || !title || !req.file) {
            return res.status(400).json({ error: "companyId, title, and file are required" });
        }
        const content = await parseUploadedFile(
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname
        );
        const saved = await saveKnowledgeDocument({
            companyId,
            title,
            type: type || "document",
            content,
            fileName: req.file.originalname,
        });
        res.json({ success: true, contentLength: content.length, ...saved });
    } catch (err) {
        console.error("[api/knowledge/upload] error:", err.message);
        res.status(500).json({ error: err.message || "Upload failed" });
    }
});

/** Bridge WhatsApp webhook memory → admin inbox (read-only). */
app.get("/api/conversations", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const companyId = req.query.companyId || null;
        const items = await listConversations({ companyId, limit: 50 });
        res.json({ items });
    } catch (err) {
        console.error("[api/conversations] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list conversations" });
    }
});

app.get("/api/conversations/:id/messages", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const id = req.params.id;
        const history = await getConversation(id, 50);
        const items = history.map((m, idx) => ({
            id: `api-${idx}`,
            role: m.role === "assistant" ? "ai" : m.role === "user" ? "customer" : m.role,
            message: m.content,
            content: m.content,
        }));
        res.json({ items, conversation: { id, phone: id } });
    } catch (err) {
        console.error("[api/conversations/:id/messages] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load messages" });
    }
});

/** Customer CRM API */
app.get("/api/customers", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const companyId = req.query.companyId || null;
        const items = await listCustomers({ companyId, limit: 100 });
        res.json({ items });
    } catch (err) {
        console.error("[api/customers] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list customers" });
    }
});

app.get("/api/customers/:phone", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const phone = normalizePhone(req.params.phone);
        const profile = await getCustomerProfile(phone);
        if (!profile) {
            return res.status(404).json({ error: "Customer not found" });
        }
        res.json({ customer: profile });
    } catch (err) {
        console.error("[api/customers/:phone] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load customer" });
    }
});

app.patch("/api/customers/:phone", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const phone = normalizePhone(req.params.phone);
        const body = req.body || {};
        let customer = await getCustomerProfile(phone);

        if (!customer && body.create !== false) {
            customer = await updateCustomer(phone, { phone, name: body.name || phone });
        }
        if (!customer) {
            return res.status(404).json({ error: "Customer not found" });
        }

        if (body.note?.text) {
            const note = await addNote(phone, { text: body.note.text, author: body.note.author || "Admin" });
            return res.json({ success: true, note, customer: await getCustomerProfile(phone) });
        }

        if (body.deleteNoteId) {
            await deleteNote(phone, body.deleteNoteId);
            return res.json({ success: true, customer: await getCustomerProfile(phone) });
        }

        if (body.task?.title) {
            const task = await addTask(phone, body.task);
            return res.json({ success: true, task, customer: await getCustomerProfile(phone) });
        }

        if (body.updateTask) {
            const task = await updateTask(phone, body.updateTask.id, body.updateTask);
            return res.json({ success: true, task, customer: await getCustomerProfile(phone) });
        }

        const patch = {};
        if (body.tags) patch.tags = body.tags;
        if (body.aiSummary != null) patch.aiSummary = body.aiSummary;
        if (body.status) patch.status = body.status;
        if (body.assignedEmployee != null) patch.assignedEmployee = body.assignedEmployee;
        if (Object.keys(patch).length) {
            await updateCustomer(phone, patch);
        }

        res.json({ success: true, customer: await getCustomerProfile(phone) });
    } catch (err) {
        console.error("[api/customers/:phone PATCH] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to update customer" });
    }
});

/** Workflow Automation Studio API — legacy in-memory builder (see automation/workflowRegistry for tenant automations) */
app.get("/api/workflows", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const companyId = req.query.companyId || null;
        const data = await listWorkflows({ companyId });
        res.json(data);
    } catch (err) {
        console.error("[api/workflows] list error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list workflows" });
    }
});

app.post("/api/workflows", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const result = await createWorkflow(req.body || {});
        if (result.error) return res.status(400).json(result);
        res.status(201).json(result);
    } catch (err) {
        console.error("[api/workflows] create error:", err.message);
        res.status(500).json({ error: err.message || "Failed to create workflow" });
    }
});

app.get("/api/workflows/templates", async (req, res) => {
    try {
        const data = await listTemplates();
        res.json(data);
    } catch (err) {
        console.error("[api/workflows/templates] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to list templates" });
    }
});

app.post("/api/workflows/from-template", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const result = await installTemplate(req.body || {});
        if (result.error) return res.status(400).json(result);
        res.status(201).json(result);
    } catch (err) {
        console.error("[api/workflows/from-template] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to install template" });
    }
});

app.get("/api/workflows/:id", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const result = await getWorkflow(req.params.id);
        if (result.error) return res.status(404).json(result);
        res.json(result);
    } catch (err) {
        console.error("[api/workflows/:id] get error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load workflow" });
    }
});

app.patch("/api/workflows/:id", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const result = await updateWorkflow(req.params.id, req.body || {});
        if (result.error) return res.status(404).json(result);
        res.json(result);
    } catch (err) {
        console.error("[api/workflows/:id] patch error:", err.message);
        res.status(500).json({ error: err.message || "Failed to update workflow" });
    }
});

app.delete("/api/workflows/:id", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const result = await deleteWorkflow(req.params.id);
        if (result.error) return res.status(404).json(result);
        res.json(result);
    } catch (err) {
        console.error("[api/workflows/:id] delete error:", err.message);
        res.status(500).json({ error: err.message || "Failed to delete workflow" });
    }
});

app.post("/api/workflows/:id/publish", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const result = await publishWorkflow(req.params.id, req.body || {});
        if (result.error) return res.status(400).json(result);
        res.json(result);
    } catch (err) {
        console.error("[api/workflows/:id/publish] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to publish workflow" });
    }
});

app.post("/api/workflows/:id/rollback", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const { targetVersion, publish } = req.body || {};
        if (!targetVersion) return res.status(400).json({ error: "targetVersion is required" });
        const result = await rollbackWorkflow(req.params.id, { targetVersion, publish });
        if (result.error) return res.status(400).json(result);
        res.json(result);
    } catch (err) {
        console.error("[api/workflows/:id/rollback] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to rollback workflow" });
    }
});

app.post("/api/workflows/:id/duplicate", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const result = await duplicateWorkflow(req.params.id, req.body || {});
        if (result.error) return res.status(404).json(result);
        res.status(201).json(result);
    } catch (err) {
        console.error("[api/workflows/:id/duplicate] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to duplicate workflow" });
    }
});

app.get("/api/customers/:phone/timeline", requireTenantScope({ optional: true }), async (req, res) => {
    try {
        const phone = normalizePhone(req.params.phone);
        const items = await getTimeline(phone);
        res.json({ items });
    } catch (err) {
        console.error("[api/customers/:phone/timeline] error:", err.message);
        res.status(500).json({ error: err.message || "Failed to load timeline" });
    }
});

/** Legacy Meta/WhatsApp webhook — delegates to whatsappAdapter via Integration Hub */
app.get("/webhook", (req, res) => handleLegacyWhatsAppWebhook(req, res));
app.post("/webhook", (req, res) => handleLegacyWhatsAppWebhook(req, res));

/** Unified integration webhooks + monitoring API */
mountIntegrationRoutes(app);

/** Phase 3–6 Customer Operations — CRM, Inbox, Appointments, Notifications, Reports */
mountCustomerOpsRoutes(app);
}

export async function runBackgroundInit() {
    initEventSystem();
    initIntegrationHub();

    const optional = ["VERIFY_TOKEN", "PHONE_NUMBER_ID", "WHATSAPP_TOKEN", "OPENAI_API_KEY"];
    const missing = optional.filter((k) => !process.env[k]);
    if (missing.length) {
        console.error("[startup] Missing optional env vars:", missing.join(", "));
    }

    try {
        const adapter = await getStorageAdapter();
        await seedDemoCustomersIfEmpty(adapter);
        await seedCustomerOpsDemoIfEmpty();
        try {
            await seedPackVersions();
        } catch (err) {
            console.error("[startup] Marketplace version seed skipped:", err.message);
        }

        if (process.env.DEFAULT_COMPANY_ID) {
            try {
                await provisionCompany(process.env.DEFAULT_COMPANY_ID, {
                    name: "Default Tenant",
                    plan: "business",
                    status: "active",
                });
                console.error("[startup] Provisioned DEFAULT_COMPANY_ID:", process.env.DEFAULT_COMPANY_ID);
            } catch (err) {
                console.error("[startup] DEFAULT_COMPANY_ID provisioning skipped:", err.message);
            }
        }

        startMessageWorker();
        console.error("[startup] Storage backend:", adapter.name);
    } catch (err) {
        console.error("[startup] Background init error:", err.message);
    }
}
