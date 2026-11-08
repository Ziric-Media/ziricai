/**
 * Sarah Network orchestration (U4).
 */
import { assertCompanyDiscoverableAsync } from "../../users/businessDirectoryService.js";
import { validateConsentGrantAsync } from "../../users/consentGrantService.js";
import { auditLog } from "../../audit/auditLog.js";
import {
    createNetworkRequest,
    getNetworkRequest,
    attachNetworkResponse,
    failNetworkRequest,
    listNetworkRequestsForUser,
    getNetworkAudit,
    getNetworkRequestAsync,
    getNetworkAuditAsync,
    listNetworkRequestsForUserAsync,
} from "./sarahNetworkStore.js";
import { dispatchCompanyReception } from "./dispatchCompanyReception.js";
import { ensureNetworkChatThread } from "../../users/sarahNetworkChatLinkService.js";
import { NETWORK_COLLECTIONS } from "../../database/schema.js";
import { createNetworkCollection } from "../../network/networkCollectionStore.js";

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_PER_USER = Number(process.env.SARAH_NETWORK_RATE_PER_HOUR) || 30;

/** @type {Map<string, number[]>} */
const rateEvents = new Map();

const rateCol = createNetworkCollection(NETWORK_COLLECTIONS.RATE_EVENTS);

/**
 * Per-user hourly limit. In-process sliding window (cheap, exact on one instance) plus a durable fixed-window
 * counter (networkRateEvents/{uid}__{hour}) so limits hold across restarts / replicas. The durable counter is a
 * read-then-write (not a transaction): under heavy concurrency it may under-count slightly; it is a guard rail, not billing.
 */
async function assertRateLimit(uid) {
    const now = Date.now();
    const events = (rateEvents.get(uid) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (events.length >= RATE_MAX_PER_USER) {
        throw Object.assign(new Error("Too many Sarah Network requests. Please try again later."), {
            status: 429,
            code: "RATE_LIMITED",
        });
    }
    const bucket = Math.floor(now / RATE_WINDOW_MS);
    const rateId = `${uid}__${bucket}`;
    const durable = await rateCol.get(rateId);
    const used = Number(durable?.count || 0);
    if (used >= RATE_MAX_PER_USER) {
        throw Object.assign(new Error("Too many Sarah Network requests. Please try again later."), {
            status: 429,
            code: "RATE_LIMITED",
        });
    }
    events.push(now);
    rateEvents.set(uid, events);
    await rateCol.put(rateId, { uid, bucket, count: used + 1, updatedAt: new Date(now).toISOString() }, { merge: false });
}

/**
 * @param {string} uid
 * @param {object} input
 */
export async function submitPersonalToCompanyEnquiry(uid, input) {
    await assertRateLimit(uid);
    const companyId = String(input.companyId || "").trim();
    if (!companyId) {
        throw Object.assign(new Error("companyId is required."), { status: 400, code: "COMPANY_ID_REQUIRED" });
    }

    await assertCompanyDiscoverableAsync(companyId);

    const grantId = input.grantId;
    if (!grantId) {
        throw Object.assign(new Error("A consent grant is required before Sarah can contact a business."), {
            status: 403,
            code: "GRANT_REQUIRED",
        });
    }
    await validateConsentGrantAsync(uid, grantId, { companyId });

    const requestDoc = createNetworkRequest({
        interactionType: input.interactionType || "business_information",
        channel: "sarah_app",
        source: {
            actorType: "personal_sarah",
            userId: uid,
            sessionId: input.personalSessionId || null,
        },
        destination: {
            actorType: "company_sarah",
            companyId,
        },
        payload: {
            intent: input.intent || "general_enquiry",
            naturalLanguage: String(input.naturalLanguage || "").trim(),
            structured: input.structured || {},
            consumerDisplayName: input.consumerDisplayName || null,
        },
        consent: {
            grantId,
            scope: "this_request",
            disclosedFields: input.disclosedFields || [],
        },
    });

    auditLog("sarah_network_enquiry", {
        uid,
        companyId,
        requestId: requestDoc.requestId,
        interactionType: requestDoc.interactionType,
    });

    try {
        const response = await dispatchCompanyReception(requestDoc);
        const completed = attachNetworkResponse(requestDoc.requestId, response);
        await ensureNetworkChatThread({ ...completed, response });
        return completed;
    } catch (err) {
        failNetworkRequest(requestDoc.requestId, err);
        throw err;
    }
}

function assertOwnRequest(doc, uid) {
    if (!doc) {
        throw Object.assign(new Error("Network request not found."), { status: 404, code: "REQUEST_NOT_FOUND" });
    }
    if (doc.source?.userId !== uid) {
        throw Object.assign(new Error("Forbidden."), { status: 403, code: "REQUEST_FORBIDDEN" });
    }
}

export function getSarahNetworkRequest(requestId, uid) {
    const doc = getNetworkRequest(requestId);
    assertOwnRequest(doc, uid);
    return { request: doc, audit: getNetworkAudit(requestId) };
}

/** Read-through variant (cold start / other replica). */
export async function getSarahNetworkRequestAsync(requestId, uid) {
    const doc = await getNetworkRequestAsync(requestId);
    assertOwnRequest(doc, uid);
    return { request: doc, audit: await getNetworkAuditAsync(requestId) };
}

export function listSarahNetworkRequests(uid) {
    return listNetworkRequestsForUser(uid);
}

export async function listSarahNetworkRequestsAsync(uid) {
    return listNetworkRequestsForUserAsync(uid);
}

export function resetSarahNetworkRateLimitsForTests() {
    rateEvents.clear();
    rateCol.clearMemory();
}
