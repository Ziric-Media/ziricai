/**
 * Firestore platform pack versions — platform/marketplace/packs/{packId}/versions/{version}
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { platformPackVersionCollectionPath, platformPackVersionPath } from "../database/schema.js";

export class FirestoreMarketplacePackVersionRepository {
    async publishVersion({ packId, version, template, changelog = [], publishedAt }) {
        const db = getAdminFirestore();
        const path = platformPackVersionPath(packId, version);
        const entry = {
            packId,
            version,
            template,
            changelog: changelog || [],
            publishedAt: publishedAt || new Date().toISOString(),
        };
        await db.doc(path).set(entry);
        return entry;
    }

    async getVersion(packId, version) {
        const db = getAdminFirestore();
        const snap = await db.doc(platformPackVersionPath(packId, version)).get();
        if (!snap.exists) return null;
        return snap.data();
    }

    async listVersions(packId) {
        const db = getAdminFirestore();
        const col = db.collection(platformPackVersionCollectionPath(packId));
        const snap = await col.get();
        return snap.docs.map((d) => d.data());
    }
}
