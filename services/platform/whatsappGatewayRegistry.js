/**
 * ZiricAI WhatsApp Gateway — platform number registry model (G1).
 * Authoritative allocation lives on platform/whatsapp/numbers documents.
 * Legacy field `status` (in_use, available, …) is kept in sync for MC compatibility.
 */

export const ALLOCATION_AVAILABLE = "available";
export const ALLOCATION_ASSIGNED = "assigned";
export const ALLOCATION_RESERVED = "reserved";
export const ALLOCATION_SUSPENDED = "suspended";
export const ALLOCATION_RETIRED = "retired";

export const CONNECTION_MANAGED = "managed";
export const CONNECTION_BYO = "byo";

export const REGISTRATION_REGISTERED = "registered";
export const REGISTRATION_PENDING = "pending_registration";
export const REGISTRATION_UNKNOWN = "unknown";

/** @deprecated use ALLOCATION_* — kept for pool API filters */
export const LEGACY_STATUS_AVAILABLE = "available";
export const LEGACY_STATUS_IN_USE = "in_use";
export const LEGACY_STATUS_RESERVED = "reserved";
export const LEGACY_STATUS_RETIRED = "retired";

const ALLOCATION_HISTORY_MAX = 100;

export function nowIso() {
    return new Date().toISOString();
}

/**
 * Map legacy pool `status` + assignment to gateway allocationStatus.
 * @param {object|null|undefined} record
 */
export function deriveAllocationStatus(record) {
    if (!record) return ALLOCATION_AVAILABLE;
    if (record.allocationStatus) return String(record.allocationStatus);
    const legacy = String(record.status || LEGACY_STATUS_AVAILABLE);
    if (legacy === LEGACY_STATUS_RETIRED) return ALLOCATION_RETIRED;
    if (legacy === LEGACY_STATUS_RESERVED) return ALLOCATION_RESERVED;
    if (legacy === LEGACY_STATUS_IN_USE || record.assignedCompanyId) return ALLOCATION_ASSIGNED;
    return ALLOCATION_AVAILABLE;
}

/** Keep legacy `status` aligned with allocationStatus for existing MC/API consumers. */
export function allocationToLegacyStatus(allocationStatus) {
    switch (String(allocationStatus)) {
        case ALLOCATION_ASSIGNED:
        case ALLOCATION_SUSPENDED:
            return LEGACY_STATUS_IN_USE;
        case ALLOCATION_RESERVED:
            return LEGACY_STATUS_RESERVED;
        case ALLOCATION_RETIRED:
            return LEGACY_STATUS_RETIRED;
        default:
            return LEGACY_STATUS_AVAILABLE;
    }
}

/**
 * Normalize a raw Firestore pool doc into gateway registry shape (in-memory merge only).
 * @param {object|null} record
 * @returns {object|null}
 */
export function normalizeRegistryRecord(record) {
    if (!record) return null;
    const allocationStatus = deriveAllocationStatus(record);
    const assignedCompanyId = record.assignedCompanyId || null;
    const connectionMethod =
        record.connectionMethod === CONNECTION_BYO ? CONNECTION_BYO : CONNECTION_MANAGED;
    const registrationStatus =
        record.registrationStatus ||
        (record.phoneNumberId ? REGISTRATION_REGISTERED : REGISTRATION_UNKNOWN);

    return {
        ...record,
        connectionMethod,
        registrationStatus,
        allocationStatus,
        status: allocationToLegacyStatus(allocationStatus),
        wabaId: record.wabaId || record.businessAccountId || null,
        businessAccountId: record.businessAccountId || record.wabaId || null,
        allocationHistory: Array.isArray(record.allocationHistory) ? record.allocationHistory : [],
        releasedAt: record.releasedAt || null,
        registeredAt: record.registeredAt || record.createdAt || null,
    };
}

/**
 * @param {object} record
 * @param {{ action: string, companyId?: string|null, operatorId?: string|null, reason?: string|null, leaseId?: string|null }} event
 */
export function appendAllocationHistory(record, event) {
    const base = Array.isArray(record?.allocationHistory) ? record.allocationHistory : [];
    const entry = {
        at: nowIso(),
        action: String(event.action || "unknown"),
        companyId: event.companyId ?? record?.assignedCompanyId ?? null,
        operatorId: event.operatorId ?? null,
        reason: event.reason ?? null,
        leaseId: event.leaseId ?? record?.leaseId ?? null,
    };
    return [...base, entry].slice(-ALLOCATION_HISTORY_MAX);
}

/**
 * Build payload for registry write (assign claim).
 */
export function registryPayloadForAssign(record, { companyId, leaseId, operatorId = null, reason = null }) {
    const normalized = normalizeRegistryRecord(record) || {};
    const at = nowIso();
    const next = {
        ...normalized,
        allocationStatus: ALLOCATION_ASSIGNED,
        status: LEGACY_STATUS_IN_USE,
        assignedCompanyId: companyId,
        assignedAt: at,
        leaseId,
        releasedAt: null,
    };
    next.allocationHistory = appendAllocationHistory(normalized, {
        action: "assigned",
        companyId,
        operatorId,
        reason,
        leaseId,
    });
    return next;
}

/**
 * Build payload for registry write (release).
 */
export function registryPayloadForRelease(record, { operatorId = null, reason = null } = {}) {
    const normalized = normalizeRegistryRecord(record) || {};
    const previousCompanyId = normalized.assignedCompanyId || null;
    const at = nowIso();
    const next = {
        ...normalized,
        allocationStatus: ALLOCATION_AVAILABLE,
        status: LEGACY_STATUS_AVAILABLE,
        assignedCompanyId: null,
        assignedAt: null,
        leaseId: null,
        releasedAt: at,
    };
    next.allocationHistory = appendAllocationHistory(normalized, {
        action: "released",
        companyId: previousCompanyId,
        operatorId,
        reason: reason || "Pool number released",
        leaseId: null,
    });
    return next;
}

/**
 * Roll back a failed assign claim (restore prior snapshot fields).
 */
export function registryPayloadForAssignRollback(priorRecord) {
    const normalized = normalizeRegistryRecord(priorRecord) || {};
    const next = {
        ...normalized,
        allocationStatus: ALLOCATION_AVAILABLE,
        status: LEGACY_STATUS_AVAILABLE,
        assignedCompanyId: null,
        assignedAt: null,
        leaseId: null,
    };
    next.allocationHistory = appendAllocationHistory(normalized, {
        action: "assign_rollback",
        companyId: null,
        reason: "Tenant configure or activate failed",
    });
    return next;
}

export function sanitizeRegistryForApi(record) {
    const n = normalizeRegistryRecord(record);
    if (!n) return null;
    return {
        id: n.id,
        label: n.label || null,
        displayPhoneNumber: n.displayPhoneNumber || null,
        phoneNumberId: n.phoneNumberId || null,
        wabaId: n.wabaId || null,
        businessAccountId: n.businessAccountId || null,
        metaBusinessId: n.metaBusinessId || null,
        connectionMethod: n.connectionMethod,
        registrationStatus: n.registrationStatus,
        allocationStatus: n.allocationStatus,
        status: n.status,
        assignedCompanyId: n.assignedCompanyId || null,
        assignedSarahId: n.assignedSarahId || null,
        assignedAt: n.assignedAt || null,
        releasedAt: n.releasedAt || null,
        registeredAt: n.registeredAt || null,
        credentialsSource: n.credentialsSource || "env",
        kind: n.kind || null,
        notes: n.notes || null,
        leaseId: n.leaseId || null,
        createdAt: n.createdAt || null,
        updatedAt: n.updatedAt || null,
        allocationHistoryCount: n.allocationHistory?.length ?? 0,
        lastAllocationEvent: n.allocationHistory?.length
            ? n.allocationHistory[n.allocationHistory.length - 1]
            : null,
    };
}
