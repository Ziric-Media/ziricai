/**
 * SNET Phase 2.2 — Nominatim geocode on publish, FCM client wiring, MC officer session, push server path.
 */
process.env.STORAGE_BACKEND = "memory";
process.env.NOMINATIM_DISABLED = "0";
delete process.env.FCM_SERVER_KEY;
delete process.env.FIREBASE_PROJECT_ID;
delete process.env.FIREBASE_CLIENT_EMAIL;
delete process.env.FIREBASE_PRIVATE_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearBusinessDirectoryForTests, searchDiscoverCompanies, setBusinessDirectoryStoreForTests } from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests } from "../services/network/networkIdentityService.js";
import { publishListing, saveListingDraft } from "../services/network/networkProfileService.js";
import { geocodeProfileLocation, resetNominatimForTests, setNominatimFetchForTests } from "../services/network/nominatimGeocode.js";
import { inferGeoFromProfile } from "../services/network/networkGeo.js";
import {
    drainPushAttemptsForTests,
    resetFcmForTests,
    sendPushToUser,
    setFcmAccessTokenForTests,
    setFcmFetchForTests,
} from "../services/network/webPushService.js";
import { clearPushDevicesForTests, registerPushDevice } from "../services/network/pushDeviceService.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const PROD = { id: "geo-nom-1", name: "Karoo Motors", settings: { tenantClass: "production_customer" } };
const deps = { getCompany: async (id) => (id === PROD.id ? PROD : null) };

test("nominatim: geocode unknown SA town when gazetteer misses", async () => {
    resetNominatimForTests();
    setNominatimFetchForTests(async () => ({
        ok: true,
        json: async () => [{ lat: "-32.9977", lon: "22.1390", display_name: "Beaufort West" }],
    }));
    assert.equal(inferGeoFromProfile({ location: "Beaufort West, Western Cape" }), null);
    const g = await geocodeProfileLocation({ location: "Beaufort West, Western Cape" });
    assert.ok(g && Math.abs(g.lat + 32.9977) < 0.01);
    resetNominatimForTests();
});

test("publish: stores Nominatim coordinates on directory entry", async () => {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    resetNominatimForTests();
    setNominatimFetchForTests(async () => ({
        ok: true,
        json: async () => [{ lat: "-32.9977", lon: "22.1390" }],
    }));

    await saveListingDraft(
        PROD.id,
        {
            displayName: "Karoo Auto",
            industry: "Automotive",
            shortDescription: "Cars in the Karoo.",
            location: "Beaufort West, Western Cape",
            legalName: "Karoo Auto Pty",
            registrationNumber: "2024/222222/07",
        },
        "o",
        deps
    );
    await publishListing(PROD.id, "o", deps);
    const hit = await searchDiscoverCompanies({ near: "-32.9977,22.1390", radiusKm: 40 });
    const card = hit.companies.find((c) => c.displayName === "Karoo Auto");
    assert.ok(card, "discover near uses stored geo from Nominatim");
    resetNominatimForTests();
});

test("FCM: server no-op without key; client sources wire push-fcm", async () => {
    resetFcmForTests();
    drainPushAttemptsForTests();
    clearPushDevicesForTests();
    await registerPushDevice("fcm-u1", { token: "c".repeat(152), consent: true, platform: "web" });
    const r = await sendPushToUser("fcm-u1", { title: "Hi", body: "There" });
    assert.equal(r.skipped, "fcm_not_configured");
    assert.match(read("prototype/sarah-app-ux/js/app.js"), /push-fcm\.mjs/);
    assert.match(read("prototype/sarah-app-ux/js/push-fcm.mjs"), /getToken/);
    assert.match(read("js/users/sw.js"), /firebase-messaging-compat/);
});

test("FCM: HTTP v1 send uses mocked bearer (Firebase Admin env)", async () => {
    resetFcmForTests();
    drainPushAttemptsForTests();
    clearPushDevicesForTests();
    process.env.FIREBASE_PROJECT_ID = "ziricai-test";
    process.env.FIREBASE_CLIENT_EMAIL = "fcm-test@ziricai-test.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n";

    const calls = [];
    setFcmAccessTokenForTests("mock-fcm-v1-token");
    setFcmFetchForTests(async (url, init) => {
        calls.push({ url: String(url), init });
        return { ok: true, status: 200, json: async () => ({ name: "projects/ziricai-test/messages/msg-1" }) };
    });

    await registerPushDevice("fcm-v1-u1", { token: "d".repeat(152), consent: true, platform: "web" });
    const r = await sendPushToUser("fcm-v1-u1", {
        title: "V1",
        body: "Ping",
        notificationId: "n-1",
        snId: "sn-1",
    });
    assert.equal(r.sent, 1);
    assert.equal(r.mode, "v1");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /fcm\.googleapis\.com\/v1\/projects\/ziricai-test\/messages:send/);
    assert.equal(calls[0].init.headers.Authorization, "Bearer mock-fcm-v1-token");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.message.token, "d".repeat(152));
    assert.equal(body.message.data.type, "sarah_network");

    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    resetFcmForTests();
});

test("MC officer: session path allows platform operator without tenant profile", () => {
    assert.match(read("js/auth.js"), /isMissionControlHost\(\) && platformPermissions\.length/);
    assert.match(read("js/admin/auth-guard.js"), /Sarah Network platform role/);
    assert.match(read("js/admin/main.js"), /snetDefaultTab.*verification/);
});
