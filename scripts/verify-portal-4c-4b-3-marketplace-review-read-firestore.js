#!/usr/bin/env node
/**
 * PORTAL-4C-4B-3 — Firestore Admin SDK pagination + index verification (isolated tenants).
 *
 *   node scripts/verify-portal-4c-4b-3-marketplace-review-read-firestore.js
 *
 * Requires Firebase Admin credentials. Does not use Central Motors or production pilot tenants.
 */
import assert from "node:assert/strict";
import "dotenv/config";

process.env.STORAGE_BACKEND = "firestore";
process.env.TENANT_SCOPE_ENFORCEMENT = process.env.TENANT_SCOPE_ENFORCEMENT || "strict";

const FORBIDDEN_TENANT_FRAGMENTS = ["central-motors", "central_motors", "centralmotors"];

const CATALOG_PACK_CANDIDATES = [
    "pack-security-ai",
    "pack-construction-ai",
    "pack-restaurant-ai",
    "pack-church-ai",
];

console.log("verify-portal-4c-4b-3-marketplace-review-read-firestore");

const { hasAdminCredentials, getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
assert.ok(hasAdminCredentials(), "Firebase Admin required — set credentials and re-run");

const { platformReviewPath, platformRatingPath } = await import("../services/database/schema.js");
const { marketplaceReviewDocId } = await import("../services/platform/marketplaceReviewModel.js");
const { getMarketplaceReviewRepository } = await import("../services/platform/marketplaceReviewRepository.js");
const {
    getPublicPackRating,
    listPublicPackReviews,
    encodeReviewPageCursor,
} = await import("../services/platform/marketplaceReviewReadService.js");

const repo = await getMarketplaceReviewRepository();
assert.equal(repo.constructor.name, "FirestoreMarketplaceReviewRepository");
console.log("✓ FirestoreMarketplaceReviewRepository active");

const runTag = `portal-4c4b3-fs-${Date.now()}`;
function tenantId(label) {
    const id = `${runTag}-${label}`;
    for (const frag of FORBIDDEN_TENANT_FRAGMENTS) {
        assert.ok(!id.toLowerCase().includes(frag), `forbidden tenant fragment: ${frag}`);
    }
    return id;
}

/** Pick a catalog pack with no published reviews so aggregate assertions stay isolated. */
let packId = null;
for (const candidate of CATALOG_PACK_CANDIDATES) {
    const rating = await getPublicPackRating(candidate);
    if (rating.count === 0) {
        packId = candidate;
        break;
    }
}
assert.ok(packId, `need a zero-review catalog pack among: ${CATALOG_PACK_CANDIDATES.join(", ")}`);
console.log(`✓ zero-review catalog pack selected: ${packId}`);

const publishedTenants = [tenantId("pub-a"), tenantId("pub-b"), tenantId("pub-c")];
const pendingTenant = tenantId("pending");
const rejectedTenant = tenantId("rejected");

const reviewIds = [
    ...publishedTenants.map((co) => marketplaceReviewDocId(co, packId)),
    marketplaceReviewDocId(pendingTenant, packId),
    marketplaceReviewDocId(rejectedTenant, packId),
];

const createdAtOrdered = [
    "2026-03-01T10:00:00.000Z",
    "2026-03-02T10:00:00.000Z",
    "2026-03-03T10:00:00.000Z",
];

const ratings = [3, 4, 5];
for (let i = 0; i < publishedTenants.length; i++) {
    await repo.createReview({
        companyId: publishedTenants[i],
        packId,
        authorUid: `uid-${i}`,
        authorDisplayName: `FS Verify ${String.fromCharCode(65 + i)}`,
        rating: ratings[i],
        title: `Published ${i}`,
        body: "Firestore pagination verify.",
        status: "published",
    });
}
await repo.createReview({
    companyId: pendingTenant,
    packId,
    authorUid: "uid-pending",
    authorDisplayName: "Pending Only",
    rating: 2,
    title: "Pending",
    body: "Must not appear in public list.",
    status: "pending",
});
await repo.createReview({
    companyId: rejectedTenant,
    packId,
    authorUid: "uid-rejected",
    authorDisplayName: "Rejected Only",
    rating: 1,
    title: "Rejected",
    body: "Must not appear in public list.",
    status: "rejected",
});

const db = getAdminFirestore();
for (let i = 0; i < publishedTenants.length; i++) {
    const rid = marketplaceReviewDocId(publishedTenants[i], packId);
    await db.doc(platformReviewPath(rid)).update({ createdAt: createdAtOrdered[i] });
}
console.log("✓ seeded published / pending / rejected reviews (deterministic createdAt on published)");

const page1 = await listPublicPackReviews(packId, { limit: 2 });
assert.equal(page1.reviews.length, 2);
assert.ok(page1.pagination.nextCursor, "expected cursor for page 2");
const idsPage1 = page1.reviews.map((r) => r.id);
assert.deepEqual(
    idsPage1,
    [
        marketplaceReviewDocId(publishedTenants[2], packId),
        marketplaceReviewDocId(publishedTenants[1], packId),
    ],
    "page 1 must be newest published first (createdAt DESC, tie-break id)"
);
for (const r of page1.reviews) {
    assert.equal(r.companyId, undefined);
    assert.equal(r.authorUid, undefined);
    assert.equal(r.status, undefined);
}
console.log("✓ first page ordering + public DTO privacy");

const page2 = await listPublicPackReviews(packId, {
    limit: 2,
    cursor: page1.pagination.nextCursor,
});
assert.equal(page2.reviews.length, 1);
assert.equal(page2.reviews[0].id, marketplaceReviewDocId(publishedTenants[0], packId));
assert.equal(page2.pagination.nextCursor, null);
const allIds = [...idsPage1, ...page2.reviews.map((r) => r.id)];
assert.equal(new Set(allIds).size, 3);
console.log("✓ second page via cursor, no duplicates");

const pendingListed = allIds.includes(marketplaceReviewDocId(pendingTenant, packId));
const rejectedListed = allIds.includes(marketplaceReviewDocId(rejectedTenant, packId));
assert.equal(pendingListed, false);
assert.equal(rejectedListed, false);
console.log("✓ pending/rejected excluded from Firestore query");

const directPage = await repo.listPublishedReviews(packId, { limit: 2 });
assert.equal(directPage.items.length, 2);
assert.ok(directPage.nextCursor);
const cursorPayload = encodeReviewPageCursor(directPage.nextCursor);
assert.ok(cursorPayload);
console.log("✓ repository listPublishedReviews (Admin SDK query) succeeded — index OK");

const rating = await getPublicPackRating(packId);
assert.equal(rating.count, 3);
assert.equal(rating.average, 4);
assert.equal(rating.packId, packId);
console.log("✓ aggregate read matches published set (3 reviews, avg 4.0)");

try {
    for (const rid of reviewIds) {
        await db.doc(platformReviewPath(rid)).delete().catch(() => {});
    }
    await db.doc(platformRatingPath(packId)).delete().catch(() => {});
} catch {
    /* best-effort */
}

const afterCleanup = await getPublicPackRating(packId);
assert.equal(afterCleanup.count, 0);
assert.equal(afterCleanup.average, 0);
console.log("✓ zero-review aggregate after isolated cleanup");

console.log("\nPORTAL-4C-4B-3 Firestore review read pagination verification passed");
