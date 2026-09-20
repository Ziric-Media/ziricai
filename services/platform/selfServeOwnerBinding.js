/**
 * CORPORATE-P0-2b — server-authoritative owner uid for self-serve onboarding/provisioning.
 */

/**
 * @param {object} payload
 * @returns {string}
 */
export function resolveSelfServeOwnerUid(payload = {}) {
    const uid = String(payload.uid || payload.ownerUid || "").trim();
    if (!uid) {
        throw Object.assign(new Error("Authenticated owner uid is required"), {
            status: 401,
            code: "UNAUTHORIZED",
        });
    }
    return uid;
}

/**
 * Enforce that company provisioning data uses the authenticated owner uid only.
 * @param {object} companyData
 * @param {string} ownerUid
 */
export function bindSelfServeCompanyData(companyData = {}, ownerUid) {
    const uid = String(ownerUid || "").trim();
    if (!uid) {
        throw Object.assign(new Error("Authenticated owner uid is required"), {
            status: 401,
            code: "UNAUTHORIZED",
        });
    }

    const provided = String(companyData.ownerUid || companyData.ownerId || "").trim();
    if (provided && provided !== uid) {
        throw Object.assign(new Error("Owner uid does not match authenticated user"), {
            status: 403,
            code: "OWNER_UID_MISMATCH",
        });
    }

    return {
        ...companyData,
        ownerUid: uid,
        ownerId: uid,
        selfServeOwnerUid: uid,
    };
}

/**
 * Demo lead seed — default off in production (P0-2b).
 * @param {boolean|undefined} explicit
 */
export function resolveSeedDemoLead(explicit) {
    if (explicit === true) return true;
    if (explicit === false) return false;
    if (process.env.ONBOARDING_SEED_DEMO_LEAD === "true") return true;
    if (process.env.ONBOARDING_SEED_DEMO_LEAD === "false") return false;
    return process.env.NODE_ENV !== "production";
}
