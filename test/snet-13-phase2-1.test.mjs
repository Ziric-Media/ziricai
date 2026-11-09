/**
 * SNET Phase 2.1 — web push MVP, geocoding publish inference, MC officer UX wiring, evidence scan stub.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.FCM_SERVER_KEY;
delete process.env.CLAMAV_HOST;

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { clearBusinessDirectoryForTests, searchDiscoverCompanies, setBusinessDirectoryStoreForTests } from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests } from "../services/network/networkIdentityService.js";
import { publishListing, saveListingDraft } from "../services/network/networkProfileService.js";
import { clearConsentGrantsForTests, createConsentGrant } from "../services/users/consentGrantService.js";
import { applyConsumerAction, clearNetworkConnectionsForTests, SUBSCRIBE_SCOPE } from "../services/network/connectionService.js";
import { clearSubscriberEventsForTests, recordSubscriberEvent } from "../services/network/subscriberEventService.js";
import { clearNotificationsForTests } from "../services/network/notificationService.js";
import { clearPushDevicesForTests, registerPushDevice } from "../services/network/pushDeviceService.js";
import { drainPushAttemptsForTests } from "../services/network/webPushService.js";
import { putEvidenceBlob, clearEvidenceBlobsForTests } from "../services/network/evidenceBlobStore.js";
import { assertAllowedEvidenceMime } from "../services/network/evidenceScan.js";
import { inferGeoFromProfile, parseNear, resolvePlace } from "../services/network/networkGeo.js";
import { mountNetworkConnectionRoutes } from "../services/api/networkConnectionRoutes.js";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { ensureOrgEntity } from "../services/network/networkIdentityService.js";
import { ROUTE_CATALOG } from "../services/api/routeRegistry.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const PROD = { id: "geo-publish-1a", name: "Geo Test Motors", settings: { tenantClass: "production_customer" } };
const deps = { getCompany: async (id) => (id === PROD.id ? PROD : null) };

test("web push: token register + subscriber fan-out attempts push (FCM optional)", async () => {
    clearPushDevicesForTests();
    clearNotificationsForTests();
    clearSubscriberEventsForTests();
    clearNetworkConnectionsForTests();
    clearConsentGrantsForTests();
    clearNetworkEntitiesForTests();
    drainPushAttemptsForTests();

    await registerPushDevice("push-u1", { token: "a".repeat(140), consent: true, platform: "web" });
    const snId = (await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID)).snId;
    await applyConsumerAction("push-u1", snId, "follow");
    const g = createConsentGrant("push-u1", { companyId: SMILEMORE_DEMO_COMPANY_ID, snId, scope: SUBSCRIBE_SCOPE });
    await applyConsumerAction("push-u1", snId, "subscribe", { grantId: g.grantId });

    const evt = await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "announcement", title: "Push hello", body: "Test" });
    assert.equal(evt.status, "delivered_in_app");
    const attempts = drainPushAttemptsForTests();
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].uid, "push-u1");
    assert.equal(attempts[0].title, "Push hello");
});

test("push device route is catalogued and accepts POST", async () => {
    const keys = new Set(ROUTE_CATALOG.map((r) => `${r.method} ${r.path}`));
    assert.ok(keys.has("POST /api/network/v1/my-push-devices"));
    const app = express();
    app.use(express.json());
    mountNetworkConnectionRoutes(app, {
        consumerGuard: (req, _res, next) => {
            req.consumerAuth = { uid: "route-u1" };
            next();
        },
        authorize: async () => ({ uid: "m1", companyId: SMILEMORE_DEMO_COMPANY_ID }),
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const res = await fetch(`${base}/api/network/v1/my-push-devices`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: "b".repeat(120), consent: true }),
        });
        assert.equal(res.status, 201);
    } finally {
        server.close();
    }
    clearPushDevicesForTests();
});

test("geocoding: infer geo on publish from expanded gazetteer (Atlantis)", async () => {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    assert.equal(resolvePlace("Atlantis")?.name, "atlantis");
    assert.deepEqual(parseNear("Atlantis").label, "atlantis");

    await saveListingDraft(
        PROD.id,
        {
            displayName: "Atlantis Auto",
            industry: "Automotive",
            shortDescription: "Cars by the coast.",
            location: "Atlantis, Western Cape",
            legalName: "Atlantis Auto Pty",
            registrationNumber: "2024/111111/07",
        },
        "o",
        deps
    );
    await publishListing(PROD.id, "o", deps);
    const hit = await searchDiscoverCompanies({ near: "Atlantis", radiusKm: 30 });
    const card = hit.companies.find((c) => c.displayName === "Atlantis Auto");
    assert.ok(card, "listed by inferred coordinates");
    assert.equal(inferGeoFromProfile({ location: "Atlantis, Western Cape" })?.lat, resolvePlace("Atlantis").lat);
});

test("evidence: MIME guard + CLAMAV env no-op", async () => {
    clearEvidenceBlobsForTests();
    assert.throws(() => assertAllowedEvidenceMime("application/x-msdownload"), (e) => e.code === "UPLOAD_TYPE_NOT_ALLOWED");
    const PDF = Buffer.from("%PDF-1.4 test");
    process.env.CLAMAV_HOST = "127.0.0.1:3310";
    const meta = await putEvidenceBlob({ uploadId: "scan_ok", companyId: "co", mimeType: "application/pdf", fileName: "x.pdf" }, PDF);
    assert.equal(meta.byteLength, PDF.length);
    delete process.env.CLAMAV_HOST;
});

test("MC officer UX: landing tab + permission-gated actions in client source", () => {
    assert.match(read("js/admin/main.js"), /snetDefaultTab.*verification/s);
    assert.match(read("js/admin/modules/sarah-network.js"), /network\.verification\.restrict/);
    assert.match(read("js/admin/auth-guard.js"), /mc-platform-operator/);
    assert.match(read("prototype/sarah-app-ux/js/live-bridge.mjs"), /registerPushDevice/);
    assert.match(read("prototype/sarah-app-ux/js/app.js"), /maybeRegisterWebPush/);
});
