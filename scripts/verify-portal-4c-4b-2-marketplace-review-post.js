#!/usr/bin/env node
/**
 * PORTAL-4C-4B-2 — POST /api/marketplace/review (eligibility + durable repository).
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

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

function tenantCtx(companyId, { uid = "uid-member", name = "Jordan Reviewer", email = "jordan@tenant.test" } = {}) {
    return {
        companyId,
        uid,
        isSuperAdmin: false,
        email,
        profile: { companyId, fullName: name, email, role: "owner" },
    };
}

console.log("verify-portal-4c-4b-2-marketplace-review-post");

const appJs = read("api/app.js");
assert.match(appJs, /submitMarketplacePackReview/);
assert.match(appJs, /CLIENT_AUTHOR_FORBIDDEN/);
assert.doesNotMatch(appJs, /submitReview/);
assert.doesNotMatch(read("services/platform/marketplaceInstaller.js"), /saveMarketplaceReview/);
console.log("✓ POST route wired to review service; legacy installer hooks removed");

const {
    submitMarketplacePackReview,
    mapMarketplaceReviewSubmitHttpStatus,
} = await import("../services/platform/marketplaceReviewService.js");
const { DUPLICATE_REVIEW, REVIEW_NOT_ELIGIBLE, REVIEW_PERSISTENCE_FAILED } = await import(
    "../services/platform/marketplaceReviewErrors.js"
);
const { claimInstall, failInstall } = await import("../services/platform/marketplaceInstallService.js");
const { installIndustryPack } = await import("../services/platform/industryPackService.js");
const { getMarketplaceReviewRepository } = await import(
    "../services/platform/marketplaceReviewRepository.js"
);
const { assertAuthenticatedTenantMemberAccess } = await import("../services/core/tenantContext.js");

const companyId = `portal-4c4b2-${Date.now()}`;
const otherCompany = `portal-4c4b2-other-${Date.now()}`;

await installIndustryPack(companyId, PACK, {}, { installedBy: "4c4b2-verify" });
const ctx = tenantCtx(companyId);

const ok = await submitMarketplacePackReview(ctx, {
    packId: PACK,
    rating: 5,
    title: "Great pack",
    body: "Installed and working.",
});
assert.equal(ok.success, true);
assert.equal(ok.publicReview.authorDisplayName, "Jordan Reviewer");
assert.equal(ok.publicReview.companyId, undefined);
assert.equal(ok.publicReview.authorUid, undefined);

const repo = await getMarketplaceReviewRepository();
const stored = await repo.getReviewByTenantPack(companyId, PACK);
assert.ok(stored);
assert.equal(stored.authorUid, "uid-member");
assert.equal(stored.status, "published");
const agg = await repo.getPackRatingAggregate(PACK);
assert.equal(agg.count, 1);
assert.equal(agg.average, 5);
console.log("✓ installed tenant → durable review + aggregate");

try {
    await submitMarketplacePackReview(tenantCtx(`portal-4c4b2-noinstall-${Date.now()}`), {
        packId: PACK,
        rating: 4,
        title: "x",
        body: "y",
    });
    assert.fail("expected uninstalled 403");
} catch (err) {
    assert.equal(err.code, REVIEW_NOT_ELIGIBLE);
    assert.equal(mapMarketplaceReviewSubmitHttpStatus(err).status, 403);
}
console.log("✓ uninstalled tenant → 403");

const installingCo = `portal-4c4b2-installing-${Date.now()}`;
const claim = await claimInstall(installingCo, PACK, { installedBy: "4c4b2" });
assert.equal(claim.outcome, "claimed");
try {
    await submitMarketplacePackReview(tenantCtx(installingCo), { packId: PACK, rating: 4, title: "a", body: "b" });
    assert.fail("expected installing 403");
} catch (err) {
    assert.equal(err.code, REVIEW_NOT_ELIGIBLE);
}
console.log("✓ installing tenant → 403");

const installRepo = await import("../services/platform/marketplaceInstallRepository.js").then((m) =>
    m.getMarketplaceInstallRepository()
);
const staleKey = `${installingCo}::${PACK}`;
const staleRec = installRepo.docs.get(staleKey);
staleRec.updatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
installRepo.docs.set(staleKey, staleRec);
try {
    await submitMarketplacePackReview(tenantCtx(installingCo), { packId: PACK, rating: 3, title: "s", body: "s" });
    assert.fail("expected stale installing 403");
} catch (err) {
    assert.equal(err.code, REVIEW_NOT_ELIGIBLE);
}
console.log("✓ stale installing tenant → 403");

const failedCo = `portal-4c4b2-failed-${Date.now()}`;
const failedClaim = await claimInstall(failedCo, PACK, { installedBy: "4c4b2" });
await failInstall(failedCo, PACK, failedClaim.installAttemptId, "verify failure");
try {
    await submitMarketplacePackReview(tenantCtx(failedCo), { packId: PACK, rating: 2, title: "f", body: "f" });
    assert.fail("expected failed 403");
} catch (err) {
    assert.equal(err.code, REVIEW_NOT_ELIGIBLE);
}
console.log("✓ failed tenant → 403");

try {
    await submitMarketplacePackReview(
        { companyId, uid: null, isSuperAdmin: false, profile: ctx.profile },
        { packId: PACK, rating: 5, title: "x", body: "y" }
    );
    assert.fail("expected unauthenticated 401");
} catch (err) {
    assert.equal(err.status, 401);
}
console.log("✓ unauthenticated service caller → 401");

const membership = async (uid, tenantId) =>
    uid === "member-rtb" && tenantId === companyId ? { uid, companyId: tenantId, role: "owner" } : null;
await assert.rejects(
    () =>
        assertAuthenticatedTenantMemberAccess(
            {
                companyId: otherCompany,
                uid: "member-rtb",
                isSuperAdmin: false,
                profile: { companyId, role: "owner" },
            },
            { getTenantMembership: membership, auditSurface: "review_test" }
        ),
    (err) => err.status === 403
);
console.log("✓ wrong tenant membership → 403");

try {
    await submitMarketplacePackReview(ctx, { packId: PACK, rating: 5, title: "dup", body: "dup" });
    assert.fail("expected duplicate 409");
} catch (err) {
    assert.equal(err.code, DUPLICATE_REVIEW);
    assert.equal(mapMarketplaceReviewSubmitHttpStatus(err).status, 409);
}
console.log("✓ duplicate review → 409");

const concurrentCo = `portal-4c4b2-concurrent-${Date.now()}`;
await installIndustryPack(concurrentCo, PACK, {}, { installedBy: "4c4b2" });
const concurrentCtx = tenantCtx(concurrentCo, { uid: "uid-concurrent", name: "Concurrent User" });
const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
        submitMarketplacePackReview(concurrentCtx, {
            packId: PACK,
            rating: 4,
            title: "race",
            body: "race",
        })
    )
);
assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
assert.equal(
    results.filter((r) => r.status === "rejected" && r.reason?.code === DUPLICATE_REVIEW).length,
    9
);
console.log("✓ concurrent duplicate → exactly one succeeds");

try {
    await submitMarketplacePackReview(ctx, { packId: PACK, rating: 5, title: "x", body: "y" }, {
        getReviewRepository: async () => ({
            createReview: async () => {
                throw new Error("simulated firestore outage");
            },
        }),
    });
    assert.fail("expected persistence failure");
} catch (err) {
    assert.equal(err.code, REVIEW_PERSISTENCE_FAILED);
    assert.equal(mapMarketplaceReviewSubmitHttpStatus(err).status, 503);
}
console.log("✓ Firestore write failure → no success path (503 mapping)");

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
runRegression("verify-portal-4c-4b-1-marketplace-review-foundation.js");
console.log("✓ 4A / 4A-R1 / 4B / 4C-1 / 4C-2 / 4C-3 / 4C-4A / 4C-4B-1 regressions passed");
}

console.log("\nPORTAL-4C-4B-2 marketplace review POST verification passed");
