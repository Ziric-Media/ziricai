import { upsertIntegration } from "../../tenants/integrationService.js";
import { getWhatsAppConfig } from "../../platform/onboardingService.js";

export default {
    name: "connectWhatsApp",
    description: "Start or check WhatsApp Business integration setup for the company.",
    parameters: {
        type: "object",
        properties: {
            phoneNumberId: { type: "string", description: "Meta phone number ID (optional)" },
        },
    },
    requiredPermissions: ["canManageStaff"],
    async execute(ctx, args) {
        const config = getWhatsAppConfig();
        const steps = [
            "Open Meta Business Suite → WhatsApp → API Setup",
            "Copy Phone Number ID and permanent access token",
            "Paste credentials in Settings → Channels → WhatsApp",
            "Send a test message to verify webhook delivery",
        ];

        let integration = null;
        if (args.phoneNumberId) {
            integration = await upsertIntegration(ctx.companyId, "whatsapp", {
                phoneNumberId: args.phoneNumberId,
                status: "pending_verification",
            });
        }

        return {
            message: `WhatsApp setup: ${steps.join(" → ")}`,
            data: { steps, config, integration },
            uiHints: [{ navigate: "settings" }, { openWizard: "connectWhatsApp" }],
        };
    },
};
