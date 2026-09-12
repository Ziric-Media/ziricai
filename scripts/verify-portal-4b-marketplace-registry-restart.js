#!/usr/bin/env node
import assert from "node:assert/strict";

const companyId = process.env.PORTAL_4B_RESTART_COMPANY;
const packId = process.env.PORTAL_4B_RESTART_PACK || "pack-funeral-ai";
assert.ok(companyId, "PORTAL_4B_RESTART_COMPANY required");

const { getInstalledPacks } = await import("../services/platform/industryPackService.js");

const { items } = await getInstalledPacks(companyId);
assert.equal(items.length, 1);
assert.equal(items[0].packId, packId);
assert.equal(items[0].status, "installed");
console.log("restart persistence ok");
