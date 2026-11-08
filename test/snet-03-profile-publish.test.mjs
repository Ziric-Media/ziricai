/**
 * SNET-03 — tenant listing draft → publish → Discover; eligibility, completeness, restricted fields, API.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
    getListing,
    getPublicProfileBySnId,
    publishListing,
    saveListingDraft,
    unpublishListing,
    validateProfilePatch,
} from "../services/network/networkProfileService.js";
import {
    clearBusinessDirectoryForTests,
    searchDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
} from "../services/users/businessDirectoryService.js";
import {
    clearNetworkEntitiesForTests,
    getOrgEntityByCompanyId,
    setOrgEntityStatus,
} from "../services/network/networkIdentityService.js";
import { mountNetworkListingRoutes } from "../services/api/networkListingRoutes.js";
import { hasPermission } from "../services/auth/permissionsService.js";

const PROD = { id: "acme-motors-1a2b", name: "Acme Motors", settings: { tenantClass: "production_customer" } };
const TEST_TENANT = { id: "portal-4b-zz", name: "Portal test" };
const deps = {
    getCompany: async (id) => ({ [PROD.id]: PROD, [TEST_TENANT.id]: TEST_TENANT })[id] || null,
};

function reset() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
}

const FULL = {
    displayName: "Acme Motors",
    industry: "Automotive dealership",
    shortDescription: "New and pre-owned vehicles with an in-house service centre.",
    location: "Pretoria, South Africa",
    tags: ["Cars", "service", "cars"],
    contact: { phone: "+27 12 000 0000", email: "hello@acme.example", website: "https://acme.example" },
    hours: [{ day: "Mon–Fri", time: "08:00–17:00" }],
    legalName: "Acme Motors (Pty) Ltd",
    registrationNumber: "2020/123456/07",
};

test("validation: rejects non-editable fields (verified), bad URLs, unknown categories, bad email", () => {
    assert.throws(() => validateProfilePatch({ verified: true }), { code: "PROFILE_FIELD_NOT_ALLOWED" });
    assert.throws(() => validateProfilePatch({ logoUrl: "http://insecure.example/a.png" }), { code: "PROFILE_INVALID" });
    assert.throws(() => validateProfilePatch({ categories: ["nonsense"] }), { code: "PROFILE_INVALID" });
    assert.throws(() => validateProfilePatch({ contact: { email: "nope" } }), { code: "PROFILE_INVALID" });
    const { profile, restricted } = validateProfilePatch({ tags: ["Cars", "cars", " Service "], legalName: " X " });
    assert.deepEqual(profile.tags, ["cars", "service"]);
    assert.equal(restricted.legalName, "X");
});

test("draft is private until published; publish requires a complete profile", async () => {
    reset();
    await saveListingDraft(PROD.id, { displayName: "Acme Motors", industry: "Automotive dealership" }, "owner-1", deps);
    let listing = await getListing(PROD.id, deps);
    assert.equal(listing.published, false);
    assert.deepEqual(listing.missingRequired.sort(), ["location", "shortDescription"]);
    assert.equal((await searchDiscoverCompanies({ q: "acme" })).companies.length, 0, "draft not in Discover");

    await assert.rejects(() => publishListing(PROD.id, "owner-1", deps), { code: "PROFILE_INCOMPLETE" });

    await saveListingDraft(PROD.id, FULL, "owner-1", deps);
    listing = await publishListing(PROD.id, "owner-1", deps);
    assert.equal(listing.published, true);
    assert.ok(listing.snId);
    assert.equal(listing.entityStatus, "listed");
    assert.equal(listing.verified, false, "tenant cannot self-verify");
});

test("published tenant is discoverable with SN-ID + derived category; restricted data never leaks", async () => {
    reset();
    await saveListingDraft(PROD.id, FULL, "owner-1", deps);
    const listing = await publishListing(PROD.id, "owner-1", deps);

    const { companies } = await searchDiscoverCompanies({ q: "acme", category: "auto" });
    assert.equal(companies.length, 1);
    assert.equal(companies[0].snId, listing.snId);
    assert.equal(companies[0].verified, false);
    assert.ok(!JSON.stringify(companies[0]).includes("2020/123456"));
    assert.ok(!JSON.stringify(companies[0]).includes("Pty"));

    const profile = await getPublicProfileBySnId(listing.snId);
    assert.equal(profile.displayName, "Acme Motors");
    assert.deepEqual(profile.tags, ["cars", "service"]);
    assert.equal(profile.contact.website, "https://acme.example");
    assert.ok(!JSON.stringify(profile).includes("2020/123456"));
    assert.equal(profile.restricted, undefined);

    // tenant still sees its restricted block
    assert.equal((await getListing(PROD.id, deps)).restricted.registrationNumber, "2020/123456/07");
});

test("unpublish removes from Discover/profile but keeps the content as draft; republish works", async () => {
    reset();
    await saveListingDraft(PROD.id, FULL, "o", deps);
    const { snId } = await publishListing(PROD.id, "o", deps);
    const after = await unpublishListing(PROD.id, "o", deps);
    assert.equal(after.published, false);
    assert.equal(after.profile.shortDescription, FULL.shortDescription);
    assert.equal((await searchDiscoverCompanies({ q: "acme" })).companies.length, 0);
    assert.equal(await getPublicProfileBySnId(snId), null);
    assert.equal((await getOrgEntityByCompanyId(PROD.id)).status, "draft");

    const again = await publishListing(PROD.id, "o", deps);
    assert.equal(again.snId, snId, "SN-ID is stable across publish cycles");
});

test("ineligible (test/demo/unknown) and suspended tenants cannot publish", async () => {
    reset();
    await saveListingDraft(TEST_TENANT.id, FULL, "o", deps);
    await assert.rejects(() => publishListing(TEST_TENANT.id, "o", deps), { code: "NETWORK_NOT_ELIGIBLE" });

    await saveListingDraft(PROD.id, FULL, "o", deps);
    await publishListing(PROD.id, "o", deps);
    await setOrgEntityStatus(PROD.id, "suspended", { actor: "mc", reason: "fraud report" });
    await assert.rejects(() => publishListing(PROD.id, "o", deps), { code: "NETWORK_SUSPENDED" });
    await assert.rejects(() => getListing("nobody-co", deps), { code: "COMPANY_NOT_FOUND" });
});

test("API: role-gated writes, error envelope, consumer public profile", async () => {
    reset();
    let role = "viewer";
    const app = express();
    app.use(express.json());
    mountNetworkListingRoutes(app, {
        listingDeps: deps,
        authorize: async (req, companyId, { write }) => {
            if (write && !hasPermission(role, "canManageNetwork")) {
                throw Object.assign(new Error("denied"), { status: 403, code: "PERMISSION_DENIED" });
            }
            req.tenant = { companyId, uid: "uid-1", role };
            return req.tenant;
        },
        consumerGuard: (req, _res, next) => {
            req.consumerAuth = { uid: "consumer-1" };
            next();
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, method = "GET", body) => {
        const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json() };
    };
    const L = `/api/network/v1/orgs/${PROD.id}/listing`;
    try {
        assert.equal((await call(L)).status, 200);
        let r = await call(L, "PUT", FULL);
        assert.equal(r.status, 403, "viewer cannot write");
        role = "manager";
        r = await call(L, "PUT", { verified: true });
        assert.equal(r.status, 422);
        assert.equal(r.body.ok, false);
        assert.equal(r.body.error.code, "PROFILE_FIELD_NOT_ALLOWED");
        r = await call(L + "/publish", "POST");
        assert.equal(r.status, 422);
        assert.equal(r.body.error.code, "PROFILE_INCOMPLETE");
        assert.ok(r.body.error.missing.includes("location"));

        assert.equal((await call(L, "PUT", FULL)).status, 200);
        r = await call(L + "/publish", "POST");
        assert.equal(r.status, 200);
        const { snId } = r.body.data;

        r = await call(`/api/network/v1/entities/${snId}/profile`);
        assert.equal(r.status, 200);
        assert.equal(r.body.data.profile.snId, snId);
        assert.ok(!JSON.stringify(r.body).includes("2020/123456"));

        await call(L + "/unpublish", "POST");
        assert.equal((await call(`/api/network/v1/entities/${snId}/profile`)).status, 404);
    } finally {
        server.close();
    }
});

test("API: default guards reject unauthenticated callers", async () => {
    const app = express();
    app.use(express.json());
    mountNetworkListingRoutes(app);
    const server = app.listen(0);
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const [method, path] of [
            ["GET", "/api/network/v1/orgs/acme/listing"],
            ["PUT", "/api/network/v1/orgs/acme/listing"],
            ["POST", "/api/network/v1/orgs/acme/listing/publish"],
            ["GET", "/api/network/v1/entities/sn_org_0000000000000000/profile"],
        ]) {
            const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
            assert.ok([401, 403].includes(res.status), `${method} ${path} → ${res.status}`);
        }
    } finally {
        server.close();
    }
});

/* ---------- SNET-03 portal UI: GET shape for the editor + wiring checks ---------- */

test("API: GET listing carries category options and canEdit (managers edit, viewers read-only)", async () => {
    reset();
    let role = "viewer";
    const app = express();
    app.use(express.json());
    mountNetworkListingRoutes(app, {
        listingDeps: deps,
        authorize: async (req, companyId) => {
            req.tenant = { companyId, uid: "uid-1", role };
            return req.tenant;
        },
    });
    const server = app.listen(0);
    try {
        const url = `http://127.0.0.1:${server.address().port}/api/network/v1/orgs/${PROD.id}/listing`;
        let body = await (await fetch(url)).json();
        assert.equal(body.data.canEdit, false);
        assert.ok(body.data.categoryOptions.some((c) => c.id === "auto" && c.label === "Auto"));
        assert.deepEqual(Object.keys(body.data.categoryOptions[0]).sort(), ["id", "label"]);
        role = "owner";
        body = await (await fetch(url)).json();
        assert.equal(body.data.canEdit, true);
    } finally {
        server.close();
    }
});

test("Company Portal: Sarah Network section is registered, permission-gated and calls the listing/verification APIs", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
    assert.match(read("js/portal/core/lazyLoader.js"), /'network',/);
    assert.match(read("js/portal/core/lazyLoader.js"), /network: 'renderNetwork'/);
    assert.match(read("js/portal/core/appShell.js"), /id: 'network', label: 'Sarah Network'/);
    // same key the server enforces on the listing writes — no matrix drift
    assert.match(read("js/portal/permissions.js"), /network: 'canManageNetwork'/);
    assert.match(read("services/api/networkListingRoutes.js"), /hasPermission\(req\.tenant\.role, "canManageNetwork"\)/);

    const api = read("js/portal/api.js");
    for (const frag of ["/listing`", "/listing/publish`", "/listing/unpublish`", "/verification`", "/verification/evidence`"]) {
        assert.ok(api.includes(frag), `portal api.js is missing ${frag}`);
    }
    const mod = read("js/portal/modules/network.js");
    assert.match(mod, /export async function renderNetwork/);
    for (const fn of ["saveNetworkListingDraft", "publishNetworkListing", "unpublishNetworkListing", "submitNetworkVerification", "addNetworkVerificationEvidence"]) {
        assert.ok(mod.includes(fn), `network.js must use ${fn}`);
    }
    assert.ok(!/window\.prompt/.test(mod));
    // generated app/ is rebuilt by prepare-sites; the source of truth is js/portal
    assert.equal(hasPermission("manager", "canManageNetwork"), true);
    assert.equal(hasPermission("support", "canManageNetwork"), false);
});
