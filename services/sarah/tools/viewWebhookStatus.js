import { gatherWebhookStatus } from "../../support/diagnostics/gatherTenantDiagnostics.js";

export default {
    name: "viewWebhookStatus",
    description:
        "Read-only webhook readiness for WhatsApp: whether the integration can receive Meta events and any blocking configuration gaps.",
    parameters: { type: "object", properties: {} },
    requiredPermissions: ["canManageIntegrations"],
    async execute(ctx) {
        const data = await gatherWebhookStatus(ctx.companyId);
        const message =
            data.assessment === "likely_active"
                ? "WhatsApp webhooks look ready to receive events based on current integration checks."
                : `Webhook assessment: ${data.assessment}. ${(data.notes || []).slice(0, 2).join(" ")}`;
        return { message, data, completionType: "read_only" };
    },
};
