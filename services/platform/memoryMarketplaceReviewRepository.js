/**
 * In-process Marketplace pack review store (local/regression).
 */
import {
    buildMarketplaceReviewRecord,
    computeRatingAggregateDelta,
    marketplaceReviewDocId,
} from "./marketplaceReviewModel.js";
import { MarketplaceReviewError, DUPLICATE_REVIEW, REVIEW_NOT_FOUND } from "./marketplaceReviewErrors.js";

function tenantPackKey(companyId, packId) {
    return `${companyId}::${packId}`;
}

export class MemoryMarketplaceReviewRepository {
    constructor() {
        /** @type {Map<string, object>} reviewId -> record */
        this.reviewsById = new Map();
        /** @type {Map<string, object>} packId -> aggregate */
        this.ratingsByPack = new Map();
        /** @type {Map<string, Promise<void>>} */
        this.locks = new Map();
    }

    async _withLock(lockKey, fn) {
        while (this.locks.has(lockKey)) {
            await this.locks.get(lockKey);
        }
        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });
        this.locks.set(lockKey, gate);
        try {
            return await fn();
        } finally {
            this.locks.delete(lockKey);
            release();
        }
    }

    /**
     * @param {Parameters<typeof buildMarketplaceReviewRecord>[0]} input
     */
    async createReview(input) {
        const record = buildMarketplaceReviewRecord(input);
        const lockKey = tenantPackKey(record.companyId, record.packId);

        return this._withLock(lockKey, async () => {
            if (this.reviewsById.has(record.id)) {
                throw new MarketplaceReviewError(
                    `Review already exists for company ${record.companyId} and pack ${record.packId}`,
                    DUPLICATE_REVIEW
                );
            }

            this.reviewsById.set(record.id, { ...record });

            if (record.status === "published") {
                const existing = this.ratingsByPack.get(record.packId) || {
                    packId: record.packId,
                    average: 0,
                    count: 0,
                };
                const next = computeRatingAggregateDelta(existing, record.rating, 1);
                this.ratingsByPack.set(record.packId, next);
            }

            return { outcome: "created", review: { ...record } };
        });
    }

    async getReview(reviewId) {
        const review = this.reviewsById.get(reviewId);
        return review ? { ...review } : null;
    }

    async getReviewByTenantPack(companyId, packId) {
        const id = marketplaceReviewDocId(companyId, packId);
        return this.getReview(id);
    }

    async listPublishedReviews(packId, { limit = 20, cursor = null } = {}) {
        let list = [...this.reviewsById.values()]
            .filter((r) => r.packId === packId && r.status === "published")
            .sort((a, b) => {
                const byTime = String(b.createdAt).localeCompare(String(a.createdAt));
                if (byTime !== 0) return byTime;
                return String(b.id).localeCompare(String(a.id));
            });
        if (cursor?.createdAt && cursor?.id) {
            list = list.filter((r) => {
                const afterTime = String(r.createdAt).localeCompare(String(cursor.createdAt)) < 0;
                const sameTime = String(r.createdAt) === String(cursor.createdAt);
                const tieBreak = sameTime && String(r.id).localeCompare(String(cursor.id)) < 0;
                return afterTime || tieBreak;
            });
        }
        const page = list.slice(0, limit);
        const next = list.length > limit ? page[page.length - 1] : null;
        return {
            items: page.map((r) => ({ ...r })),
            nextCursor: next ? { createdAt: next.createdAt, id: next.id } : null,
        };
    }

    async getPackRatingAggregate(packId) {
        const agg = this.ratingsByPack.get(packId);
        if (!agg) {
            return { packId, average: 0, count: 0, updatedAt: null };
        }
        return { ...agg };
    }

    /** Test helper — status transitions with aggregate maintenance. */
    async setReviewStatus(reviewId, status) {
        const lockKey = `status::${reviewId}`;
        return this._withLock(lockKey, async () => {
            const existing = this.reviewsById.get(reviewId);
            if (!existing) {
                throw new MarketplaceReviewError("Review not found", REVIEW_NOT_FOUND);
            }
            const wasPublished = existing.status === "published";
            const willPublish = status === "published";
            const ts = new Date().toISOString();
            const next = {
                ...existing,
                status,
                updatedAt: ts,
                publishedAt: willPublish ? existing.publishedAt || ts : null,
            };
            this.reviewsById.set(reviewId, next);

            if (wasPublished !== willPublish) {
                const delta = willPublish ? 1 : -1;
                const ratingAgg = this.ratingsByPack.get(existing.packId) || {
                    packId: existing.packId,
                    average: 0,
                    count: 0,
                };
                const updated = computeRatingAggregateDelta(ratingAgg, existing.rating, delta);
                this.ratingsByPack.set(existing.packId, updated);
            }

            return { ...next };
        });
    }

    /** @internal regression reset */
    _resetForTests() {
        this.reviewsById.clear();
        this.ratingsByPack.clear();
    }
}
