import { getWhatsAppIntegration, sanitizeIntegrationForPlatform } from "../../tenants/integrationService.js";
import { assessRuntimeReadiness } from "../../tenants/platformWhatsAppIntegrationService.js";

const SECRET_KEYS = [
    "accessToken",
    "whatsappToken",
    "token",
    "webhookVerifyToken",
    "verifyToken",
    "appSecret",
    "credentials",
    "privateKey",
    "authorizationCode",
    "oauthCode",
];

function assertNoSecrets(payload) {
    const json = JSON.stringify(payload || {});
    for (const key of SECRET_KEYS) {
        if (json.includes(`"${key}"`)) {
            throw new Error("Integration diagnostic attempted to expose sensitive fields");
        }
    }
}

export default {
    name: "diagnoseWhatsAppIntegration",
    description:
        "Read-only WhatsApp integration diagnostics for this company: connection status, runtime readiness, masked phone identity, credential source, and actionable missing configuration. Use for questions like “Is WhatsApp connected?” or “Why isn't WhatsApp working?”",
    parameters: {
        type: "object",
        properties: {},
    },
    requiredPermissions: ["canManageIntegrations"],
    async execute(ctx) {
        const raw = await getWhatsAppIntegration(ctx.companyId);
        if (!raw) {
            return {
                message:
                    "No WhatsApp integration is configured for this workspace yet. Open Integrations and use Connect WhatsApp → Continue with Meta (Embedded Signup) to connect.",
                data: {
                    present: false,
                    status: "not_configured",
                    runtimeReady: false,
                    missing: ["integration_document"],
                },
                uiHints: [{ navigate: "integrations" }, { openWizard: "connectWhatsApp" }],
            };
        }

        const integration = sanitizeIntegrationForPlatform(raw);
        const { runtimeReady, missing } = assessRuntimeReadiness(raw);
        const status = integration?.status || raw.status || "unknown";
        const credentialsSource = integration?.credentialsSource ?? raw.credentialsSource ?? null;

        const hints = [];
        if (!runtimeReady) {
            if (missing.includes("phoneNumberId")) {
                hints.push("Complete Embedded Signup to assign a WhatsApp phone number.");
            }
            if (missing.includes("tenant_credentials_not_configured")) {
                hints.push("Finish OAuth / Embedded Signup so tenant credentials are stored securely.");
            }
            if (missing.includes("credentialsSource")) {
                hints.push("Integration metadata is incomplete — reconnect via Integrations.");
            }
        }

        const payload = {
            present: true,
            status,
            runtimeReady,
            missing,
            credentialsSource,
            phoneNumberIdMasked: integration?.phoneNumberId || null,
            displayPhoneNumber: integration?.displayPhoneNumber || raw.displayPhoneNumber || null,
            wabaId: integration?.wabaId || raw.wabaId || null,
            provider: integration?.provider || "whatsapp",
            lastError: integration?.lastError || raw.lastError || null,
            hints,
        };

        assertNoSecrets(payload);

        const summary = runtimeReady
            ? `WhatsApp is active for this workspace (status: ${status}).`
            : `WhatsApp is not fully ready (status: ${status}). Missing or incomplete: ${missing.join(", ") || "unknown"}.`;

        return {
            message: `${summary}${hints.length ? ` Next steps: ${hints.join(" ")}` : ""}`,
            data: payload,
            uiHints: runtimeReady ? [{ navigate: "integrations" }] : [{ navigate: "integrations" }, { openWizard: "connectWhatsApp" }],
        };
    },
};
