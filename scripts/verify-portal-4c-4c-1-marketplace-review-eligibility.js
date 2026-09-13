#!/usr/bin/env node
/**
 * PORTAL-4C-4C-1 — Review contract + eligibility UX (no POST wiring).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

process.env.STORAGE_BACKEND = "memory";
process.env.PORTAL_ACCEPTANCE_LEAF = process.env.PORTAL_ACCEPTANCE_LEAF || "1";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MP = "js/portal/modules/marketplace.js";
const API = "js/portal/api.js";
const REG = "services/api/routeRegistry.js";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-portal-4c-4c-1-marketplace-review-eligibility");

const mp = read(MP);
const api = read(API);
const reg = read(REG);

assert.match(mp, /renderInstalledPackReviewEligibilityBlock/);
assert.match(mp, /renderCatalogReviewSubmitGuidance/);
assert.match(mp, /mp-review-eligibility/);
assert.match(mp, /Your review/);
assert.match(mp, /One review per workspace per pack/);
assert.match(mp, /Rating is required\. Title and review text are optional/);
assert.match(mp, /Reviews publish immediately and contribute to the marketplace rating/);
assert.match(mp, /mp-review-write-disabled/);
assert.match(mp, /Write a review/);
assert.match(mp, /disabled[\s\S]*mp-review-write-disabled|mp-review-write-disabled[\s\S]*disabled/);
assert.match(mp, /Install this pack in your workspace to submit a review/);
assert.match(mp, /Installed packs → Details/);
assert.match(mp, /openInstalledDetailModal/);
assert.match(mp, /renderInstalledPackReviewEligibilityBlock\(\)/);

assert.doesNotMatch(mp, /submitPackReview/);
assert.doesNotMatch(mp, /import[\s\S]*submitPackReview/);
assert.doesNotMatch(mp, /\/api\/marketplace\/review/i);
assert.doesNotMatch(mp, /method:\s*['"]POST['"]/);
assert.doesNotMatch(mp, /type=["']radio["']|star-input|mp-rating-input/i);
console.log("✓ installed-only disabled affordance; no POST wiring in Portal module");

assert.match(api, /submitPackReview/);
assert.match(api, /\/api\/marketplace\/review/);
console.log("✓ API stub submitPackReview exists but module does not import it");

assert.match(reg, /POST.*\/api\/marketplace\/review/);
assert.match(reg, /tenantScoped:\s*true/);
console.log("✓ route registry documents POST review");

assert.match(read("css/admin-dashboard.css"), /\.mp-review-eligibility/);
assert.match(read("css/admin-dashboard.css"), /\.mp-review-write-disabled/);
console.log("✓ eligibility CSS present");

const runRegression = (script) => {
    execSync(`node scripts/${script}`, { cwd: ROOT, stdio: "inherit", env: { ...process.env, STORAGE_BACKEND: "memory" } });
};

runRegression("verify-portal-4c-4b-4-portal-marketplace-review-read.js");
runRegression("verify-portal-4c-4a-marketplace-review-honesty.js");
runRegression("verify-portal-4c-4b-3-marketplace-review-read-api.js");
runRegression("verify-portal-4c-4b-2-marketplace-review-post.js");
runRegression("verify-portal-4a-marketplace-auth.js");
runRegression("verify-portal-4a-r1-marketplace-security.js");
runRegression("verify-portal-4b-marketplace-registry.js");
runRegression("verify-portal-4c-1-marketplace-update.js");
runRegression("verify-portal-4c-2-marketplace-lifecycle.js");
runRegression("verify-portal-4c-3-marketplace-payment-ux.js");
console.log("✓ nested regressions 4A→4C-4B-4 passed");

console.log("\nPORTAL-4C-4C-1 marketplace review eligibility verification passed");
