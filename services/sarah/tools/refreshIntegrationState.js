import { runRefreshIntegrationStateRemediation } from "../../support/remediation/actions/refreshIntegrationState.js";
import { remediationToolResult } from "./remediationToolCommon.js";

export default {
    name: "refreshIntegrationState",
    description:
        "Approved remediation (PI-4F-3): reconcile stale WhatsApp integration state for this tenant. Does NOT re-authenticate or change Meta credentials.",
    parameters: {
        type: "object",
        properties: {
            caseId: { type: "string" },
        },
        required: ["caseId"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const caseId = args.caseId || ctx.sessionContext?.activeSupportCaseId;
        if (!caseId) {
            return { success: false, error: "caseId is required.", code: "MISSING_CASE" };
        }
        const result = await runRefreshIntegrationStateRemediation(ctx.companyId, caseId, ctx, args);
        return remediationToolResult(result, "Integration refresh");
    },
};
