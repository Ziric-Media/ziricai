/**
 * Tenant-scoped WhatsApp credential resolution for outbound Graph API calls.
 * Phase A: env-backed tokens only; tenant token storage is Phase B.
 */
import { getWhatsAppIntegration, maskPhoneNumberId } from "../tenants/integrationService.js";

const ACTIVE_STATUSES = new Set(["active", "connected"]);

export class WhatsAppCredentialError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {{ companyId?: string|null, status?: number }} [meta]
     */
    constructor(code, message, meta = {}) {
        super(message);
        this.name = "WhatsAppCredentialError";
        this.code = code;
        this.companyId = meta.companyId ?? null;
        this.status = meta.status ?? 422;
    }
}

function logCredentialResolution(companyId, integration, credentialsSource) {
    console.log("[whatsapp] Credentials resolved", {
        companyId,
        phoneNumberId: maskPhoneNumberId(integration?.phoneNumberId),
        integrationStatus: integration?.status ?? null,
        credentialsSource,
    });
}

/**
 * Resolve bearer token + source for outbound WhatsApp (never log the token).
 * @param {string|null|undefined} companyId — when omitted, legacy platform env token only
 * @returns {Promise<{ accessToken: string, credentialsSource: string, companyId: string|null }>}
 */
export async function resolveWhatsAppCredentials(companyId) {
    if (!companyId) {
        const token = String(process.env.WHATSAPP_TOKEN || "").trim();
        if (!token) {
            throw new WhatsAppCredentialError(
                "platform_token_missing",
                "WHATSAPP_TOKEN is not set",
                { companyId: null }
            );
        }
        return { accessToken: token, credentialsSource: "env", companyId: null };
    }

    const integration = await getWhatsAppIntegration(companyId);
    if (!integration?.id) {
        throw new WhatsAppCredentialError(
            "integration_not_found",
            "WhatsApp integration not found for tenant",
            { companyId }
        );
    }

    const status = String(integration.status || "").toLowerCase();
    if (!ACTIVE_STATUSES.has(status)) {
        throw new WhatsAppCredentialError(
            "integration_inactive",
            `WhatsApp integration is not active (status: ${integration.status || "unknown"})`,
            { companyId }
        );
    }

    const source = integration.credentialsSource ?? null;

    if (source === "tenant") {
        const token =
            integration.accessToken ||
            integration.whatsappToken ||
            integration.token ||
            null;
        if (!token || !String(token).trim()) {
            throw new WhatsAppCredentialError(
                "tenant_credentials_not_configured",
                "Tenant WhatsApp credentials are not configured",
                { companyId }
            );
        }
        logCredentialResolution(companyId, integration, "tenant");
        return {
            accessToken: String(token).trim(),
            credentialsSource: "tenant",
            companyId,
        };
    }

    if (source === "env") {
        const token = String(process.env.WHATSAPP_TOKEN || "").trim();
        if (!token) {
            throw new WhatsAppCredentialError(
                "platform_token_missing",
                "Environment WHATSAPP_TOKEN is not configured",
                { companyId }
            );
        }
        logCredentialResolution(companyId, integration, "env");
        return { accessToken: token, credentialsSource: "env", companyId };
    }

    throw new WhatsAppCredentialError(
        "credentials_source_missing",
        "WhatsApp credentialsSource is not configured for this tenant",
        { companyId }
    );
}
