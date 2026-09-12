/**
 * Post-update validation — additive Marketplace pack updates only.
 */
import { listKnowledgeDocuments } from "../tenants/knowledgeService.js";
import { listWorkflows } from "../automation/workflowRegistry.js";

export async function validatePackUpdate(companyId, { knowledgeDocIds = [], workflowIds = [] } = {}) {
    const errors = [];
    const checks = [];

    const [documents, workflows] = await Promise.all([
        listKnowledgeDocuments(companyId),
        listWorkflows(companyId),
    ]);

    for (const docId of knowledgeDocIds) {
        const doc = documents.find((d) => d.id === docId);
        if (!doc) {
            errors.push(`Knowledge document ${docId} not found via tenant API`);
            checks.push({ key: `doc:${docId}`, ok: false });
        } else {
            checks.push({ key: `doc:${docId}`, ok: true, title: doc.title });
        }
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

    return {
        valid: errors.length === 0,
        errors,
        checks,
        verified: {
            knowledgeDocs: knowledgeDocIds.length,
            workflows: workflowIds.length,
        },
    };
}
