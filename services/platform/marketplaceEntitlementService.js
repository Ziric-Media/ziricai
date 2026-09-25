/**
 * Platform ops write layer for Marketplace pack entitlements (4C-6C).
 * Grant / revoke / expiry — does not change install authorization.
 */
import { isValidCompanyId } from "../auth/validateInput.js";
import { auditLog } from "../audit/auditLog.js";
import { getCompany } from "../tenants/companyService.js";
import { getPackById, resolvePackId } from "./marketplaceRegistry.js";
import { getMarketplaceEntitlementRepository } from "./marketplaceEntitlementRepository.js";
import {
    MarketplaceEntitlementError,
    INVALID_ENTITLEMENT,
    COMPANY_NOT_FOUND,
    PACK_NOT_FOUND,
    ENTITLEMENT_NOT_FOUND,
} from "./marketplaceEntitlementErrors.js";
import { resolveEntitlementEffectiveStatus } from "./marketplaceEntitlementModel.js";

/**
 * @param {object|null|undefined} platformAuth
 */
function buildGrantedByFromPlatformAuth(platformAuth) {
    if (!platformAuth) return { source: "script" };
    if (platformAuth.via === "api_key") return { source: "platform_api" };
    if (platformAuth.via === "superadmin") {
        return { source: "superadmin", uid: platformAuth.uid || undefined };
    }
    return { source: "platform_api" };
}

function buildRevokedByFromPlatformAuth(platformAuth) {
    return buildGrantedByFromPlatformAuth(platformAuth);
}

/**
 * @param {string} companyId
 * @param {string} packIdRaw
 */
async function resolveGrantTarget(companyId, packIdRaw) {
    const cid = String(companyId || "").trim();
    const packRaw = String(packIdRaw || "").trim();
    if (!cid || !packRaw) {
        throw Object.assign(
            new MarketplaceEntitlementError("companyId and packId are required", INVALID_ENTITLEMENT),
            { status: 400 }
        );
    }
    if (!isValidCompanyId(cid)) {
        throw Object.assign(new Error("Invalid companyId format"), { status: 400, code: "INVALID_COMPANY_ID" });
    }
    const packId = resolvePackId(packRaw);
    const pack = getPackById(packId);
    if (!pack) {
        throw Object.assign(new MarketplaceEntitlementError(`Pack not found: ${packId}`, PACK_NOT_FOUND), {
            status: 404,
        });
    }
    const company = await getCompany(cid);
    if (!company) {
        throw Object.assign(new MarketplaceEntitlementError("Company not found", COMPANY_NOT_FOUND), {
            status: 404,
        });
    }
    return { companyId: cid, packId };
}

/**
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function parseExpiresAtInput(raw) {
    if (raw === undefined) return undefined;
    if (raw === null || raw === "") return null;
    const parsed = Date.parse(String(raw));
    if (!Number.isFinite(parsed)) {
        throw Object.assign(new MarketplaceEntitlementError("Invalid expiresAt", INVALID_ENTITLEMENT), {
            status: 400,
        });
    }
    return new Date(parsed).toISOString();
}

/**
 * Grant or re-grant pack entitlement (upsert to active). Idempotent for already-active grants.
 */
export async function grantMarketplaceEntitlement(input, context = {}) {
    const companyId = String(input?.companyId || "").trim();
    const packIdRaw = String(input?.packId || "").trim();
    const { packId } = await resolveGrantTarget(companyId, packIdRaw);

    let expiresAt = null;
    if (input.expiresAt !== undefined && input.expiresAt !== null && input.expiresAt !== "") {
        expiresAt = parseExpiresAtInput(input.expiresAt);
    }

    const salesReference =
        input.salesReference != null && String(input.salesReference).trim()
            ? String(input.salesReference).trim()
            : null;

    const repo = await getMarketplaceEntitlementRepository();
    const existing = await repo.getEntitlement(companyId, packId);
    const priorEffective = resolveEntitlementEffectiveStatus(existing);
    const idempotent = priorEffective === "active";
    const preserveGrantedAt = idempotent && existing?.grantedAt;

    const grantedBy = buildGrantedByFromPlatformAuth(context.platformAuth);

    const entitlement = await repo.saveEntitlement({
        companyId,
        packId,
        status: "active",
        grantedAt: preserveGrantedAt ? existing.grantedAt : undefined,
        expiresAt,
        grantedBy,
        salesReference: salesReference ?? (idempotent ? existing?.salesReference ?? null : null),
    });

    auditLog("platform_marketplace_entitlement_grant", {
        companyId,
        packId,
        via: context.platformAuth?.via || "script",
        actorSource: grantedBy.source,
        salesReference: salesReference || entitlement.salesReference || null,
        idempotent,
    });

    return { entitlement, idempotent };
}

/**
 * Soft revoke entitlement (platform ops).
 */
export async function revokeMarketplaceEntitlement(companyId, packIdRaw, input = {}, context = {}) {
    const { companyId: cid, packId } = await resolveGrantTarget(companyId, packIdRaw);
    const repo = await getMarketplaceEntitlementRepository();
    const existing = await repo.getEntitlement(cid, packId);
    if (!existing) {
        throw Object.assign(new MarketplaceEntitlementError("Entitlement not found", ENTITLEMENT_NOT_FOUND), {
            status: 404,
        });
    }

    const idempotent = existing.status === "revoked";
    if (idempotent) {
        return { entitlement: { ...existing }, idempotent: true };
    }

    const revokeReason =
        input.revokeReason != null && String(input.revokeReason).trim()
            ? String(input.revokeReason).trim()
            : null;
    const revokedBy = buildRevokedByFromPlatformAuth(context.platformAuth);

    const entitlement = await repo.saveEntitlement({
        companyId: cid,
        packId,
        status: "revoked",
        grantedAt: existing.grantedAt,
        grantedBy: existing.grantedBy,
        expiresAt: existing.expiresAt ?? null,
        salesReference: existing.salesReference ?? null,
        revokedBy,
        revokeReason,
    });

    auditLog("platform_marketplace_entitlement_revoke", {
        companyId: cid,
        packId,
        via: context.platformAuth?.via || "script",
        actorSource: revokedBy.source,
        revokeReason,
        idempotent: false,
    });

    return { entitlement, idempotent: false };
}

/**
 * Update expiresAt on an existing entitlement (active stored status only).
 */
export async function updateMarketplaceEntitlementExpiry(companyId, packIdRaw, expiresAtRaw, context = {}) {
    const { companyId: cid, packId } = await resolveGrantTarget(companyId, packIdRaw);
    const expiresAt = parseExpiresAtInput(expiresAtRaw);
    if (expiresAt === undefined) {
        throw Object.assign(new MarketplaceEntitlementError("expiresAt is required", INVALID_ENTITLEMENT), {
            status: 400,
        });
    }

    const repo = await getMarketplaceEntitlementRepository();
    const existing = await repo.getEntitlement(cid, packId);
    if (!existing) {
        throw Object.assign(new MarketplaceEntitlementError("Entitlement not found", ENTITLEMENT_NOT_FOUND), {
            status: 404,
        });
    }
    if (existing.status === "revoked") {
        throw Object.assign(
            new MarketplaceEntitlementError("Cannot update expiry on revoked entitlement; re-grant instead", INVALID_ENTITLEMENT),
            { status: 400 }
        );
    }
    if (existing.status !== "active") {
        throw Object.assign(new MarketplaceEntitlementError("Entitlement is not active", INVALID_ENTITLEMENT), {
            status: 400,
        });
    }

    const priorExpiresAt = existing.expiresAt ?? null;
    const idempotent = priorExpiresAt === expiresAt;

    const entitlement = await repo.saveEntitlement({
        companyId: cid,
        packId,
        status: "active",
        grantedAt: existing.grantedAt,
        grantedBy: existing.grantedBy,
        expiresAt,
        salesReference: existing.salesReference ?? null,
    });

    if (!idempotent) {
        auditLog("platform_marketplace_entitlement_expiry_update", {
            companyId: cid,
            packId,
            via: context.platformAuth?.via || "script",
            expiresAt,
            priorExpiresAt,
        });
    }

    return { entitlement, idempotent };
}
