import { gatherAiEmployeeStatus } from "../../support/diagnostics/gatherTenantDiagnostics.js";

export default {
    name: "viewAiEmployeeStatus",
    description:
        "Read-only AI employee operational status: count, plan limit, WhatsApp workspace readiness, and per-employee channel state.",
    parameters: { type: "object", properties: {} },
    requiredPermissions: ["canEditAI"],
    async execute(ctx) {
        const data = await gatherAiEmployeeStatus(ctx.companyId, ctx.plan);
        const message = `${data.count} AI employee(s); ${data.receivingWhatsAppCount} receiving WhatsApp conversations.`;
        return { message, data, completionType: "read_only" };
    },
};
