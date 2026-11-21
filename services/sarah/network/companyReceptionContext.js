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
import { isDentalPracticeCompany } from "../../dental/dentalIndustryPreset.js";
import { smilemorePracticePrompt, SMILEMORE_PUBLIC_WEBSITE } from "../../dental/smilemorePractice.js";

const EDUCARE_DIGEST_PRIORITY_IDS = [
    "edu-pack-core",
    "edu-sarah-kb-master",
    "edu-kb-001",
    "edu-pack-primary",
    "edu-pack-secondary",
];

function buildKnowledgeDigest(docs, maxChars = 2800) {
    const active = (docs || []).filter(
        (doc) => doc && (doc.title || doc.content) && String(doc.status || "active") !== "archived"
    );
    active.sort((a, b) => {
        const ai = EDUCARE_DIGEST_PRIORITY_IDS.indexOf(a.id);
        const bi = EDUCARE_DIGEST_PRIORITY_IDS.indexOf(b.id);
        const ar = ai === -1 ? 999 : ai;
        const br = bi === -1 ? 999 : bi;
        if (ar !== br) return ar - br;
        return String(a.title || "").localeCompare(String(b.title || ""));
    });
    const parts = [];
    let used = 0;
    for (const doc of active) {
        const body = String(doc.content || doc.answer || "").trim();
        const block = `### ${doc.title || "Document"}\n${body.slice(0, 800)}`;
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
    const dentalPracticePrompt = isDentalPracticeCompany(companyId, resolvedCompany)
        ? smilemorePracticePrompt()
        : null;
    const defaultAgent = agents.find((a) => a.isDefault) || agents[0] || null;
    const knowledgeBaseId = defaultAgent?.knowledgeBaseId || resolvedCompany?.knowledgeBaseId || `kb-${companyId}`;
    const role = "agent";
    const permissions = getPermissions(role);

    return {
        companyId,
        companyName: resolvedCompany?.name || companyId,
        defaultAgent,
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
            knowledgeBaseId,
            documentCount: knowledgeDocs.length,
            titles: knowledgeDocs.map((d) => d.title).filter(Boolean),
            digest: buildKnowledgeDigest(knowledgeDocs),
        },
        networkEnquiry: options.enquiry || null,
        consumerDisplayName: options.consumerDisplayName || "Guest",
        dentalPracticePrompt,
        publicWebsite: isDentalPracticeCompany(companyId, resolvedCompany) ? SMILEMORE_PUBLIC_WEBSITE : null,
    };
}
