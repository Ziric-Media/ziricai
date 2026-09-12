/**
 * Marketplace platform pack version persistence — memory or Firestore.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import { MemoryMarketplacePackVersionRepository } from "./memoryMarketplacePackVersionRepository.js";
import { FirestoreMarketplacePackVersionRepository } from "./firestoreMarketplacePackVersionRepository.js";

let memoryRepo = null;
let firestoreRepo = null;

export async function getMarketplacePackVersionRepository() {
    const adapter = await getStorageAdapter();
    if (adapter.name === "memory") {
        if (!memoryRepo) memoryRepo = new MemoryMarketplacePackVersionRepository();
        return memoryRepo;
    }
    if (!useAdminBackend()) {
        throw new Error(
            "Marketplace pack versions require Firebase Admin Firestore (STORAGE_BACKEND=firestore with credentials)"
        );
    }
    if (!firestoreRepo) firestoreRepo = new FirestoreMarketplacePackVersionRepository();
    return firestoreRepo;
}

export async function publishCuratedPackVersions(packIds = null) {
    const { getCuratedPackVersions, listCuratedPackIdsWithVersions } = await import(
        "./marketplacePackVersionCatalog.js"
    );
    const repo = await getMarketplacePackVersionRepository();
    const ids = packIds || listCuratedPackIdsWithVersions();
    const published = [];
    for (const packId of ids) {
        for (const entry of getCuratedPackVersions(packId)) {
            await repo.publishVersion(entry);
            published.push({ packId: entry.packId, version: entry.version });
        }
    }
    return published;
}
