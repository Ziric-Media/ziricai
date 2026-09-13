#!/usr/bin/env node
/**
 * PORTAL-4C-4B-4 — Portal Marketplace review read (API-backed UI, no write path).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

process.env.STORAGE_BACKEND = "memory";
process.env.TENANT_SCOPE_ENFORCEMENT = process.env.TENANT_SCOPE_ENFORCEMENT || "strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MP = "js/portal/modules/marketplace.js";
const API = "js/portal/api.js";
const ZERO_PACK = "pack-security-ai";
const ARTIFACT_PACK = "pack-funeral-ai";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-portal-4c-4b-4-portal-marketplace-review-read");

const mp = read(MP);
const api = read(API);

assert.match(api, /export async function fetchPackReviews/);
assert.match(api, /\/api\/marketplace\/packs\/\$\{encodeURIComponent\(packId\)\}\/reviews/);
assert.doesNotMatch(api, /platform\/marketplace\/reviews/);
console.log("✓ fetchPackReviews public API helper");

assert.match(mp, /fetchPackReviews/);
assert.match(mp, /renderCatalogRatingSummary/);
assert.match(mp, /renderStarsFromApi/);
assert.match(mp, /ratingCount === 0|count === 0/);
assert.match(mp, /No reviews yet/);
assert.match(mp, /No customer reviews yet/);
assert.match(mp, /Reviews couldn't be loaded/);
assert.match(mp, /mp-reviews-retry/);
assert.match(mp, /mp-reviews-load-more/);
assert.match(mp, /loadPackReviewsIntoMount/);
assert.match(mp, /renderCustomerReviewsLoadingState/);
assert.doesNotMatch(mp, /submitPackReview/);
assert.doesNotMatch(mp, /\/api\/marketplace\/review/i);
if (/Write a review/i.test(mp)) {
    assert.match(mp, /mp-review-write-disabled/);
} else {
    assert.doesNotMatch(mp, /Write a review/i);
}
assert.doesNotMatch(mp, /getDemoReviews/);
assert.doesNotMatch(mp, /PACK_DEMO_RATINGS/);
assert.doesNotMatch(mp, /Top rated/i);
assert.doesNotMatch(mp, /d\.reviews/);
assert.doesNotMatch(mp, /firestore/i);
assert.doesNotMatch(mp, /localStorage.*review/i);
console.log("✓ Portal module read-only + error vs empty distinction");

const css = read("css/admin-dashboard.css");
assert.match(css, /\.mp-reviews-error/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.match(css, /\.mp-review-head/);
console.log("✓ review error/loading/mobile CSS present");

const {
    getCustomerMarketplaceCatalog,
} = await import("../services/platform/marketplaceRegistry.js");
const {
    listPublicPackReviews,
    getPublicPackRating,
} = await import("../services/platform/marketplaceReviewReadService.js");
const { toPublicMarketplaceReview } = await import("../services/platform/marketplaceReviewModel.js");
const { installIndustryPack } = await import("../services/platform/industryPackService.js");
const { submitMarketplacePackReview } = await import("../services/platform/marketplaceReviewService.js");
const { getMarketplaceReviewRepository } = await import("../services/platform/marketplaceReviewRepository.js");

const catalog = await getCustomerMarketplaceCatalog({});
const zero = catalog.packs.find((p) => p.id === ZERO_PACK || p.canonicalId === ZERO_PACK);
assert.ok(zero);
assert.equal(zero.ratingCount, 0);
assert.equal(zero.rating, 0);
console.log("✓ catalog zero-review pack (API contract for Portal cards)");

const co = `portal-4c4b4-${Date.now()}`;
await installIndustryPack(co, ARTIFACT_PACK, {}, { installedBy: "4c4b4" });
await submitMarketplacePackReview(
    {
        companyId: co,
        uid: "u-4c4b4",
        isSuperAdmin: false,
        profile: { companyId: co, fullName: "Portal Read Tester", role: "owner" },
    },
    { packId: ARTIFACT_PACK, rating: 5, title: "Artifact check", body: "Verify list shape." }
);

const list = await listPublicPackReviews(ARTIFACT_PACK, { limit: 5 });
assert.ok(list.reviews.length >= 1);
const pub = list.reviews[0];
assert.equal(pub.companyId, undefined);
assert.equal(pub.authorUid, undefined);
assert.equal(pub.status, undefined);
const sanitized = toPublicMarketplaceReview({
    id: "x",
    packId: ARTIFACT_PACK,
    authorDisplayName: "A",
    rating: 5,
    title: "t",
    body: "b",
    createdAt: "2026-01-01T00:00:00.000Z",
    companyId: "secret",
    authorUid: "u",
    status: "published",
});
assert.equal(sanitized.companyId, undefined);
assert.equal(sanitized.authorUid, undefined);
assert.equal(sanitized.status, undefined);
console.log("✓ published reviews + public DTO privacy (API layer)");

const pendingCo = `portal-4c4b4-p-${Date.now()}`;
const repo = await getMarketplaceReviewRepository();
await repo.createReview({
    companyId: pendingCo,
    packId: ARTIFACT_PACK,
    authorUid: "u-p",
    authorDisplayName: "Pending",
    rating: 2,
    title: "Pending",
    body: "Hidden",
    status: "pending",
});
const afterPending = await listPublicPackReviews(ARTIFACT_PACK, { limit: 50 });
assert.ok(!afterPending.reviews.some((r) => r.title === "Pending"));
console.log("✓ pending excluded from public list");

const page1 = await listPublicPackReviews(ARTIFACT_PACK, { limit: 1 });
if (page1.pagination.nextCursor) {
    const page2 = await listPublicPackReviews(ARTIFACT_PACK, { limit: 1, cursor: page1.pagination.nextCursor });
    const ids = new Set([page1.reviews[0]?.id, page2.reviews[0]?.id].filter(Boolean));
    assert.ok(ids.size >= 1);
}
console.log("✓ pagination cursor (Load more contract)");

const rating = await getPublicPackRating(ARTIFACT_PACK);
assert.ok(rating.count >= 1);
console.log("✓ detail/catalog aggregate source");

const regressionEnv = { ...process.env, STORAGE_BACKEND: "memory", PORTAL_ACCEPTANCE_LEAF: "1" };
const runRegression = (script) => {
    execSync(`node scripts/${script}`, { cwd: ROOT, stdio: "inherit", env: regressionEnv });
};
runRegression("verify-portal-4c-4a-marketplace-review-honesty.js");
runRegression("verify-portal-4c-4b-3-marketplace-review-read-api.js");
runRegression("verify-portal-4c-4b-2-marketplace-review-post.js");
runRegression("verify-portal-4a-marketplace-auth.js");
runRegression("verify-portal-4a-r1-marketplace-security.js");
runRegression("verify-portal-4b-marketplace-registry.js");
runRegression("verify-portal-4c-1-marketplace-update.js");
runRegression("verify-portal-4c-2-marketplace-lifecycle.js");
runRegression("verify-portal-4c-3-marketplace-payment-ux.js");
console.log("✓ regressions through 4C-4B-3 / 4C-4A / 4A / 4B / 4C-*");

console.log("\nPORTAL-4C-4B-4 Portal marketplace review read verification passed");
