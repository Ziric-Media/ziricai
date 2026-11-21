/**
 * REC-02 — verified offering catalogue (tenant-scoped).
 */
import { randomUUID } from "node:crypto";
import { offeringsCol } from "./recommendationStore.js";
import {
    OFFERING_STATUS,
    OFFERING_VERIFICATION_STATUS,
    normalizeOfferingCategories,
} from "./offeringConstants.js";

function strip(row) {
    const { __id, ...rest } = row;
    return rest;
}

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

export function clientOffering(row) {
    if (!row) return null;
    const o = strip(row);
    return {
        offeringId: o.offeringId,
        companyId: o.companyId,
        displayName: o.displayName,
        description: o.description || "",
        categoryIds: o.categoryIds || [],
        status: o.status,
        verificationStatus: o.verificationStatus,
        verificationCaseId: o.verificationCaseId || null,
        pricingSummary: o.pricingSummary || null,
        attributes: o.attributes || {},
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
    };
}

/** @param {string} companyId */
export async function listOfferingsForCompany(companyId, { limit = 50 } = {}) {
    const rows = (await offeringsCol.list({ where: [["companyId", "==", companyId]], limit: 200 })).map(strip);
    return rows
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, limit)
        .map(clientOffering);
}

/** @param {string} companyId @param {string} offeringId */
export async function getOffering(companyId, offeringId) {
    const raw = await offeringsCol.get(offeringId);
    if (!raw || raw.companyId !== companyId) return null;
    return clientOffering(raw);
}

/**
 * @param {string} companyId
 * @param {object} patch
 * @param {string|null} actorUid
 */
export async function createOffering(companyId, patch, actorUid = null) {
    const displayName = String(patch.displayName || "").trim();
    if (!displayName || displayName.length > 160) {
        throw err(422, "OFFERING_INVALID", "displayName is required (max 160 characters).");
    }
    const description = String(patch.description || "").trim().slice(0, 4000);
    const categoryIds = normalizeOfferingCategories(patch.categoryIds);
    const now = new Date().toISOString();
    const offeringId = `rec_off_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const row = {
        offeringId,
        companyId,
        displayName,
        description,
        categoryIds,
        status: OFFERING_STATUS.DRAFT,
        verificationStatus: OFFERING_VERIFICATION_STATUS.UNVERIFIED,
        verificationCaseId: null,
        pricingSummary: patch.pricingSummary ? String(patch.pricingSummary).trim().slice(0, 500) : null,
        attributes: patch.attributes && typeof patch.attributes === "object" && !Array.isArray(patch.attributes) ? patch.attributes : {},
        createdBy: actorUid,
        createdAt: now,
        updatedAt: now,
    };
    await offeringsCol.put(offeringId, row, { merge: false });
    return clientOffering(row);
}

/**
 * @param {string} companyId
 * @param {string} offeringId
 */
export async function updateOffering(companyId, offeringId, patch, actorUid = null) {
    const raw = await offeringsCol.get(offeringId);
    if (!raw || raw.companyId !== companyId) throw err(404, "OFFERING_NOT_FOUND", "Offering not found.");
    const cur = strip(raw);
    if (cur.status === OFFERING_STATUS.ARCHIVED) {
        throw err(409, "OFFERING_ARCHIVED", "Archived offerings cannot be edited.");
    }
    if (cur.verificationStatus === OFFERING_VERIFICATION_STATUS.SUBMITTED || cur.verificationStatus === OFFERING_VERIFICATION_STATUS.UNDER_REVIEW) {
        throw err(409, "VERIFICATION_IN_PROGRESS", "Cannot edit while verification is in progress.");
    }
    const now = new Date().toISOString();
    const next = { ...cur, updatedAt: now, updatedBy: actorUid };
    if (patch.displayName != null) {
        const displayName = String(patch.displayName).trim();
        if (!displayName || displayName.length > 160) throw err(422, "OFFERING_INVALID", "displayName is invalid.");
        next.displayName = displayName;
    }
    if (patch.description != null) next.description = String(patch.description).trim().slice(0, 4000);
    if (patch.categoryIds != null) next.categoryIds = normalizeOfferingCategories(patch.categoryIds);
    if (patch.pricingSummary != null) next.pricingSummary = String(patch.pricingSummary).trim().slice(0, 500) || null;
    if (patch.attributes != null) {
        if (typeof patch.attributes !== "object" || Array.isArray(patch.attributes)) {
            throw err(422, "OFFERING_INVALID", "attributes must be an object.");
        }
        next.attributes = patch.attributes;
    }
    if (cur.verificationStatus === OFFERING_VERIFICATION_STATUS.VERIFIED) {
        next.verificationStatus = OFFERING_VERIFICATION_STATUS.UNVERIFIED;
        next.status = OFFERING_STATUS.DRAFT;
    }
    await offeringsCol.put(offeringId, next, { merge: false });
    return clientOffering(next);
}

/** Internal — apply verification outcome to offering doc. */
export async function applyOfferingVerificationOutcome(offeringId, caseRow) {
    const raw = await offeringsCol.get(offeringId);
    if (!raw) return null;
    const cur = strip(raw);
    const now = new Date().toISOString();
    const status = caseRow.status;
    let nextStatus = cur.status;
    let verificationStatus = status;
    if (status === OFFERING_VERIFICATION_STATUS.VERIFIED) {
        nextStatus = OFFERING_STATUS.ACTIVE;
        verificationStatus = OFFERING_VERIFICATION_STATUS.VERIFIED;
    } else if (status === OFFERING_VERIFICATION_STATUS.REJECTED) {
        nextStatus = OFFERING_STATUS.DRAFT;
        verificationStatus = OFFERING_VERIFICATION_STATUS.REJECTED;
    } else if (status === OFFERING_VERIFICATION_STATUS.SUSPENDED) {
        nextStatus = OFFERING_STATUS.SUSPENDED;
        verificationStatus = OFFERING_VERIFICATION_STATUS.SUSPENDED;
    } else if (status === OFFERING_VERIFICATION_STATUS.SUBMITTED || status === OFFERING_VERIFICATION_STATUS.UNDER_REVIEW) {
        nextStatus = OFFERING_STATUS.SUBMITTED;
        verificationStatus = status;
    }
    const next = {
        ...cur,
        status: nextStatus,
        verificationStatus,
        verificationCaseId: caseRow.caseId,
        updatedAt: now,
    };
    await offeringsCol.put(offeringId, next, { merge: false });
    return clientOffering(next);
}

export async function getOfferingById(offeringId) {
    const raw = await offeringsCol.get(offeringId);
    return raw ? clientOffering(raw) : null;
}