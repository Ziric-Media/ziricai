/**
 * Marketplace pack review model — platform-level social proof (Model A foundation).
 */
import crypto from "crypto";
import { MarketplaceReviewError, INVALID_REVIEW } from "./marketplaceReviewErrors.js";

/** @typedef {'pending'|'published'|'rejected'} MarketplaceReviewStatus */

export const MARKETPLACE_REVIEW_STATUSES = /** @type {const} */ (["pending", "published", "rejected"]);

const MAX_TITLE = 200;
const MAX_BODY = 4000;
const MAX_DISPLAY_NAME = 120;

/**
 * Deterministic review document id for one review per tenant + pack.
 * @param {string} companyId
 * @param {string} packId
 */
export function marketplaceReviewDocId(companyId, packId) {
    if (!companyId || !packId) {
        throw new MarketplaceReviewError("companyId and packId are required", INVALID_REVIEW);
    }
    return crypto.createHash("sha256").update(`${companyId}\n${packId}`, "utf8").digest("hex");
}

function clampRating(rating) {
    const n = Number(rating);
    if (!Number.isFinite(n) || n < 1 || n > 5) {
        throw new MarketplaceReviewError("rating must be a number between 1 and 5", INVALID_REVIEW);
    }
    return Math.min(5, Math.max(1, Math.round(n)));
}

function trimText(value, maxLen, fieldName) {
    const s = value == null ? "" : String(value).trim();
    if (s.length > maxLen) {
        throw new MarketplaceReviewError(`${fieldName} exceeds ${maxLen} characters`, INVALID_REVIEW);
    }
    return s;
}

/**
 * @param {object} input
 * @param {string} input.companyId
 * @param {string} input.packId
 * @param {string} input.authorUid
 * @param {string} input.authorDisplayName
 * @param {number} input.rating
 * @param {string} [input.title]
 * @param {string} [input.body]
 * @param {MarketplaceReviewStatus} [input.status]
 */
export function buildMarketplaceReviewRecord(input) {
    const companyId = trimText(input.companyId, 128, "companyId");
    const packId = trimText(input.packId, 128, "packId");
    const authorUid = trimText(input.authorUid, 128, "authorUid");
    const authorDisplayName = trimText(input.authorDisplayName || "Tenant member", MAX_DISPLAY_NAME, "authorDisplayName");
    if (!companyId || !packId || !authorUid) {
        throw new MarketplaceReviewError("companyId, packId, and authorUid are required", INVALID_REVIEW);
    }

    const status = input.status || "published";
    if (!MARKETPLACE_REVIEW_STATUSES.includes(status)) {
        throw new MarketplaceReviewError(`Invalid review status: ${status}`, INVALID_REVIEW);
    }

    const ts = new Date().toISOString();
    const id = marketplaceReviewDocId(companyId, packId);
    const rating = clampRating(input.rating);
    const title = trimText(input.title, MAX_TITLE, "title");
    const body = trimText(input.body, MAX_BODY, "body");

    /** @type {Record<string, unknown>} */
    const record = {
        id,
        packId,
        companyId,
        authorUid,
        authorDisplayName,
        rating,
        title,
        body,
        status,
        createdAt: ts,
        updatedAt: ts,
    };
    if (status === "published") {
        record.publishedAt = ts;
    }

    return record;
}

/**
 * Remove undefined values (Firestore rejects undefined fields).
 * @param {Record<string, unknown>} obj
 */
export function stripUndefinedFields(obj) {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) out[k] = v;
    }
    return out;
}

/**
 * Public API shape — no tenant ids, uids, or moderation internals.
 * @param {Record<string, unknown>} review
 */
export function toPublicMarketplaceReview(review) {
    return {
        id: review.id,
        packId: review.packId,
        authorDisplayName: review.authorDisplayName,
        rating: review.rating,
        title: review.title,
        body: review.body,
        createdAt: review.createdAt,
    };
}

/**
 * @param {{ average?: number, count?: number }} existing
 * @param {number} rating
 * @param {1|-1} deltaCount published review added (+1) or removed (-1)
 */
export function computeRatingAggregateDelta(existing, rating, deltaCount) {
    const packId = existing?.packId;
    const oldCount = Math.max(0, Number(existing?.count) || 0);
    const oldAverage = Number(existing?.average) || 0;
    const newCount = oldCount + deltaCount;

    if (newCount <= 0) {
        return {
            packId,
            average: 0,
            count: 0,
            updatedAt: new Date().toISOString(),
        };
    }

    const oldSum = oldAverage * oldCount;
    const newSum = oldSum + rating * deltaCount;
    const average = Math.round((newSum / newCount) * 10) / 10;

    return {
        packId,
        average,
        count: newCount,
        updatedAt: new Date().toISOString(),
    };
}
