/**
 * Marketplace install registry persistence — memory or Firestore.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import { MemoryMarketplaceInstallRepository } from "./memoryMarketplaceInstallRepository.js";
import { FirestoreMarketplaceInstallRepository } from "./firestoreMarketplaceInstallRepository.js";
import { INSTALL_REGISTRY_UNAVAILABLE } from "./marketplaceInstallErrors.js";

let memoryRepo = null;
let firestoreRepo = null;

export async function getMarketplaceInstallRepository() {
    const adapter = await getStorageAdapter();
    if (adapter.name === "memory") {
        if (!memoryRepo) memoryRepo = new MemoryMarketplaceInstallRepository();
        return memoryRepo;
    }
    if (!useAdminBackend()) {
        const err = new Error(
            "Marketplace install registry requires Firebase Admin Firestore (STORAGE_BACKEND=firestore with credentials)"
        );
        err.code = INSTALL_REGISTRY_UNAVAILABLE;
        throw err;
    }
    if (!firestoreRepo) firestoreRepo = new FirestoreMarketplaceInstallRepository();
    return firestoreRepo;
}

/** @typedef {'installing'|'installed'|'failed'} MarketplaceInstallStatus */

/**
 * @typedef {object} MarketplaceInstallRecord
 * @property {string} packId
 * @property {string} packName
 * @property {string} [category]
 * @property {string} companyId
 * @property {string} version
 * @property {MarketplaceInstallStatus} status
 * @property {string} installedAt
 * @property {string} updatedAt
 * @property {string} installedBy
 * @property {string} installAttemptId
 * @property {object} customizations
 * @property {string[]} enabledIntegrations
 * @property {string[]} disabledIntegrations
 * @property {string[]} agentIds
 * @property {string[]} knowledgeDocIds
 * @property {string[]} workflowIds
 * @property {string[]} reportIds
 * @property {string[]} [mergedKnowledgeTitles]
 * @property {string[]} [mergedWorkflowNames]
 * @property {object} links
 * @property {string|null} [lastError]
 * @property {string|null} [failedAt]
 * @property {string|null} [installedCompletedAt]
 */
