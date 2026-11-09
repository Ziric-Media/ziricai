/**
 * Sarah App consent grants (U4) — server-side only.
 *
 * SNET-02: the Map is a write-through cache over `networkConsentGrants/{grantId}` (Firestore Admin; memory
 * adapter in tests). Sync functions keep their U4 contract; `*Async` variants read through the store so a
 * grant survives restarts and works across replicas.
 */
import { randomUUID } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import { writeThrough } from "../network/networkWriteQueue.js";

/** @type {Map<string, object>} */
const grants = new Map();
const col = createNetworkCollection(NETWORK_COLLECTIONS.CONSENT_GRANTS);

function persist(grant) {
    void writeThrough("consent grant", () => col.put(grant.grantId, grant, { merge: false }));
}

/** One-off enquiry grants last a day; standing relationship grants (SNET-07) last a year unless revoked. */
const STANDING_SCOPES = new Set(["sarah_network_subscription", "sarah_network_connection"]);
function defaultTtlMs(scope) {
    return (STANDING_SCOPES.has(scope) ? 365 : 1) * 24 * 60 * 60 * 1000;
}

/**
 * @param {string} uid
 * @param {object} input
 */
export function createConsentGrant(uid, input = {}) {
    const grantId = `grant_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const grant = {
        grantId,
        uid,
        scope: input.scope || "sarah_network_enquiry",
        companyId: input.companyId || null,
        snId: input.snId || null,
        disclosedFields: Array.isArray(input.disclosedFields) ? input.disclosedFields : [],
        requestId: input.requestId || null,
        status: "active",
        createdAt: new Date().toISOString(),
        expiresAt: input.expiresAt || new Date(Date.now() + defaultTtlMs(input.scope)).toISOString(),
    };
    grants.set(grantId, grant);
    persist(grant);
    return grant;
}

/** @param {object|null} grant @param {string} uid @param {object} options */
function assertGrantUsable(grant, uid, options = {}) {
    if (!grant) {
        throw Object.assign(new Error("Consent grant not found."), { status: 404, code: "GRANT_NOT_FOUND" });
    }
    if (grant.uid !== uid) {
        throw Object.assign(new Error("Consent grant does not belong to this user."), {
            status: 403,
            code: "GRANT_FORBIDDEN",
        });
    }
    if (grant.status !== "active") {
        throw Object.assign(new Error("Consent grant is no longer active."), {
            status: 403,
            code: "GRANT_INACTIVE",
        });
    }
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() < Date.now()) {
        throw Object.assign(new Error("Consent grant has expired."), { status: 403, code: "GRANT_EXPIRED" });
    }
    if (options.companyId && grant.companyId && grant.companyId !== options.companyId) {
        throw Object.assign(new Error("Consent grant is not valid for this company."), {
            status: 403,
            code: "GRANT_COMPANY_MISMATCH",
        });
    }
    return grant;
}

/**
 * @param {string} uid
 * @param {string} grantId
 * @param {object} [options]
 */
export function validateConsentGrant(uid, grantId, options = {}) {
    return assertGrantUsable(grants.get(grantId), uid, options);
}

export function getConsentGrant(grantId) {
    return grants.get(grantId) || null;
}

/** Read-through: cache first, then the durable store (cold start / another replica). */
export async function getConsentGrantAsync(grantId) {
    if (!grantId) return null;
    const cached = grants.get(grantId);
    if (cached) return cached;
    const stored = await col.get(grantId);
    if (stored) {
        const { __id, ...grant } = stored;
        grants.set(grantId, grant);
        return grant;
    }
    return null;
}

export async function validateConsentGrantAsync(uid, grantId, options = {}) {
    return assertGrantUsable(await getConsentGrantAsync(grantId), uid, options);
}

/**
 * @param {string} uid
 * @returns {Promise<object[]>} newest first
 */
export async function listConsentGrantsForUser(uid) {
    const stored = await col.list({ where: [["uid", "==", uid]], limit: 200 });
    const merged = new Map();
    for (const row of stored) {
        const { __id, ...grant } = row;
        merged.set(grant.grantId, grant);
    }
    for (const g of grants.values()) if (g.uid === uid) merged.set(g.grantId, g);
    return [...merged.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Revoke a grant the caller owns. Idempotent.
 * @param {string} uid
 * @param {string} grantId
 */
export async function revokeConsentGrant(uid, grantId) {
    const grant = await getConsentGrantAsync(grantId);
    if (!grant) {
        throw Object.assign(new Error("Consent grant not found."), { status: 404, code: "GRANT_NOT_FOUND" });
    }
    if (grant.uid !== uid) {
        throw Object.assign(new Error("Consent grant does not belong to this user."), { status: 403, code: "GRANT_FORBIDDEN" });
    }
    if (grant.status === "revoked") return grant;
    const next = { ...grant, status: "revoked", revokedAt: new Date().toISOString() };
    grants.set(grantId, next);
    await col.put(grantId, next, { merge: false });
    return next;
}

export function clearConsentGrantsForTests() {
    grants.clear();
    col.clearMemory();
}

/** Simulate a process restart: drop the cache but keep the durable store. */
export function dropConsentGrantCacheForTests() {
    grants.clear();
}
