/**
 * In-process Marketplace entitlement store (local/regression).
 */
import { buildMarketplaceEntitlementRecord } from "./marketplaceEntitlementModel.js";

function key(companyId, packId) {
    return `${companyId}::${packId}`;
}

export class MemoryMarketplaceEntitlementRepository {
    constructor() {
        /** @type {Map<string, object>} */
        this.byKey = new Map();
    }

    async getEntitlement(companyId, packId) {
        return this.byKey.get(key(companyId, packId)) || null;
    }

    async listEntitlements(companyId) {
        const prefix = `${companyId}::`;
        const items = [];
        for (const [k, record] of this.byKey.entries()) {
            if (k.startsWith(prefix)) items.push({ ...record });
        }
        items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
        return items;
    }

    /**
     * Persist entitlement (tests + future grant API — not exposed to tenants in 4C-6B).
     * @param {Parameters<typeof buildMarketplaceEntitlementRecord>[0]} input
     */
    async saveEntitlement(input) {
        const record = buildMarketplaceEntitlementRecord(input);
        this.byKey.set(key(record.companyId, record.packId), { ...record });
        return { ...record };
    }
}
