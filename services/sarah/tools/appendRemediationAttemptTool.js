import { appendRemediationAttempt } from "../../tenants/supportCaseService.js";

export default {
    name: "appendRemediationAttempt",
    description: "Append a remediation attempt entry to a support case audit trail (case record only).",
    parameters: {
        type: "object",
        properties: {
            caseId: { type: "string" },
            tool: { type: "string" },
            outcome: { type: "string", enum: ["pending", "success", "failed", "skipped"] },
            message: { type: "string" },
            verified: { type: "boolean" },
        },
        required: ["caseId", "tool", "outcome"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const caseId = args.caseId || ctx.sessionContext?.activeSupportCaseId;
        if (!caseId) {
            return { success: false, code: "MISSING_CASE", message: "caseId is required." };
        }
        const result = await appendRemediationAttempt(
            ctx.companyId,
            caseId,
            {
                tool: args.tool,
                outcome: args.outcome,
                message: args.message,
                verified: args.verified,
            },
            { uid: ctx.uid || "sarah" }
        );
        return {
            message: `Remediation attempt logged on case ${caseId}.`,
            data: result,
            supportCase: result.supportCase,
            completionType: "support_case_update",
        };
    },
};
