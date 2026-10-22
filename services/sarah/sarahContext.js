/**
 * Resolve Sarah execution context — user, tenant, role, permissions, workspace snapshot.
 */
import { resolveTenantContext } from "../core/tenantContext.js";
import { getPermissions, canUseTool } from "./permissions.js";
import { getPortalCompanyAsync } from "../portal/portalDemo.js";
import { getWorkspaceSnapshot } from "../portal/workspaceService.js";
import { listAiEmployees } from "../tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../tenants/knowledgeService.js";
import { getWhatsAppIntegration } from "../tenants/integrationService.js";
import {
    moduleKeyFromPortalSurface,
    moduleLabelFromKey,
    PORTAL_SARAH_SURFACES,
    isPortalClientSurface,
} from "./portalSarahSurfaces.js";
import { PORTAL_NAV_TARGETS } from "./portalNavigation.js";
import {
    listPendingInstructionsForModule,
    listWorkforceInstructions,
} from "../bos/workforceInstructionService.js";
import { resolvePersonaFromSurface } from "./sarahPersona.js";
import { resolveFinanceSarahActive } from "./financeSarahToolPolicy.js";
import { resolveOperationsSarahActive } from "./operationsSarahToolPolicy.js";

function readSarahPageContextFromRequest(req) {
    if (!req) return null;
    if (req.body?.pageContext && typeof req.body.pageContext === "object") {
        return req.body.pageContext;
    }
    const raw = req.query?.pageContext;
    if (!raw) return null;
    try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        return null;
    }
}

/**
 * Build Sarah context from Express request + optional overrides.
 * @param {import('express').Request} req
 * @param {{ companyId?: string, sessionId?: string, surface?: string, persona?: string, pageContext?: object|null }} [overrides]
 */
export async function buildSarahContext(req, overrides = {}) {
    const tenant = await resolveTenantContext(req);
    const companyId = overrides.companyId || tenant.companyId || process.env.DEFAULT_COMPANY_ID || "demo-central-motors";
    const role = tenant.role || "owner";
    const permissions = getPermissions(role);

    const [company, workspace, agents, knowledgeDocs, waIntegration] = await Promise.all([
        getPortalCompanyAsync(companyId).catch(() => null),
        getWorkspaceSnapshot(companyId).catch(() => null),
        listAiEmployees(companyId).catch(() => []),
        listKnowledgeDocuments(companyId).catch(() => []),
        getWhatsAppIntegration(companyId).catch(() => null),
    ]);

    const resolvedCompany = workspace?.company || company || { id: companyId, name: companyId };
    const kbSummary = {
        knowledgeBaseId: workspace?.workspaceLinks?.knowledgeBaseId || `kb-${companyId}`,
        documentCount: knowledgeDocs.length,
        titles: knowledgeDocs.slice(0, 8).map((d) => d.title).filter(Boolean),
    };

    const agentList = agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.roleLabel || a.role,
        isDefault: Boolean(a.isDefault),
        status: a.status || "active",
    }));

    const defaultAgent = agentList.find((a) => a.isDefault) || agentList[0] || null;
    const surface = overrides.surface || "portal-admin";
    const pageContext = overrides.pageContext ?? readSarahPageContextFromRequest(req) ?? null;
    const persona = overrides.persona || resolvePersonaFromSurface(surface);
    const financeSarah = resolveFinanceSarahActive({
        persona,
        surface,
        uid: tenant.uid,
        pageContext,
    });
    const operationsSarah = resolveOperationsSarahActive({
        persona,
        surface,
        uid: tenant.uid,
        pageContext,
    });
    const moduleKey = pageContext?.module || moduleKeyFromPortalSurface(surface);

    let workforceInstructionsPending = [];
    let workforceInstructionsRecent = [];
    if (isPortalClientSurface(surface)) {
        try {
            if (moduleKey === "admin") {
                workforceInstructionsRecent = await listWorkforceInstructions(companyId, { limit: 12 });
            } else if (["sales", "finance", "operations", "hr"].includes(moduleKey)) {
                workforceInstructionsPending = await listPendingInstructionsForModule(companyId, moduleKey, {
                    limit: 10,
                });
            }
        } catch (err) {
            console.warn("[sarahContext] workforce instructions load failed:", err.message);
        }
    }

    return {
        companyId,
        companyName: resolvedCompany?.name || companyId,
        companyIndustry:
            resolvedCompany?.industry ||
            workspace?.company?.industry ||
            company?.industry ||
            null,
        uid: tenant.uid,
        email: tenant.email,
        role,
        isSuperAdmin: tenant.isSuperAdmin,
        permissions,
        profile: tenant.profile,
        sessionId: overrides.sessionId || null,
        surface,
        persona,
        financeSarah,
        operationsSarah,
        pageContext,
        workforceInstructionsPending,
        workforceInstructionsRecent,
        canUseTool: (tool) => canUseTool({ role, isSuperAdmin: tenant.isSuperAdmin }, tool),
        workspace,
        workspaceLinks: workspace?.workspaceLinks || null,
        resources: workspace?.resources || null,
        agents: agentList,
        defaultAgent,
        kbSummary,
        integrations: {
            whatsapp: waIntegration || {
                provider: "whatsapp",
                status: "not_configured",
            },
        },
        plan: workspace?.company?.plan || resolvedCompany?.plan || "trial",
    };
}

export function assertToolAccess(ctx, tool) {
    if (ctx.canUseTool(tool)) return;
    const permList = (tool.requiredPermissions || []).join(", ") || "elevated access";
    throw Object.assign(
        new Error(`You don't have permission to use "${tool.name}". Required: ${permList}.`),
        { code: "PERMISSION_DENIED", status: 403 }
    );
}

export function buildWorkspaceContextHint(ctx) {
    const parts = [];
    if (ctx.defaultAgent?.name) {
        parts.push(`Default AI employee: ${ctx.defaultAgent.name} (${ctx.defaultAgent.role || "support"})`);
    }
    if (ctx.agents?.length) {
        parts.push(`AI team (${ctx.agents.length}): ${ctx.agents.map((a) => a.name).join(", ")}`);
    }
    if (ctx.kbSummary?.documentCount != null) {
        parts.push(`Knowledge base: ${ctx.kbSummary.documentCount} document(s)`);
        if (ctx.kbSummary.titles?.length) {
            parts.push(`Topics include: ${ctx.kbSummary.titles.slice(0, 3).join("; ")}`);
        }
    }
    if (ctx.integrations?.whatsapp?.status) {
        parts.push(`WhatsApp: ${ctx.integrations.whatsapp.status}`);
    }
    if (ctx.resources) {
        parts.push(
            `Workspace: ${ctx.resources.aiEmployees || 0} agents, ${ctx.resources.knowledge || 0} KB items, ${ctx.resources.crm || 0} CRM contacts`
        );
    }

    const surface = String(ctx.surface || "portal-admin").toLowerCase();
    const moduleKey = ctx.pageContext?.module || moduleKeyFromPortalSurface(surface);
    const moduleLabel = moduleLabelFromKey(moduleKey);
    parts.push(
        `Sarah workforce module: ${moduleLabel} (surface ${surface}). This chat is separate from Sarah in other modules — stay focused on ${moduleLabel} responsibilities.`
    );

    if (moduleKey === "admin" || surface === PORTAL_SARAH_SURFACES.ADMIN || surface === "portal") {
        const portalGuide = Object.entries(PORTAL_NAV_TARGETS)
            .map(([id, meta]) => `${meta.label} (${id})`)
            .join("; ");
        parts.push(
            "Sarah Admin: company-wide coordinator — answer company questions in this chat first; use navigatePortal with takeUserThere only when the owner explicitly asks to open a module (respect role permissions)."
        );
        parts.push(`Portal modules: ${portalGuide}`);
        parts.push(
            "Workforce Sarah modules: Sarah Sales (conversations/inbox), Sarah Finance (finance), Sarah Operations (operations), Sarah HR (hr). Delegate cross-module work with issueWorkforceInstruction and BOS commercial cycles."
        );
        const industry = String(ctx.companyIndustry || "").trim();
        if (industry) {
            parts.push(
                `Tenant industry: ${industry}. Offer practical, industry-aware advice for this business when the owner asks (workflows, customer expectations, compliance tone) — stay within ZiricAI capabilities and their configured data.`
            );
        } else {
            parts.push(
                "Tenant industry is not set — ask or infer cautiously from company name and knowledge base; suggest setting industry in Settings when relevant."
            );
        }
    }
    if (moduleKey === "operations" || surface === PORTAL_SARAH_SURFACES.OPERATIONS) {
        parts.push("Sarah Operations: tasks, projects, client database, workflows. Prefer listTasks / createTask for operational work.");
        if (ctx.pageContext?.section) parts.push(`Operations section: ${ctx.pageContext.section}`);
    }
    if (moduleKey === "hr" || surface === PORTAL_SARAH_SURFACES.HR) {
        parts.push("Sarah HR: team and HR workflows (some areas may be preview until HRIS is connected).");
        if (ctx.pageContext?.workspace) parts.push(`HR workspace: ${ctx.pageContext.workspace}`);
    }
    if (moduleKey === "sales" || surface === PORTAL_SARAH_SURFACES.SALES) {
        parts.push("Sarah Sales: inbox, leads, and channel conversations. Prefer viewConversations and CRM tools.");
        if (ctx.pageContext?.section) parts.push(`Sales section: ${ctx.pageContext.section}`);
    }
    if (moduleKey === "finance" || surface === PORTAL_SARAH_SURFACES.FINANCE || ctx.pageContext?.module === "finance") {
        const pc = ctx.pageContext;
        parts.push(
            `Finance UI (descriptive): ${pc?.financeWorkspaceLabel || pc?.financeWorkspace || "Finance"}`
        );
        parts.push(
            "F-Sarah 1–2: Finance Sarah uses allowlisted read tools for figures and prepare* + confirmFinanceWrite for user-confirmed invoices, quotations, and income/expense entries — never invent amounts."
        );
        parts.push(
            "State reporting period, currency, and dataCoverage.complete/limitations. Net movement is not profit or bank balance. No payments, voids, or GL claims without dedicated tools."
        );
    }

    const pending = ctx.workforceInstructionsPending || [];
    if (pending.length) {
        parts.push(
            `Pending instructions from Sarah Admin or humans (${pending.length}): ${pending
                .map((i) => `[${i.id}] ${i.instruction}`)
                .join(" | ")}. Use listWorkforceInstructions, execute with your module tools, then completeWorkforceInstruction.`
        );
    }
    if (moduleKey === "admin" && ctx.workforceInstructionsRecent?.length) {
        const open = ctx.workforceInstructionsRecent.filter((i) =>
            ["pending", "in_progress"].includes(i.status)
        );
        if (open.length) {
            parts.push(
                `Open workforce delegations you issued (${open.length}): ${open
                    .slice(0, 5)
                    .map((i) => `${i.targetModuleLabel}: ${i.instruction.slice(0, 80)}`)
                    .join("; ")}`
            );
        }
    }
    if (moduleKey === "admin") {
        parts.push(
            "Sarah Admin coordinates the workforce: use issueWorkforceInstruction to delegate to Sales, Finance, Operations, or HR Sarah. Humans may also assign instructions via the portal."
        );
    }

    return parts.join(". ");
}
