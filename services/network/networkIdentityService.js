/**
 * SNET-01a — Network Identity Service (foundation): `networkEntities/{snId}` linked to companyId via
 * `networkRefs/org__{companyId}`. Firestore (Admin) when available, in-memory otherwise (tests / STORAGE_BACKEND=memory).
 */
import { mintSnId, SN_ID_KINDS, isValidSnId } from "./snId.js";
import {
    useAdminBackend,
    getDoc,
    setDoc,
    networkEntityRef,
    networkRefDocRef,
    runAdminFirestoreTransaction,
} from "../database/firestoreClient.js";
import { NETWORK_ENTITIES } from "../database/schema.js";

export const NETWORK_ENTITY_STATUSES = Object.freeze({
    DRAFT: "draft",
    LISTED: "listed",
    SUSPENDED: "suspended",
});

/** @type {Map<string, object>} */
const memEntities = new Map();
/** @type {Map<string, { snId: string }>} */
const memRefs = new Map();

const memoryStore = {
    async getEntity(snId) {
        return memEntities.get(snId) || null;
    },
    async putEntity(entity) {
        memEntities.set(entity.snId, entity);
    },
    async getRef(refDocId) {
        return memRefs.get(refDocId) || null;
    },
    /** @returns {Promise<{ snId: string }|null>} existing ref when already present, else null after creating */
    async createRefIfAbsent(refDocId, data) {
        const existing = memRefs.get(refDocId);
        if (existing) return existing;
        memRefs.set(refDocId, data);
        return null;
    },
};

const firestoreStore = {
    async getEntity(snId) {
        const snap = await getDoc(networkEntityRef(snId));
        return snap.exists() ? snap.data() : null;
    },
    async putEntity(entity) {
        await setDoc(networkEntityRef(entity.snId), entity, { merge: true });
    },
    async getRef(refDocId) {
        const snap = await getDoc(networkRefDocRef(refDocId));
        return snap.exists() ? snap.data() : null;
    },
    async createRefIfAbsent(refDocId, data) {
        return runAdminFirestoreTransaction(async (tx) => {
            const ref = networkRefDocRef(refDocId);
            const snap = await tx.get(ref);
            if (snap.exists()) return snap.data();
            tx.create(ref, data);
            return null;
        });
    },
};

/** @type {typeof memoryStore|null} */
let storeOverride = null;

function store() {
    return storeOverride || (useAdminBackend() ? firestoreStore : memoryStore);
}

export function refDocId(kind, refKey) {
    return `${kind}__${refKey}`;
}

function nowIso() {
    return new Date().toISOString();
}

/**
 * Idempotently create (or return) the org entity for a tenant. Safe to call repeatedly / concurrently.
 * @param {string} companyId
 * @param {{ displayName?: string, status?: string }} [input]
 */
export async function ensureOrgEntity(companyId, input = {}) {
    const cid = String(companyId || "").trim();
    if (!cid) {
        throw Object.assign(new Error("companyId is required."), { status: 400, code: "COMPANY_ID_REQUIRED" });
    }
    const s = store();
    const key = refDocId(SN_ID_KINDS.ORGANISATION, cid);
    const timestamp = nowIso();

    let snId = (await s.getRef(key))?.snId || null;
    if (!snId) {
        const candidate = mintSnId(SN_ID_KINDS.ORGANISATION);
        const existing = await s.createRefIfAbsent(key, { snId: candidate, kind: SN_ID_KINDS.ORGANISATION, companyId: cid, createdAt: timestamp });
        snId = existing?.snId || candidate;
    }

    const current = await s.getEntity(snId);
    if (!current) {
        const entity = {
            snId,
            kind: SN_ID_KINDS.ORGANISATION,
            status: input.status || NETWORK_ENTITY_STATUSES.DRAFT,
            version: 1,
            schemaVersion: NETWORK_ENTITIES.SCHEMA_VERSION,
            refs: { companyId: cid },
            displayName: input.displayName || cid,
            handle: null,
            verification: { state: "unverified" },
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        await s.putEntity(entity);
        return entity;
    }

    const patch = {};
    if (input.displayName && input.displayName !== current.displayName) patch.displayName = input.displayName;
    if (
        input.status &&
        input.status !== current.status &&
        current.status !== NETWORK_ENTITY_STATUSES.SUSPENDED
    ) {
        patch.status = input.status;
    }
    if (!Object.keys(patch).length) return current;
    const next = { ...current, ...patch, version: (current.version || 1) + 1, updatedAt: timestamp };
    await s.putEntity(next);
    return next;
}

/** @param {string} snId */
export async function getEntityBySnId(snId) {
    if (!isValidSnId(snId)) return null;
    return store().getEntity(snId);
}

/** @param {string} companyId */
export async function getOrgEntityByCompanyId(companyId) {
    const cid = String(companyId || "").trim();
    if (!cid) return null;
    const ref = await store().getRef(refDocId(SN_ID_KINDS.ORGANISATION, cid));
    return ref?.snId ? store().getEntity(ref.snId) : null;
}

/** Best-effort hook for provisioning/publish paths — never throws. */
export async function ensureOrgEntitySafe(companyId, input = {}) {
    try {
        return await ensureOrgEntity(companyId, input);
    } catch (err) {
        console.warn("[networkIdentityService] ensureOrgEntity failed:", err.message);
        return null;
    }
}

export function clearNetworkEntitiesForTests() {
    memEntities.clear();
    memRefs.clear();
}

/** @param {typeof memoryStore|null} override */
export function setNetworkEntityStoreForTests(override) {
    storeOverride = override;
}
