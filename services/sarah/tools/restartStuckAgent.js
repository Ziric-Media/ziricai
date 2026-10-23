import { runRestartStuckAgentRemediation } from "../../support/remediation/actions/restartStuckAgent.js";
import { remediationToolResult } from "./remediationToolCommon.js";

export default {
    name: "restartStuckAgent",
    description:
        "Approved remediation (PI-4F-3): restart operational state for a stuck AI employee (tenant-scoped, cooldown enforced). Requires supportCaseId.",
    parameters: {
        type: "object",
        properties: {
            caseId: { type: "string" },
            agentId: { type: "string", description: "Optional; defaults to first employee" },
        },
        required: ["caseId"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const caseId = args.caseId || ctx.sessionContext?.activeSupportCaseId;
        if (!caseId) {
            return { success: false, error: "caseId is required.", code: "MISSING_CASE" };
        }
        const result = await runRestartStuckAgentRemediation(ctx.companyId, caseId, ctx, {
            agentId: args.agentId,
        });
        return remediationToolResult(result, "Agent restart");
    },
};
