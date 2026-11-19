/**
 * REC-02 — offering + verification states.
 */
import { isKnownCategory } from "../network/networkTaxonomy.js";

export const OFFERING_STATUS = Object.freeze({
    DRAFT: "draft",
    SUBMITTED: "submitted",
    ACTIVE: "active",
    SUSPENDED: "suspended",
    ARCHIVED: "archived",
});

export const OFFERING_VERIFICATION_STATUS = Object.freeze({
    UNVERIFIED: "unverified",
    SUBMITTED: "submitted",
    UNDER_REVIEW: "under_review",
    VERIFIED: "verified",
    REJECTED: "rejected",
    SUSPENDED: "suspended",
});

export const OFFERING_VERIFICATION_CHECKS = Object.freeze([
    "supplier_authority_confirmed",
    "offering_description_accurate",
    "category_eligible",
    "pricing_disclosed_where_applicable",
    "media_authentic",
]);

const OPEN_CASE = new Set([
    OFFERING_VERIFICATION_STATUS.SUBMITTED,
    OFFERING_VERIFICATION_STATUS.UNDER_REVIEW,
]);

export function isOpenOfferingVerification(status) {
    return OPEN_CASE.has(String(status || ""));
}

/** @param {string[]} categoryIds */
export function normalizeOfferingCategories(categoryIds = []) {
    const out = [...new Set((Array.isArray(categoryIds) ? categoryIds : []).map((c) => String(c).toLowerCase().trim()))].filter(
        isKnownCategory
    );
    if (!out.length) {
        const err = Object.assign(new Error("At least one valid category is required."), {
            status: 422,
            code: "CATEGORY_INVALID",
        });
        throw err;
    }
    return out;
}