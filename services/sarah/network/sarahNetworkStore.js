/**
 * Sarah Network request/response store (U4) — in-memory; Firestore path sarahNetwork/requests.
 */
import { randomUUID } from "node:crypto";

/** @type {Map<string, object>} */
const requests = new Map();
/** @type {Map<string, object[]>} */
const auditByRequest = new Map();

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
    appendNetworkAudit(requestId, { type: "request.failed", requestId, error: next.error });
    return next;
}

function appendNetworkAudit(requestId, event) {
    const list = auditByRequest.get(requestId) || [];
    list.push({ ...event, eventId: randomUUID(), at: new Date().toISOString() });
    auditByRequest.set(requestId, list);
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

export function clearSarahNetworkStoreForTests() {
    requests.clear();
    auditByRequest.clear();
}
