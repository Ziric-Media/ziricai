import { gatherSupportHistory } from "../../support/diagnostics/gatherTenantDiagnostics.js";

export default {
    name: "viewSupportHistory",
    description: "Read-only list of recent support cases for this workspace.",
    parameters: {
        type: "object",
        properties: {
            limit: { type: "number", description: "Max cases (default 10)" },
        },
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
        const data = await gatherSupportHistory(ctx.companyId, { limit });
        const message =
            data.count === 0
                ? "No support cases on record for this workspace."
                : `${data.count} recent support case(s) loaded.`;
        return { message, data, completionType: "read_only" };
    },
};
