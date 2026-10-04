/**
 * Link Meta WhatsApp (manual or Embedded Signup) to Client Zero tenant (ziricai).
 * Webhooks resolve phone_number_id → companyId via Firestore integration doc.
 */
import {
    isClientZeroCompanyId,
    normalizeCompanyId,
    CLIENT_ZERO_AI_EMPLOYEE_NAME,
} from "./clientZero.js";
import { getCompany } from "../tenants/companyService.js";
import {
    getWhatsAppIntegration,
    warmPhoneResolutionCache,
    maskPhoneNumberId,
} from "../tenants/integrationService.js";
import {
    registerPlatformWhatsAppIntegration,
    configurePlatformWhatsAppIntegration,
    activatePlatformWhatsAppIntegration,
    assessRuntimeReadiness,
    WHATSAPP_STATUS_ACTIVE,
} from "../tenants/platformWhatsAppIntegrationService.js";
import { sanitizeIntegrationForPlatform } from "../tenants/integrationService.js";
import { logInfo, logWarn } from "../integrations/integrationLogger.js";

export function resolveClientZeroWhatsAppEnv(overrides = {}) {
    const companyId = normalizeCompanyId(
        overrides.companyId || process.env.CLIENT_ZERO_COMPANY_ID || "ziricai"
    );
    const phoneNumberId = String(
        overrides.phoneNumberId ||
            process.env.CLIENT_ZERO_WHATSAPP_PHONE_NUMBER_ID ||
            process.env.PHONE_NUMBER_ID ||
            ""
    ).trim();
    const businessAccountId =
        String(
            overrides.businessAccountId ||
                overrides.wabaId ||
                process.env.CLIENT_ZERO_WHATSAPP_WABA_ID ||
                process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
                process.env.META_WABA_ID ||
                ""
        ).trim() || null;
    const displayPhoneNumber =
        String(overrides.displayPhoneNumber || process.env.CLIENT_ZERO_WHATSAPP_DISPLAY_NUMBER || "").trim() ||
        null;

    return { companyId, phoneNumberId, businessAccountId, displayPhoneNumber };
}

/**
 * Persist + activate WhatsApp integration for Client Zero from Railway/Meta env.
 * @param {{ forceReconfigure?: boolean, source?: string }} [options]
 */
export async function ensureClientZeroWhatsAppIntegration(options = {}) {
    const { forceReconfigure = false, source = "startup", overrides = {} } = options;
    const env = resolveClientZeroWhatsAppEnv(overrides);

    if (!isClientZeroCompanyId(env.companyId)) {
        return { skipped: true, reason: "not_client_zero_tenant", companyId: env.companyId };
    }
    if (!process.env.WHATSAPP_TOKEN) {
        return { skipped: true, reason: "missing_whatsapp_token", companyId: env.companyId };
    }

    const company = await getCompany(env.companyId);
    if (!company) {
        return { skipped: true, reason: "company_not_found", companyId: env.companyId };
    }

    let integration = await getWhatsAppIntegration(env.companyId);

    const phoneNumberId = String(
        overrides.phoneNumberId ||
            process.env.CLIENT_ZERO_WHATSAPP_PHONE_NUMBER_ID ||
            integration?.phoneNumberId ||
            env.phoneNumberId ||
            ""
    ).trim();
    if (!phoneNumberId) {
        return { skipped: true, reason: "missing_phone_number_id", companyId: env.companyId };
    }

    const patch = {
        phoneNumberId,
        credentialsSource: "env",
    };
    if (env.businessAccountId) patch.businessAccountId = env.businessAccountId;
    if (env.displayPhoneNumber) patch.displayPhoneNumber = env.displayPhoneNumber;

    if (!integration?.id) {
        await registerPlatformWhatsAppIntegration(env.companyId, patch);
        integration = await getWhatsAppIntegration(env.companyId);
        logInfo("whatsapp", env.companyId, "Client Zero WhatsApp registered", {
            source,
            phoneNumberId: maskPhoneNumberId(env.phoneNumberId),
            aiEmployee: CLIENT_ZERO_AI_EMPLOYEE_NAME,
        });
    } else {
        const needsConfigure =
            forceReconfigure ||
            String(integration.phoneNumberId || "") !== phoneNumberId ||
            !integration.credentialsSource ||
            integration.credentialsSource !== "env" ||
            (env.businessAccountId && integration.businessAccountId !== env.businessAccountId) ||
            (env.displayPhoneNumber && integration.displayPhoneNumber !== env.displayPhoneNumber);

        if (needsConfigure) {
            await configurePlatformWhatsAppIntegration(env.companyId, patch);
            integration = await getWhatsAppIntegration(env.companyId);
            logInfo("whatsapp", env.companyId, "Client Zero WhatsApp configured", {
                source,
                phoneNumberId: maskPhoneNumberId(env.phoneNumberId),
            });
        }
    }

    if (integration?.status !== WHATSAPP_STATUS_ACTIVE || forceReconfigure) {
        try {
            const activated = await activatePlatformWhatsAppIntegration(env.companyId, {
                acknowledgeEnvCredentials: true,
            });
            logInfo("whatsapp", env.companyId, "Client Zero WhatsApp activated", {
                source,
                runtimeReady: activated.runtimeReady,
                phoneNumberId: maskPhoneNumberId(env.phoneNumberId),
            });
            return {
                linked: true,
                companyId: env.companyId,
                ...activated,
            };
        } catch (err) {
            logWarn("whatsapp", env.companyId, "Client Zero WhatsApp activation pending", {
                source,
                error: err.message,
            });
            return {
                linked: false,
                companyId: env.companyId,
                error: err.message,
                integration: sanitizeIntegrationForPlatform(integration),
            };
        }
    }

    if (integration?.phoneNumberId) {
        warmPhoneResolutionCache(integration.phoneNumberId, integration);
    }

    const readiness = assessRuntimeReadiness(integration);
    return {
        linked: true,
        companyId: env.companyId,
        integration: sanitizeIntegrationForPlatform(integration),
        runtimeReady: readiness.runtimeReady,
        missing: readiness.missing,
    };
}

/** Public webhook URL hint for Meta console (Client Zero manual setup). */
export function getClientZeroWhatsAppWebhookHint() {
    const base =
        process.env.PUBLIC_API_BASE_URL ||
        process.env.API_BASE_URL ||
        process.env.RAILWAY_PUBLIC_DOMAIN
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
            : "https://ziricai-production.up.railway.app";
    const normalized = String(base).replace(/\/$/, "");
    return `${normalized}/webhook`;
}
