/**
 * Marketplace pack review persistence — memory or Firestore (Admin).
 * Separate from install registry and generic storage adapter review stubs.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import { MemoryMarketplaceReviewRepository } from "./memoryMarketplaceReviewRepository.js";
import { FirestoreMarketplaceReviewRepository } from "./firestoreMarketplaceReviewRepository.js";
import { MarketplaceReviewError, REVIEW_REPOSITORY_UNAVAILABLE } from "./marketplaceReviewErrors.js";

let memoryRepo = null;
let firestoreRepo = null;

export async function getMarketplaceReviewRepository() {
    const adapter = await getStorageAdapter();
    if (adapter.name === "memory") {
        if (!memoryRepo) memoryRepo = new MemoryMarketplaceReviewRepository();
        return memoryRepo;
    }
    if (!useAdminBackend()) {
        throw new MarketplaceReviewError(
            "Marketplace review repository requires Firebase Admin Firestore (STORAGE_BACKEND=firestore with credentials)",
            REVIEW_REPOSITORY_UNAVAILABLE
        );
    }
    if (!firestoreRepo) firestoreRepo = new FirestoreMarketplaceReviewRepository();
    return firestoreRepo;
}

/** @typedef {MemoryMarketplaceReviewRepository|FirestoreMarketplaceReviewRepository} MarketplaceReviewRepository */
