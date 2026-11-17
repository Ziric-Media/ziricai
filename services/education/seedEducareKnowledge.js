/**
 * Seed Educare Knowledge Centre v1.0 + refresh Company Sarah system prompt.
 */
import { EDUCARE_COMPANY_ID } from "./educareDefaults.js";
import { EDUCARE_KB_DOCUMENTS, EDUCARE_KB_VERSION, EDUCARE_SARAH_SYSTEM_PROMPT } from "../storage/educareSchoolKnowledge.js";
import { getCompany } from "../tenants/companyService.js";
import { ensureKnowledgeBase, saveKnowledgeDocument } from "../tenants/knowledgeService.js";
import { getDefaultAiEmployee, updateAiEmployee } from "../tenants/aiEmployeeService.js";

/**
 * @param {string} [companyId]
 * @returns {Promise<{ companyId: string, version: string, documents: number, agentId: string|null }>}
 */
export async function seedEducareKnowledge(companyId = EDUCARE_COMPANY_ID) {
    const company = await getCompany(companyId);
    if (!company) {
        throw Object.assign(new Error(`Company not found: ${companyId}`), { code: "COMPANY_NOT_FOUND" });
    }

    await ensureKnowledgeBase(companyId);
    const kbId = company.knowledgeBaseId || `kb-${companyId}`;

    let written = 0;
    for (const doc of EDUCARE_KB_DOCUMENTS) {
        await saveKnowledgeDocument({
            companyId,
            knowledgeBaseId: kbId,
            id: doc.id,
            title: doc.title,
            category: doc.category,
            type: doc.type,
            content: doc.content,
        });
        written += 1;
    }

    let agentId = null;
    const agent = await getDefaultAiEmployee(companyId);
    if (agent?.id) {
        agentId = agent.id;
        await updateAiEmployee(companyId, agentId, {
            systemPrompt: EDUCARE_SARAH_SYSTEM_PROMPT,
            roleLabel: agent.roleLabel || "School Reception",
        });
    }

    return { companyId, version: EDUCARE_KB_VERSION, documents: written, agentId };
}
