/**
 * G4 — Registry-first WhatsApp inbound/outbound routing.
 *
 * Env: WHATSAPP_GATEWAY_REGISTRY_ROUTING = off | shadow | primary
 */
import { findWhatsAppRegistryByPhoneNumberId } from "./whatsappNumberPoolService.js";
import {
    deriveAllocationStatus,
    ALLOCATION_ASSIGNED,
    CONNECTION_BYO,
} from "./whatsappGatewayRegistry.js";
import {
    findActiveWhatsAppIntegrationByPhoneNumberId,
    getWhatsAppIntegration,
    maskPhoneNumberId,
} from "../tenants/integrationService.js";

const ROUTING_MODES = new Set(["off", "shadow", "primary"]);

const ACTIVE_INTEGRATION_STATUSES = new Set(["active", "connected"]);

function isActiveIntegration(integration) {
    return integration && ACTIVE_INTEGRATION_STATUSES.has(String(integration.status || "").toLowerCase());
}

export function getWhatsAppGatewayRoutingMode() {
    const raw = String(process.env.WHATSAPP_GATEWAY_REGISTRY_ROUTING || "off")
        .trim()
        .toLowerCase();
    return ROUTING_MODES.has(raw) ? raw : "off";
}

/**
 * Registry-authoritative tenant resolution for a Meta phone_number_id.
 * @returns {Promise<{ companyId: string|null, source: string, registry: object|null, integration: object|null }>}
 */
export async function resolveTenantFromRegistry(phoneNumberId) {
    const key = String(phoneNumberId || "").trim();
    if (!key) {
        return { companyId: null, source: "missing_phone_number_id", registry: null, integration: null };
    }

    const registry = await findWhatsAppRegistryByPhoneNumberId(key);
    if (!registry) {
        return { companyId: null, source: "registry_miss", registry: null, integration: null };
    }

    if (registry.connectionMethod === CONNECTION_BYO) {
        return { companyId: null, source: "registry_byo_row", registry, integration: null };
    }

    const allocation = deriveAllocationStatus(registry);
    if (allocation !== ALLOCATION_ASSIGNED || !registry.assignedCompanyId) {
        return {
            companyId: null,
            source: "registry_unassigned",
            registry,
            integration: null,
        };
    }

    const companyId = String(registry.assignedCompanyId);
    const integration = await getWhatsAppIntegration(companyId);
    if (!isActiveIntegration(integration)) {
        return {
            companyId: null,
            source: "projection_inactive",
            registry,
            integration: integration || null,
            expectedCompanyId: companyId,
        };
    }
    if (String(integration.phoneNumberId || "").trim() !== key) {
        return {
            companyId: null,
            source: "projection_phone_mismatch",
            registry,
            integration,
            expectedCompanyId: companyId,
        };
    }

    return { companyId, source: "registry", registry, integration };
}

/**
 * Inbound routing: legacy collection-group vs registry (shadow / primary).
 * @returns {Promise<{ companyId: string|null, mode: string, via: string, shadow?: object }>}
 */
export async function resolveWhatsAppInboundCompanyId(phoneNumberId) {
    const mode = getWhatsAppGatewayRoutingMode();
    const key = String(phoneNumberId || "").trim();
    if (!key) {
        return { companyId: null, mode, via: "none" };
    }

    const legacyIntegration = await findActiveWhatsAppIntegrationByPhoneNumberId(key);
    const legacyCompanyId = legacyIntegration?.companyId || null;

    if (mode === "off") {
        return { companyId: legacyCompanyId, mode, via: "legacy" };
    }

    const registryRoute = await resolveTenantFromRegistry(key);
    const registryCompanyId = registryRoute.companyId;

    if (mode === "shadow") {
        const agree = registryCompanyId === legacyCompanyId;
        if (!agree) {
            console.error("[whatsapp-gateway] SHADOW routing disagreement", {
                phoneNumberId: maskPhoneNumberId(key),
                registryCompanyId,
                legacyCompanyId,
                registrySource: registryRoute.source,
            });
        }
        return {
            companyId: legacyCompanyId,
            mode,
            via: "legacy",
            shadow: {
                agree,
                registryCompanyId,
                legacyCompanyId,
                registrySource: registryRoute.source,
            },
        };
    }

    /* primary */
    if (registryCompanyId) {
        if (legacyCompanyId && legacyCompanyId !== registryCompanyId) {
            console.error("[whatsapp-gateway] PRIMARY overrides legacy mismatch", {
                phoneNumberId: maskPhoneNumberId(key),
                registryCompanyId,
                legacyCompanyId,
            });
        }
        return { companyId: registryCompanyId, mode, via: "registry" };
    }

    /* Registry miss — BYO and unregistered managed lines use legacy integration doc. */
    if (legacyCompanyId) {
        const creds = legacyIntegration?.credentialsSource;
        const via =
            creds === "tenant" ? "legacy_byo" : "legacy_unregistered_managed";
        if (via === "legacy_unregistered_managed") {
            console.warn("[whatsapp-gateway] registry miss; legacy managed fallback", {
                phoneNumberId: maskPhoneNumberId(key),
                legacyCompanyId,
                registrySource: registryRoute.source,
            });
        }
        return { companyId: legacyCompanyId, mode, via };
    }

    console.warn("[whatsapp-gateway] unresolved inbound phone_number_id", {
        phoneNumberId: maskPhoneNumberId(key),
        registrySource: registryRoute.source,
    });
    return { companyId: null, mode, via: "none" };
}

/**
 * Managed outbound: registry must assign this phoneNumberId to companyId (primary/shadow enforce; off skips).
 */
export async function assertManagedOutboundRegistryAllowed({ companyId, phoneNumberId, credentialsSource }) {
    const mode = getWhatsAppGatewayRoutingMode();
    if (mode === "off") return;

    const source = String(credentialsSource || "").toLowerCase();
    if (source === "tenant") return;

    const key = String(phoneNumberId || "").trim();
    const tenant = String(companyId || "").trim();
    if (!key || !tenant) return;

    const registry = await findWhatsAppRegistryByPhoneNumberId(key);
    if (!registry) {
        if (mode === "primary") {
            const err = new Error(
                "Outbound blocked: no registry row for managed WhatsApp phoneNumberId"
            );
            err.code = "WHATSAPP_GATEWAY_REGISTRY_OUTBOUND_BLOCKED";
            err.status = 409;
            throw err;
        }
        return;
    }

    const allocation = deriveAllocationStatus(registry);
    const assigned = registry.assignedCompanyId ? String(registry.assignedCompanyId) : null;
    const aligned = allocation === ALLOCATION_ASSIGNED && assigned === tenant;

    if (!aligned && mode === "primary") {
        const err = new Error(
            "Outbound blocked: phoneNumberId is not assigned to this tenant in the WhatsApp gateway registry"
        );
        err.code = "WHATSAPP_GATEWAY_REGISTRY_OUTBOUND_BLOCKED";
        err.status = 409;
        throw err;
    }

    if (!aligned && mode === "shadow") {
        console.error("[whatsapp-gateway] SHADOW outbound registry mismatch", {
            phoneNumberId: maskPhoneNumberId(key),
            companyId: tenant,
            assignedCompanyId: assigned,
            allocationStatus: allocation,
        });
    }
}
