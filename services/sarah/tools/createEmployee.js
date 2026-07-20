import { createEmployeeWithKnowledge } from "../../ai-core/aiCoreBridge.js";

export default {
    name: "createEmployee",
    description:
        "Create a new AI employee (agent) for the company — e.g. Sales AI, Reception AI, Support AI. Auto-provisions a linked Knowledge Base.",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string", description: "Display name for the AI employee" },
            role: {
                type: "string",
                description: "Role label e.g. Reception, Sales, Support, Funeral",
            },
            channel: {
                type: "string",
                enum: ["whatsapp", "web", "all"],
                description: "Primary channel",
            },
        },
        required: ["name"],
    },
    requiredPermissions: ["canEditAI"],
    async execute(ctx, args) {
        const name = String(args.name || "Sarah").trim();
        const role = args.role || "Reception";

        const result = await createEmployeeWithKnowledge(ctx.companyId, {
            name,
            roleLabel: role,
            companyName: ctx.companyName,
            channels:
                args.channel === "whatsapp"
                    ? { whatsapp: true }
                    : args.channel === "web"
                      ? { websiteChat: true }
                      : { whatsapp: true, websiteChat: true },
        });

        const { employee, knowledgeBaseId, agentId } = result;

        return {
            message:
                `Created AI employee "${employee.name}" (${employee.roleLabel || role}). ` +
                `Linked to Knowledge Base ${knowledgeBaseId}. ` +
                `Manage in AI Employees or upload training docs in Knowledge Base.`,
            data: { agentId, employee, knowledgeBaseId },
            uiHints: [
                { navigate: "agents" },
                { navigate: "knowledge" },
                { openWizard: "createAgent", agentId },
            ],
        };
    },
};
