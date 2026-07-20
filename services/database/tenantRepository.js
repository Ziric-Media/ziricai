/**
 * Generic tenant-scoped CRUD with companyId path enforcement.
 * Uses Firestore subcollections in production; in-memory Maps when STORAGE_BACKEND=memory.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import {
    getFirestore,
    tenantCollectionRef,
    tenantDocRef,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
} from "./firestoreClient.js";
import { ROOT } from "./schema.js";

const memoryTenantStore = new Map();

function memoryKey(companyId, collection, docId) {
    return `${companyId}::${collection}::${docId}`;
}

function memoryListKey(companyId, collection) {
    return `${companyId}::${collection}`;
}

function nowIso() {
    return new Date().toISOString();
}

async function useMemoryBackend() {
    const adapter = await getStorageAdapter();
    return adapter.name === "memory";
}

export class TenantRepository {
    constructor(collectionName) {
        this.collectionName = collectionName;
    }

    assertCompanyId(companyId) {
        if (!companyId || typeof companyId !== "string") {
            throw new Error(`companyId is required for ${this.collectionName}`);
        }
    }

    /* ── Memory backend ── */

    memoryGet(companyId, docId) {
        return memoryTenantStore.get(memoryKey(companyId, this.collectionName, docId)) || null;
    }

    memorySet(companyId, docId, data) {
        const record = {
            id: docId,
            companyId,
            ...data,
            updatedAt: nowIso(),
        };
        if (!record.createdAt) record.createdAt = nowIso();
        memoryTenantStore.set(memoryKey(companyId, this.collectionName, docId), record);

        const listKey = memoryListKey(companyId, this.collectionName);
        if (!memoryTenantStore.has(listKey)) memoryTenantStore.set(listKey, new Set());
        memoryTenantStore.get(listKey).add(docId);
        return record;
    }

    memoryList(companyId, { max = 100, orderByField = "updatedAt", filters = {} } = {}) {
        const listKey = memoryListKey(companyId, this.collectionName);
        const ids = memoryTenantStore.get(listKey) || new Set();
        let items = [...ids]
            .map((id) => this.memoryGet(companyId, id))
            .filter(Boolean);

        for (const [field, value] of Object.entries(filters)) {
            items = items.filter((item) => item[field] === value);
        }

        items.sort((a, b) => {
            const av = a[orderByField] || "";
            const bv = b[orderByField] || "";
            return new Date(bv) - new Date(av);
        });

        return items.slice(0, max);
    }

    memoryDelete(companyId, docId) {
        memoryTenantStore.delete(memoryKey(companyId, this.collectionName, docId));
        const listKey = memoryListKey(companyId, this.collectionName);
        memoryTenantStore.get(listKey)?.delete(docId);
        return { deleted: true, id: docId };
    }

    /* ── Public API ── */

    async get(companyId, docId) {
        this.assertCompanyId(companyId);
        if (await useMemoryBackend()) {
            return this.memoryGet(companyId, docId);
        }
        const snap = await getDoc(tenantDocRef(companyId, this.collectionName, docId));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
    }

    async create(companyId, data, docId = null) {
        this.assertCompanyId(companyId);
        const payload = { ...data, companyId, updatedAt: nowIso(), createdAt: data.createdAt || nowIso() };

        if (await useMemoryBackend()) {
            const id = docId || data.id || `doc-${Date.now()}`;
            return this.memorySet(companyId, id, payload);
        }

        if (docId) {
            await setDoc(tenantDocRef(companyId, this.collectionName, docId), {
                ...payload,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            return this.get(companyId, docId);
        }

        const ref = await addDoc(tenantCollectionRef(companyId, this.collectionName), {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return this.get(companyId, ref.id);
    }

    async set(companyId, docId, data) {
        this.assertCompanyId(companyId);
        if (await useMemoryBackend()) {
            return this.memorySet(companyId, docId, data);
        }
        await setDoc(
            tenantDocRef(companyId, this.collectionName, docId),
            { ...data, companyId, updatedAt: serverTimestamp() },
            { merge: true }
        );
        return this.get(companyId, docId);
    }

    async update(companyId, docId, patch) {
        this.assertCompanyId(companyId);
        if (await useMemoryBackend()) {
            const existing = this.memoryGet(companyId, docId);
            if (!existing) return null;
            return this.memorySet(companyId, docId, { ...existing, ...patch });
        }
        await updateDoc(tenantDocRef(companyId, this.collectionName, docId), {
            ...patch,
            updatedAt: serverTimestamp(),
        });
        return this.get(companyId, docId);
    }

    async delete(companyId, docId) {
        this.assertCompanyId(companyId);
        if (await useMemoryBackend()) {
            return this.memoryDelete(companyId, docId);
        }
        await deleteDoc(tenantDocRef(companyId, this.collectionName, docId));
        return { deleted: true, id: docId };
    }

    /**
     * Paginated tenant list — always scoped to companies/{companyId}/<collection>.
     * @param {string} companyId
     * @param {{ max?: number, orderByField?: string, orderDirection?: 'asc'|'desc', filters?: Record<string, unknown>, startAfterId?: string|null }} options
     * @returns {Promise<{ items: object[], nextCursor: string|null, hasMore: boolean }>}
     */
    async listPage(companyId, options = {}) {
        this.assertCompanyId(companyId);
        const {
            max = 50,
            orderByField = "updatedAt",
            orderDirection = "desc",
            filters = {},
            startAfterId = null,
        } = options;
        const pageSize = Math.min(Math.max(max, 1), 200);

        if (await useMemoryBackend()) {
            let items = this.memoryList(companyId, { max: pageSize + 1, orderByField, filters });
            if (startAfterId) {
                const idx = items.findIndex((item) => item.id === startAfterId);
                items = idx >= 0 ? items.slice(idx + 1) : items;
            }
            const page = items.slice(0, pageSize);
            const nextCursor = items.length > pageSize ? page[page.length - 1]?.id : null;
            return { items: page, nextCursor, hasMore: Boolean(nextCursor) };
        }

        const constraints = [];
        for (const [field, value] of Object.entries(filters)) {
            constraints.push(where(field, "==", value));
        }
        constraints.push(orderBy(orderByField, orderDirection));

        if (startAfterId) {
            const cursorSnap = await getDoc(tenantDocRef(companyId, this.collectionName, startAfterId));
            if (cursorSnap.exists()) {
                constraints.push(startAfter(cursorSnap));
            }
        }

        constraints.push(limit(pageSize + 1));

        const q = query(tenantCollectionRef(companyId, this.collectionName), ...constraints);
        const snapshot = await getDocs(q);
        const items = [];
        snapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() });
        });

        const hasMore = items.length > pageSize;
        const page = hasMore ? items.slice(0, pageSize) : items;
        const nextCursor = hasMore ? page[page.length - 1]?.id : null;
        return { items: page, nextCursor, hasMore };
    }

    /**
     * List tenant documents (array). Default max 50 — use listPage() for cursor pagination.
     * @param {string} companyId
     * @param {{ max?: number, orderByField?: string, orderDirection?: 'asc'|'desc', filters?: Record<string, unknown> }} options
     */
    async list(companyId, options = {}) {
        const { items } = await this.listPage(companyId, options);
        return items;
    }
}

/** Clear in-memory tenant store (tests / dev reset) */
export function resetMemoryTenantStore() {
    memoryTenantStore.clear();
}

/** Export for diagnostics */
export function getMemoryTenantStoreSize() {
    return memoryTenantStore.size;
}
