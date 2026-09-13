#!/usr/bin/env node
/**
 * PORTAL-4C-4B-3 — Public review/rating GET + customer API de-demo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

process.env.STORAGE_BACKEND = "memory";
process.env.TENANT_SCOPE_ENFORCEMENT = process.env.TENANT_SCOPE_ENFORCEMENT || "strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = "pack-funeral-ai";
const OTHER = "pack-school-ai";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-portal-4c-4b-3-marketplace-review-read-api");

const appJs = read("api/app.js");
assert.match(appJs, /\/api\/marketplace\/packs\/:packId\/reviews/);
assert.match(appJs, /\/api\/marketplace\/packs\/:packId\/rating/);
assert.match(appJs, /Cache-Control.*no-store/);
assert.doesNotMatch(read("services/platform/marketplaceInstaller.js"), /getDemoReviews/);
assert.match(
    read("services/platform/marketplaceInstaller.js"),
    /export async function executeInstall[\s\S]*buildPackManifest\(getPackById\(resolved\), \{ useDemoSocialProof: false \}\)/
);
console.log("✓ public GET routes + customer install path uses honest manifest");

const {
    getPublicPackRating,
    listPublicPackReviews,
    MarketplacePackNotFoundError,
} = await import("../services/platform/marketplaceReviewReadService.js");
const { getCustomerMarketplaceCatalog } = await import("../services/platform/marketplaceRegistry.js");
const { getCustomerPackDetail, runInstallWizard } = await import("../services/platform/marketplaceInstaller.js");
const { getMarketplaceReviewRepository } = await import("../services/platform/marketplaceReviewRepository.js");
const { installIndustryPack } = await import("../services/platform/industryPackService.js");
const { submitMarketplacePackReview } = await import("../services/platform/marketplaceReviewService.js");

const companyId = `portal-4c4b3-${Date.now()}`;
await installIndustryPack(companyId, PACK, {}, { installedBy: "4c4b3" });
await installIndustryPack(companyId, OTHER, {}, { installedBy: "4c4b3" });

const ctx = {
    companyId,
    uid: "uid-4c4b3",
    isSuperAdmin: false,
    email: "t@example.com",
    profile: { companyId, fullName: "Read API Tester", role: "owner" },
};

await submitMarketplacePackReview(ctx, { packId: OTHER, rating: 4, title: "Good", body: "Published review." });
const repo = await getMarketplaceReviewRepository();
const pendingCo = `portal-4c4b3-pending-${Date.now()}`;
await repo.createReview({
    companyId: pendingCo,
    packId: PACK,
    authorUid: "u-p",
    authorDisplayName: "Pending User",
    rating: 3,
    title: "Pending",
    body: "Should not list",
    status: "pending",
});

try {
    await getPublicPackRating("pack-does-not-exist-xyz");
    assert.fail("expected 404");
} catch (err) {
    assert.ok(err instanceof MarketplacePackNotFoundError);
}
console.log("✓ unknown pack → 404");

const rating = await getPublicPackRating(OTHER);
assert.equal(rating.count, 1);
assert.equal(rating.average, 4);
console.log("✓ public rating aggregate");

const zero = await getPublicPackRating(PACK);
assert.equal(zero.count, 0);
assert.equal(zero.average, 0);
console.log("✓ zero-review honest aggregate");

const list = await listPublicPackReviews(OTHER, { limit: 10 });
assert.equal(list.reviews.length, 1);
assert.equal(list.reviews[0].authorDisplayName, "Read API Tester");
assert.equal(list.reviews[0].companyId, undefined);
assert.equal(list.reviews[0].authorUid, undefined);
assert.equal(list.reviews[0].status, undefined);
console.log("✓ published reviews only + public DTO privacy");

const packList = await listPublicPackReviews(PACK, { limit: 10 });
assert.equal(packList.reviews.length, 0);
console.log("✓ pending/rejected excluded from published list");

const page1 = await listPublicPackReviews(OTHER, { limit: 1 });
assert.equal(page1.reviews.length, 1);
if (page1.pagination.nextCursor) {
    const page2 = await listPublicPackReviews(OTHER, { limit: 1, cursor: page1.pagination.nextCursor });
    assert.equal(page2.reviews.length, 0);
}
console.log("✓ pagination cursor");

const catalog = await getCustomerMarketplaceCatalog({});
const funeral = catalog.packs.find((p) => p.id === PACK || p.canonicalId === PACK);
const school = catalog.packs.find((p) => p.id === OTHER || p.canonicalId === OTHER);
assert.equal(funeral.ratingCount, 0);
assert.equal(funeral.rating, 0);
assert.equal(school.ratingCount, 1);
assert.notEqual(school.rating, 4.8);
assert.ok(school.rating !== 4.5 || school.ratingCount !== 12, "must not use default demo fallback");
console.log("✓ catalog uses real aggregates (no 4.5/12 fallback)");

const detail = await getCustomerPackDetail(PACK);
assert.equal(detail.pack.ratingCount, 0);
assert.equal(detail.reviews, undefined);
assert.ok(!("reviews" in detail));
console.log("✓ pack detail no demo reviews");

const preview = await runInstallWizard(companyId, PACK, { step: "preview" });
assert.equal(preview.reviews, undefined);
assert.equal(preview.pack.ratingCount, 0);
console.log("✓ install preview no demo social proof");

assert.match(read("admin/js/admin/modules/marketplace.js"), /getAdminDemoRatingDisplay/);
assert.match(read("admin/js/shared/marketplaceAdminDemoPresentation.js"), /admin_demo_presentation/);
console.log("✓ Admin demo presentation isolated from customer API");

const portalMp = read("js/portal/modules/marketplace.js");
assert.match(portalMp, /No customer reviews yet/);
assert.match(portalMp, /fetchPackReviews/);
assert.doesNotMatch(portalMp, /getDemoReviews/);
assert.doesNotMatch(portalMp, /PACK_DEMO_RATINGS/);
console.log("✓ Portal read path uses public API (no demo fiction)");

const regressionEnv = { ...process.env, STORAGE_BACKEND: "memory" };
const runRegression = (script) => {
    execSync(`node scripts/${script}`, { cwd: ROOT, stdio: "inherit", env: regressionEnv });
};
runRegression("verify-portal-4c-4b-2-marketplace-review-post.js");
runRegression("verify-portal-4c-4b-1-marketplace-review-foundation.js");
runRegression("verify-portal-4c-4a-marketplace-review-honesty.js");
runRegression("verify-portal-4a-marketplace-auth.js");
runRegression("verify-portal-4a-r1-marketplace-security.js");
runRegression("verify-portal-4b-marketplace-registry.js");
runRegression("verify-portal-4c-1-marketplace-update.js");
runRegression("verify-portal-4c-2-marketplace-lifecycle.js");
runRegression("verify-portal-4c-3-marketplace-payment-ux.js");
console.log("✓ regressions through 4C-4B-2 / 4C-4A / 4A / 4B / 4C-* passed");

console.log("\nPORTAL-4C-4B-3 marketplace review read API verification passed");
