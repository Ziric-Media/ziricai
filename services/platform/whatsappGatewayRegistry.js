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
        operationId: event.operationId ?? null,
        outcome: event.outcome ?? "success",
        previousAllocationStatus: event.previousAllocationStatus ?? null,
        newAllocationStatus: event.newAllocationStatus ?? null,
        previousCompanyId: event.previousCompanyId ?? null,
        newCompanyId: event.newCompanyId ?? null,
        phoneNumberIdSuffix: event.phoneNumberIdSuffix ?? null,
        failureCode: event.failureCode ?? null,
    };
    return [...base, entry].slice(-ALLOCATION_HISTORY_MAX);
}

const IDEMPOTENCY_CACHE_MAX = 50;

/** @param {object} record @param {string} operationId @param {object} cachedResult */
export function cacheIdempotentOperation(record, operationId, cachedResult) {
    if (!operationId) return record?.idempotencyCache || {};
    const prev = record?.idempotencyCache && typeof record.idempotencyCache === "object" ? record.idempotencyCache : {};
    const next = { ...prev, [operationId]: { ...cachedResult, at: nowIso() } };
    const keys = Object.keys(next);
    if (keys.length <= IDEMPOTENCY_CACHE_MAX) return next;
    const trimmed = {};
    for (const k of keys.slice(-IDEMPOTENCY_CACHE_MAX)) trimmed[k] = next[k];
    return trimmed;
}

export function getIdempotentOperation(record, operationId) {
    if (!operationId || !record?.idempotencyCache) return null;
    return record.idempotencyCache[operationId] || null;
}

export function phoneSuffix(phoneNumberId) {
    const s = String(phoneNumberId || "");
    return s.length >= 4 ? s.slice(-4) : s || null;
}

/**
 * Build payload for registry write (assign claim).
 */
export function registryPayloadForAssign(
    record,
    { companyId, leaseId, operatorId = null, reason = null, operationId = null }
) {
    const normalized = normalizeRegistryRecord(record) || {};
    const at = nowIso();
    const prevAllocation = normalized.allocationStatus;
    const prevCompany = normalized.assignedCompanyId || null;
    const next = {
        ...normalized,
        allocationStatus: ALLOCATION_ASSIGNED,
        status: LEGACY_STATUS_IN_USE,
        assignedCompanyId: companyId,
        assignedAt: at,
        leaseId,
        releasedAt: null,
        registryVersion: (normalized.registryVersion || 0) + 1,
    };
    next.allocationHistory = appendAllocationHistory(normalized, {
        action: "assigned",
        companyId,
        operatorId,
        reason,
        leaseId,
        operationId,
        outcome: "success",
        previousAllocationStatus: prevAllocation,
        newAllocationStatus: ALLOCATION_ASSIGNED,
        previousCompanyId: prevCompany,
        newCompanyId: companyId,
        phoneNumberIdSuffix: phoneSuffix(normalized.phoneNumberId),
    });
    return next;
}

/**
 * Build payload for registry write (release).
 */
export function registryPayloadForRelease(
    record,
    { operatorId = null, reason = null, operationId = null } = {}
) {
    const normalized = normalizeRegistryRecord(record) || {};
    const previousCompanyId = normalized.assignedCompanyId || null;
    const prevAllocation = normalized.allocationStatus;
    const at = nowIso();
    const next = {
        ...normalized,
        allocationStatus: ALLOCATION_AVAILABLE,
        status: LEGACY_STATUS_AVAILABLE,
        assignedCompanyId: null,
        assignedAt: null,
        leaseId: null,
        releasedAt: at,
        registryVersion: (normalized.registryVersion || 0) + 1,
    };
    next.allocationHistory = appendAllocationHistory(normalized, {
        action: "released",
        companyId: previousCompanyId,
        operatorId,
        reason: reason || "Pool number released",
        leaseId: null,
        operationId,
        outcome: "success",
        previousAllocationStatus: prevAllocation,
        newAllocationStatus: ALLOCATION_AVAILABLE,
        previousCompanyId,
        newCompanyId: null,
        phoneNumberIdSuffix: phoneSuffix(normalized.phoneNumberId),
    });
    return next;
}

export function registryPayloadForSuspended(record, { operatorId = null, reason = null, operationId = null } = {}) {
    const normalized = normalizeRegistryRecord(record) || {};
    const next = {
        ...normalized,
        allocationStatus: ALLOCATION_SUSPENDED,
        status: LEGACY_STATUS_IN_USE,
        registryVersion: (normalized.registryVersion || 0) + 1,
    };
    next.allocationHistory = appendAllocationHistory(normalized, {
        action: "suspended",
        companyId: normalized.assignedCompanyId,
        operatorId,
        reason: reason || "Release projection step failed",
        operationId,
        outcome: "partial",
        previousAllocationStatus: normalized.allocationStatus,
        newAllocationStatus: ALLOCATION_SUSPENDED,
        phoneNumberIdSuffix: phoneSuffix(normalized.phoneNumberId),
    });
    return next;
}

/**
 * Roll back a failed assign claim (restore prior snapshot fields).
 */
export function registryPayloadForAssignRollback(priorRecord, { operationId = null, reason = null } = {}) {
    const normalized = normalizeRegistryRecord(priorRecord) || {};
    const next = {
        ...normalized,
        allocationStatus: ALLOCATION_AVAILABLE,
        status: LEGACY_STATUS_AVAILABLE,
        assignedCompanyId: null,
        assignedAt: null,
        leaseId: null,
        registryVersion: (normalized.registryVersion || 0) + 1,
    };
    next.allocationHistory = appendAllocationHistory(normalized, {
        action: "assign_rollback",
        companyId: null,
        reason: reason || "Tenant configure or activate failed",
        operationId,
        outcome: "failed",
        previousAllocationStatus: ALLOCATION_ASSIGNED,
        newAllocationStatus: ALLOCATION_AVAILABLE,
        phoneNumberIdSuffix: phoneSuffix(normalized.phoneNumberId),
    });
    return next;
}

/** Allocation states that allow a new assign claim. */
export function isAllocationAssignable(allocationStatus) {
    return String(allocationStatus) === ALLOCATION_AVAILABLE;
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
