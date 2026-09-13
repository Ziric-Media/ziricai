/**
 * Customer-facing Marketplace review/rating reads (public DTOs only).
 */
import { getPackById, resolvePackId } from "./marketplaceRegistry.js";
import { getMarketplaceReviewRepository } from "./marketplaceReviewRepository.js";
import { toPublicMarketplaceReview } from "./marketplaceReviewModel.js";

export const PUBLIC_REVIEWS_DEFAULT_LIMIT = 20;
export const PUBLIC_REVIEWS_MAX_LIMIT = 50;

export class MarketplacePackNotFoundError extends Error {
    constructor(packId) {
        super(`Pack not found: ${packId}`);
        this.name = "MarketplacePackNotFoundError";
        this.status = 404;
        this.code = "PACK_NOT_FOUND";
    }
}

/**
 * @param {string} packId
 * @returns {string} canonical pack id
 */
export function resolveCustomerCatalogPackId(packId) {
    if (!packId || !String(packId).trim()) {
        throw new MarketplacePackNotFoundError(packId);
    }
    const resolved = resolvePackId(String(packId).trim());
    if (!getPackById(resolved)) {
        throw new MarketplacePackNotFoundError(packId);
    }
    return resolved;
}

function clampLimit(limit) {
    const n = Number(limit) || PUBLIC_REVIEWS_DEFAULT_LIMIT;
    return Math.min(PUBLIC_REVIEWS_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export function encodeReviewPageCursor(review) {
    if (!review?.createdAt || !review?.id) return null;
    return Buffer.from(JSON.stringify({ createdAt: review.createdAt, id: review.id }), "utf8").toString(
        "base64url"
    );
}

export function decodeReviewPageCursor(cursor) {
    if (!cursor) return null;
    try {
        const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
        if (!parsed?.createdAt || !parsed?.id) return null;
        return { createdAt: String(parsed.createdAt), id: String(parsed.id) };
    } catch {
        return null;
    }
}

/**
 * @param {string} packId
 */
export async function getPublicPackRating(packId) {
    const resolved = resolveCustomerCatalogPackId(packId);
    const repo = await getMarketplaceReviewRepository();
    const agg = await repo.getPackRatingAggregate(resolved);
    const count = Math.max(0, Number(agg.count) || 0);
    const average = count === 0 ? 0 : Math.round((Number(agg.average) || 0) * 10) / 10;
    return {
        packId: resolved,
        average,
        count,
        updatedAt: agg.updatedAt || null,
    };
}

/**
 * @param {string} packId
 * @param {{ limit?: number, cursor?: string|null }} [options]
 */
export async function listPublicPackReviews(packId, options = {}) {
    const resolved = resolveCustomerCatalogPackId(packId);
    const limit = clampLimit(options.limit);
    const cursor = decodeReviewPageCursor(options.cursor);
    const repo = await getMarketplaceReviewRepository();
    const { items, nextCursor } = await repo.listPublishedReviews(resolved, { limit, cursor });
    return {
        packId: resolved,
        reviews: items.map((r) => toPublicMarketplaceReview(r)),
        pagination: {
            limit,
            nextCursor: nextCursor ? encodeReviewPageCursor(nextCursor) : null,
        },
    };
}

/**
 * @param {Array<{ id?: string, canonicalId?: string, rating?: number, ratingCount?: number }>} packs
 */
export async function hydrateCatalogRatings(packs) {
    const repo = await getMarketplaceReviewRepository();
    const out = [];
    for (const pack of packs) {
        const packId = pack.canonicalId || pack.id;
        const agg = await repo.getPackRatingAggregate(packId);
        const count = Math.max(0, Number(agg.count) || 0);
        const average = count === 0 ? 0 : Math.round((Number(agg.average) || 0) * 10) / 10;
        out.push({
            ...pack,
            rating: average,
            ratingCount: count,
        });
    }
    return out;
}
