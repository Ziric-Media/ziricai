import { uploadKnowledgeForEmployee, resolveAiEmployee } from "../../ai-core/aiCoreBridge.js";
import { setSessionContext } from "../sarahMemory.js";

export default {
    name: "trainAI",
    description:
        "Train an AI employee with new examples, tone guidance, or escalation rules by adding content to their knowledge base.",
    parameters: {
        type: "object",
        properties: {
            agentId: { type: "string", description: "AI employee ID" },
            employeeName: { type: "string", description: "AI employee name" },
            employeeRole: { type: "string", description: "AI employee role" },
            instruction: { type: "string", description: "Training instruction or example dialogue" },
            title: { type: "string", description: "Optional document title" },
        },
        required: ["instruction"],
    },
    requiredPermissions: ["canEditAI"],
    async execute(ctx, args) {
        const instruction = String(args.instruction || "").trim();
        if (!instruction) {
            return { message: "Please provide a training instruction or example.", data: { saved: false } };
        }

        const employee = await resolveAiEmployee(ctx.companyId, {
            agentId: args.agentId,
            name: args.employeeName,
            role: args.employeeRole,
        });

        const title =
            args.title ||
            `Training — ${employee?.name || "AI Employee"} — ${new Date().toISOString().slice(0, 10)}`;

        const result = await uploadKnowledgeForEmployee(ctx.companyId, {
            title,
            content: instruction,
            type: "manual",
            agentId: employee?.id,
            employeeName: employee?.name || args.employeeName,
            employeeRole: employee?.roleLabel || args.employeeRole,
            source: "sarah-train",
        });

        if (ctx.sessionId) {
            setSessionContext(ctx.sessionId, {
                lastAgentId: result.employee?.id,
                lastAgentName: result.employee?.name,
                lastKnowledgeBaseId: result.knowledgeBaseId,
            });
        }

        return {
            message: employee
                ? `Training content added for "${employee.name}". They will use this in future replies.`
                : `Training content saved to company Knowledge Base. Link it to an AI Employee in Agents settings.`,
            data: result,
            uiHints: [{ navigate: "agents" }, { navigate: "knowledge" }],
        };
    },
};
