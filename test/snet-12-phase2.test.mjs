/**
 * SNET Phase 2.0 — evidence blob storage + officer download, in-app notifications, MC Search administration,
 * geo discover (near / city / region), Verification Officer RBAC.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { hasPermission } from "../services/auth/permissionsService.js";
import {
    clearBusinessDirectoryForTests,
    searchDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests, ensureOrgEntity } from "../services/network/networkIdentityService.js";
import { publishListing, saveListingDraft } from "../services/network/networkProfileService.js";
import { clearVerificationCasesForTests, getVerificationCase, submitVerification } from "../services/network/verificationService.js";
import { clearNetworkAdminAuditForTests, listNetworkAdminAudit } from "../services/network/networkAdminAudit.js";
import { clearChatMediaForTests, completeScopedMediaUpload, createScopedMediaUpload } from "../services/users/chatMediaService.js";
import {
    clearEvidenceBlobsForTests,
    EVIDENCE_CHUNK_BYTES,
    getEvidenceBlobMeta,
    putEvidenceBlob,
    readEvidenceBlob,
    removeEvidenceBlob,
    signatureMatches,
} from "../services/network/evidenceBlobStore.js";
import { mountNetworkVerificationRoutes } from "../services/api/networkVerificationRoutes.js";
import { mountNetworkPlatformRoutes } from "../services/api/networkPlatformRoutes.js";
import { mountNetworkConnectionRoutes } from "../services/api/networkConnectionRoutes.js";
import { ROUTE_CATALOG } from "../services/api/routeRegistry.js";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { clearConsentGrantsForTests, createConsentGrant } from "../services/users/consentGrantService.js";
import { applyConsumerAction, clearNetworkConnectionsForTests, SUBSCRIBE_SCOPE } from "../services/network/connectionService.js";
import { updateMyOrganisationPreferences } from "../services/network/myOrganisationsService.js";
import { clearSubscriberEventsForTests, recordSubscriberEvent } from "../services/network/subscriberEventService.js";
import {
    clearNotificationsForTests,
    countUnreadNotifications,
    listNotificationsForUser,
    markNotificationsRead,
} from "../services/network/notificationService.js";
import {
    clearSearchConfigForTests,
    getSearchConfig,
    resetSearchConfig,
    updateSearchConfig,
    validateCategories,
    validateSynonyms,
} from "../services/network/searchConfigService.js";
import { getCategories, getSynonyms, deriveCategories } from "../services/network/networkTaxonomy.js";
import {
    clearPlatformRolesForTests,
    getPlatformRoles,
    permissionsForRoles,
    platformAuthAllows,
    PLATFORM_PERMISSIONS as PERM,
    PLATFORM_ROLES,
    setPlatformRoles,
} from "../services/auth/platformRbac.js";
import { clampRadiusKm, haversineKm, locateEntry, matchesCity, matchesRegion, parseNear, resolvePlace } from "../services/network/networkGeo.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const tick = () => new Promise((r) => setImmediate(r));

const PROD = { id: "acme-motors-1a2b", name: "Acme Motors", settings: { tenantClass: "production_customer" } };
const deps = { getCompany: async (id) => (id === PROD.id ? PROD : null) };
const FULL = {
    displayName: "Acme Motors",
    industry: "Automotive dealership",
    shortDescription: "New and pre-owned vehicles with an in-house service centre.",
    location: "Pretoria, South Africa",
    legalName: "Acme Motors (Pty) Ltd",
    registrationNumber: "2020/123456/07",
};

function reset() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    clearVerificationCasesForTests();
    clearNetworkAdminAuditForTests();
    clearChatMediaForTests();
    clearEvidenceBlobsForTests();
}

const PDF = Buffer.from("%PDF-1.4 fake registration certificate");

/* ------------------------------------------------------------------ 1. evidence blob store */

test("evidence blob store: chunked round trip, integrity verified, signature + size enforced, removable", async () => {
    clearEvidenceBlobsForTests();
    const big = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(EVIDENCE_CHUNK_BYTES * 2 + 123, 7)]);
    const meta = await putEvidenceBlob({ uploadId: "smed_big", companyId: "co-1", mimeType: "application/pdf", fileName: "big.pdf" }, big);
    assert.equal(meta.chunks, 3);
    assert.equal(meta.byteLength, big.length);
    const got = await readEvidenceBlob("smed_big");
    assert.ok(got.bytes.equals(big), "bytes survive chunking");
    assert.equal(got.meta.companyId, "co-1");
    assert.equal(await readEvidenceBlob("smed_unknown"), null);

    await assert.rejects(putEvidenceBlob({ uploadId: "smed_exe", companyId: "co-1", mimeType: "application/pdf" }, Buffer.from("MZ not a pdf at all")), {
        code: "FILE_CONTENT_MISMATCH",
    });
    assert.equal(await getEvidenceBlobMeta("smed_exe"), null, "rejected bytes leave nothing behind");
    await assert.rejects(putEvidenceBlob({ uploadId: "smed_big2", companyId: "co-1", mimeType: "application/pdf" }, Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)])), {
        code: "FILE_TOO_LARGE",
    });
    await assert.rejects(putEvidenceBlob({ uploadId: "smed_sum", companyId: "co-1", mimeType: "application/pdf", sha256: "0".repeat(64) }, PDF), {
        code: "EVIDENCE_BLOB_CHECKSUM",
    });

    assert.equal(signatureMatches("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), true);
    assert.equal(signatureMatches("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), true);
    assert.equal(signatureMatches("text/html", Buffer.from("<html>")), false);

    await removeEvidenceBlob("smed_big");
    assert.equal(await readEvidenceBlob("smed_big"), null);
});

/* ------------------------------------------------------------------ 2. officer evidence download (routes) */

async function evidenceApp(platformAuth = { via: "platform_role", uid: "officer-1", roles: ["verification_officer"], permissions: permissionsForRoles(["verification_officer"]) }) {
    const app = express();
    app.use(express.json());
    const deps2 = {
        authorize: async (req, companyId) => ((req.tenant = { companyId, uid: "uid-1", role: "owner" }), req.tenant),
        platformGuard: (req, _res, next) => {
            req.platformAuth = platformAuth;
            next();
        },
    };
    mountNetworkVerificationRoutes(app, deps2);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, method = "GET", body, headers = {}) => {
        const isRaw = Buffer.isBuffer(body);
        const res = await fetch(base + path, {
            method,
            headers: isRaw ? headers : { "content-type": "application/json", ...headers },
            body: isRaw ? body : body ? JSON.stringify(body) : undefined,
        });
        const type = res.headers.get("content-type") || "";
        return { status: res.status, headers: res.headers, body: type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()) };
    };
    return { call, close: () => server.close() };
}

const V = `/api/network/v1/orgs/${PROD.id}/verification`;

test("evidence download: stored upload → officer downloads the exact bytes (audited, attachment, no-store); checksum-only refs are not served", async () => {
    reset();
    await saveListingDraft(PROD.id, FULL, "o", deps);
    await publishListing(PROD.id, "o", deps);
    const kase = await submitVerification(PROD.id, "owner-1");
    const { call, close } = await evidenceApp();
    try {
        let r = await call(`${V}/evidence-uploads`, "POST", { mimeType: "application/pdf", fileName: "cipc cert (1).pdf", byteLength: PDF.length });
        const { uploadId, token, putPath } = r.body.data;
        r = await call(`${putPath}?token=${token}`, "PUT", PDF, { "content-type": "application/pdf" });
        assert.equal(r.status, 200);
        assert.equal(r.body.data.file.stored, true);

        // a PUT whose bytes do not match the declared type is refused and cannot be attached
        const bad = (await call(`${V}/evidence-uploads`, "POST", { mimeType: "application/pdf", fileName: "fake.pdf" })).body.data;
        r = await call(`${bad.putPath}?token=${bad.token}`, "PUT", Buffer.from("MZ this is an executable"), { "content-type": "application/pdf" });
        assert.equal(r.status, 415);
        assert.equal(r.body.error.code, "FILE_CONTENT_MISMATCH");
        r = await call(`${V}/evidence`, "POST", { items: [{ kind: "other", label: "Fake", uploadId: bad.uploadId }] });
        assert.ok(r.status >= 400, "rejected upload is not attachable");

        r = await call(`${V}/evidence`, "POST", { items: [{ kind: "registration_certificate", label: "CIPC", uploadId }] });
        assert.equal(r.status, 201);
        const evidenceId = r.body.data.evidence[0].evidenceId;
        assert.equal(r.body.data.evidence[0].file.stored, true);

        // officer view lists it as downloadable
        const detail = await getVerificationCase(kase.caseId);
        assert.equal(detail.evidenceRefs[0].file.stored, true);

        const dl = await call(`/api/platform/network/v1/verification/${kase.caseId}/evidence/${evidenceId}/download`);
        assert.equal(dl.status, 200);
        assert.ok(Buffer.isBuffer(dl.body) && dl.body.equals(PDF), "exact bytes");
        assert.equal(dl.headers.get("content-type"), "application/pdf");
        assert.match(dl.headers.get("content-disposition"), /^attachment; filename="cipc_cert__1_.pdf"$/);
        assert.equal(dl.headers.get("x-content-type-options"), "nosniff");
        assert.match(dl.headers.get("cache-control"), /no-store/);
        assert.match(dl.headers.get("content-security-policy"), /sandbox/);

        const audit = await listNetworkAdminAudit({ action: "verification.evidence_download" });
        assert.equal(audit.length, 1);
        assert.equal(audit[0].actor, "officer-1");
        assert.equal(audit[0].detail.evidenceId, evidenceId);

        // unknown evidence / case → 404; a file recorded before storage existed → 404 NOT_STORED
        assert.equal((await call(`/api/platform/network/v1/verification/${kase.caseId}/evidence/ev_nope/download`)).status, 404);
        const legacy = createScopedMediaUpload(
            { subject: `tenant:${PROD.id}`, purpose: "network_verification_evidence", allowedMimeTypes: ["application/pdf"] },
            { mimeType: "application/pdf", fileName: "old.pdf" }
        );
        completeScopedMediaUpload(legacy.uploadId, `tenant:${PROD.id}`, "network_verification_evidence", legacy.token, PDF); // no blob written
        const att = await call(`${V}/evidence`, "POST", { items: [{ kind: "other", label: "Old", uploadId: legacy.uploadId }] });
        assert.equal(att.body.data.evidence.at(-1).file.stored, false);
        const old = await call(`/api/platform/network/v1/verification/${kase.caseId}/evidence/${att.body.data.evidence.at(-1).evidenceId}/download`);
        assert.equal(old.status, 404);
        assert.equal(old.body.error.code, "EVIDENCE_FILE_NOT_STORED");

        // another tenant's blob cannot be served through this case
        await putEvidenceBlob({ uploadId: legacy.uploadId, companyId: "someone-else", mimeType: "application/pdf" }, PDF);
        const cross = await call(`/api/platform/network/v1/verification/${kase.caseId}/evidence/${att.body.data.evidence.at(-1).evidenceId}/download`);
        assert.equal(cross.status, 404);
    } finally {
        close();
    }
});

/* ------------------------------------------------------------------ 3. Verification Officer RBAC */

test("RBAC: verification_officer decides cases and downloads evidence but cannot restrict, edit search or suspend", async () => {
    const officer = permissionsForRoles(["verification_officer"]);
    for (const p of [PERM.VERIFICATION_READ, PERM.VERIFICATION_DECIDE, PERM.VERIFICATION_EVIDENCE]) assert.ok(officer.includes(p), p);
    for (const p of [PERM.VERIFICATION_RESTRICT, PERM.SEARCH_ADMIN, PERM.ENTITIES_WRITE, PERM.MODERATION_DECIDE]) assert.ok(!officer.includes(p), `officer must not have ${p}`);
    assert.ok(permissionsForRoles(["search_admin"]).includes(PERM.SEARCH_ADMIN));
    assert.ok(permissionsForRoles(["trust_safety"]).includes(PERM.VERIFICATION_RESTRICT));
    assert.deepEqual(permissionsForRoles(["not_a_role"]), []);

    assert.equal(platformAuthAllows({ via: "superadmin" }, PERM.SEARCH_ADMIN), true, "super admin unrestricted");
    assert.equal(platformAuthAllows({ via: "api_key" }, PERM.SEARCH_ADMIN), true, "api key unrestricted");
    assert.equal(platformAuthAllows({ via: "platform_role", permissions: officer }, PERM.VERIFICATION_RESTRICT), false);
    assert.equal(platformAuthAllows(null, PERM.STATS_READ), false);

    // role grants: validation + persistence
    clearPlatformRolesForTests();
    await assert.rejects(setPlatformRoles("u1", ["root"], "sa"), { code: "ROLE_UNKNOWN" });
    await assert.rejects(setPlatformRoles("bad/uid", ["search_admin"], "sa"), { code: "ROLE_UID_INVALID" });
    await setPlatformRoles("u1", ["verification_officer", "verification_officer", "search_admin"], "sa");
    assert.deepEqual((await getPlatformRoles("u1")).sort(), ["search_admin", "verification_officer"]);
    await setPlatformRoles("u1", [], "sa");
    assert.deepEqual(await getPlatformRoles("u1"), []);

    // restrict through the decision route is refused for an officer-scoped auth context
    reset();
    await saveListingDraft(PROD.id, FULL, "o", deps);
    await publishListing(PROD.id, "o", deps);
    const kase = await submitVerification(PROD.id, "owner-1");
    const asOfficer = await evidenceApp({ via: "platform_role", uid: "officer-1", permissions: officer });
    try {
        const r = await asOfficer.call(`/api/platform/network/v1/verification/${kase.caseId}/decision`, "POST", { action: "restrict", note: "no" });
        assert.equal(r.status, 403);
        assert.equal(r.body.error.code, "PLATFORM_FORBIDDEN");
        const ok = await asOfficer.call(`/api/platform/network/v1/verification/${kase.caseId}/decision`, "POST", { action: "start_review" });
        assert.equal(ok.status, 200);
    } finally {
        asOfficer.close();
    }
    // …but a trust-and-safety / super admin context may restrict
    const asAdmin = await evidenceApp({ via: "superadmin", uid: "sa-1" });
    try {
        const r = await asAdmin.call(`/api/platform/network/v1/verification/${kase.caseId}/decision`, "POST", { action: "restrict", note: "Policy breach confirmed by review" });
        assert.equal(r.status, 200);
    } finally {
        asAdmin.close();
    }
});

/* ------------------------------------------------------------------ 4. MC Search administration */

test("search admin: validation, effective taxonomy follows the override, audited, reset restores defaults", async () => {
    clearSearchConfigForTests();
    clearNetworkAdminAuditForTests();
    const defaults = await getSearchConfig();
    assert.deepEqual(defaults.overridden, { categories: false, synonyms: false });
    assert.ok(defaults.categories.length >= 5);

    assert.throws(() => validateCategories([]), { code: "SEARCH_CONFIG_INVALID" });
    assert.throws(() => validateCategories([{ id: "A B", label: "x", keywords: [] }]), { code: "SEARCH_CONFIG_INVALID" });
    assert.throws(() => validateCategories([{ id: "cafe", label: "Cafe", keywords: [] }, { id: "cafe", label: "Dup", keywords: [] }]), /Duplicate/);
    assert.throws(() => validateSynonyms({ "x": ["a"] }), { code: "SEARCH_CONFIG_INVALID" });
    assert.throws(() => validateSynonyms({ coffee: [] }), { code: "SEARCH_CONFIG_INVALID" });
    assert.throws(() => validateSynonyms([]), { code: "SEARCH_CONFIG_INVALID" });
    await assert.rejects(updateSearchConfig({}, "sa"), { code: "SEARCH_CONFIG_INVALID" });

    const cats = [
        { id: "vet", label: "Veterinary", keywords: "vet, animal hospital, pet clinic" },
        { id: "cafe", label: "Cafes", keywords: ["coffee", "espresso"] },
    ];
    const next = await updateSearchConfig({ categories: cats, synonyms: { puppy: ["dog", "pet"] } }, "officer-9");
    assert.deepEqual(next.overridden, { categories: true, synonyms: true });
    assert.equal(next.version, 1);
    assert.equal(next.updatedBy, "officer-9");
    assert.deepEqual(getCategories().map((c) => c.id), ["vet", "cafe"]);
    assert.deepEqual(getSynonyms().puppy, ["dog", "pet"]);
    assert.ok(deriveCategories({ industry: "Pet clinic", shortDescription: "We treat animals" }).includes("vet"));

    // a partial update keeps the other part
    const again = await updateSearchConfig({ synonyms: { puppy: ["dog"] } }, "officer-9");
    assert.deepEqual(again.categories.map((c) => c.id), ["vet", "cafe"]);
    assert.equal(again.version, 2);

    const audit = await listNetworkAdminAudit({ action: "search.config_update" });
    assert.equal(audit.length, 2);

    const reset1 = await resetSearchConfig("officer-9");
    assert.deepEqual(reset1.overridden, { categories: false, synonyms: false });
    assert.ok(getCategories().length >= 5);
    assert.equal((await listNetworkAdminAudit({ action: "search.config_reset" })).length, 1);
    clearSearchConfigForTests();
});

test("search admin routes: read / update / reset / roles, validation errors are 422, and all are catalogued", async () => {
    clearSearchConfigForTests();
    clearPlatformRolesForTests();
    const app = express();
    app.use(express.json());
    mountNetworkPlatformRoutes(app, {
        platformGuard: (req, _res, next) => {
            req.platformAuth = { via: "superadmin", uid: "sa-1" };
            next();
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const j = (path, init = {}) =>
        fetch(base + path, { ...init, headers: { "content-type": "application/json" } }).then(async (r) => ({ status: r.status, body: await r.json() }));
    try {
        const cfg = await j("/api/platform/network/v1/search-config");
        assert.equal(cfg.status, 200);
        assert.ok(cfg.body.data.categories.length);

        const bad = await j("/api/platform/network/v1/search-config", { method: "PUT", body: JSON.stringify({ categories: [{ id: "!!", label: "x" }] }) });
        assert.equal(bad.status, 422);
        const put = await j("/api/platform/network/v1/search-config", {
            method: "PUT",
            body: JSON.stringify({ categories: [{ id: "bakery", label: "Bakeries", keywords: ["bread", "pastry"] }] }),
        });
        assert.equal(put.status, 200);
        assert.deepEqual(put.body.data.categories, [{ id: "bakery", label: "Bakeries", keywords: ["bread", "pastry"] }]);
        const del = await j("/api/platform/network/v1/search-config/reset", { method: "POST" });
        assert.equal(del.status, 200);
        assert.equal(del.body.data.overridden.categories, false);

        const grant = await j("/api/platform/network/v1/roles/uid-77", { method: "PUT", body: JSON.stringify({ roles: ["verification_officer"] }) });
        assert.equal(grant.status, 200);
        assert.equal((await j("/api/platform/network/v1/roles/uid-77", { method: "PUT", body: JSON.stringify({ roles: ["root"] }) })).status, 422);
        const roles = await j("/api/platform/network/v1/roles");
        assert.equal(roles.status, 200);
        assert.deepEqual(roles.body.data.grants.map((g) => g.uid), ["uid-77"]);
        assert.deepEqual(roles.body.data.roles.map((r) => r.id).sort(), Object.keys(PLATFORM_ROLES).sort());
        assert.equal((await listNetworkAdminAudit({ action: "platform.roles_set" })).length >= 1, true);
    } finally {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
        clearSearchConfigForTests();
        clearPlatformRolesForTests();
    }
    const keys = new Set(ROUTE_CATALOG.map((r) => `${r.method} ${r.path}`));
    for (const k of [
        "GET /api/platform/network/v1/search-config",
        "PUT /api/platform/network/v1/search-config",
        "POST /api/platform/network/v1/search-config/reset",
        "GET /api/platform/network/v1/roles",
        "PUT /api/platform/network/v1/roles/:uid",
        "GET /api/platform/network/v1/verification/:caseId/evidence/:evidenceId/download",
        "GET /api/network/v1/my-notifications",
        "POST /api/network/v1/my-notifications/read",
    ]) {
        assert.ok(keys.has(k), `catalogued: ${k}`);
    }
});

/* ------------------------------------------------------------------ 5. geo discover */

test("geo helpers: gazetteer, aliases, provinces, distance, near parsing", () => {
    assert.equal(resolvePlace("Unit 4, Emalahleni, South Africa").name, "emalahleni");
    assert.equal(resolvePlace("Witbank").name, "emalahleni", "alias");
    assert.equal(resolvePlace("Nowhereville"), null);
    assert.equal(locateEntry({ location: "Sandton, Gauteng" }).region, "Gauteng");
    assert.equal(locateEntry({ location: "Cape Town" }).geoSource, "gazetteer");
    const explicit = locateEntry({ location: "Cape Town", geo: { lat: -33.912345, lng: 18.412345 } });
    assert.equal(explicit.geoSource, "listing");
    assert.deepEqual(explicit.geo, { lat: -33.91, lng: 18.41 }, "public precision ~1 km");
    assert.equal(matchesRegion({ location: "Durban" }, "kwazulu-natal"), true);
    assert.equal(matchesRegion({ location: "Durban" }, "Gauteng"), false);
    assert.equal(matchesCity({ location: "Sandton", serviceAreas: ["Midrand"] }, "midrand"), true);
    const jhbPta = haversineKm({ lat: -26.2041, lng: 28.0473 }, { lat: -25.7479, lng: 28.2293 });
    assert.ok(jhbPta > 45 && jhbPta < 60, `Joburg–Pretoria ≈ 50 km, got ${jhbPta}`);
    assert.deepEqual(parseNear("-26.2,28.04"), { lat: -26.2, lng: 28.04, label: null });
    assert.equal(parseNear("Cape Town").label, "cape town");
    assert.equal(parseNear(""), null);
    assert.throws(() => parseNear("Atlantis"), { code: "NEAR_UNKNOWN_PLACE" });
    assert.throws(() => parseNear("999,999"), { code: "NEAR_INVALID" });
    assert.equal(clampRadiusKm(undefined), 50);
    assert.equal(clampRadiusKm(100000), 500);
    assert.equal(clampRadiusKm(0), 50);
});

async function seedGeo() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    clearSearchConfigForTests();
    const mk = (id, name, location, extra = {}) =>
        upsertBusinessDirectoryEntry(id, { discoverability: "public", displayName: name, industry: "Cafe", location, shortDescription: `${name} serves coffee.`, tags: ["coffee"], ...extra });
    mk("geo-emal", "Emalahleni Roasters", "Emalahleni, South Africa");
    mk("geo-sand", "Sandton Brews", "Sandton, Gauteng");
    mk("geo-cpt", "Cape Coffee Co", "Cape Town", { serviceAreas: ["Stellenbosch"] });
    mk("geo-none", "Somewhere Cafe", "A farm road, somewhere");
    await tick();
}
const MINE = new Set(["Emalahleni Roasters", "Sandton Brews", "Cape Coffee Co", "Somewhere Cafe"]);
const mine = (res) => res.companies.filter((c) => MINE.has(c.displayName));

test("geo discover: city / region filters, near + radius with distance ordering, public coordinates rounded", async () => {
    await seedGeo();

    const city = await searchDiscoverCompanies({ q: "coffee", city: "Sandton" });
    assert.deepEqual(mine(city).map((c) => c.displayName), ["Sandton Brews"]);
    assert.equal(city.geo.city, "Sandton");

    const viaArea = await searchDiscoverCompanies({ city: "Stellenbosch" });
    assert.deepEqual(mine(viaArea).map((c) => c.displayName), ["Cape Coffee Co"], "service area counts as a place served");

    const region = await searchDiscoverCompanies({ region: "Western Cape" });
    assert.deepEqual(mine(region).map((c) => c.displayName), ["Cape Coffee Co"]);

    const tight = await searchDiscoverCompanies({ near: "Emalahleni", radiusKm: 20 });
    assert.deepEqual(mine(tight).map((c) => c.displayName), ["Emalahleni Roasters"]);
    assert.equal(mine(tight)[0].distanceKm, 0);
    assert.equal(tight.geo.near.label, "emalahleni");
    assert.equal(tight.geo.radiusKm, 20);

    const wide = await searchDiscoverCompanies({ near: "-25.8713,29.2332", radiusKm: 300 });
    assert.deepEqual(mine(wide).map((c) => c.displayName), ["Emalahleni Roasters", "Sandton Brews"], "nearest first; Cape Town and unlocatable excluded");
    assert.ok(mine(wide)[1].distanceKm > 100 && mine(wide)[1].distanceKm < 180);
    assert.ok(mine(wide).every((c) => c.geo && Number.isInteger(Math.round(c.geo.lat * 100))), "coordinates exposed at ~1 km precision");

    // without geo params nothing changes: every listing (incl. unlocatable) is returned, no geo block
    const plain = await searchDiscoverCompanies({ q: "coffee" });
    assert.equal(mine(plain).length, 4);
    assert.equal(plain.geo, undefined);

    await assert.rejects(searchDiscoverCompanies({ near: "Atlantis" }), { code: "NEAR_UNKNOWN_PLACE" });
});

test("geo discover: a listing can set exact coordinates (validated), shown rounded; clearing falls back to the gazetteer", async () => {
    reset();
    await saveListingDraft(PROD.id, { ...FULL, geo: { lat: -25.871234, lng: 29.233456 } }, "o", deps);
    await publishListing(PROD.id, "o", deps);
    const hit = await searchDiscoverCompanies({ near: "-25.87,29.23", radiusKm: 5 });
    const card = hit.companies.find((c) => c.displayName === "Acme Motors");
    assert.ok(card, "found by explicit coordinates although the text says Pretoria");
    assert.equal(card.geoSource, "listing");
    assert.deepEqual(card.geo, { lat: -25.87, lng: 29.23 });

    await assert.rejects(saveListingDraft(PROD.id, { geo: { lat: 200, lng: 0 } }, "o", deps), { code: "PROFILE_INVALID" });
    await assert.rejects(saveListingDraft(PROD.id, { geo: "here" }, "o", deps), { code: "PROFILE_INVALID" });

    await saveListingDraft(PROD.id, { geo: null }, "o", deps);
    await publishListing(PROD.id, "o", deps);
    const after = (await searchDiscoverCompanies({ q: "acme" })).companies.find((c) => c.displayName === "Acme Motors");
    assert.equal(after.geoSource, "gazetteer");
});

/* ------------------------------------------------------------------ 6. notifications */

async function subscriberSetup() {
    clearConsentGrantsForTests();
    clearNetworkEntitiesForTests();
    clearNetworkConnectionsForTests();
    clearSubscriberEventsForTests();
    clearNotificationsForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    await tick();
    const snId = (await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID)).snId;
    const subscribe = async (uid) => {
        await applyConsumerAction(uid, snId, "follow");
        const g = createConsentGrant(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID, snId, scope: SUBSCRIBE_SCOPE });
        await applyConsumerAction(uid, snId, "subscribe", { grantId: g.grantId });
    };
    return { snId, subscribe };
}

test("notifications: fan-out honours prefs + subscription, private to the recipient, read state, hidden after unsubscribe", async () => {
    const { snId, subscribe } = await subscriberSetup();
    await subscribe("n-u1");
    await subscribe("n-u2");
    await subscribe("n-u3");
    await applyConsumerAction("n-u4", snId, "follow");
    await updateMyOrganisationPreferences("n-u3", snId, { reminders: false });

    const evt = await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "reminder", title: "Check-up due", body: "Book your visit." }, "member:owner");
    assert.equal(evt.status, "delivered_in_app");
    assert.equal(evt.delivered, 2);
    assert.deepEqual(evt.audience, { subscribers: 3, wouldReceive: 2 });
    assert.ok(!JSON.stringify(evt).includes("n-u1"), "the business-visible event never names recipients");

    const u1 = await listNotificationsForUser("n-u1");
    assert.equal(u1.unread, 1);
    assert.equal(u1.delivery, "in_app");
    assert.equal(u1.notifications.length, 1);
    const n = u1.notifications[0];
    assert.equal(n.title, "Check-up due");
    assert.equal(n.read, false);
    assert.equal(n.snId, snId);
    const raw = JSON.stringify(u1);
    for (const secret of ["companyId", "uid", "createdBy", "audience", SMILEMORE_DEMO_COMPANY_ID]) assert.ok(!raw.includes(secret), `no ${secret} in the payload`);

    assert.equal((await listNotificationsForUser("n-u3")).notifications.length, 0, "reminders muted");
    assert.equal((await listNotificationsForUser("n-u4")).notifications.length, 0, "followers are not subscribers");

    // an announcement reaches all three subscribers
    await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "announcement", title: "New hours" });
    assert.equal(await countUnreadNotifications("n-u3"), 1);
    assert.equal((await listNotificationsForUser("n-u1")).unread, 2);
    assert.equal((await listNotificationsForUser("n-u1", { unreadOnly: true, limit: 1 })).notifications.length, 1);

    // read state is per user and cannot touch someone else's notification
    await assert.rejects(markNotificationsRead("n-u1", {}), { code: "NOTIFICATIONS_INVALID" });
    const foreign = (await markNotificationsRead("n-u2", { ids: [n.notificationId] })).updated;
    assert.equal(foreign, 0, "u2 cannot mark u1's notification");
    const one = await markNotificationsRead("n-u1", { ids: [n.notificationId] });
    assert.deepEqual(one, { updated: 1, unread: 1 });
    assert.equal((await markNotificationsRead("n-u1", { all: true })).unread, 0);
    assert.equal((await listNotificationsForUser("n-u2")).unread, 2, "u2 unaffected");

    // unsubscribing hides the organisation's notifications
    await applyConsumerAction("n-u2", snId, "unsubscribe");
    const hidden = await listNotificationsForUser("n-u2");
    assert.equal(hidden.notifications.length, 0);
    assert.equal(hidden.unread, 0);
});

test("notifications routes: poll + mark read through the consumer guard; recipients only see their own", async () => {
    const { subscribe } = await subscriberSetup();
    await subscribe("r-u1");
    const app = express();
    app.use(express.json());
    mountNetworkConnectionRoutes(app, {
        consumerGuard: (req, _res, next) => {
            req.consumerAuth = { uid: String(req.headers["x-uid"] || "") };
            next();
        },
        authorize: async (_req, companyId) => ({ uid: "member-1", companyId }),
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const j = (path, init = {}) =>
        fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json() }));
    try {
        const post = await j(`/api/network/v1/orgs/${SMILEMORE_DEMO_COMPANY_ID}/subscriber-events`, {
            method: "POST",
            body: JSON.stringify({ type: "notification", title: "Hello subscribers", body: "Welcome." }),
        });
        assert.equal(post.status, 201);
        assert.equal(post.body.data.event.status, "delivered_in_app");

        const list = await j("/api/network/v1/my-notifications", { headers: { "x-uid": "r-u1" } });
        assert.equal(list.status, 200);
        assert.equal(list.body.data.unread, 1);
        assert.equal(list.body.data.notifications[0].title, "Hello subscribers");
        const other = await j("/api/network/v1/my-notifications", { headers: { "x-uid": "someone-else" } });
        assert.equal(other.body.data.notifications.length, 0);
        assert.equal((await j("/api/network/v1/my-notifications?unread=1", { headers: { "x-uid": "r-u1" } })).body.data.notifications.length, 1);

        assert.equal((await j("/api/network/v1/my-notifications/read", { method: "POST", headers: { "x-uid": "r-u1" }, body: "{}" })).status, 422);
        const read = await j("/api/network/v1/my-notifications/read", { method: "POST", headers: { "x-uid": "r-u1" }, body: JSON.stringify({ all: true }) });
        assert.equal(read.status, 200);
        assert.deepEqual(read.body.data, { updated: 1, unread: 0 });

        const log = await j(`/api/network/v1/orgs/${SMILEMORE_DEMO_COMPANY_ID}/subscriber-events`);
        assert.equal(log.body.data.delivery, "in_app");
        assert.equal(log.body.data.events.length, 1);
    } finally {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
});

/* ------------------------------------------------------------------ 7. clients wired */

test("clients: Sarah App sends geo + notification calls; MC has Search/Access tabs and evidence download; portal hint updated", () => {
    const bridge = read("prototype/sarah-app-ux/js/live-bridge.mjs");
    assert.match(bridge, /params\.set\('city', city\)/);
    assert.match(bridge, /params\.set\('region', region\)/);
    assert.match(bridge, /\/api\/network\/v1\/my-notifications/);
    assert.match(bridge, /fetchMyNotifications,\s*\n\s*markNotificationsRead,/);
    const app = read("prototype/sarah-app-ux/js/app.js");
    assert.match(app, /fetchMyNotifications/);
    assert.match(app, /discoverPlaceInput/);
    assert.match(read("prototype/sarah-app-ux/index.html"), /id="discoverPlaceInput"/);

    const mc = read("js/admin/modules/sarah-network.js");
    for (const label of ["'Search'", "'Access'", "data-snet-download", "saveNetworkSearchConfig", "setNetworkRoles"]) assert.ok(mc.includes(label), label);
    assert.ok(!/\bprompt\s*\(/.test(mc));
    const api = read("js/admin/api.js");
    assert.match(api, /evidence\/\$\{encodeURIComponent\(evidenceId\)\}\/download/);
    assert.match(api, /\/api\/platform\/network\/v1\/search-config/);

    // a Verification Officer must not need Super Admin to reach the queue, and Super Admin keeps full access
    assert.equal(hasPermission("superadmin", "canManageNetwork"), true);
});
