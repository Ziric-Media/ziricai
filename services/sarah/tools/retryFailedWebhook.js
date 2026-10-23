import { runRetryFailedWebhookRemediation } from "../../support/remediation/actions/retryFailedWebhook.js";
import { remediationToolResult } from "./remediationToolCommon.js";

export default {
    name: "retryFailedWebhook",
    description:
        "Approved remediation (PI-4F-3): requeue failed webhook/message processing jobs for this tenant after pre-checks. Requires supportCaseId. Post-verifies recovery — never claims success on HTTP 200 alone.",
    parameters: {
        type: "object",
        properties: {
            caseId: { type: "string", description: "Support case id" },
        },
        required: ["caseId"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const caseId = args.caseId || ctx.sessionContext?.activeSupportCaseId;
        if (!caseId) {
            return {
                success: false,
                error: "caseId is required (or active support case in session).",
                code: "MISSING_CASE",
            };
        }
        const result = await runRetryFailedWebhookRemediation(ctx.companyId, caseId, ctx, args);
        return remediationToolResult(result, "Webhook retry");
    },
};
