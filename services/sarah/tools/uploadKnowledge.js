import { uploadKnowledgeForEmployee } from "../../ai-core/aiCoreBridge.js";
import { setSessionContext } from "../sarahMemory.js";

export default {
    name: "uploadKnowledge",
    description:
        "Add content to a company or AI employee knowledge base — FAQ, policy, product info, or pasted text. Optionally target a specific AI employee by name or role.",
    parameters: {
        type: "object",
        properties: {
            title: { type: "string", description: "Document title" },
            content: { type: "string", description: "Text content to store" },
            type: {
                type: "string",
                enum: ["faq", "manual", "policy", "product"],
                description: "Document type",
            },
            employeeName: {
                type: "string",
                description: "Target AI employee by name (e.g. Emma, Funeral AI)",
            },
            employeeRole: {
                type: "string",
                description: "Target AI employee by role (e.g. Reception, Sales)",
            },
        },
        required: ["title", "content"],
    },
    requiredPermissions: ["canEditAI"],
    async execute(ctx, args) {
        const title = String(args.title || "").trim();
        const content = String(args.content || "").trim();
        if (!title || !content) {
            return { message: "Title and content are required to upload knowledge.", data: { saved: false } };
        }

        const result = await uploadKnowledgeForEmployee(ctx.companyId, {
            title,
            content,
            type: args.type || "manual",
            employeeName: args.employeeName,
            employeeRole: args.employeeRole,
            source: "sarah-chat",
        });

        const employeeLabel = result.employee?.name
            ? `"${result.employee.name}" (${result.employee.roleLabel || result.employee.role})`
            : "company default";

        if (ctx.sessionId) {
            setSessionContext(ctx.sessionId, {
                lastAgentId: result.employee?.id,
                lastAgentName: result.employee?.name,
                lastKnowledgeBaseId: result.knowledgeBaseId,
                lastKbTopic: title,
            });
        }

        return {
            message:
                `Knowledge document "${title}" saved to ${employeeLabel}'s Knowledge Base (${result.knowledgeBaseId}).`,
            data: {
                document: result.document,
                employee: result.employee,
                knowledgeBaseId: result.knowledgeBaseId,
            },
            uiHints: [{ navigate: "knowledge" }, { navigate: "agents" }],
        };
    },
};
