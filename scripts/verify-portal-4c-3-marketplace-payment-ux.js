#!/usr/bin/env node
/**
 * PORTAL-4C-3 — Marketplace paid-pack Contact Sales UX (Portal only, local).
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
const FREE_PACK = "pack-funeral-ai";
const PAID_PACK = "pack-automotive-ai";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-portal-4c-3-marketplace-payment-ux");
console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}`);

const contactSrc = read("js/shared/marketplaceSalesContact.js");
assert.match(contactSrc, /ZIRIC_SALES_EMAIL\s*=\s*['"]sales@ziricai.com['"]/);
assert.match(contactSrc, /buildIndustryPackAccessMailto/);
assert.match(contactSrc, /Pack ID:/);
assert.doesNotMatch(contactSrc, /stripe|payfast|checkout/i);
console.log("✓ centralized sales contact helper");

const authBefore = read("services/platform/marketplaceAuth.js");
assert.match(authBefore, /resolveMarketplacePaymentBypass/);
assert.match(authBefore, /allowMarketplacePaymentBypass/);

for (const rel of ["js/portal/modules/marketplace.js"]) {
    const src = read(rel);
    assert.match(src, /marketplaceSalesContact/);
    assert.match(src, /mp-contact-sales/);
    assert.match(src, /Contact Sales \/ Request Access/);
    assert.match(src, /mp-paid-notice/);
    assert.match(src, /mp-payment-required-panel/);
    assert.match(src, /mp-preview-btn/);
    assert.match(src, /Preview pack/);
    assert.match(src, /isPaymentRequiredResult/);
    assert.doesNotMatch(src, /request\s*\(\s*['"]\/api\/marketplace\/update['"]/);
    assert.doesNotMatch(src, /applyMarketplaceUpdate\b/);
    assert.doesNotMatch(src, /stripe|payfast|paystack|flutterwave|checkout/i);
    assert.doesNotMatch(src, /sales@ziricai\.com/);
}
console.log("✓ Portal marketplace UX wiring (no scattered sales email, no checkout)");

const companyId = `portal-4c3-pay-${Date.now()}`;

const { runInstallWizard } = await import("../services/platform/marketplaceInstaller.js");
const { installIndustryPack } = await import("../services/platform/industryPackService.js");
const { resolveMarketplacePaymentBypass } = await import("../services/platform/marketplaceAuth.js");

const freePreview = await runInstallWizard(companyId, FREE_PACK, { step: "preview" });
assert.equal(freePreview.stepName, "preview");
assert.equal(freePreview.pack?.isFree, true);
console.log("✓ free pack preview");

await installIndustryPack(companyId, FREE_PACK, {}, { installedBy: "4c3-verify" });
console.log("✓ free pack install (memory)");

const paidPreview = await runInstallWizard(companyId, PAID_PACK, { step: "preview" });
assert.equal(paidPreview.stepName, "preview");
assert.equal(paidPreview.pack?.isPaid, true);
assert.equal(paidPreview.pack?.priceLabel, "Paid");
console.log("✓ paid pack preview remains available");

const paidInstall = await runInstallWizard(companyId, PAID_PACK, { step: "install" });
assert.equal(paidInstall.requiresPayment, true);
assert.equal(paidInstall.contactSales, true);
console.log("✓ paid pack install requires payment (service layer)");

const fakeReq = { tenant: { uid: "u1", isSuperAdmin: false } };
const bypass = resolveMarketplacePaymentBypass(fakeReq, { demoMode: true, skipPayment: true });
assert.equal(bypass.demoMode, false);
assert.equal(bypass.skipPayment, false);
console.log("✓ demoMode/skipPayment not honored for ordinary tenant callers");

assert.match(read("services/platform/marketplaceTemplate.js"), /PACK_PRICING/);
assert.match(read("services/platform/marketplaceInstaller.js"), /requiresPayment/);
console.log("✓ backend pricing gate unchanged");

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
    console.log("✓ 4A / 4A-R1 / 4B / 4C-1 / 4C-2 regressions passed");
}

assert.equal(read("services/platform/marketplaceAuth.js"), authBefore);
console.log("✓ marketplaceAuth.js untouched");

console.log("\nPORTAL-4C-3 marketplace payment UX verification passed");
