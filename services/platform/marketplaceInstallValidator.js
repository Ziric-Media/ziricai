/**
 * Post-install validation — verifies pack resources exist in tenant APIs
 * before marking a marketplace install successful.
 */
import { listAiEmployees } from "../tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../tenants/knowledgeService.js";
import { listWorkflows } from "../automation/workflowRegistry.js";
import { getPackById, resolvePackId } from "./marketplaceRegistry.js";

function buildVerifiedSummary(agentNames, docCount, workflowCount) {
    const agentPart = agentNames.length
        ? agentNames.join(", ")
        : "AI Employee";
    const docLabel = docCount === 1 ? "doc" : "docs";
    const wfLabel = workflowCount === 1 ? "workflow" : "workflows";
    return `Installed: ${agentPart}, ${docCount} ${docLabel}, ${workflowCount} ${wfLabel}`;
}

/**
 * @param {string} companyId
 * @param {object} installResult — result from installIndustryPack
 * @param {string} packId
 */
export async function validatePackInstall(companyId, installResult, packId) {
    const resolved = resolvePackId(packId);
    const pack = getPackById(resolved);
    const expectedAgents = pack?.agents?.length || 0;
    const expectedKnowledge = pack?.knowledge?.length || 0;
    const expectedWorkflows = pack?.workflows?.length || 0;

    if (installResult?.alreadyInstalled) {
        const links = installResult.links || {};
        const agentNames = links.agentNames || [];
        const docCount = links.knowledgeDocIds?.length || 0;
        const workflowCount = links.workflowIds?.length || 0;
        return {
            valid: true,
            alreadyInstalled: true,
            verified: {
                agentNames,
                knowledgeDocs: docCount,
                workflows: workflowCount,
            },
            summary: buildVerifiedSummary(agentNames, docCount, workflowCount),
            errors: [],
            checks: [{ key: "alreadyInstalled", ok: true }],
        };
    }

    const links = installResult?.links || {};
    const agentIds = links.agents || [];
    const knowledgeDocIds = links.knowledgeDocIds || [];
    const workflowIds = links.workflowIds || [];

    const [agents, documents, workflows] = await Promise.all([
        listAiEmployees(companyId),
        listKnowledgeDocuments(companyId),
        listWorkflows(companyId),
    ]);

    const errors = [];
    const checks = [];
    const verifiedAgentNames = [];

    if (expectedAgents > 0 && agentIds.length < expectedAgents) {
        errors.push(`Expected ${expectedAgents} AI employee(s), provisioned ${agentIds.length}`);
    }

    for (const agentId of agentIds) {
        const agent = agents.find((a) => a.id === agentId);
        if (!agent) {
            errors.push(`AI employee ${agentId} not found via tenant API`);
            checks.push({ key: `agent:${agentId}`, ok: false });
            continue;
        }
        if (!agent.systemPrompt) {
            errors.push(`AI employee "${agent.name}" is missing systemPrompt`);
        }
        if (!agent.knowledgeBaseId) {
            errors.push(`AI employee "${agent.name}" is missing knowledgeBaseId`);
        }
        verifiedAgentNames.push(agent.name || agentId);
        checks.push({ key: `agent:${agentId}`, ok: true, name: agent.name });
    }

    if (expectedKnowledge > 0 && knowledgeDocIds.length === 0) {
        errors.push("No knowledge documents were provisioned");
    }

    for (const docId of knowledgeDocIds) {
        const doc = documents.find((d) => d.id === docId);
        if (!doc) {
            errors.push(`Knowledge document ${docId} not found via tenant API`);
            checks.push({ key: `doc:${docId}`, ok: false });
        } else {
            checks.push({ key: `doc:${docId}`, ok: true, title: doc.title });
        }
    }

    if (expectedWorkflows > 0 && workflowIds.length < expectedWorkflows) {
        errors.push(`Expected ${expectedWorkflows} workflow(s), provisioned ${workflowIds.length}`);
    }

    for (const wfId of workflowIds) {
        const wf = workflows.find((w) => w.id === wfId);
        if (!wf) {
            errors.push(`Workflow ${wfId} not found via automation API`);
            checks.push({ key: `workflow:${wfId}`, ok: false });
        } else if (wf.status !== "active" && wf.status !== "published") {
            errors.push(`Workflow "${wf.name}" is not active`);
            checks.push({ key: `workflow:${wfId}`, ok: false, status: wf.status });
        } else {
            checks.push({ key: `workflow:${wfId}`, ok: true, name: wf.name });
        }
    }

    const docCount = knowledgeDocIds.length;
    const workflowCount = workflowIds.length;

    return {
        valid: errors.length === 0,
        verified: {
            agentNames: verifiedAgentNames.length ? verifiedAgentNames : links.agentNames || [],
            knowledgeDocs: docCount,
            workflows: workflowCount,
        },
        summary: buildVerifiedSummary(
            verifiedAgentNames.length ? verifiedAgentNames : links.agentNames || [],
            docCount,
            workflowCount
        ),
        errors,
        checks,
        expected: {
            agents: expectedAgents,
            knowledge: expectedKnowledge,
            workflows: expectedWorkflows,
        },
    };
}

export { buildVerifiedSummary };
