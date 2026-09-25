#!/usr/bin/env node
/**
 * Harness-only: force validatePackInstall failure then run installIndustryPack orchestration.
 * Not a substitute for POST /api/marketplace/install happy-path evidence.
 */
import assert from "node:assert/strict";
import { mock } from "node:test";
import { provisionPortal4bDisposableActor } from "./provision-portal-4b-disposable-acceptance-actor.mjs";

const companyId =
    process.env.PORTAL_4B_VALIDATOR_FAIL_COMPANY || `portal-4b-validator-fail-${Date.now()}`;
const PACK = "pack-funeral-ai";
const password = process.env.PORTAL_4B_SMOKE_PASSWORD || "";
assert.ok(password, "PORTAL_4B_SMOKE_PASSWORD required");

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "firestore";

await provisionPortal4bDisposableActor({
    companyId,
    email: `portal-4b-validator-${Date.now()}@ziricai.com`,
});

await mock.module("../services/platform/marketplaceInstallValidator.js", {
    exports: {
        validatePackInstall: async () => ({
            valid: false,
            errors: ["harness forced validation failure"],
            checks: [],
        }),
    },
});

const { installIndustryPack } = await import("../services/platform/industryPackService.js");
const { getInstall } = await import("../services/platform/marketplaceInstallService.js");

let threw = false;
try {
    await installIndustryPack(companyId, PACK, {}, { installedBy: "validator-harness" });
} catch {
    threw = true;
}
assert.equal(threw, true);

const rec = await getInstall(companyId, PACK);
assert.equal(rec.status, "failed");
assert.ok(rec.lastError?.includes("validation") || rec.lastError?.includes("harness"));
assert.ok(rec.installAttemptId);
console.log("orchestrated validator failure ok", companyId);
mock.reset();
