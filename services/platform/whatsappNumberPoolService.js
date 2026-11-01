/**
 * Platform WhatsApp number pool — controlled lease of Meta phone identities to tenants.
 * Numbers are never auto-assigned on company create; operators assign from AVAILABLE inventory.
 */
import { getAdminFirestore, hasAdminCredentials } from "../database/firestoreAdmin.js";
import { platformWhatsAppNumbersCollectionPath } from "../database/schema.js";
import {
    readPoolRegistryDoc,
    writePoolRegistryDoc,
    __memoryPoolForTests,
} from "./whatsappNumberPoolPoolIO.js";
import { executeGatewayAssign, executeGatewayRelease } from "./whatsappGatewayAssignmentService.js";
import { registerPlatformWhatsAppIntegration } from "../tenants/platformWhatsAppIntegrationService.js";
import { getWhatsAppIntegration } from "../tenants/integrationService.js";
import {
    normalizeRegistryRecord,
    sanitizeRegistryForApi,
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
    return readPoolRegistryDoc(numberId);
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
        items = Array.from(__memoryPoolForTests().values());
    } else {
        const snap = await getAdminFirestore().collection(platformWhatsAppNumbersCollectionPath()).get();
        items = snap.docs.map((d) => normalizeRegistryRecord({ id: d.id, ...d.data() }));
    }
    return items.find((n) => String(n.phoneNumberId) === key) || null;
}

async function writePoolDoc(numberId, data, options = {}) {
    return writePoolRegistryDoc(numberId, data, options);
}

/**
 * List pool numbers (optional status / kind filters).
 */
export async function listWhatsAppPoolNumbers({ status = null, kind = null } = {}) {
    await ensureEnvSeedNumber();

    let items = [];
    if (!useFirestore()) {
        items = Array.from(__memoryPoolForTests().values());
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
    try {
        return await executeGatewayAssign(input);
    } catch (err) {
        if (err.status) throw err;
        throw poolError(err.message || "Assign failed", err.status || 500, err.code);
    }
}

/**
 * Release a pool number from a tenant (makes it AVAILABLE again).
 * Clears phone metadata on the tenant integration when it matches the released number.
 */
export async function releaseWhatsAppPoolNumber(input = {}) {
    try {
        return await executeGatewayRelease(input);
    } catch (err) {
        if (err.status) throw err;
        throw poolError(err.message || "Release failed", err.status || 500, err.code);
    }
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
