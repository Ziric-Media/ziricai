/**
 * Sarah App consent grants (U4) — server-side only.
 */
import { randomUUID } from "node:crypto";

/** @type {Map<string, object>} */
const grants = new Map();

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
        disclosedFields: Array.isArray(input.disclosedFields) ? input.disclosedFields : [],
        requestId: input.requestId || null,
        status: "active",
        createdAt: new Date().toISOString(),
        expiresAt: input.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    grants.set(grantId, grant);
    return grant;
}

/**
 * @param {string} uid
 * @param {string} grantId
 * @param {object} [options]
 */
export function validateConsentGrant(uid, grantId, options = {}) {
    const grant = grants.get(grantId);
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

export function getConsentGrant(grantId) {
    return grants.get(grantId) || null;
}

export function clearConsentGrantsForTests() {
    grants.clear();
}
