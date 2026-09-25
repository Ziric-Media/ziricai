/**
 * Tenant read API for Marketplace pack entitlements (4C-6B).
 */
import { resolvePackId } from "./marketplaceRegistry.js";
import { getMarketplaceEntitlementRepository } from "./marketplaceEntitlementRepository.js";
import { toTenantEntitlementView } from "./marketplaceEntitlementModel.js";

/**
 * @param {string} companyId
 * @param {string|null|undefined} packIdFilter
 */
export async function listTenantMarketplaceEntitlements(companyId, packIdFilter = null) {
    if (!companyId) {
        throw Object.assign(new Error("companyId is required"), { status: 400, code: "MISSING_COMPANY_ID" });
    }
    const repo = await getMarketplaceEntitlementRepository();
    let items = await repo.listEntitlements(companyId);
    if (packIdFilter) {
        const resolved = resolvePackId(packIdFilter);
        items = items.filter((r) => resolvePackId(r.packId) === resolved);
    }
    return {
        companyId,
        items: items.map((r) => toTenantEntitlementView(r.packId, r)),
    };
}

/**
 * @param {string} companyId
 * @param {string} packId
 */
export async function getTenantMarketplaceEntitlement(companyId, packId) {
    if (!companyId) {
        throw Object.assign(new Error("companyId is required"), { status: 400, code: "MISSING_COMPANY_ID" });
    }
    if (!packId) {
        throw Object.assign(new Error("packId is required"), { status: 400, code: "MISSING_PACK_ID" });
    }
    const resolved = resolvePackId(packId);
    const repo = await getMarketplaceEntitlementRepository();
    const record = await repo.getEntitlement(companyId, resolved);
    return {
        companyId,
        entitlement: toTenantEntitlementView(resolved, record),
    };
}
