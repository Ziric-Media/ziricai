import { gatherKnowledgeBaseStatus } from "../../support/diagnostics/gatherTenantDiagnostics.js";

export default {
    name: "viewKnowledgeBaseStatus",
    description: "Read-only knowledge base status: document count and whether content is indexed for AI answers.",
    parameters: { type: "object", properties: {} },
    requiredPermissions: ["canEditAI"],
    async execute(ctx) {
        const data = await gatherKnowledgeBaseStatus(ctx.companyId);
        const message = data.hasDocuments
            ? `Knowledge base has ${data.documentCount} document(s).`
            : "Knowledge base is empty — upload documents so AI employees can answer from your content.";
        return { message, data, completionType: "read_only" };
    },
};
