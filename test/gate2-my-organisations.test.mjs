/**
 * Gate 2 — My Organisations backend MVP: relationships joined to public cards, sections, preferences, privacy.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { clearConsentGrantsForTests, createConsentGrant } from "../services/users/consentGrantService.js";
import {
    clearBusinessDirectoryForTests,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests, ensureOrgEntity, setOrgEntityStatus } from "../services/network/networkIdentityService.js";
import {
    applyBusinessAction,
    applyConsumerAction,
    clearNetworkConnectionsForTests,
    listConnectionsForOrg,
    SUBSCRIBE_SCOPE,
} from "../services/network/connectionService.js";
import { listMyOrganisations, updateMyOrganisationPreferences } from "../services/network/myOrganisationsService.js";
import { mountNetworkConnectionRoutes } from "../services/api/networkConnectionRoutes.js";
import { ROUTE_CATALOG } from "../services/api/routeRegistry.js";

const tick = () => new Promise((r) => setImmediate(r));
let snId;
let otherSnId;

async function reset() {
    clearConsentGrantsForTests();
    clearNetworkEntitiesForTests();
    clearNetworkConnectionsForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    upsertBusinessDirectoryEntry("gate2-org", {
        discoverability: "public",
        displayName: "Gate2 Org",
        industry: "retail",
        location: "Cape Town",
        shortDescription: "Second org for My Organisations",
    });
    await tick();
    snId = (await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID)).snId;
    otherSnId = (await ensureOrgEntity("gate2-org")).snId;
}

const grant = (uid, id = snId, companyId = SMILEMORE_DEMO_COMPANY_ID) =>
    createConsentGrant(uid, { companyId, snId: id, scope: SUBSCRIBE_SCOPE });

test("empty until the user acts; discovered is not 'mine'", async () => {
    await reset();
    assert.deepEqual((await listMyOrganisations("g2-u0")).organisations, []);
    await applyConsumerAction("g2-u0", snId, "discover");
    const res = await listMyOrganisations("g2-u0");
    assert.equal(res.counts.total, 0);
});

test("lists following + subscribed orgs with public cards, sections and default prefs", async () => {
    await reset();
    const uid = "g2-u1";
    await applyConsumerAction(uid, snId, "follow");
    await applyConsumerAction(uid, otherSnId, "follow");
    const g = grant(uid, otherSnId, "gate2-org");
    await applyConsumerAction(uid, otherSnId, "subscribe", { grantId: g.grantId });

    const { organisations, counts } = await listMyOrganisations(uid);
    assert.equal(counts.total, 2);
    assert.equal(counts.subscriptions, 1);
    assert.equal(counts.following, 1);
    const sub = organisations.find((o) => o.snId === otherSnId);
    assert.equal(sub.section, "subscriptions");
    assert.equal(sub.state, "subscribed");
    assert.equal(sub.available, true);
    assert.equal(sub.organisation.displayName, "Gate2 Org");
    assert.equal(sub.consent.grantId, g.grantId);
    assert.deepEqual(sub.prefs, { notifications: true, announcements: true, reminders: true });
    // internal / other-user data never leaks
    assert.equal(sub.uid, undefined);
    assert.equal(JSON.stringify(organisations).includes(uid), false);
});

test("preferences persist, validate, and require a relationship", async () => {
    await reset();
    const uid = "g2-u2";
    await assert.rejects(updateMyOrganisationPreferences(uid, snId, { reminders: false }), (e) => e.code === "CONNECTION_NOT_FOUND");
    await applyConsumerAction(uid, snId, "follow");
    const out = await updateMyOrganisationPreferences(uid, snId, { reminders: false });
    assert.deepEqual(out.prefs, { notifications: true, announcements: true, reminders: false });
    const row = (await listMyOrganisations(uid)).organisations[0];
    assert.equal(row.prefs.reminders, false);
    await assert.rejects(updateMyOrganisationPreferences(uid, snId, { nope: true }), (e) => e.code === "PREFS_INVALID");
    await assert.rejects(updateMyOrganisationPreferences(uid, snId, { reminders: "yes" }), (e) => e.code === "PREFS_INVALID");
    await assert.rejects(updateMyOrganisationPreferences(uid, "not-an-id", {}), (e) => e.code === "SN_ID_INVALID");
});

test("business-side block is masked; suspended org stays manageable but shows no profile", async () => {
    await reset();
    const uid = "g2-u3";
    await applyConsumerAction(uid, snId, "follow");
    await applyConsumerAction(uid, otherSnId, "follow");

    const conn = (await listConnectionsForOrg("gate2-org"))[0];
    await applyBusinessAction("gate2-org", conn.connectionId, "block");
    await setOrgEntityStatus(SMILEMORE_DEMO_COMPANY_ID, "suspended", { reason: "gate2 test" });

    const { organisations } = await listMyOrganisations(uid);
    const blocked = organisations.find((o) => o.snId === otherSnId);
    assert.equal(blocked.state, "unavailable");
    assert.equal(blocked.available, false);
    assert.equal(blocked.section, "unavailable");
    assert.equal(blocked.consent, null);
    const suspended = organisations.find((o) => o.snId === snId);
    assert.equal(suspended.available, false);
    assert.equal(suspended.organisation, null);
    await assert.rejects(updateMyOrganisationPreferences(uid, otherSnId, { reminders: false }), (e) => e.code === "CONNECTION_UNAVAILABLE");
    // The user can still leave a suspended org.
    assert.equal((await applyConsumerAction(uid, snId, "unfollow")).state, "discovered");
});

test("routes: GET list, PUT preferences, auth required, catalogued", async () => {
    await reset();
    const app = express();
    app.use(express.json());
    mountNetworkConnectionRoutes(app, {
        consumerGuard: (req, _res, next) => {
            req.consumerAuth = { uid: String(req.headers["x-uid"] || "g2-api") };
            next();
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const j = (path, init = {}) =>
        fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json() }));
    try {
        assert.equal((await j("/api/network/v1/my-organisations")).body.data.counts.total, 0);
        await applyConsumerAction("g2-api", snId, "follow");
        const list = await j("/api/network/v1/my-organisations");
        assert.equal(list.body.data.organisations[0].snId, snId);
        const put = await j(`/api/network/v1/my-organisations/${snId}/preferences`, { method: "PUT", body: JSON.stringify({ prefs: { announcements: false } }) });
        assert.equal(put.status, 200);
        assert.equal(put.body.data.prefs.announcements, false);
        const bad = await j(`/api/network/v1/my-organisations/${snId}/preferences`, { method: "PUT", body: JSON.stringify({ prefs: { x: 1 } }) });
        assert.equal(bad.status, 422);
        assert.equal((await j("/api/network/v1/my-organisations", { headers: { "x-uid": "someone-else" } })).body.data.counts.total, 0);
    } finally {
        server.close();
    }
    const paths = ROUTE_CATALOG.map((r) => `${r.method} ${r.path}`);
    assert.ok(paths.includes("GET /api/network/v1/my-organisations"));
    assert.ok(paths.includes("PUT /api/network/v1/my-organisations/:snId/preferences"));

    const guarded = express();
    mountNetworkConnectionRoutes(guarded);
    const s2 = guarded.listen(0);
    try {
        const res = await fetch(`http://127.0.0.1:${s2.address().port}/api/network/v1/my-organisations`);
        assert.ok([401, 403].includes(res.status));
    } finally {
        s2.close();
    }
});

test("Sarah App wiring: live-bridge exposes the API and the panel renders from it (no localStorage in live mode)", () => {
    const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
    const bridge = read("prototype/sarah-app-ux/js/live-bridge.mjs");
    const app = read("prototype/sarah-app-ux/js/app.js");
    for (const fn of ["fetchMyOrganisations", "updateOrganisationPreferences"]) {
        assert.ok(bridge.includes("export async function " + fn), fn + " exported");
        assert.ok(new RegExp("^\\s+" + fn + ",$", "m").test(bridge), fn + " on window.SarahLive");
    }
    assert.ok(bridge.includes("/api/network/v1/my-organisations"));
    assert.ok(app.includes("function renderLiveMyOrganisations"));
    assert.ok(/if \(discoverLiveActive\(\)\) \{\s+renderLiveMyOrganisations\(root\);/.test(app), "live mode branches before the prototype/localStorage path");
    assert.ok(app.includes("window.SarahLive.fetchMyOrganisations()"));
    assert.ok(app.includes("window.SarahLive.updateOrganisationPreferences("));
});
