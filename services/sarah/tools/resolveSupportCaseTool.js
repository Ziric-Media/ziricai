import { resolveSupportCaseWithVerification } from "../../tenants/supportCaseService.js";

export default {
    name: "resolveSupportCaseWithVerification",
    description: "Resolve a support case after verification (updates case record only).",
    parameters: {
        type: "object",
        properties: {
            caseId: { type: "string" },
            summary: { type: "string" },
            autoResolved: { type: "boolean" },
        },
        required: ["caseId", "summary"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const caseId = args.caseId || ctx.sessionContext?.activeSupportCaseId;
        if (!caseId) {
            return { success: false, code: "MISSING_CASE", message: "caseId is required." };
        }
        const supportCase = await resolveSupportCaseWithVerification(
            ctx.companyId,
            caseId,
            { summary: args.summary, autoResolved: args.autoResolved === true },
            { uid: ctx.uid || "sarah" }
        );
        return {
            message: `Case ${caseId} marked resolved.`,
            data: { supportCase },
            completionType: "support_case_update",
        };
    },
};
