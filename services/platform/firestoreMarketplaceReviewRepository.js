/**
 * Firestore Marketplace pack reviews — platform/marketplace/reviews + ratings (Admin SDK).
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import {
    platformMarketplaceReviewsCollectionPath,
    platformRatingPath,
    platformReviewPath,
} from "../database/schema.js";
import {
    buildMarketplaceReviewRecord,
    computeRatingAggregateDelta,
    marketplaceReviewDocId,
    stripUndefinedFields,
} from "./marketplaceReviewModel.js";
import { MarketplaceReviewError, DUPLICATE_REVIEW, REVIEW_NOT_FOUND } from "./marketplaceReviewErrors.js";

export class FirestoreMarketplaceReviewRepository {
    /**
     * @param {Parameters<typeof buildMarketplaceReviewRecord>[0]} input
     */
    async createReview(input) {
        const record = buildMarketplaceReviewRecord(input);
        const db = getAdminFirestore();
        const reviewRef = db.doc(platformReviewPath(record.id));
        const ratingRef = db.doc(platformRatingPath(record.packId));

        return db.runTransaction(async (tx) => {
            const reviewSnap = await tx.get(reviewRef);
            const ratingSnap =
                record.status === "published" ? await tx.get(ratingRef) : null;

            if (reviewSnap.exists) {
                throw new MarketplaceReviewError(
                    `Review already exists for company ${record.companyId} and pack ${record.packId}`,
                    DUPLICATE_REVIEW
                );
            }

            const payload = stripUndefinedFields(record);
            tx.create(reviewRef, payload);

            if (record.status === "published") {
                const existing = ratingSnap?.exists
                    ? { packId: record.packId, ...ratingSnap.data() }
                    : { packId: record.packId, average: 0, count: 0 };
                const next = computeRatingAggregateDelta(existing, record.rating, 1);
                tx.set(ratingRef, stripUndefinedFields(next), { merge: true });
            }

            return { outcome: "created", review: { ...record } };
        });
    }

    async getReview(reviewId) {
        const db = getAdminFirestore();
        const snap = await db.doc(platformReviewPath(reviewId)).get();
        if (!snap.exists) return null;
        return { id: snap.id, ...snap.data() };
    }

    async getReviewByTenantPack(companyId, packId) {
        const id = marketplaceReviewDocId(companyId, packId);
        return this.getReview(id);
    }

    async listPublishedReviews(packId, { limit = 20, cursor = null } = {}) {
        const db = getAdminFirestore();
        const col = db.collection(platformMarketplaceReviewsCollectionPath());
        let q = col
            .where("packId", "==", packId)
            .where("status", "==", "published")
            .orderBy("createdAt", "desc")
            .orderBy("__name__", "desc");
        if (cursor?.createdAt && cursor?.id) {
            q = q.startAfter(cursor.createdAt, cursor.id);
        }
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const hasMore = docs.length > limit;
        const page = hasMore ? docs.slice(0, limit) : docs;
        const last = page[page.length - 1];
        return {
            items: page,
            nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
        };
    }

    async getPackRatingAggregate(packId) {
        const db = getAdminFirestore();
        const snap = await db.doc(platformRatingPath(packId)).get();
        if (!snap.exists) {
            return { packId, average: 0, count: 0, updatedAt: null };
        }
        return { packId, ...snap.data() };
    }

    /** Test/helper — status transitions with aggregate maintenance. */
    async setReviewStatus(reviewId, status) {
        const db = getAdminFirestore();
        const reviewRef = db.doc(platformReviewPath(reviewId));

        return db.runTransaction(async (tx) => {
            const reviewSnap = await tx.get(reviewRef);
            if (!reviewSnap.exists) {
                throw new MarketplaceReviewError("Review not found", REVIEW_NOT_FOUND);
            }
            const existing = { id: reviewSnap.id, ...reviewSnap.data() };
            const wasPublished = existing.status === "published";
            const willPublish = status === "published";
            const ratingRef = db.doc(platformRatingPath(existing.packId));
            const ratingSnap =
                wasPublished !== willPublish ? await tx.get(ratingRef) : null;

            const ts = new Date().toISOString();
            const next = stripUndefinedFields({
                ...existing,
                status,
                updatedAt: ts,
                publishedAt: willPublish ? existing.publishedAt || ts : null,
            });
            tx.set(reviewRef, next);

            if (wasPublished !== willPublish && ratingSnap) {
                const ratingAgg = ratingSnap.exists
                    ? { packId: existing.packId, ...ratingSnap.data() }
                    : { packId: existing.packId, average: 0, count: 0 };
                const delta = willPublish ? 1 : -1;
                const updated = computeRatingAggregateDelta(ratingAgg, existing.rating, delta);
                tx.set(ratingRef, stripUndefinedFields(updated), { merge: true });
            }

            return next;
        });
    }

    /** Structural reference for verification (no I/O). */
    static pathHelpers() {
        return {
            reviewsCollection: platformMarketplaceReviewsCollectionPath(),
            reviewDoc: (reviewId) => platformReviewPath(reviewId),
            ratingDoc: (packId) => platformRatingPath(packId),
        };
    }
}
