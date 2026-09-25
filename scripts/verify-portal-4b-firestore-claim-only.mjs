#!/usr/bin/env node
/** Firestore transactional claim concurrency (no provisioning). */
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "firestore";

const companyId = `portal-4b-claim-${Date.now()}`;
const packId = "pack-funeral-ai";

const { claimInstall, assertInstallClaimResult } = await import(
    "../services/platform/marketplaceInstallService.js"
);
const { MarketplaceInstallError, INSTALL_IN_PROGRESS } = await import(
    "../services/platform/marketplaceInstallErrors.js"
);

const first = await claimInstall(companyId, packId, { installedBy: "claim-a" });
assert.equal(first.outcome, "claimed");

let err = null;
try {
    const second = await claimInstall(companyId, packId, { installedBy: "claim-b" });
    assertInstallClaimResult(second);
} catch (e) {
    err = e;
}
assert.ok(err instanceof MarketplaceInstallError);
assert.equal(err.code, INSTALL_IN_PROGRESS);
console.log("firestore concurrent claim ok", companyId);
