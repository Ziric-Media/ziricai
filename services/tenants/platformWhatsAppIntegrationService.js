/**
 * Mission Control platform admin — WhatsApp integration lifecycle (B-MC-5c-2b).
 * Mutates companies/{companyId}/integrations/whatsapp only; never company-root whatsappConnected.
 */
import { getCompany } from "./companyService.js";
import {
    findActiveWhatsAppIntegrationByPhoneNumberId,
    getWhatsAppIntegration,
    sanitizeIntegrationForPlatform,
    warmPhoneResolutionCache,
    invalidatePhoneResolutionCache,
} from "./integrationService.js";
import { ServiceBase, TENANT_COLLECTIONS } from "../core/serviceBase.js";

export const WHATSAPP_INTEGRATION_DOC_ID = "whatsapp";
export const WHATSAPP_STATUS_PENDING = "pending_configuration";
export const WHATSAPP_STATUS_DISCONNECTED = "disconnected";
export const WHATSAPP_STATUS_ACTIVE = "active";

const PROVIDER_WHATSAPP = "whatsapp";
const ALLOWED_CREDENTIALS_SOURCES = new Set(["env", "tenant"]);
const CONFIGURABLE_FIELDS = [
    "phoneNumberId",
    "displayPhoneNumber",
    "businessAccountId",
    "credentialsSource",
];
const REGISTER_FIELDS = [...CONFIGURABLE_FIELDS];

class WhatsAppIntegrationRepo extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.INTEGRATIONS);
    }
}

const whatsappRepo = new WhatsAppIntegrationRepo();

function platformError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

export function isValidPhoneNumberId(value) {
    if (value === undefined || value === null || value === "") return true;
    const str = String(value).trim();
    return /^\d{8,20}$/.test(str);
}

function pickAllowlisted(body = {}, fields = CONFIGURABLE_FIELDS) {
    const patch = {};
    for (const key of fields) {
        if (body[key] !== undefined) {
            patch[key] = body[key];
        }
    }
    return patch;
}

function normalizeCredentialsSource(value) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const normalized = String(value).toLowerCase();
    if (!ALLOWED_CREDENTIALS_SOURCES.has(normalized)) {
        throw platformError(`Invalid credentialsSource: ${value}`, 400);
    }
    return normalized;
}

function validateConfigurablePatch(patch) {
    if (patch.phoneNumberId !== undefined && !isValidPhoneNumberId(patch.phoneNumberId)) {
        throw platformError("Invalid phoneNumberId format", 400);
    }
    if (patch.credentialsSource !== undefined) {
        patch.credentialsSource = normalizeCredentialsSource(patch.credentialsSource);
    }
    return patch;
}

async function requireCompany(companyId) {
    const company = await getCompany(companyId);
    if (!company) {
        throw platformError("Company not found", 404);
    }
    return company;
}

async function requireIntegration(companyId) {
    const existing = await getWhatsAppIntegration(companyId);
    if (!existing?.id) {
        throw platformError("WhatsApp integration not found", 404);
    }
    return existing;
}

async function assertNoCrossTenantActivePhone(companyId, phoneNumberId) {
    if (!phoneNumberId) return;
    const other = await findActiveWhatsAppIntegrationByPhoneNumberId(String(phoneNumberId));
    if (other?.companyId && String(other.companyId) !== String(companyId)) {
        throw platformError("phoneNumberId is already active for another tenant", 409);
    }
}

function envWhatsAppConfigured() {
    const phoneId = process.env.PHONE_NUMBER_ID || "";
    const token = process.env.WHATSAPP_TOKEN || "";
    return {
        configured: Boolean(phoneId && token),
        phoneNumberId: phoneId,
    };
}

function assessRuntimeReadiness(integration) {
    const missing = [];
    if (!integration?.phoneNumberId) {
        missing.push("phoneNumberId");
    }

    const source = integration?.credentialsSource || null;
    if (source === "env") {
        const env = envWhatsAppConfigured();
        if (!env.phoneNumberId) missing.push("env.PHONE_NUMBER_ID");
        if (!process.env.WHATSAPP_TOKEN) missing.push("env.WHATSAPP_TOKEN");
        if (
            integration.phoneNumberId &&
            env.phoneNumberId &&
            String(integration.phoneNumberId) !== String(env.phoneNumberId)
        ) {
            missing.push("phoneNumberId_env_mismatch");
        }
    } else if (source === "tenant") {
        missing.push("tenant_credentials_not_configured");
    } else if (source === null || source === undefined) {
        missing.push("credentialsSource");
    }

    return {
        runtimeReady: missing.length === 0,
        missing,
    };
}

function validateEnvActivation(integration, opts = {}) {
    const env = envWhatsAppConfigured();
    if (!env.configured) {
        throw platformError("Environment WhatsApp credentials are not configured", 422);
    }
    if (
        integration.phoneNumberId &&
        env.phoneNumberId &&
        String(integration.phoneNumberId) !== String(env.phoneNumberId) &&
        !opts.acknowledgeEnvCredentials
    ) {
        throw platformError(
            "phoneNumberId does not match environment PHONE_NUMBER_ID; set acknowledgeEnvCredentials to proceed",
            422
        );
    }
}

async function persistIntegration(companyId, docId, patch) {
    return whatsappRepo.update(companyId, docId, patch);
}

async function createIntegrationDoc(companyId, record) {
    return whatsappRepo.create(companyId, record, WHATSAPP_INTEGRATION_DOC_ID);
}

/**
 * Register a WhatsApp integration document (pending_configuration).
 * @param {string} companyId
 * @param {object} [body]
 */
export async function registerPlatformWhatsAppIntegration(companyId, body = {}) {
    await requireCompany(companyId);

    const existing = await getWhatsAppIntegration(companyId);
    if (existing?.id) {
        throw platformError("WhatsApp integration already exists", 409);
    }

    const patch = validateConfigurablePatch(pickAllowlisted(body, REGISTER_FIELDS));
    if (patch.phoneNumberId) {
        await assertNoCrossTenantActivePhone(companyId, patch.phoneNumberId);
    }

    const record = {
        provider: PROVIDER_WHATSAPP,
        channel: PROVIDER_WHATSAPP,
        status: WHATSAPP_STATUS_PENDING,
        ...patch,
    };

    const saved = await createIntegrationDoc(companyId, record);
    return sanitizeIntegrationForPlatform(saved);
}

/**
 * Configure allowlisted WhatsApp integration metadata (does not activate).
 * @param {string} companyId
 * @param {object} body
 */
export async function configurePlatformWhatsAppIntegration(companyId, body = {}) {
    await requireCompany(companyId);
    const existing = await requireIntegration(companyId);

    const patch = validateConfigurablePatch(pickAllowlisted(body));
    if (!Object.keys(patch).length) {
        throw platformError("No configurable WhatsApp integration fields provided", 400);
    }

    if (patch.phoneNumberId) {
        await assertNoCrossTenantActivePhone(companyId, patch.phoneNumberId);
    }

    const saved = await persistIntegration(companyId, existing.id, {
        ...patch,
        status: existing.status,
    });

    return sanitizeIntegrationForPlatform(saved);
}

/**
 * Activate WhatsApp integration (status → active).
 * @param {string} companyId
 * @param {{ acknowledgeEnvCredentials?: boolean }} [opts]
 */
export async function activatePlatformWhatsAppIntegration(companyId, opts = {}) {
    await requireCompany(companyId);
    const existing = await requireIntegration(companyId);

    if (!existing.phoneNumberId) {
        throw platformError("phoneNumberId is required before activation", 422);
    }

    await assertNoCrossTenantActivePhone(companyId, existing.phoneNumberId);

    if (existing.credentialsSource === "env") {
        validateEnvActivation(existing, opts);
    }

    const saved = await persistIntegration(companyId, existing.id, {
        status: WHATSAPP_STATUS_ACTIVE,
    });

    warmPhoneResolutionCache(saved.phoneNumberId, saved);

    const readiness = assessRuntimeReadiness(saved);
    return {
        integration: sanitizeIntegrationForPlatform(saved),
        runtimeReady: readiness.runtimeReady,
        missing: readiness.missing,
    };
}

/**
 * Deactivate WhatsApp integration (status → disconnected, document retained).
 * @param {string} companyId
 * @param {{ reason?: string }} [opts]
 */
export async function deactivatePlatformWhatsAppIntegration(companyId, opts = {}) {
    await requireCompany(companyId);
    const existing = await requireIntegration(companyId);
    const previousStatus = existing.status;

    const saved = await persistIntegration(companyId, existing.id, {
        status: WHATSAPP_STATUS_DISCONNECTED,
    });

    if (existing.phoneNumberId) {
        invalidatePhoneResolutionCache(existing.phoneNumberId);
    }

    return {
        integration: sanitizeIntegrationForPlatform(saved),
        deactivated: true,
        previousStatus,
        reason: opts.reason || null,
    };
}
