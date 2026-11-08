/**
 * SNET-02 — generic durable collection for network records.
 * Firestore (Admin SDK) when available; in-memory Map otherwise (tests / STORAGE_BACKEND=memory).
 * Server-only: clients never touch these collections (default-deny rules).
 */
import {
    useAdminBackend,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    queryWhere,
    queryLimit,
    networkDocRef,
    networkCollectionRef,
    runAdminFirestoreTransaction,
} from "../database/firestoreClient.js";

/** @type {Map<string, Map<string, object>>} */
const memory = new Map();

function memCol(name) {
    if (!memory.has(name)) memory.set(name, new Map());
    return memory.get(name);
}

function matches(doc, filters) {
    return filters.every(([field, op, value]) => {
        const v = field.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), doc);
        switch (op) {
            case "==":
                return v === value;
            case "!=":
                return v !== value;
            case "in":
                return Array.isArray(value) && value.includes(v);
            case "array-contains":
                return Array.isArray(v) && v.includes(value);
            case ">=":
                return v >= value;
            case "<=":
                return v <= value;
            default:
                throw new Error(`Unsupported op ${op}`);
        }
    });
}

/**
 * @param {string} name Firestore collection name (see NETWORK_COLLECTIONS)
 */
export function createNetworkCollection(name) {
    return {
        name,
        /** Tests only: empty the in-memory adapter (no-op against Firestore). */
        clearMemory() {
            memory.delete(name);
        },
        /** @param {string} id */
        async get(id) {
            if (!id) return null;
            if (useAdminBackend()) {
                const snap = await getDoc(networkDocRef(name, id));
                return snap.exists() ? snap.data() : null;
            }
            const doc = memCol(name).get(id);
            return doc ? structuredClone(doc) : null;
        },
        /**
         * @param {string} id
         * @param {object} data
         * @param {{ merge?: boolean }} [opts]
         */
        async put(id, data, { merge = true } = {}) {
            if (useAdminBackend()) {
                // JSON round-trip drops `undefined` (Firestore rejects it) and detaches from caller objects.
                await setDoc(networkDocRef(name, id), JSON.parse(JSON.stringify(data)), { merge });
                return;
            }
            const col = memCol(name);
            col.set(id, structuredClone(merge ? { ...(col.get(id) || {}), ...data } : data));
        },
        /** @returns {Promise<object|null>} existing doc when present, else null after creating */
        async createIfAbsent(id, data) {
            if (useAdminBackend()) {
                return runAdminFirestoreTransaction(async (tx) => {
                    const ref = networkDocRef(name, id);
                    const snap = await tx.get(ref);
                    if (snap.exists()) return snap.data();
                    tx.create(ref, data);
                    return null;
                });
            }
            const col = memCol(name);
            if (col.has(id)) return structuredClone(col.get(id));
            col.set(id, structuredClone(data));
            return null;
        },
        async remove(id) {
            if (useAdminBackend()) {
                await deleteDoc(networkDocRef(name, id));
                return;
            }
            memCol(name).delete(id);
        },
        /**
         * Equality-style filters only (no composite indexes required). Caller sorts.
         * @param {{ where?: Array<[string, string, any]>, limit?: number }} [opts]
         * @returns {Promise<object[]>}
         */
        async list({ where = [], limit = 500 } = {}) {
            if (useAdminBackend()) {
                const constraints = where.map(([f, op, v]) => queryWhere(f, op, v));
                constraints.push(queryLimit(limit));
                const snap = await getDocs(query(networkCollectionRef(name), ...constraints));
                return snap.docs.map((d) => ({ ...d.data(), __id: d.id }));
            }
            return [...memCol(name).entries()]
                .filter(([, doc]) => matches(doc, where))
                .slice(0, limit)
                .map(([id, doc]) => ({ ...structuredClone(doc), __id: id }));
        },
    };
}

export function clearNetworkCollectionsForTests() {
    memory.clear();
}
