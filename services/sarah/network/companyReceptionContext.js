/**
 * Build Sarah context for Company Reception (Sarah Network dispatch) without portal session.
 */
import { getPortalCompanyAsync } from "../../portal/portalDemo.js";
import { getWorkspaceSnapshot } from "../../portal/workspaceService.js";
import { listAiEmployees } from "../../tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../../tenants/knowledgeService.js";
import { resolveSarahTenantCompanyRecord } from "../sarahContext.js";
import { SARAH_PERSONA } from "../sarahPersona.js";
import { getPermissions, canUseTool } from "../permissions.js";

function buildKnowledgeDigest(docs, maxChars = 6000) {
    const active = (docs || []).filter(
        (doc) => doc && (doc.title || doc.content) && String(doc.status || "active") !== "archived"
    );
    const parts = [];
    let used = 0;
    for (const doc of active) {
        const body = String(doc.content || doc.answer || "").trim();
        const block = `### ${doc.title || "Document"}\n${body.slice(0, 1200)}`;
        if (used + block.length > maxChars) break;
        parts.push(block);
        used += block.length + 2;
    }
    return parts.join("\n\n");
}

/**
 * @param {string} companyId
 * @param {string} consumerUid
 * @param {object} [options]
 */
export async function buildCompanyReceptionContext(companyId, consumerUid, options = {}) {
    const [company, workspace, agents, knowledgeDocs] = await Promise.all([
        getPortalCompanyAsync(companyId).catch(() => null),
        getWorkspaceSnapshot(companyId).catch(() => null),
        listAiEmployees(companyId).catch(() => []),
        listKnowledgeDocuments(companyId).catch(() => []),
    ]);

    const resolvedCompany = resolveSarahTenantCompanyRecord(workspace, company, companyId);
    const role = "agent";
    const permissions = getPermissions(role);

    return {
        companyId,
        companyName: resolvedCompany?.name || companyId,
        uid: consumerUid,
        role,
        isSuperAdmin: false,
        permissions,
        surface: "company_app",
        persona: SARAH_PERSONA.COMPANY_RECEPTION,
        financeSarah: false,
        sessionId: options.sessionId || null,
        canUseTool: (tool) => canUseTool({ role, isSuperAdmin: false }, tool),
        kbSummary: {
            documentCount: knowledgeDocs.length,
            digest: buildKnowledgeDigest(knowledgeDocs),
        },
        networkEnquiry: options.enquiry || null,
        consumerDisplayName: options.consumerDisplayName || "Guest",
    };
}
