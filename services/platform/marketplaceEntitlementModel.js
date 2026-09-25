/**
 * Marketplace pack entitlement — company ↔ pack access grant (4C-6).
 */
import { resolvePackId } from "./marketplaceRegistry.js";
import { MarketplaceEntitlementError, INVALID_ENTITLEMENT } from "./marketplaceEntitlementErrors.js";

/** @typedef {'active'|'revoked'|'expired'} MarketplaceEntitlementStoredStatus */

export const MARKETPLACE_ENTITLEMENT_STATUSES = /** @type {const} */ (["active", "revoked", "expired"]);

/**
 * @param {string} [iso]
 * @returns {boolean}
 */
export function isEntitlementExpiredByTime(iso) {
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t <= Date.now();
}

/**
 * Resolve effective stored status (active may become expired by time).
 * @param {object|null} record
 * @returns {'none'|'active'|'revoked'|'expired'}
 */
export function resolveEntitlementEffectiveStatus(record) {
    if (!record) return "none";
    if (record.status === "revoked") return "revoked";
    if (record.status === "expired") return "expired";
    if (record.status === "active" && isEntitlementExpiredByTime(record.expiresAt)) return "expired";
    if (record.status === "active") return "active";
    return "none";
}

/**
 * @param {object|null} record
 * @returns {boolean}
 */
export function isEntitlementInstallEligible(record) {
    return resolveEntitlementEffectiveStatus(record) === "active";
}

/**
 * Tenant-safe read DTO — no grant authority / internal ops fields.
 * @param {string} packId
 * @param {object|null} record
 */
export function toTenantEntitlementView(packId, record) {
    const status = resolveEntitlementEffectiveStatus(record);
    const entitled = status === "active";
    const view = {
        packId,
        status,
        entitled,
    };
    if (record?.grantedAt) view.grantedAt = record.grantedAt;
    if (record?.expiresAt != null) view.expiresAt = record.expiresAt;
    return view;
}

/**
 * @param {object} input
 * @param {string} input.companyId
 * @param {string} input.packId
 * @param {MarketplaceEntitlementStoredStatus} [input.status]
 * @param {string} [input.grantedAt]
 * @param {string|null} [input.expiresAt]
 * @param {object} [input.grantedBy]
 * @param {string} [input.salesReference]
 * @param {string} [input.revokeReason]
 */
export function buildMarketplaceEntitlementRecord(input) {
    const companyId = String(input.companyId || "").trim();
    const packId = resolvePackId(String(input.packId || "").trim());
    if (!companyId || !packId) {
        throw new MarketplaceEntitlementError("companyId and packId are required", INVALID_ENTITLEMENT);
    }
    const status = input.status || "active";
    if (!MARKETPLACE_ENTITLEMENT_STATUSES.includes(status)) {
        throw new MarketplaceEntitlementError(`Invalid entitlement status: ${status}`, INVALID_ENTITLEMENT);
    }
    const ts = new Date().toISOString();
    return {
        companyId,
        packId,
        status,
        grantedAt: input.grantedAt || ts,
        expiresAt: input.expiresAt ?? null,
        grantedBy: input.grantedBy || null,
        salesReference: input.salesReference || null,
        revokedAt: status === "revoked" ? input.revokedAt || ts : null,
        revokedBy: status === "revoked" ? input.revokedBy || null : null,
        revokeReason: status === "revoked" ? input.revokeReason || null : null,
        updatedAt: ts,
    };
}
