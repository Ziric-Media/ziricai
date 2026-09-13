#!/usr/bin/env node
/**
 * PORTAL-4C-4A — Portal Marketplace review honesty (no fictional demo social proof).
 * Updated 4C-4B-4: real API-backed ratings allowed; demo sources still forbidden.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

if (!process.argv.includes("--firestore")) {
    process.env.STORAGE_BACKEND = "memory";
}
process.env.TENANT_SCOPE_ENFORCEMENT = process.env.TENANT_SCOPE_ENFORCEMENT || "strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL_MP = "js/portal/modules/marketplace.js";
const PORTAL_API = "js/portal/api.js";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-portal-4c-4a-marketplace-review-honesty");
console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}`);

const mp = read(PORTAL_MP);
const api = read(PORTAL_API);

assert.match(mp, /renderCustomerReviewsEmptyState/);
assert.match(mp, /No customer reviews yet/);
assert.match(mp, /Customer reviews/);
assert.match(mp, /Reviews couldn't be loaded/);
assert.match(mp, /fetchPackReviews/);
assert.match(mp, /renderCatalogRatingSummary/);
assert.match(mp, /renderStarsFromApi/);
assert.match(mp, /pack\.ratingCount|ratingCount\)/);
assert.doesNotMatch(mp, /Top rated/i);
assert.doesNotMatch(mp, /d\.reviews/);
assert.doesNotMatch(mp, /getDemoReviews/);
assert.doesNotMatch(mp, /PACK_DEMO_RATINGS/);
assert.doesNotMatch(mp, /submitPackReview/);
if (/Write a review/i.test(mp)) {
    assert.match(mp, /mp-review-write-disabled/);
    assert.match(mp, /mp-review-write-disabled[\s\S]*disabled|disabled[\s\S]*mp-review-write-disabled/);
} else {
    assert.doesNotMatch(mp, /Write a review/i);
}
assert.doesNotMatch(mp, /\/api\/marketplace\/review/i);
console.log("✓ Portal uses API-backed ratings; demo fiction forbidden");

assert.match(api, /fetchPackReviews/);
assert.match(api, /submitPackReview/);
assert.doesNotMatch(mp, /import[\s\S]*submitPackReview/);
console.log("✓ submitPackReview remains unused by Portal module (API stub only)");

assert.match(read("services/platform/marketplaceTemplate.js"), /PACK_DEMO_RATINGS/);
assert.match(read("services/platform/marketplaceTemplate.js"), /getDemoReviews/);
console.log("✓ backend demo helpers unchanged (Admin/internal only)");

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
console.log("✓ 4A / 4A-R1 / 4B / 4C-1 / 4C-2 / 4C-3 regressions passed");
}

console.log("\nPORTAL-4C-4A marketplace review honesty verification passed");
