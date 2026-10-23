#!/usr/bin/env node
/**
 * Automotive Phase 1 — preset package validation (no Sarah tools bootstrap).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    getIndustryPresetDocument,
    listIndustryPresetCatalogue,
} from "../services/platform/industryPresetRegistry.js";
import { validateIndustryPreset } from "../services/platform/industryPresetValidator.js";
import { resolveIndustryPresetForTenant } from "../services/platform/industryPresetContext.js";

const root = path.dirname(fileURLToPath(import.meta.url));

console.log("verify-automotive-preset-phase1\n");

const catalogue = listIndustryPresetCatalogue();
assert.ok(
    catalogue.some((e) => e.presetId === "automotive-dealership"),
    "automotive-dealership catalogue entry"
);

const automotive = getIndustryPresetDocument("automotive-dealership", "1.0.0");
assert.ok(automotive, "automotive preset document loads");

const validation = validateIndustryPreset(automotive);
if (!validation.valid) console.error(validation.errors);
assert.equal(validation.valid, true, "automotive preset validates");

process.env.INDUSTRY_PRESET_RUNTIME = "1";
const resolved = await resolveIndustryPresetForTenant({
    industryPresetId: "automotive-dealership",
    industryPresetVersion: "1.0.0",
    industryPresetActivatedAt: "2026-10-22T12:00:00.000Z",
});
assert.equal(resolved.active, true, "automotive preset resolves active for tenant");

const testFiles = [
    "test/automotive-date-range.test.mjs",
    "test/automotive-appointment-classifier.test.mjs",
    "test/automotive-metrics-service.test.mjs",
    "test/automotive-preset-access.test.mjs",
    "test/automotive-dashboard-api.test.mjs",
    "test/automotive-dashboard-http.test.mjs",
    "test/automotive-dashboard-http-default-loaders.test.mjs",
    "test/automotive-command-centre-ui.test.mjs",
];

const testRun = spawnSync(process.execPath, ["--test", ...testFiles], {
    cwd: path.join(root, ".."),
    stdio: "inherit",
    env: { ...process.env, STORAGE_BACKEND: "memory", INDUSTRY_PRESET_RUNTIME: "1" },
});

assert.equal(testRun.status, 0, "automotive test suite");

console.log("\nverify-automotive-preset-phase1: OK");
