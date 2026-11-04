/**
 * Sarah Network orchestration (U4).
 */
import { assertCompanyDiscoverable } from "../../users/businessDirectoryService.js";
import { validateConsentGrant } from "../../users/consentGrantService.js";
import { auditLog } from "../../audit/auditLog.js";
import {
    createNetworkRequest,
    getNetworkRequest,
    attachNetworkResponse,
    failNetworkRequest,
    listNetworkRequestsForUser,
    getNetworkAudit,
} from "./sarahNetworkStore.js";
import { dispatchCompanyReception } from "./dispatchCompanyReception.js";

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_PER_USER = Number(process.env.SARAH_NETWORK_RATE_PER_HOUR) || 30;

/** @type {Map<string, number[]>} */
const rateEvents = new Map();

function assertRateLimit(uid) {
    const now = Date.now();
    const events = (rateEvents.get(uid) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (events.length >= RATE_MAX_PER_USER) {
        throw Object.assign(new Error("Too many Sarah Network requests. Please try again later."), {
            status: 429,
            code: "RATE_LIMITED",
        });
    }
    events.push(now);
    rateEvents.set(uid, events);
}

/**
 * @param {string} uid
 * @param {object} input
 */
export async function submitPersonalToCompanyEnquiry(uid, input) {
    assertRateLimit(uid);
    const companyId = String(input.companyId || "").trim();
    if (!companyId) {
        throw Object.assign(new Error("companyId is required."), { status: 400, code: "COMPANY_ID_REQUIRED" });
    }

    assertCompanyDiscoverable(companyId);

    const grantId = input.grantId;
    if (!grantId) {
        throw Object.assign(new Error("A consent grant is required before Sarah can contact a business."), {
            status: 403,
            code: "GRANT_REQUIRED",
        });
    }
    validateConsentGrant(uid, grantId, { companyId });

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
        return completed;
    } catch (err) {
        failNetworkRequest(requestDoc.requestId, err);
        throw err;
    }
}

export function getSarahNetworkRequest(requestId, uid) {
    const doc = getNetworkRequest(requestId);
    if (!doc) {
        throw Object.assign(new Error("Network request not found."), { status: 404, code: "REQUEST_NOT_FOUND" });
    }
    if (doc.source?.userId !== uid) {
        throw Object.assign(new Error("Forbidden."), { status: 403, code: "REQUEST_FORBIDDEN" });
    }
    return { request: doc, audit: getNetworkAudit(requestId) };
}

export function listSarahNetworkRequests(uid) {
    return listNetworkRequestsForUser(uid);
}

export function resetSarahNetworkRateLimitsForTests() {
    rateEvents.clear();
}
