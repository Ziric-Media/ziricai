/**
 * Marketplace entitlement persistence — memory or Firestore.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import { MemoryMarketplaceEntitlementRepository } from "./memoryMarketplaceEntitlementRepository.js";
import { FirestoreMarketplaceEntitlementRepository } from "./firestoreMarketplaceEntitlementRepository.js";
import { MarketplaceEntitlementError, ENTITLEMENT_REPOSITORY_UNAVAILABLE } from "./marketplaceEntitlementErrors.js";

let memoryRepo = null;
let firestoreRepo = null;

export async function getMarketplaceEntitlementRepository() {
    const adapter = await getStorageAdapter();
    if (adapter.name === "memory") {
        if (!memoryRepo) memoryRepo = new MemoryMarketplaceEntitlementRepository();
        return memoryRepo;
    }
    if (!useAdminBackend()) {
        throw new MarketplaceEntitlementError(
            "Marketplace entitlement registry requires Firebase Admin Firestore",
            ENTITLEMENT_REPOSITORY_UNAVAILABLE
        );
    }
    if (!firestoreRepo) firestoreRepo = new FirestoreMarketplaceEntitlementRepository();
    return firestoreRepo;
}
