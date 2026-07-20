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

/**
 * Build Sarah context from Express request + optional overrides.
 * @param {import('express').Request} req
 * @param {{ companyId?: string, sessionId?: string, surface?: string }} [overrides]
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

    return {
        companyId,
        companyName: resolvedCompany?.name || companyId,
        uid: tenant.uid,
        email: tenant.email,
        role,
        isSuperAdmin: tenant.isSuperAdmin,
        permissions,
        profile: tenant.profile,
        sessionId: overrides.sessionId || null,
        surface: overrides.surface || "portal",
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
                status: resolvedCompany?.whatsappConnected ? "connected" : "pending",
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
    return parts.join(". ");
}
