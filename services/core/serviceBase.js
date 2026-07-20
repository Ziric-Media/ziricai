/**
 * Base class for tenant-scoped services.
 * Ensures all data access includes companyId in the path.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { TenantRepository } from "../database/tenantRepository.js";
import { ROOT, TENANT_COLLECTIONS } from "../database/schema.js";

export class ServiceBase {
    /**
     * @param {string} collectionName — TENANT_COLLECTIONS key value
     */
    constructor(collectionName) {
        this.collectionName = collectionName;
        this.repo = new TenantRepository(collectionName);
    }

    scopedPath(companyId) {
        if (!companyId) {
            throw new Error(`companyId is required for ${this.collectionName}`);
        }
        return `${ROOT.COMPANIES}/${companyId}/${this.collectionName}`;
    }

    async adapter() {
        return getStorageAdapter();
    }

    async get(companyId, docId) {
        return this.repo.get(companyId, docId);
    }

    async list(companyId, options = {}) {
        return this.repo.list(companyId, options);
    }

    /** Cursor-based pagination — returns { items, nextCursor, hasMore } */
    async listPage(companyId, options = {}) {
        return this.repo.listPage(companyId, options);
    }

    async create(companyId, data, docId = null) {
        return this.repo.create(companyId, { ...data, companyId }, docId);
    }

    async update(companyId, docId, patch) {
        return this.repo.update(companyId, docId, patch);
    }

    async delete(companyId, docId) {
        return this.repo.delete(companyId, docId);
    }

    async upsert(companyId, docId, data) {
        return this.repo.set(companyId, docId, { ...data, companyId });
    }
}

export { TENANT_COLLECTIONS };
