/**
 * SNET Phase 2.2 — Nominatim geocode on publish, FCM client wiring, MC officer session, push server path.
 */
process.env.STORAGE_BACKEND = "memory";
process.env.NOMINATIM_DISABLED = "0";
delete process.env.FCM_SERVER_KEY;

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
import { drainPushAttemptsForTests } from "../services/network/webPushService.js";
import { registerPushDevice } from "../services/network/pushDeviceService.js";
import { sendPushToUser } from "../services/network/webPushService.js";

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
    drainPushAttemptsForTests();
    await registerPushDevice("fcm-u1", { token: "c".repeat(152), consent: true, platform: "web" });
    const r = await sendPushToUser("fcm-u1", { title: "Hi", body: "There" });
    assert.equal(r.skipped, "fcm_not_configured");
    assert.match(read("prototype/sarah-app-ux/js/app.js"), /push-fcm\.mjs/);
    assert.match(read("prototype/sarah-app-ux/js/push-fcm.mjs"), /getToken/);
    assert.match(read("js/users/sw.js"), /firebase-messaging-compat/);
});

test("MC officer: session path allows platform operator without tenant profile", () => {
    assert.match(read("js/auth.js"), /isMissionControlHost\(\) && platformPermissions\.length/);
    assert.match(read("js/admin/auth-guard.js"), /Sarah Network platform role/);
    assert.match(read("js/admin/main.js"), /snetDefaultTab.*verification/);
});
