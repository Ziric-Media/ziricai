import { runPortalSupportDiagnosisWorkflow } from "../../support/portalSupportDiagnosisWorkflow.js";

export default {
    name: "investigateSupportIssue",
    description:
        "Run the full read-only support diagnosis workflow: gather evidence, record structured diagnosis on a support case, apply escalation policy. Does not change customer infrastructure.",
    parameters: {
        type: "object",
        properties: {
            message: { type: "string", description: "User's problem description" },
            affectedService: {
                type: "string",
                description: "Optional service hint: whatsapp, ai_employee, knowledge, billing, platform",
            },
            caseId: { type: "string", description: "Optional existing support case id to correlate" },
        },
        required: ["message"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        return runPortalSupportDiagnosisWorkflow(ctx, {
            message: args.message,
            affectedService: args.affectedService,
            sessionCaseId: args.caseId || ctx.sessionContext?.activeSupportCaseId,
        });
    },
};
