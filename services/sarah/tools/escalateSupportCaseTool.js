import { escalateSupportCase } from "../../tenants/supportCaseService.js";

export default {
    name: "escalateSupportCase",
    description: "Escalate a support case to platform operators with a documented reason.",
    parameters: {
        type: "object",
        properties: {
            caseId: { type: "string" },
            reason: { type: "string" },
            recommendedOperatorAction: { type: "string" },
        },
        required: ["caseId", "reason"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const caseId = args.caseId || ctx.sessionContext?.activeSupportCaseId;
        if (!caseId) {
            return { success: false, code: "MISSING_CASE", message: "caseId is required." };
        }
        const supportCase = await escalateSupportCase(
            ctx.companyId,
            caseId,
            {
                reason: args.reason,
                recommendedOperatorAction: args.recommendedOperatorAction,
                sarahConfidence: ctx.sessionContext?.lastConfidence,
            },
            { uid: ctx.uid || "sarah" }
        );
        return {
            message: `Case ${caseId} escalated to platform operators.`,
            data: { supportCase },
            completionType: "support_case_update",
        };
    },
};
