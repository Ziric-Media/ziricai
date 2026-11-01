/**
 * Platform WhatsApp number pool — controlled lease of Meta phone identities to tenants.
 * Numbers are never auto-assigned on company create; operators assign from AVAILABLE inventory.
 */
import crypto from "crypto";
import { getAdminFirestore, hasAdminCredentials } from "../database/firestoreAdmin.js";
import {
    platformWhatsAppNumberPath,
    platformWhatsAppNumbersCollectionPath,
} from "../database/schema.js";
import { getCompany } from "../tenants/companyService.js";
import {
    registerPlatformWhatsAppIntegration,
    configurePlatformWhatsAppIntegration,
    activatePlatformWhatsAppIntegration,
    deactivatePlatformWhatsAppIntegration,
    WHATSAPP_STATUS_ACTIVE,
} from "../tenants/platformWhatsAppIntegrationService.js";
import {
    getWhatsAppIntegration,
    getPlatformWhatsAppIntegrationWithReadiness,
} from "../tenants/integrationService.js";
import {
    normalizeRegistryRecord,
    sanitizeRegistryForApi,
    registryPayloadForAssign,
    registryPayloadForRelease,
    registryPayloadForAssignRollback,
    CONNECTION_MANAGED,
    REGISTRATION_REGISTERED,
    ALLOCATION_AVAILABLE,
    deriveAllocationStatus,
    ALLOCATION_ASSIGNED,
} from "./whatsappGatewayRegistry.js";

export const POOL_STATUS_AVAILABLE = "available";
export const POOL_STATUS_IN_USE = "in_use";
export const POOL_STATUS_RESERVED = "reserved";
export const POOL_STATUS_RETIRED = "retired";

export const POOL_KIND_TEST = "test";
export const POOL_KIND_PRODUCTION = "production";

/** @type {Map<string, object>} */
const memoryPool = new Map();

function poolError(message, status = 400, code = undefined) {
    const err = new Error(message);
    err.status = status;
    if (code) err.code = code;
    return err;
}

function nowIso() {
    return new Date().toISOString();
}

function normalizePhoneDisplay(value) {
    return String(value || "").trim();
}

function isValidPhoneNumberId(value) {
    return /^\d{8,20}$/.test(String(value || "").trim());
}

function useFirestore() {
    return hasAdminCredentials() && Boolean(getAdminFirestore());
}

function sanitizePoolNumber(record) {
    return sanitizeRegistryForApi(record);
}

async function readPoolDoc(numberId) {
    let raw = null;
    if (!useFirestore()) {
        raw = memoryPool.get(String(numberId)) || null;
    } else {
        const snap = await getAdminFirestore().doc(platformWhatsAppNumberPath(numberId)).get();
        if (!snap.exists) return null;
        raw = { id: snap.id, ...snap.data() };
    }
    return raw ? normalizeRegistryRecord(raw) : null;
}

/**
 * Gateway registry lookup by Meta phone_number_id (G1).
 * @param {string} phoneNumberId
 */
export async function findWhatsAppRegistryByPhoneNumberId(phoneNumberId) {
    const key = String(phoneNumberId || "").trim();
    if (!key) return null;
    await ensureEnvSeedNumber();
    let items = [];
    if (!useFirestore()) {
        items = Array.from(memoryPool.values());
    } else {
        const snap = await getAdminFirestore().collection(platformWhatsAppNumbersCollectionPath()).get();
        items = snap.docs.map((d) => normalizeRegistryRecord({ id: d.id, ...d.data() }));
    }
    return items.find((n) => String(n.phoneNumberId) === key) || null;
}

async function writePoolDoc(numberId, data, { merge = true } = {}) {
    const id = String(numberId);
    const payload = { ...data, id, updatedAt: nowIso() };
    if (!useFirestore()) {
        const prev = memoryPool.get(id) || {};
        const next = merge ? { ...prev, ...payload } : payload;
        memoryPool.set(id, next);
        return next;
    }
    const ref = getAdminFirestore().doc(platformWhatsAppNumberPath(id));
    if (merge) {
        await ref.set(payload, { merge: true });
    } else {
        await ref.set(payload);
    }
    const snap = await ref.get();
    return { id: snap.id, ...snap.data() };
}

/**
 * List pool numbers (optional status / kind filters).
 */
export async function listWhatsAppPoolNumbers({ status = null, kind = null } = {}) {
    await ensureEnvSeedNumber();

    let items = [];
    if (!useFirestore()) {
        items = Array.from(memoryPool.values());
    } else {
        const snap = await getAdminFirestore().collection(platformWhatsAppNumbersCollectionPath()).get();
        items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    if (status) items = items.filter((n) => String(n.status) === String(status));
    if (kind) items = items.filter((n) => String(n.kind || POOL_KIND_TEST) === String(kind));

    items.sort((a, b) => String(a.label || a.displayPhoneNumber || a.id).localeCompare(String(b.label || b.displayPhoneNumber || b.id)));
    return items.map(sanitizePoolNumber);
}

/**
 * Add or update a Meta phone identity in the Ziric pool (operator inventory).
 */
export async function upsertWhatsAppPoolNumber(input = {}) {
    const phoneNumberId = String(input.phoneNumberId || "").trim();
    if (!isValidPhoneNumberId(phoneNumberId)) {
        throw poolError("Valid Meta phoneNumberId is required", 400, "INVALID_PHONE_NUMBER_ID");
    }

    const id = String(input.id || `wa-${phoneNumberId}`).trim();
    const existing = await readPoolDoc(id);
    const kind = String(input.kind || existing?.kind || POOL_KIND_TEST).toLowerCase();
    if (kind !== POOL_KIND_TEST && kind !== POOL_KIND_PRODUCTION) {
        throw poolError("kind must be test or production", 400);
    }

    if (
        existing &&
        deriveAllocationStatus(existing) === ALLOCATION_ASSIGNED &&
        existing.phoneNumberId !== phoneNumberId
    ) {
        throw poolError("Cannot change phoneNumberId while number is in use", 409, "NUMBER_IN_USE");
    }

    const wabaId =
        String(input.wabaId ?? input.businessAccountId ?? existing?.wabaId ?? existing?.businessAccountId ?? process.env.WABA_ID ?? "").trim() ||
        null;
    const baseAllocation = existing ? deriveAllocationStatus(existing) : ALLOCATION_AVAILABLE;

    const record = normalizeRegistryRecord({
        id,
        label: String(input.label || existing?.label || `Ziric ${kind} ${phoneNumberId.slice(-4)}`).trim(),
        displayPhoneNumber: normalizePhoneDisplay(input.displayPhoneNumber ?? existing?.displayPhoneNumber ?? ""),
        phoneNumberId,
        wabaId,
        businessAccountId: wabaId,
        metaBusinessId: input.metaBusinessId ?? existing?.metaBusinessId ?? null,
        kind,
        status: existing?.status || POOL_STATUS_AVAILABLE,
        allocationStatus: input.allocationStatus ?? baseAllocation,
        assignedCompanyId: existing?.assignedCompanyId || null,
        assignedAt: existing?.assignedAt || null,
        assignedSarahId: input.assignedSarahId ?? existing?.assignedSarahId ?? null,
        connectionMethod: input.connectionMethod ?? existing?.connectionMethod ?? CONNECTION_MANAGED,
        registrationStatus: input.registrationStatus ?? existing?.registrationStatus ?? REGISTRATION_REGISTERED,
        registeredAt: existing?.registeredAt || existing?.createdAt || nowIso(),
        credentialsSource: String(input.credentialsSource || existing?.credentialsSource || "env").toLowerCase(),
        notes: input.notes !== undefined ? String(input.notes || "") : existing?.notes || null,
        createdAt: existing?.createdAt || nowIso(),
        allocationHistory: existing?.allocationHistory || [],
    });

    const saved = await writePoolDoc(id, record, { merge: true });
    return sanitizePoolNumber(saved);
}

/**
 * Seed the current Railway/env Meta sandbox number into the pool if missing.
 * Does not assign it to any tenant.
 */
export async function ensureEnvSeedNumber() {
    const phoneNumberId = String(process.env.PHONE_NUMBER_ID || "").trim();
    if (!isValidPhoneNumberId(phoneNumberId)) return null;

    const id = `wa-env-${phoneNumberId}`;
    const existing = await readPoolDoc(id);
    if (existing) return sanitizePoolNumber(existing);

    return upsertWhatsAppPoolNumber({
        id,
        phoneNumberId,
        displayPhoneNumber: process.env.WHATSAPP_DISPLAY_PHONE || "",
        businessAccountId: process.env.WABA_ID || "",
        label: "Ziric Meta sandbox (env)",
        kind: POOL_KIND_TEST,
        credentialsSource: "env",
        notes: "Auto-seeded from PHONE_NUMBER_ID. Assign explicitly — never auto-leased on company create.",
    });
}

/**
 * Lease an AVAILABLE pool number to a company and bind WhatsApp integration.
 * Does not create a Meta phone number — registers supplied Meta identity onto the tenant.
 *
 * @param {{ companyId: string, numberId: string, activate?: boolean }} input
 */
export async function assignWhatsAppPoolNumberToCompany(input = {}) {
    const companyId = String(input.companyId || "").trim();
    const numberId = String(input.numberId || "").trim();
    const activate = input.activate !== false;

    if (!companyId) throw poolError("companyId is required", 400);
    if (!numberId) throw poolError("numberId is required", 400);

    const company = await getCompany(companyId);
    if (!company) throw poolError("Company not found", 404, "COMPANY_NOT_FOUND");

    const poolNumber = await readPoolDoc(numberId);
    if (!poolNumber) throw poolError("Pool number not found", 404, "POOL_NUMBER_NOT_FOUND");
    if (poolNumber.status === POOL_STATUS_RETIRED) {
        throw poolError("Pool number is retired", 409, "NUMBER_RETIRED");
    }
    const allocation = deriveAllocationStatus(poolNumber);
    if (allocation === ALLOCATION_ASSIGNED && poolNumber.assignedCompanyId !== companyId) {
        throw poolError(
            `Number is in use by tenant ${poolNumber.assignedCompanyId}`,
            409,
            "NUMBER_IN_USE"
        );
    }

    const leaseId = crypto.randomBytes(6).toString("hex");
    const operatorId = input.operatorId ? String(input.operatorId) : null;

    /* Claim registry first so two operators cannot lease the same AVAILABLE number. */
    if (allocation !== ALLOCATION_ASSIGNED || poolNumber.assignedCompanyId !== companyId) {
        await writePoolDoc(
            numberId,
            registryPayloadForAssign(poolNumber, {
                companyId,
                leaseId,
                operatorId,
                reason: input.reason || "assign-pool-number",
            })
        );
    }

    let integration = await getWhatsAppIntegration(companyId);
    if (!integration?.id) {
        try {
            integration = await registerPlatformWhatsAppIntegration(companyId, {
                credentialsSource: poolNumber.credentialsSource || "env",
            });
        } catch (err) {
            await writePoolDoc(numberId, registryPayloadForAssignRollback(poolNumber));
            throw err;
        }
    }

    try {
        const existingActive = await getWhatsAppIntegration(companyId);
        if (
            existingActive?.status === WHATSAPP_STATUS_ACTIVE &&
            existingActive.phoneNumberId &&
            existingActive.phoneNumberId !== poolNumber.phoneNumberId
        ) {
            throw poolError(
                "Company already has an active WhatsApp number; deactivate or release first",
                409,
                "TENANT_ALREADY_ACTIVE"
            );
        }

        await configurePlatformWhatsAppIntegration(companyId, {
            phoneNumberId: poolNumber.phoneNumberId,
            displayPhoneNumber: poolNumber.displayPhoneNumber || "",
            businessAccountId: poolNumber.businessAccountId || "",
            credentialsSource: poolNumber.credentialsSource || "env",
        });

        let activation = null;
        if (activate) {
            activation = await activatePlatformWhatsAppIntegration(companyId, {
                acknowledgeEnvCredentials: true,
                source: "whatsapp_number_pool",
                poolNumberId: numberId,
            });
        }

        const leased = await readPoolDoc(numberId);
        const readiness = await getPlatformWhatsAppIntegrationWithReadiness(companyId);

        return {
            success: true,
            companyId,
            number: sanitizePoolNumber(leased),
            integration: readiness?.integration || activation?.integration || null,
            runtimeReady: readiness?.runtimeReady ?? activation?.runtimeReady ?? null,
            missing: readiness?.missing || activation?.missing || [],
            activated: Boolean(activate),
        };
    } catch (err) {
        const current = await readPoolDoc(numberId);
        if (current && deriveAllocationStatus(current) === ALLOCATION_ASSIGNED && current.assignedCompanyId === companyId) {
            await writePoolDoc(numberId, registryPayloadForAssignRollback(poolNumber));
        }
        throw err;
    }
}

/**
 * Release a pool number from a tenant (makes it AVAILABLE again).
 * Clears phone metadata on the tenant integration when it matches the released number.
 */
export async function releaseWhatsAppPoolNumber({
    numberId = null,
    companyId = null,
    operatorId = null,
    reason = null,
} = {}) {
    let poolNumber = null;
    if (numberId) {
        poolNumber = await readPoolDoc(numberId);
    } else if (companyId) {
        const all = await listWhatsAppPoolNumbers({ status: POOL_STATUS_IN_USE });
        poolNumber = all.find((n) => n.assignedCompanyId === companyId) || null;
        if (poolNumber) poolNumber = await readPoolDoc(poolNumber.id);
    }

    if (!poolNumber) throw poolError("Pool number assignment not found", 404, "POOL_NUMBER_NOT_FOUND");

    const assignedCompanyId = poolNumber.assignedCompanyId;
    const released = await writePoolDoc(
        poolNumber.id,
        registryPayloadForRelease(poolNumber, { operatorId, reason })
    );

    if (assignedCompanyId) {
        const integration = await getWhatsAppIntegration(assignedCompanyId);
        if (integration?.id && String(integration.phoneNumberId) === String(poolNumber.phoneNumberId)) {
            if (integration.status === WHATSAPP_STATUS_ACTIVE) {
                await deactivatePlatformWhatsAppIntegration(assignedCompanyId, {
                    reason: "Pool number released",
                });
            }
            await configurePlatformWhatsAppIntegration(assignedCompanyId, {
                phoneNumberId: "",
                displayPhoneNumber: "",
            });
        }
    }

    return {
        success: true,
        number: sanitizePoolNumber(released),
        previousCompanyId: assignedCompanyId || null,
    };
}

/**
 * Ensure tenant WhatsApp doc exists in pending_configuration (Ready for Setup).
 * Never assigns a pool number.
 */
export async function ensureWhatsAppReadyForSetup(companyId) {
    const existing = await getWhatsAppIntegration(companyId);
    if (existing?.id) {
        return { created: false, integration: existing };
    }
    const integration = await registerPlatformWhatsAppIntegration(companyId, {
        credentialsSource: "env",
    });
    return { created: true, integration };
}
