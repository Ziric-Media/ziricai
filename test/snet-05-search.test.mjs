/**
 * SNET-05 — search MVP: name / category / keyword / location ranking, synonyms, typo tolerance, verified boost,
 * pagination, zero-result analytics, provider interface + API.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import {
    clearBusinessDirectoryForTests,
    searchDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests } from "../services/network/networkIdentityService.js";
import { parseQuery, rankCards, stem } from "../services/network/networkSearchScoring.js";
import { getSearchStats, resetSearchStatsForTests } from "../services/network/networkSearchStats.js";
import { directoryProvider, getSearchProvider, setSearchProvider } from "../services/network/networkSearchService.js";
import { mountNetworkSearchRoutes } from "../services/api/networkSearchRoutes.js";

const tick = () => new Promise((r) => setImmediate(r));

async function seed() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    resetSearchStatsForTests();
    const pub = (id, d) => upsertBusinessDirectoryEntry(id, { discoverability: "public", ...d });
    pub("acme-motors-1a2b", { displayName: "Acme Motors", industry: "Automotive dealership", location: "Pretoria, South Africa", shortDescription: "New and pre-owned vehicles.", tags: ["cars", "dealership"] });
    pub("green-haven-1", { displayName: "Green Haven Cafe", industry: "Vegan cafe", location: "Sandton, South Africa", shortDescription: "Organic coffee and brunch.", tags: ["coffee", "vegan", "restaurant", "brunch"] });
    pub("bright-smile-1", { displayName: "Bright Smile Orthodontics", industry: "Healthcare · Dental", location: "Emalahleni, South Africa", shortDescription: "Braces and family dentistry.", tags: ["dentist", "orthodontics", "braces"] });
    pub("emalahleni-auto-1", { displayName: "Emalahleni Auto Repair", industry: "Automotive repair", location: "Emalahleni, South Africa", shortDescription: "Honest mechanics, quick turnaround.", tags: ["mechanic", "garage", "tyres"] });
    pub("verified-twin-1", { displayName: "Twin Plumbing", industry: "Plumbing services", location: "Durban", shortDescription: "Leaks and geysers.", tags: ["plumber"], verified: true, verificationSummary: { state: "verified", checks: ["ownership_confirmed"] } });
    pub("unverified-twin-1", { displayName: "Twin Plumbing Co", industry: "Plumbing services", location: "Durban", shortDescription: "Leaks and geysers.", tags: ["plumber"] });
    await tick();
}

const names = (r) => r.companies.map((c) => c.displayName);

test("query parsing: stop words dropped, plural stemmed, place extracted", () => {
    assert.deepEqual(parseQuery("Find a dentist near me").terms, ["dentist"]);
    assert.equal(stem("dentists"), "dentist");
    assert.equal(stem("pharmacies"), "pharmacy");
    assert.deepEqual(parseQuery("good mechanics in Emalahleni").placeTokens, ["emalahleni"]);
});

test("name search: exact name outranks keyword matches; partial names work", async () => {
    await seed();
    assert.equal(names(await searchDiscoverCompanies({ q: "green haven cafe" }))[0], "Green Haven Cafe");
    assert.equal(names(await searchDiscoverCompanies({ q: "acme" }))[0], "Acme Motors");
    assert.equal(names(await searchDiscoverCompanies({ q: "Bright" }))[0], "Bright Smile Orthodontics");
});

test("natural-language: synonyms + category + location", async () => {
    await seed();
    const dentists = names(await searchDiscoverCompanies({ q: "Find a dentist near me" }));
    assert.ok(dentists.slice(0, 2).includes("Bright Smile Orthodontics"));
    assert.ok(dentists.includes("SmileMore Dentists"));
    assert.ok(!dentists.includes("Acme Motors"));

    const local = await searchDiscoverCompanies({ q: "dentists in Emalahleni" });
    assert.equal(local.companies[0].displayName, "Bright Smile Orthodontics", "place boosts the local dentist");
    assert.ok(local.companies[0].matchedOn.includes("location"));

    const mech = names(await searchDiscoverCompanies({ q: "good mechanics in Emalahleni" }));
    assert.equal(mech[0], "Emalahleni Auto Repair");

    assert.equal(names(await searchDiscoverCompanies({ q: "restaurants" }))[0], "Green Haven Cafe");
    assert.equal(names(await searchDiscoverCompanies({ q: "a plumber" }))[0], "Twin Plumbing", "verified twin ranks above unverified twin");
});

test("typo tolerance only kicks in when nothing else matches the term", async () => {
    await seed();
    assert.equal(names(await searchDiscoverCompanies({ q: "denist" }))[0] !== undefined, true);
    assert.ok(names(await searchDiscoverCompanies({ q: "denist" })).includes("Bright Smile Orthodontics"));
    assert.equal((await searchDiscoverCompanies({ q: "zzzzqqqq" })).companies.length, 0);
});

test("category + verified filters; facets computed before filters", async () => {
    await seed();
    const auto = await searchDiscoverCompanies({ category: "auto" });
    assert.deepEqual(names(auto).sort(), ["Acme Motors", "Emalahleni Auto Repair"]);
    const verified = await searchDiscoverCompanies({ verifiedOnly: true });
    assert.ok(verified.companies.every((c) => c.verified));
    assert.ok(verified.total >= 2); // SmileMore (operator pilot) + Twin Plumbing
    const q = await searchDiscoverCompanies({ q: "dentist", category: "health" });
    assert.ok(q.facets.some((f) => f.id === "health"));
});

test("browse mode orders by trust/completeness; cursor pagination is stable and complete", async () => {
    await seed();
    const all = await searchDiscoverCompanies({ limit: 100 });
    const p1 = await searchDiscoverCompanies({ limit: 2 });
    assert.equal(p1.companies.length, 2);
    assert.ok(p1.nextCursor);
    const paged = [...names(p1)];
    let next = p1.nextCursor;
    let pages = 1;
    while (next) {
        const page = await searchDiscoverCompanies({ limit: 2, cursor: next });
        paged.push(...names(page));
        next = page.nextCursor;
        pages += 1;
        assert.ok(pages < 10, "cursor must terminate");
    }
    assert.deepEqual(paged, names(all));
    assert.equal(paged.length, all.total);    assert.deepEqual(names(await searchDiscoverCompanies({ limit: 2, cursor: "garbage" })), names(p1));
});

test("analytics: zero-result queries are recorded (in-process)", async () => {
    await seed();
    await searchDiscoverCompanies({ q: "submarine periscope" });
    await searchDiscoverCompanies({ q: "submarine periscope" });
    await searchDiscoverCompanies({ q: "dentist" });
    const stats = getSearchStats();
    assert.equal(stats.scope, "in_process_since_restart");
    assert.equal(stats.zeroResults, 2);
    assert.deepEqual(stats.topZeroResultQueries[0], { q: "submarine periscope", count: 2 });
});

test("rankCards is pure and explains matches", () => {
    const card = { displayName: "Bright Smile", industry: "Dental", location: "Pretoria", shortDescription: "", tags: ["dentist"], categories: ["health"], verified: false };
    const [hit] = rankCards([card], "dentist");
    assert.ok(hit.score > 0);
    assert.ok(hit.matchedOn.includes("tags"));
    assert.equal(rankCards([card], "plumber").length, 0);
});

test("provider interface: suggest/health, swappable provider, API envelope", async () => {
    await seed();
    assert.equal(getSearchProvider().name, "directory-inprocess");
    assert.ok((await directoryProvider.suggest("smi")).includes("SmileMore Dentists"));
    assert.deepEqual(await directoryProvider.suggest("s"), []);
    const health = await directoryProvider.health();
    assert.ok(health.ok && health.indexed >= 6);

    const app = express();
    mountNetworkSearchRoutes(app, { consumerGuard: (req, _res, next) => { req.consumerAuth = { uid: "u" }; next(); } });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        let res = await fetch(`${base}/api/network/v1/directory/search?q=dentist&limit=1`);
        let body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.data.companies.length, 1);
        assert.ok(body.data.nextCursor);
        res = await fetch(`${base}/api/network/v1/directory/suggest?q=gre`);
        assert.ok((await res.json()).data.suggestions.includes("Green Haven Cafe"));
        res = await fetch(`${base}/api/network/v1/health`);
        body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.data.search.provider, "directory-inprocess");

        setSearchProvider({
            ...directoryProvider,
            name: "stub",
            search: async () => ({ companies: [], total: 0, nextCursor: null, facets: [], query: "" }),
        });
        body = await (await fetch(`${base}/api/network/v1/directory/search?q=dentist`)).json();
        assert.equal(body.data.total, 0, "stage-B providers plug in via the same interface");
    } finally {
        setSearchProvider(null);
        server.close();
    }
});

test("search routes require consumer auth by default; health is public", async () => {
    const app = express();
    mountNetworkSearchRoutes(app);
    const server = app.listen(0);
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const path of ["/api/network/v1/directory/search?q=a", "/api/network/v1/directory/suggest?q=ab"]) {
            const res = await fetch(base + path);
            assert.ok([401, 403].includes(res.status), `${path} → ${res.status}`);
        }
        assert.equal((await fetch(`${base}/api/network/v1/health`)).status, 200);
    } finally {
        server.close();
    }
});

test("pilot listing still searchable by name", async () => {
    await seed();
    const r = await searchDiscoverCompanies({ q: "smilemore" });
    assert.equal(r.companies[0].companyId, SMILEMORE_DEMO_COMPANY_ID);
});
