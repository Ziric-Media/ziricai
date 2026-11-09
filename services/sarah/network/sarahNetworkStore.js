/**
 * Sarah Network request/response store (U4).
 *
 * SNET-02: in-process Maps are a write-through cache over `networkRequests/{requestId}` and
 * `networkRequestAudit/{eventId}` (Firestore Admin; memory adapter in tests). Sync functions keep their U4
 * contract; `*Async` variants read through the durable store (restart / multi-replica safe).
 */
import { randomUUID } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../../database/schema.js";
import { createNetworkCollection } from "../../network/networkCollectionStore.js";
import { writeThrough } from "../../network/networkWriteQueue.js";

/** @type {Map<string, object>} */
const requests = new Map();
/** @type {Map<string, object[]>} */
const auditByRequest = new Map();

const requestCol = createNetworkCollection(NETWORK_COLLECTIONS.REQUESTS);
const auditCol = createNetworkCollection(NETWORK_COLLECTIONS.REQUEST_AUDIT);

function persistRequest(doc) {
    void writeThrough("network request", () => requestCol.put(doc.requestId, doc, { merge: false }));
}

function strip(row) {
    const { __id, ...rest } = row;
    return rest;
}

export function createNetworkRequest(envelope) {
    const requestId = envelope.requestId || `snr_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const doc = {
        protocolVersion: 1,
        requestId,
        status: "pending",
        ...envelope,
        createdAt: envelope.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    requests.set(requestId, doc);
    persistRequest(doc);
    appendNetworkAudit(requestId, { type: "request.created", requestId });
    return doc;
}

export function getNetworkRequest(requestId) {
    return requests.get(requestId) || null;
}

export function attachNetworkResponse(requestId, response) {
    const req = requests.get(requestId);
    if (!req) return null;
    const responseId = response.responseId || `snr_res_${randomUUID().slice(0, 8)}`;
    const next = {
        ...req,
        status: response.status || "completed",
        response: { responseId, ...response },
        updatedAt: new Date().toISOString(),
    };
    requests.set(requestId, next);
    persistRequest(next);
    appendNetworkAudit(requestId, { type: "request.completed", requestId, responseId });
    return next;
}

export function failNetworkRequest(requestId, error) {
    const req = requests.get(requestId);
    if (!req) return null;
    const next = {
        ...req,
        status: "failed",
        error: { message: error.message || String(error), code: error.code || "DISPATCH_FAILED" },
        updatedAt: new Date().toISOString(),
    };
    requests.set(requestId, next);
    persistRequest(next);
    appendNetworkAudit(requestId, { type: "request.failed", requestId, error: next.error });
    return next;
}

function appendNetworkAudit(requestId, event) {
    const entry = { ...event, eventId: randomUUID(), at: new Date().toISOString() };
    const list = auditByRequest.get(requestId) || [];
    list.push(entry);
    auditByRequest.set(requestId, list);
    void writeThrough("network audit", () => auditCol.put(entry.eventId, entry, { merge: false }));
}

export function getNetworkAudit(requestId) {
    return auditByRequest.get(requestId) || [];
}

export function listNetworkRequestsForUser(uid, limit = 20) {
    return [...requests.values()]
        .filter((r) => r.source?.userId === uid)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit);
}

/** Read-through single request. */
export async function getNetworkRequestAsync(requestId) {
    const cached = requests.get(requestId);
    if (cached) return cached;
    const stored = await requestCol.get(requestId);
    if (!stored) return null;
    const doc = strip(stored);
    requests.set(requestId, doc);
    return doc;
}

/** Audit trail for a request, merged from cache + durable store, oldest first. */
export async function getNetworkAuditAsync(requestId) {
    const stored = (await auditCol.list({ where: [["requestId", "==", requestId]], limit: 200 })).map(strip);
    const byId = new Map(stored.map((e) => [e.eventId, e]));
    for (const e of getNetworkAudit(requestId)) byId.set(e.eventId, e);
    return [...byId.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** Read-through user request list (newest first). */
export async function listNetworkRequestsForUserAsync(uid, limit = 20) {
    const stored = (await requestCol.list({ where: [["source.userId", "==", uid]], limit: 200 })).map(strip);
    const byId = new Map(stored.map((r) => [r.requestId, r]));
    for (const r of requests.values()) if (r.source?.userId === uid) byId.set(r.requestId, r);
    return [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

/**
 * Platform view: recent requests across users, optional destination company filter.
 * @param {{ companyId?: string, limit?: number }} [opts]
 */
export async function listNetworkRequestsAsync({ companyId, limit = 100 } = {}) {
    const where = companyId ? [["destination.companyId", "==", companyId]] : [];
    const stored = (await requestCol.list({ where, limit: 500 })).map(strip);
    const byId = new Map(stored.map((r) => [r.requestId, r]));
    for (const r of requests.values()) {
        if (!companyId || r.destination?.companyId === companyId) byId.set(r.requestId, r);
    }
    return [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

export function clearSarahNetworkStoreForTests() {
    requests.clear();
    auditByRequest.clear();
    requestCol.clearMemory();
    auditCol.clearMemory();
}

/** Simulate a process restart: drop caches but keep the durable store. */
export function dropSarahNetworkCacheForTests() {
    requests.clear();
    auditByRequest.clear();
}
