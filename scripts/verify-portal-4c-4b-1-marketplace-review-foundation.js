#!/usr/bin/env node
/**
 * PORTAL-4C-4B-1 — Durable Marketplace review foundation (repository layer only).
 *
 *   node scripts/verify-portal-4c-4b-1-marketplace-review-foundation.js
 *   node scripts/verify-portal-4c-4b-1-marketplace-review-foundation.js --firestore
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const useFirestore = process.argv.includes("--firestore");
if (!useFirestore) {
    process.env.STORAGE_BACKEND = "memory";
}
process.env.TENANT_SCOPE_ENFORCEMENT = process.env.TENANT_SCOPE_ENFORCEMENT || "strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = useFirestore ? `portal-4c4b1-isolated-${Date.now()}` : "pack-funeral-ai";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

function assertNoUndefinedDeep(value, label = "value") {
    if (value === undefined) assert.fail(`${label} must not be undefined`);
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
        value.forEach((item, i) => assertNoUndefinedDeep(item, `${label}[${i}]`));
        return;
    }
    for (const [key, v] of Object.entries(value)) {
        assertNoUndefinedDeep(v, `${label}.${key}`);
    }
}

console.log("verify-portal-4c-4b-1-marketplace-review-foundation");
console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND || "(firestore via --firestore)"}`);

const {
    platformReviewPath,
    platformRatingPath,
    platformMarketplaceReviewsCollectionPath,
} = await import("../services/database/schema.js");

assert.equal(platformMarketplaceReviewsCollectionPath(), "platform/marketplace/reviews");
const reviewId = "abc123";
const packId = PACK;
assert.equal(platformReviewPath(reviewId), "platform/marketplace/reviews/abc123");
assert.equal(platformRatingPath(packId), `platform/marketplace/ratings/${packId}`);
console.log("✓ canonical review and rating paths");

const {
    marketplaceReviewDocId,
    buildMarketplaceReviewRecord,
    toPublicMarketplaceReview,
} = await import("../services/platform/marketplaceReviewModel.js");
const { DUPLICATE_REVIEW } = await import("../services/platform/marketplaceReviewErrors.js");
const { getMarketplaceReviewRepository } = await import(
    "../services/platform/marketplaceReviewRepository.js"
);

const companyA = `portal-4c4b1-a-${Date.now()}`;
const companyB = `portal-4c4b1-b-${Date.now()}`;

const idA = marketplaceReviewDocId(companyA, PACK);
const idB = marketplaceReviewDocId(companyB, PACK);
assert.equal(idA, marketplaceReviewDocId(companyA, PACK));
assert.notEqual(idA, idB);
console.log("✓ deterministic company+pack review identity");

const repo = await getMarketplaceReviewRepository();
assert.equal(repo.constructor.name, useFirestore ? "FirestoreMarketplaceReviewRepository" : "MemoryMarketplaceReviewRepository");

const baseInput = {
    companyId: companyA,
    packId: PACK,
    authorUid: "uid-test-4c4b1",
    authorDisplayName: "Alex Tenant",
    rating: 5,
    title: "Solid pack",
    body: "Works well for our use case.",
};

const created = await repo.createReview(baseInput);
assert.equal(created.outcome, "created");
assert.equal(created.review.id, idA);
assert.equal(created.review.status, "published");
assertNoUndefinedDeep(created.review, "review");
console.log("✓ memory/firestore repository create");

const fetched = await repo.getReview(idA);
assert.equal(fetched.companyId, companyA);
assert.equal(fetched.authorUid, "uid-test-4c4b1");
console.log("✓ repository get");

const byTenant = await repo.getReviewByTenantPack(companyA, PACK);
assert.equal(byTenant.id, idA);
console.log("✓ get tenant+pack review");

const agg = await repo.getPackRatingAggregate(PACK);
assert.equal(agg.count, 1);
assert.equal(agg.average, 5);
console.log("✓ aggregate after published create");

const pub = toPublicMarketplaceReview(fetched);
assert.equal(pub.authorDisplayName, "Alex Tenant");
assert.equal(pub.companyId, undefined);
assert.equal(pub.authorUid, undefined);
assert.equal(pub.status, undefined);
console.log("✓ private fields retained internally; public DTO helper sanitized");

const listed = await repo.listPublishedReviews(PACK, { limit: 10 });
assert.ok(listed.items.some((r) => r.id === idA));
console.log("✓ list published reviews");

try {
    await repo.createReview({ ...baseInput, title: "Duplicate attempt" });
    assert.fail("expected duplicate review rejection");
} catch (err) {
    assert.equal(err.code, DUPLICATE_REVIEW);
}
console.log("✓ duplicate review rejected");

const concurrentCompany = `portal-4c4b1-concurrent-${Date.now()}`;
const concurrentInput = {
    companyId: concurrentCompany,
    packId: PACK,
    authorUid: "uid-concurrent",
    authorDisplayName: "Concurrent Tester",
    rating: 4,
    title: "Race",
    body: "Concurrent create test.",
};

const outcomes = await Promise.allSettled(
    Array.from({ length: 12 }, () => repo.createReview({ ...concurrentInput }))
);
const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
const rejected = outcomes.filter((o) => o.status === "rejected");
assert.equal(fulfilled.length, 1, "exactly one concurrent create should succeed");
assert.equal(rejected.length, 11);
for (const r of rejected) {
    assert.equal(r.reason?.code, DUPLICATE_REVIEW);
}
console.log("✓ concurrent duplicate protection");

const pendingCo = `portal-4c4b1-pending-${Date.now()}`;
const pending = await repo.createReview({
    companyId: pendingCo,
    packId: PACK,
    authorUid: "uid-pending",
    authorDisplayName: "Pending User",
    rating: 3,
    title: "Pending only",
    body: "Should not affect aggregate.",
    status: "pending",
});
assert.equal(pending.review.status, "pending");
const aggAfterPending = await repo.getPackRatingAggregate(PACK);
assert.equal(aggAfterPending.count, 2, "pending review must not increase published aggregate count");
const publishedOnly = await repo.listPublishedReviews(PACK, { limit: 50 });
assert.ok(!publishedOnly.items.some((r) => r.id === pending.review.id));
await repo.setReviewStatus(pending.review.id, "published");
const aggAfterPublish = await repo.getPackRatingAggregate(PACK);
assert.equal(aggAfterPublish.count, 3);
await repo.setReviewStatus(pending.review.id, "rejected");
const aggAfterReject = await repo.getPackRatingAggregate(PACK);
assert.equal(aggAfterReject.count, 2);
console.log("✓ pending/published/rejected model; only published reviews aggregate");

const fsRepoSrc = read("services/platform/firestoreMarketplaceReviewRepository.js");
assert.match(fsRepoSrc, /platformReviewPath/);
assert.match(fsRepoSrc, /platformRatingPath/);
assert.match(fsRepoSrc, /platformMarketplaceReviewsCollectionPath/);
assert.match(fsRepoSrc, /runTransaction/);
assert.match(fsRepoSrc, /tx\.create\(reviewRef/);
assert.doesNotMatch(fsRepoSrc, /marketplaceInstalls/);
console.log("✓ Firestore repository structure (Admin SDK transaction + canonical paths)");

const installRepoSrc = read("services/platform/marketplaceInstallRepository.js");
const reviewRepoSrc = read("services/platform/marketplaceReviewRepository.js");
assert.doesNotMatch(reviewRepoSrc, /getMarketplaceInstallRepository/);
assert.doesNotMatch(installRepoSrc, /MarketplaceReview/);
console.log("✓ repository separation from Marketplace install resources");

const appSrc = read("api/app.js");
const installerSrc = read("services/platform/marketplaceInstaller.js");
assert.match(appSrc, /app\.post\("\/api\/marketplace\/review"/);
assert.doesNotMatch(installerSrc, /getMarketplaceReviewRepository/);
assert.doesNotMatch(installerSrc, /saveMarketplaceReview/);
if (/submitMarketplacePackReview/.test(appSrc)) {
    console.log("✓ POST route uses review service (4C-4B-2+)");
} else {
    assert.doesNotMatch(installerSrc, /submitReview/);
    console.log("✓ POST route present; installer not wired to review repository (4C-4B-1 boundary)");
}

assert.match(read("services/platform/marketplaceTemplate.js"), /PACK_DEMO_RATINGS/);
assert.match(read("services/platform/marketplaceTemplate.js"), /getDemoReviews/);
console.log("✓ demo catalog helpers untouched");

if (useFirestore) {
    const { hasAdminCredentials, getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
    assert.ok(hasAdminCredentials(), "Firebase Admin required for --firestore verification");
    const { FirestoreMarketplaceReviewRepository } = await import(
        "../services/platform/firestoreMarketplaceReviewRepository.js"
    );
    const paths = FirestoreMarketplaceReviewRepository.pathHelpers();
    assert.equal(paths.reviewsCollection, "platform/marketplace/reviews");
    assert.match(paths.reviewDoc(idA), /^platform\/marketplace\/reviews\//);
    assert.equal(paths.ratingDoc(PACK), platformRatingPath(PACK));

    const db = getAdminFirestore();
    const reviewSnap = await db.doc(platformReviewPath(idA)).get();
    assert.ok(reviewSnap.exists, "review doc must exist at canonical path");
    assertNoUndefinedDeep(reviewSnap.data(), "firestore.review");
    const ratingSnap = await db.doc(platformRatingPath(PACK)).get();
    assert.ok(ratingSnap.exists, "rating aggregate doc must exist");
    assertNoUndefinedDeep(ratingSnap.data(), "firestore.rating");

    const reviewIdsToDelete = [
        idA,
        idB,
        marketplaceReviewDocId(concurrentCompany, PACK),
        pending.review.id,
    ];
    try {
        for (const rid of reviewIdsToDelete) {
            await db.doc(platformReviewPath(rid)).delete().catch(() => {});
        }
        await db.doc(platformRatingPath(PACK)).delete().catch(() => {});
    } catch {
        /* best-effort cleanup of isolated verify pack */
    }
    console.log("✓ Firestore Admin SDK create/read at canonical paths (isolated pack cleaned up)");
}

if (process.env.PORTAL_ACCEPTANCE_LEAF === "1") {
    console.log("✓ nested regressions skipped (PORTAL_ACCEPTANCE_LEAF)");
} else {
const regressionEnv = { ...process.env, STORAGE_BACKEND: "memory" };
const runRegression = (script) => {
    execSync(`node scripts/${script}`, { cwd: ROOT, stdio: "inherit", env: regressionEnv });
};
runRegression("verify-portal-4a-marketplace-auth.js");
runRegression("verify-portal-4a-r1-marketplace-security.js");
runRegression("verify-portal-4b-marketplace-registry.js");
runRegression("verify-portal-4c-1-marketplace-update.js");
runRegression("verify-portal-4c-2-marketplace-lifecycle.js");
runRegression("verify-portal-4c-3-marketplace-payment-ux.js");
runRegression("verify-portal-4c-4a-marketplace-review-honesty.js");
console.log("✓ 4A / 4A-R1 / 4B / 4C-1 / 4C-2 / 4C-3 / 4C-4A regressions passed");
}

console.log("\nPORTAL-4C-4B-1 marketplace review foundation verification passed");
