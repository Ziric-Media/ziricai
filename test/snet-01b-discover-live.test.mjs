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
import { resetAuthRateLimits } from "../services/auth/authRateLimiter.js";

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

test("public Discover: anonymous read returns listed entries only (no restricted/private fields)", async () => {
    reset();
    resetAuthRateLimits();
    upsertBusinessDirectoryEntry("acme-motors-1a2b", {
        discoverability: "public",
        displayName: "Acme Motors",
        industry: "Automotive dealership",
        shortDescription: "New and used cars",
        location: "Pretoria, South Africa",
        restricted: { legalName: "Acme Motors (Pty) Ltd", registrationNumber: "2020/123456/07" },
    });
    upsertBusinessDirectoryEntry("hidden-co", { discoverability: "hidden", displayName: "Hidden Co" });
    await tick();
    const app = express();
    mountUserConversationRoutes(app);
    const server = app.listen(0);
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const res = await fetch(`${base}/api/discover/companies`);
        assert.equal(res.status, 200, "no Authorization header needed");
        const body = await res.json();
        const ids = body.companies.map((c) => c.companyId);
        assert.ok(ids.includes("acme-motors-1a2b"));
        assert.ok(ids.includes(SMILEMORE_DEMO_COMPANY_ID));
        assert.ok(!ids.includes("hidden-co"), "unlisted entries never leak to anonymous callers");
        assert.ok(body.companies.every((c) => isValidSnId(c.snId)));
        assert.ok(!JSON.stringify(body).includes("2020/123456"), "restricted evidence is never public");
        const q = await (await fetch(`${base}/api/discover/companies?q=dentist`)).json();
        assert.ok(q.companies.length >= 1);
    } finally {
        server.close();
    }
});

test("public Discover: suspended entries are not served to anonymous callers", async () => {
    reset();
    resetAuthRateLimits();
    await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID, { displayName: "SmileMore Dentists" });
    await setOrgEntityStatus(SMILEMORE_DEMO_COMPANY_ID, "suspended", { reason: "test", actor: "mc" });
    invalidateDirectoryEntity(SMILEMORE_DEMO_COMPANY_ID);
    const app = express();
    mountUserConversationRoutes(app);
    const server = app.listen(0);
    try {
        const body = await (await fetch(`http://127.0.0.1:${server.address().port}/api/discover/companies`)).json();
        assert.ok(!body.companies.some((c) => c.companyId === SMILEMORE_DEMO_COMPANY_ID));
    } finally {
        server.close();
    }
});

test("public Discover is rate limited per client (429 + Retry-After); clients are isolated", async () => {
    reset();
    resetAuthRateLimits();
    const app = express();
    mountUserConversationRoutes(app);
    const server = app.listen(0);
    try {
        const url = `http://127.0.0.1:${server.address().port}/api/discover/companies?limit=1`;
        const hit = (ip) => fetch(url, { headers: { "x-forwarded-for": ip } });
        let last;
        for (let i = 0; i < 61; i += 1) last = await hit("203.0.113.9");
        assert.equal(last.status, 429);
        assert.ok(Number(last.headers.get("retry-after")) >= 1);
        assert.equal((await last.json()).code, "RATE_LIMITED");
        assert.equal((await hit("203.0.113.10")).status, 200, "another client is unaffected");
        // The left-most X-Forwarded-For hop is client-controlled and must not reset the bucket.
        assert.equal((await hit("198.51.100.1, 203.0.113.9")).status, 429);
    } finally {
        server.close();
        resetAuthRateLimits();
    }
});

test("user-scoped Discover siblings still require consumer auth (chat list)", async () => {
    const app = express();
    mountUserConversationRoutes(app);
    const server = app.listen(0);
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/user-conversations`);
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
    // Public Discover: browsing must not require sign-in (no auth gate inside the fetch).
    const fetchFn = bridge.slice(bridge.indexOf("export async function fetchDiscoverCompanies"));
    const fetchBody = fetchFn.split(/\r?\n\}\r?\n/)[0];
    assert.ok(fetchBody.includes("/api/discover/companies"), "sliced the right function");
    assert.ok(!/signedInUser|AUTH_REQUIRED|ensureConsumerProfile/.test(fetchBody), "fetchDiscoverCompanies must work signed out");
    assert.match(src, /function discoverLiveActive\(\) \{\s*return Boolean\(window\.SarahLive\?\.isLiveEnabled\?\.\(\)\);/);
});
