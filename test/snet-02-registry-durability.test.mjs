/**
 * SNET-02 — durable consent grants / network requests / audit / rate counters (restart simulation),
 * grants list+revoke API with snId targeting, eligibility + backfill (dry-run default).
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import {
    clearConsentGrantsForTests,
    createConsentGrant,
    dropConsentGrantCacheForTests,
    getConsentGrantAsync,
    listConsentGrantsForUser,
    revokeConsentGrant,
    validateConsentGrantAsync,
} from "../services/users/consentGrantService.js";
import {
    clearSarahNetworkStoreForTests,
    dropSarahNetworkCacheForTests,
} from "../services/sarah/network/sarahNetworkStore.js";
import {
    getSarahNetworkRequestAsync,
    listSarahNetworkRequestsAsync,
    resetSarahNetworkRateLimitsForTests,
    submitPersonalToCompanyEnquiry,
} from "../services/sarah/network/sarahNetworkService.js";
import { flushNetworkWrites } from "../services/network/networkWriteQueue.js";
import { createNetworkCollection } from "../services/network/networkCollectionStore.js";
import { NETWORK_COLLECTIONS } from "../services/database/schema.js";
import { clearBusinessDirectoryForTests, setBusinessDirectoryStoreForTests } from "../services/users/businessDirectoryService.js";
import { clearNetworkChatLinksForTests } from "../services/users/sarahNetworkChatLinkService.js";
import {
    clearNetworkEntitiesForTests,
    ensureOrgEntity,
    getOrgEntityByCompanyId,
} from "../services/network/networkIdentityService.js";
import { evaluateNetworkEligibility } from "../services/network/networkEligibility.js";
import { backfillOrgEntities } from "../services/network/networkBackfill.js";
import { mountSarahNetworkRoutes } from "../services/api/sarahNetworkRoutes.js";

function reset() {
    clearConsentGrantsForTests();
    clearSarahNetworkStoreForTests();
    clearNetworkChatLinksForTests();
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    resetSarahNetworkRateLimitsForTests();
}

test("consent grants survive a restart (cache dropped) and can be listed + revoked", async () => {
    reset();
    const uid = "u-dur-1";
    const g = createConsentGrant(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID });
    await flushNetworkWrites();
    dropConsentGrantCacheForTests();

    assert.equal((await getConsentGrantAsync(g.grantId)).uid, uid);
    dropConsentGrantCacheForTests();
    await validateConsentGrantAsync(uid, g.grantId, { companyId: SMILEMORE_DEMO_COMPANY_ID });
    await assert.rejects(() => validateConsentGrantAsync("someone-else", g.grantId), { code: "GRANT_FORBIDDEN" });

    dropConsentGrantCacheForTests();
    assert.deepEqual((await listConsentGrantsForUser(uid)).map((x) => x.grantId), [g.grantId]);

    await revokeConsentGrant(uid, g.grantId);
    dropConsentGrantCacheForTests();
    await assert.rejects(() => validateConsentGrantAsync(uid, g.grantId), { code: "GRANT_INACTIVE" });
    await assert.rejects(() => revokeConsentGrant("someone-else", g.grantId), { code: "GRANT_FORBIDDEN" });
    await assert.rejects(() => revokeConsentGrant(uid, "grant_missing"), { code: "GRANT_NOT_FOUND" });
});

test("network requests + audit survive a restart", async () => {
    reset();
    const uid = "u-dur-2";
    const grant = createConsentGrant(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID });
    const done = await submitPersonalToCompanyEnquiry(uid, {
        companyId: SMILEMORE_DEMO_COMPANY_ID,
        grantId: grant.grantId,
        naturalLanguage: "Do you do whitening?",
    });
    await flushNetworkWrites();
    dropSarahNetworkCacheForTests();
    dropConsentGrantCacheForTests();

    const { request, audit } = await getSarahNetworkRequestAsync(done.requestId, uid);
    assert.equal(request.status, "completed");
    assert.ok(audit.some((e) => e.type === "request.created"));
    assert.ok(audit.some((e) => e.type === "request.completed"));
    dropSarahNetworkCacheForTests();
    assert.equal((await listSarahNetworkRequestsAsync(uid))[0].requestId, done.requestId);
    await assert.rejects(() => getSarahNetworkRequestAsync(done.requestId, "intruder"), { code: "REQUEST_FORBIDDEN" });
    await assert.rejects(() => getSarahNetworkRequestAsync("snr_nope", uid), { code: "REQUEST_NOT_FOUND" });
});

test("rate limit holds across a restart via the durable counter", async () => {
    reset();
    const uid = "u-dur-rate";
    const bucket = Math.floor(Date.now() / (60 * 60 * 1000));
    await createNetworkCollection(NETWORK_COLLECTIONS.RATE_EVENTS).put(`${uid}__${bucket}`, { uid, bucket, count: 9999 });
    const grant = createConsentGrant(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID });
    await assert.rejects(
        () => submitPersonalToCompanyEnquiry(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID, grantId: grant.grantId, naturalLanguage: "hi" }),
        { code: "RATE_LIMITED" }
    );
});

test("eligibility is decided server-side; test/demo/acceptance/unknown tenants never list", () => {
    assert.equal(evaluateNetworkEligibility({ id: SMILEMORE_DEMO_COMPANY_ID }).eligible, true);
    assert.equal(evaluateNetworkEligibility({ id: "central-motors-rtb" }).eligible, true); // PILOT
    assert.equal(evaluateNetworkEligibility({ id: "ziricai" }).classification, "CLIENT ZERO");
    for (const id of ["portal-4b-abc", "demo-central-motors", "client2-tp2c-accept-20260917", "mystery-co-1a2b"]) {
        const v = evaluateNetworkEligibility({ id });
        assert.equal(v.eligible, false, `${id} → ${v.classification}`);
    }
    // stored operator classification wins
    assert.equal(
        evaluateNetworkEligibility({ id: "acme-1a2b", settings: { tenantClass: "production_customer" } }).eligible,
        true
    );
});

test("backfill is dry-run by default, skips ineligible tenants, and is idempotent on apply", async () => {
    reset();
    const companies = [
        { id: SMILEMORE_DEMO_COMPANY_ID, name: "SmileMore" },
        { id: "central-motors-rtb", name: "Central Motors RTB" },
        { id: "portal-4b-xyz", name: "Portal test" },
        { id: "demo-central-motors", name: "Demo CM" },
        { id: "mystery-co-1a2b", name: "Mystery" },
    ];
    const dry = await backfillOrgEntities(companies);
    assert.equal(dry.dryRun, true);
    assert.deepEqual(dry.created.sort(), ["central-motors-rtb", SMILEMORE_DEMO_COMPANY_ID].sort());
    assert.equal(dry.skipped.length, 3);
    assert.equal(await getOrgEntityByCompanyId(SMILEMORE_DEMO_COMPANY_ID), null, "dry-run wrote nothing");

    const applied = await backfillOrgEntities(companies, { apply: true });
    assert.equal(applied.dryRun, false);
    const e = await getOrgEntityByCompanyId(SMILEMORE_DEMO_COMPANY_ID);
    assert.equal(e.status, "draft");
    assert.equal(await getOrgEntityByCompanyId("portal-4b-xyz"), null);

    const again = await backfillOrgEntities(companies, { apply: true });
    assert.deepEqual(again.created, []);
    assert.equal(again.existing.length, 2);
    assert.equal((await getOrgEntityByCompanyId(SMILEMORE_DEMO_COMPANY_ID)).snId, e.snId);
});

test("grants API: snId targeting, list, revoke, ownership", async () => {
    reset();
    const entity = await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID, { displayName: "SmileMore Dentists", status: "listed" });
    const app = express();
    app.use(express.json());
    let currentUid = "u-api-1";
    mountSarahNetworkRoutes(app, {
        consumerGuard: (req, _res, next) => {
            req.consumerAuth = { uid: currentUid, profile: {} };
            next();
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, init) => {
        const res = await fetch(base + path, { headers: { "content-type": "application/json" }, ...init });
        return { status: res.status, body: await res.json() };
    };
    try {
        let r = await call("/api/sarah-network/grants", { method: "POST", body: JSON.stringify({ snId: entity.snId }) });
        assert.equal(r.status, 201);
        assert.equal(r.body.grant.companyId, SMILEMORE_DEMO_COMPANY_ID, "snId resolved server-side");
        assert.equal(r.body.grant.snId, entity.snId);
        const grantId = r.body.grant.grantId;

        r = await call("/api/sarah-network/grants", { method: "POST", body: JSON.stringify({ snId: "sn_org_0000000000000000" }) });
        assert.equal(r.status, 404);

        r = await call("/api/sarah-network/grants");
        assert.equal(r.body.grants.length, 1);

        r = await call("/api/sarah-network/enquiries", {
            method: "POST",
            body: JSON.stringify({ snId: entity.snId, grantId, naturalLanguage: "Opening hours?" }),
        });
        assert.equal(r.status, 201);
        assert.equal(r.body.request.destination.companyId, SMILEMORE_DEMO_COMPANY_ID);

        currentUid = "u-api-2";
        assert.equal((await call(`/api/sarah-network/grants/${grantId}`)).status, 404);
        assert.equal((await call(`/api/sarah-network/grants/${grantId}/revoke`, { method: "POST", body: "{}" })).status, 403);

        currentUid = "u-api-1";
        r = await call(`/api/sarah-network/grants/${grantId}/revoke`, { method: "POST", body: "{}" });
        assert.equal(r.body.grant.status, "revoked");
        r = await call("/api/sarah-network/enquiries", {
            method: "POST",
            body: JSON.stringify({ snId: entity.snId, grantId, naturalLanguage: "again" }),
        });
        assert.equal(r.status, 403);
        assert.equal(r.body.code, "GRANT_INACTIVE");
    } finally {
        server.close();
    }
});
