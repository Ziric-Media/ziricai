#!/usr/bin/env node
/**
 * PORTAL-4C-4C-2 — Installed-pack review submit (POST via api.js; catalog read-only).
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

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-portal-4c-4c-2-marketplace-review-submit");

const mp = read(MP);
const api = read(API);

assert.match(mp, /import[\s\S]*submitPackReview[\s\S]*from\s+['"]\.\.\/api\.js['"]/);
assert.doesNotMatch(mp, /\/api\/marketplace\/review/i);
assert.doesNotMatch(mp, /method:\s*['"]POST['"][\s\S]*\/api\/marketplace\/review/);
console.log("✓ submitPackReview imported from api.js; no duplicate POST helper in module");

const installedStart = mp.indexOf("function openInstalledDetailModal");
const detailStart = mp.indexOf("async function openDetailModal");
const wizardStart = mp.indexOf("function openWizardModal");
assert.ok(installedStart >= 0 && detailStart > installedStart && wizardStart > detailStart);
const installedBody = mp.slice(installedStart, detailStart);
const catalogDetailBody = mp.slice(detailStart, wizardStart);

assert.match(installedBody, /renderInstalledPackReviewFormBlock/);
assert.match(installedBody, /wireInstalledPackReviewForm/);
assert.match(mp, /mp-review-form/);
assert.doesNotMatch(catalogDetailBody, /mp-review-form/);
assert.doesNotMatch(catalogDetailBody, /mp-review-submit/);
assert.doesNotMatch(catalogDetailBody, /wireInstalledPackReviewForm/);
assert.match(catalogDetailBody, /renderCatalogReviewSubmitGuidance/);
console.log("✓ POST wired only from installed-detail flow; catalog detail read-only");

assert.match(mp, /requireCompanyId\(\)/);
assert.match(mp, /submitPackReview\(companyId,\s*packId/);
assert.match(mp, /mp-rating-input/);
assert.match(mp, /Rating[\s\S]*required|required[\s\S]*Rating/i);
assert.match(mp, /title[\s\S]*optional|optional[\s\S]*title/i);
assert.match(mp, /REVIEW_TITLE_MAX\s*=\s*200/);
assert.match(mp, /REVIEW_BODY_MAX\s*=\s*4000/);
assert.doesNotMatch(mp, /reviews\/mine/i);
const wireStart = mp.indexOf("function wireInstalledPackReviewForm");
const wireEnd = mp.indexOf("/** Catalog detail");
const wireBody = mp.slice(wireStart, wireEnd);
assert.doesNotMatch(wireBody, /\bauthor\b/i);
console.log("✓ rating required; title/body optional; no client author; no reviews/mine");

assert.match(mp, /let submitting\s*=\s*false|submitting\s*=\s*true/);
assert.match(mp, /if \(submitting\) return/);
assert.match(mp, /mp-review-submitting/);
assert.match(mp, /submitBtn\.disabled\s*=\s*true/);
console.log("✓ double-submit guard while in flight");

assert.match(mp, /DUPLICATE_REVIEW/);
assert.match(mp, /renderInstalledPackReviewDuplicateBlock/);
assert.match(mp, /already reviewed this pack/i);
console.log("✓ 409 DUPLICATE_REVIEW terminal already-reviewed state");

assert.match(mp, /res\.data\?\.review|res\.data\.review/);
assert.match(mp, /renderInstalledPackReviewSuccessBlock/);
assert.match(mp, /Review submitted/);
assert.match(mp, /renderPublicReviewCard/);
assert.match(mp, /mp-review-view-catalog/);
console.log("✓ 201 consumes res.data.review and shows read-only confirmation");

assert.match(mp, /REVIEW_NOT_ELIGIBLE/);
assert.match(mp, /renderInstalledPackReviewIneligibleBlock/);
assert.match(mp, /status === 403/);
console.log("✓ 403 REVIEW_NOT_ELIGIBLE surfaced without auto-retry");

assert.match(mp, /status === 400|status === 401|status === 503/);
assert.doesNotMatch(mp, /getDemoReviews/);
assert.doesNotMatch(mp, /PACK_DEMO_RATINGS/);
assert.doesNotMatch(mp, /Top rated/i);
console.log("✓ client error mapping; no demo fiction");

assert.match(api, /export async function submitPackReview/);
assert.match(read("css/admin-dashboard.css"), /\.mp-review-form/);
assert.match(read("css/admin-dashboard.css"), /\.mp-rating-input/);

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

console.log("\nPORTAL-4C-4C-2 marketplace review submit verification passed");
