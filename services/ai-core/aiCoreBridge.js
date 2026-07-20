/**
 * AI Core Bridge — coordinates AI Employees + Knowledge Base for Sarah and messageWorker.
 */
import {
    listAiEmployees,
    getAiEmployee,
    getDefaultAiEmployee,
    createAiEmployee,
    findAiEmployeeByNameOrRole,
} from "../tenants/aiEmployeeService.js";
import {
    ensureKnowledgeBase,
    saveKnowledgeDocument,
    listKnowledgeDocuments,
    searchKnowledgeForQuery,
} from "../tenants/knowledgeService.js";

/**
 * Resolve default or named AI employee for a tenant.
 * @param {string} companyId
 * @param {{ name?: string, role?: string, agentId?: string }} [selector]
 */
export async function resolveAiEmployee(companyId, selector = {}) {
    if (!companyId) return null;

    if (selector.agentId) {
        return getAiEmployee(companyId, selector.agentId);
    }

    if (selector.name || selector.role) {
        const found = await findAiEmployeeByNameOrRole(companyId, selector);
        if (found) return found;
    }

    return getDefaultAiEmployee(companyId);
}

/**
 * Get knowledge base id for an employee (or company default).
 */
export async function resolveKnowledgeBaseId(companyId, employee = null) {
    if (employee?.knowledgeBaseId) return employee.knowledgeBaseId;
    await ensureKnowledgeBase(companyId);
    return `kb-${companyId}`;
}

/**
 * Upload content to an employee's linked knowledge base.
 */
export async function uploadKnowledgeForEmployee(companyId, params) {
    const { employeeName, employeeRole, agentId, title, content, type, source } = params;

    const employee = await resolveAiEmployee(companyId, {
        agentId,
        name: employeeName,
        role: employeeRole,
    });

    const knowledgeBaseId = await resolveKnowledgeBaseId(companyId, employee);

    const saved = await saveKnowledgeDocument({
        companyId,
        knowledgeBaseId,
        title,
        content,
        type: type || "manual",
        source: source || "ai-core",
        agentId: employee?.id || null,
    });

    return { document: saved, employee, knowledgeBaseId };
}

/**
 * RAG-lite context for inbound messages — uses employee-linked KB when available.
 */
export async function retrieveAgentKnowledgeContext(companyId, queryText, employee = null) {
    const agent = employee || (await getDefaultAiEmployee(companyId));
    const knowledgeBaseId = await resolveKnowledgeBaseId(companyId, agent);

    const result = await searchKnowledgeForQuery(companyId, queryText, {
        knowledgeBaseId,
        limit: 3,
    });

    return {
        agent,
        knowledgeBaseId,
        context: result.context,
        sources: result.sources,
        documents: result.documents,
    };
}

/**
 * Create AI employee with auto-provisioned knowledge base link.
 */
export async function createEmployeeWithKnowledge(companyId, data) {
    const kbId = `kb-${companyId}`;
    await ensureKnowledgeBase(companyId, kbId);

    const employee = await createAiEmployee(companyId, {
        ...data,
        knowledgeBaseId: data.knowledgeBaseId || kbId,
    });

    return {
        employee,
        knowledgeBaseId: employee.knowledgeBaseId || kbId,
        agentId: employee.id,
    };
}

export {
    listAiEmployees,
    getDefaultAiEmployee,
    listKnowledgeDocuments,
};
