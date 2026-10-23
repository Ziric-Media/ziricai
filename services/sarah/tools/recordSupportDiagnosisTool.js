import { recordSupportDiagnosis } from "../../tenants/supportCaseService.js";

export default {
    name: "recordSupportDiagnosis",
    description: "Record structured diagnosis on an existing support case (support record only — not infrastructure).",
    parameters: {
        type: "object",
        properties: {
            caseId: { type: "string" },
            summary: { type: "string" },
            issueClass: { type: "string" },
            affectedService: { type: "string" },
            confidence: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
        },
        required: ["caseId", "summary"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const caseId = args.caseId || ctx.sessionContext?.activeSupportCaseId;
        if (!caseId) {
            return { success: false, code: "MISSING_CASE", message: "caseId is required." };
        }
        const supportCase = await recordSupportDiagnosis(
            ctx.companyId,
            caseId,
            {
                summary: args.summary,
                issueClass: args.issueClass,
                affectedService: args.affectedService,
                confidence: args.confidence,
                evidence: args.evidence,
                sarahConfidence: args.confidence,
            },
            { uid: ctx.uid || "sarah" }
        );
        return {
            message: `Diagnosis recorded on case ${caseId}.`,
            data: { supportCase },
            completionType: "support_case_update",
        };
    },
};
