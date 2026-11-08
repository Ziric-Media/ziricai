/**
 * SNET-01b — live Discover: SN-ID on cards, q/category search, published tenants, suspended excluded,
 * fixtures never merged into live results (Sarah App source check).
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import {
    clearBusinessDirectoryForTests,
    invalidateDirectoryEntity,
    searchDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
    assertCompanyDiscoverableAsync,
} from "../services/users/businessDirectoryService.js";
import {
    clearNetworkEntitiesForTests,
    ensureOrgEntity,
    getOrgEntityByCompanyId,
    setOrgEntityStatus,
} from "../services/network/networkIdentityService.js";
import { isValidSnId } from "../services/network/snId.js";
import { deriveCategories } from "../services/network/networkTaxonomy.js";
import { mountUserConversationRoutes } from "../services/api/userConversationRoutes.js";

function reset() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
}

const tick = () => new Promise((r) => setImmediate(r));

test("SmileMore is listed with a valid SN-ID and health category", async () => {
    reset();
    const { companies, facets, total } = await searchDiscoverCompanies();
    const smile = companies.find((c) => c.companyId === SMILEMORE_DEMO_COMPANY_ID);
    assert.ok(smile, "SmileMore pilot listing present");
    assert.ok(isValidSnId(smile.snId), `snId ${smile.snId}`);
    assert.ok(smile.categories.includes("health"));
    assert.equal(smile.hasCompanySarah, true);
    assert.ok(total >= 1);
    assert.ok(facets.some((f) => f.id === "health" && f.count >= 1));
    assert.equal(smile.snId, (await getOrgEntityByCompanyId(SMILEMORE_DEMO_COMPANY_ID)).snId);
});

test("q search matches synonyms/tags; non-matching q returns nothing; category filter works", async () => {
    reset();
    assert.ok((await searchDiscoverCompanies({ q: "dentist" })).companies.length >= 1);
    assert.equal((await searchDiscoverCompanies({ q: "zzzqqq" })).companies.length, 0);
    assert.ok((await searchDiscoverCompanies({ category: "health" })).companies.length >= 1);
    assert.equal((await searchDiscoverCompanies({ category: "auto" })).companies.length, 0);
    assert.ok((await searchDiscoverCompanies({ category: "all" })).companies.length >= 1);
});

test("published tenants appear (and carry their own SN-ID); hidden ones do not", async () => {
    reset();
    upsertBusinessDirectoryEntry("acme-motors-1a2b", {
        discoverability: "public",
        displayName: "Acme Motors",
        industry: "Automotive dealership",
        shortDescription: "New and used cars",
        location: "Pretoria, South Africa",
    });
    upsertBusinessDirectoryEntry("hidden-co", { discoverability: "hidden", displayName: "Hidden Co" });
    await tick();
    const { companies } = await searchDiscoverCompanies({ q: "acme" });
    assert.equal(companies.length, 1);
    assert.equal(companies[0].companyId, "acme-motors-1a2b");
    assert.ok(isValidSnId(companies[0].snId));
    assert.ok(companies[0].categories.includes("auto"));
    const all = (await searchDiscoverCompanies()).companies.map((c) => c.companyId);
    assert.ok(!all.includes("hidden-co"));
    const smile = (await searchDiscoverCompanies()).companies.find((c) => c.companyId === SMILEMORE_DEMO_COMPANY_ID);
    assert.notEqual(smile.snId, companies[0].snId);
});

test("suspended entities are excluded from Discover and fail the discoverable gate", async () => {
    reset();
    const entity = await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID, { displayName: "SmileMore Dentists" });
    assert.ok(entity.snId);
    await setOrgEntityStatus(SMILEMORE_DEMO_COMPANY_ID, "suspended", { reason: "test", actor: "mc" });
    invalidateDirectoryEntity(SMILEMORE_DEMO_COMPANY_ID);
    const { companies } = await searchDiscoverCompanies();
    assert.ok(!companies.some((c) => c.companyId === SMILEMORE_DEMO_COMPANY_ID));
    await assert.rejects(() => assertCompanyDiscoverableAsync(SMILEMORE_DEMO_COMPANY_ID), {
        code: "COMPANY_NOT_DISCOVERABLE",
    });
});

test("taxonomy derives categories from industry text; explicit categories win", () => {
    assert.deepEqual(deriveCategories({ industry: "Healthcare · Dental" }), ["health"]);
    assert.deepEqual(deriveCategories({ categories: ["food", "bogus"], industry: "Dental" }), ["food"]);
    assert.deepEqual(deriveCategories({ industry: "Quantum cheese" }), []);
});

test("discover route requires consumer auth", async () => {
    const app = express();
    mountUserConversationRoutes(app);
    const server = app.listen(0);
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/discover/companies?q=dentist`);
        assert.ok([401, 403].includes(res.status), `status ${res.status}`);
    } finally {
        server.close();
    }
});

test("Sarah App source: live Discover never merges fixtures", () => {
    const src = readFileSync(new URL("../prototype/sarah-app-ux/js/app.js", import.meta.url), "utf8");
    assert.match(src, /function discoverCompaniesSource\(\) \{\s*return discoverLiveActive\(\) \? liveDiscover\.companies : MOCK_DISCOVER_COMPANIES \|\| \[\];/);
    assert.match(src, /if \(discoverLiveActive\(\)\) return liveDiscover\.byId\.get\(key\);/);
    const uses = src.split(/\r?\n/).filter((l) => l.includes("MOCK_DISCOVER_COMPANIES") && !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    // import destructure + the two guarded fixture branches only
    assert.equal(uses.length, 3, `unexpected fixture references:\n${uses.join("\n")}`);
    const bridge = readFileSync(new URL("../prototype/sarah-app-ux/js/live-bridge.mjs", import.meta.url), "utf8");
    assert.match(bridge, /\/api\/discover\/companies/);
    assert.match(bridge, /fetchDiscoverCompanies,/);
});
