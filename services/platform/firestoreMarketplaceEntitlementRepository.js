/**
 * Firestore Marketplace entitlements — companies/{companyId}/marketplaceEntitlements/{packId}
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { TENANT_COLLECTIONS, tenantCollectionPath, tenantMarketplaceEntitlementPath } from "../database/schema.js";
import { buildMarketplaceEntitlementRecord } from "./marketplaceEntitlementModel.js";

function stripUndefined(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) out[k] = v;
    }
    return out;
}

export class FirestoreMarketplaceEntitlementRepository {
    async getEntitlement(companyId, packId) {
        const db = getAdminFirestore();
        const snap = await db.doc(tenantMarketplaceEntitlementPath(companyId, packId)).get();
        if (!snap.exists) return null;
        return { packId: snap.id, ...snap.data() };
    }

    async listEntitlements(companyId) {
        const db = getAdminFirestore();
        const colPath = tenantCollectionPath(companyId, TENANT_COLLECTIONS.MARKETPLACE_ENTITLEMENTS);
        const snap = await db.collection(colPath).get();
        return snap.docs.map((d) => ({ packId: d.id, ...d.data() }));
    }

    /** @param {Parameters<typeof buildMarketplaceEntitlementRecord>[0]} input */
    async saveEntitlement(input) {
        const record = buildMarketplaceEntitlementRecord(input);
        const db = getAdminFirestore();
        const ref = db.doc(tenantMarketplaceEntitlementPath(record.companyId, record.packId));
        await ref.set(stripUndefined(record), { merge: true });
        return { ...record };
    }
}
