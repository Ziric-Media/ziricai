/**
 * Gate 5 — SNET crumbs: durable search stats, subscriber notification stub (event log only),
 * server-side hard block of demo/test/acceptance tenants from the public directory.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { clearConsentGrantsForTests, createConsentGrant } from "../services/users/consentGrantService.js";
import {
    assertCompanyDiscoverable,
    clearBusinessDirectoryForTests,
    searchDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests, ensureOrgEntity, setOrgEntityStatus } from "../services/network/networkIdentityService.js";
import { applyConsumerAction, clearNetworkConnectionsForTests, SUBSCRIBE_SCOPE } from "../services/network/connectionService.js";
import { updateMyOrganisationPreferences } from "../services/network/myOrganisationsService.js";
import {
    flushSearchStats,
    getDurableSearchStats,
    getSearchStats,
    recordSearch,
    resetSearchStatsForTests,
    simulateSearchStatsRestartForTests,
} from "../services/network/networkSearchStats.js";
import { getNetworkStats } from "../services/network/networkPlatformService.js";
import {
    clearSubscriberEventsForTests,
    listSubscriberEvents,
    recordSubscriberEvent,
    SUBSCRIBER_EVENTS_PER_DAY,
} from "../services/network/subscriberEventService.js";
import { isHardBlockedFromPublicDirectory } from "../services/network/networkEligibility.js";
import { mountNetworkConnectionRoutes } from "../services/api/networkConnectionRoutes.js";
import { ROUTE_CATALOG } from "../services/api/routeRegistry.js";
import { CLIENT_ZERO_COMPANY_IDS } from "../services/clientZero/clientZero.js";

const tick = () => new Promise((r) => setImmediate(r));

test("search stats survive a restart (daily durable counters) and never store personal-looking queries", async () => {
    resetSearchStatsForTests();
    recordSearch({ q: "Submarine Periscope", resultCount: 0 });
    recordSearch({ q: "submarine periscope", resultCount: 0 });
    recordSearch({ q: "dentist", resultCount: 3 });
    recordSearch({ q: "jane@example.com", resultCount: 0 });
    recordSearch({ q: "0821234567", resultCount: 0 });
    recordSearch({ q: "a.b/c", resultCount: 0 });
    recordSearch({ q: "", category: "dental", resultCount: 2 });
    assert.equal((await flushSearchStats()).flushed, 7);
    assert.equal((await flushSearchStats()).flushed, 0, "nothing pending");

    simulateSearchStatsRestartForTests();
    assert.equal(getSearchStats().total, 0, "in-process counters reset on restart");

    const durable = await getDurableSearchStats({ days: 3 });
    assert.equal(durable.scope, "durable_daily");
    assert.equal(durable.total, 7);
    assert.equal(durable.withQuery, 6);
    assert.equal(durable.zeroResults, 5);
    const top = Object.fromEntries(durable.topZeroResultQueries.map((r) => [r.q, r.count]));
    assert.equal(top["submarine periscope"], 2);
    assert.equal(top["a b c"], 1, "path separators sanitised for Firestore map keys");
    assert.equal(JSON.stringify(durable).includes("example.com"), false);
    assert.equal(JSON.stringify(durable).includes("0821234567"), false);
    assert.equal(durable.perDay.length, 1);

    // new traffic after the restart adds to the same day
    recordSearch({ q: "submarine periscope", resultCount: 0 });
    const after = await getDurableSearchStats();
    assert.equal(after.total, 8);
    assert.equal(after.topZeroResultQueries.find((r) => r.q === "submarine periscope").count, 3);
});

test("platform stats expose the durable search block next to the in-process one", async () => {
    resetSearchStatsForTests();
    clearNetworkEntitiesForTests();
    clearNetworkConnectionsForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    recordSearch({ q: "nothing here", resultCount: 0 });
    const s = await getNetworkStats();
    assert.equal(s.search.scope, "in_process_since_restart");
    assert.equal(s.search.durable.scope, "durable_daily");
    assert.equal(s.search.durable.zeroResults, 1);
});

async function subscriberSetup() {
    clearConsentGrantsForTests();
    clearNetworkEntitiesForTests();
    clearNetworkConnectionsForTests();
    clearSubscriberEventsForTests();
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

test("subscriber events: audience counts honour channel prefs, validation, rate limit", async () => {
    const { snId, subscribe } = await subscriberSetup();
    await subscribe("g5-u1");
    await subscribe("g5-u2");
    await subscribe("g5-u3");
    await applyConsumerAction("g5-u4", snId, "follow"); // follower, not a subscriber
    await updateMyOrganisationPreferences("g5-u3", snId, { reminders: false });

    const evt = await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "reminder", title: "Check-up due", body: "Book your six-month visit." }, "member:owner");
    // Phase 2.0: eligible subscribers (u1, u2) get an in-app notification; u3 muted reminders; the follower is not a subscriber.
    assert.equal(evt.status, "delivered_in_app");
    assert.equal(evt.delivered, 2);
    assert.deepEqual(evt.audience, { subscribers: 3, wouldReceive: 2 }, "u3 turned reminders off; follower excluded");
    assert.equal(evt.channel, "reminders");
    assert.equal(evt.createdBy, "member:owner");
    const raw = JSON.stringify(evt);
    for (const uid of ["g5-u1", "g5-u2", "g5-u3", "g5-u4"]) assert.equal(raw.includes(uid), false, "no recipient identifiers in the log");

    const ann = await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "announcement", title: "New hours" });
    assert.deepEqual(ann.audience, { subscribers: 3, wouldReceive: 3 });
    assert.equal((await listSubscriberEvents(SMILEMORE_DEMO_COMPANY_ID)).length, 2);

    await assert.rejects(recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "spam", title: "x" }), (e) => e.code === "SUBSCRIBER_EVENT_TYPE_INVALID");
    await assert.rejects(recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "announcement", title: "" }), (e) => e.code === "SUBSCRIBER_EVENT_INVALID");
    await assert.rejects(recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "announcement", title: "x", body: "y".repeat(1001) }), (e) => e.code === "SUBSCRIBER_EVENT_INVALID");
    await assert.rejects(recordSubscriberEvent("no-such-company", { type: "announcement", title: "x" }), (e) => e.code === "ENTITY_NOT_FOUND");

    for (let i = 0; i < SUBSCRIBER_EVENTS_PER_DAY - 2; i++) await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "notification", title: `n${i}` });
    await assert.rejects(recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "notification", title: "one too many" }), (e) => e.status === 429);

    await setOrgEntityStatus(SMILEMORE_DEMO_COMPANY_ID, "suspended", { reason: "gate5" });
    await assert.rejects(recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "announcement", title: "x" }), (e) => e.code === "ENTITY_SUSPENDED");
});

test("subscriber events: tenant routes enforce write permission and are catalogued", async () => {
    await subscriberSetup();
    const app = express();
    app.use(express.json());
    mountNetworkConnectionRoutes(app, {
        consumerGuard: (_req, _res, next) => next(),
        authorize: async (req, companyId, { write }) => {
            if (req.headers["x-role"] === "agent" && write) throw Object.assign(new Error("no"), { status: 403, code: "PERMISSION_DENIED" });
            return { uid: "member-1", companyId };
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const j = (path, init = {}) =>
        fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const url = `/api/network/v1/orgs/${SMILEMORE_DEMO_COMPANY_ID}/subscriber-events`;
    try {
        const created = await j(url, { method: "POST", body: JSON.stringify({ type: "announcement", title: "Hello" }) });
        assert.equal(created.status, 201);
        assert.equal(created.body.data.event.status, "logged_only");
        assert.equal(created.body.data.event.createdBy, "member:member-1");
        assert.equal((await j(url, { method: "POST", headers: { "x-role": "agent" }, body: JSON.stringify({ type: "announcement", title: "Nope" }) })).status, 403);
        assert.equal((await j(url, { method: "POST", body: JSON.stringify({ type: "bad", title: "x" }) })).status, 422);
        const list = await j(url, { headers: { "x-role": "agent" } });
        assert.equal(list.status, 200, "members can read");
        assert.equal(list.body.data.delivery, "in_app");
        assert.equal(list.body.data.events.length, 1);
    } finally {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
    const paths = ROUTE_CATALOG.map((r) => `${r.method} ${r.path}`);
    assert.ok(paths.includes("GET /api/network/v1/orgs/:companyId/subscriber-events"));
    assert.ok(paths.includes("POST /api/network/v1/orgs/:companyId/subscriber-events"));
});

test("server-side block: demo / test / acceptance tenants are removed from the public directory even if a stored entry says public", async () => {
    setBusinessDirectoryStoreForTests(null);
    clearNetworkEntitiesForTests();
    clearBusinessDirectoryForTests();
    const shape = { discoverability: "public", industry: "x", location: "y", shortDescription: "z" };
    upsertBusinessDirectoryEntry("demo-central-motors", { ...shape, displayName: "Demo Central Motors" });
    upsertBusinessDirectoryEntry("e2e-test-co", { ...shape, displayName: "E2E Test Co" });
    upsertBusinessDirectoryEntry("acceptance-co-1", { ...shape, displayName: "Acceptance Co" });
    upsertBusinessDirectoryEntry("real-cafe", { ...shape, displayName: "Green Haven Cafe" }); // UNKNOWN class: still listed
    upsertBusinessDirectoryEntry("ziricai", { ...shape, displayName: "ZiricAI" }); // Client Zero: never broken
    await tick();

    const hardBlocked = (id, name) => isHardBlockedFromPublicDirectory(id, name);
    assert.equal(hardBlocked("demo-central-motors", "Demo Central Motors"), true);
    assert.equal(hardBlocked("real-cafe", "Green Haven Cafe"), false, "UNKNOWN is gated at publish time, not here");
    for (const id of CLIENT_ZERO_COMPANY_IDS) assert.equal(hardBlocked(id, id), false, `Client Zero ${id}`);
    assert.equal(hardBlocked(SMILEMORE_DEMO_COMPANY_ID, "SmileMore Dentists"), false);

    const ids = new Set((await searchDiscoverCompanies({})).companies.map((c) => c.companyId));
    for (const blocked of ["demo-central-motors", "e2e-test-co", "acceptance-co-1"]) assert.equal(ids.has(blocked), false, blocked);
    assert.equal(ids.has("real-cafe"), true);
    assert.equal(ids.has("ziricai"), true, "Client Zero listing unaffected");
    assert.equal(ids.has(SMILEMORE_DEMO_COMPANY_ID), true);

    for (const blocked of ["demo-central-motors", "e2e-test-co"]) {
        assert.throws(() => assertCompanyDiscoverable(blocked), (e) => e.code === "COMPANY_NOT_DISCOVERABLE", blocked);
    }
    assert.doesNotThrow(() => assertCompanyDiscoverable("real-cafe"));

    // an operator allow-list always wins (explicit decision)
    const saved = process.env.SARAH_NETWORK_PILOT_COMPANY_IDS;
    process.env.SARAH_NETWORK_PILOT_COMPANY_IDS = `${SMILEMORE_DEMO_COMPANY_ID},demo-central-motors`;
    try {
        assert.equal(hardBlocked("demo-central-motors", "Demo Central Motors"), false);
    } finally {
        if (saved === undefined) delete process.env.SARAH_NETWORK_PILOT_COMPANY_IDS;
        else process.env.SARAH_NETWORK_PILOT_COMPANY_IDS = saved;
    }
});
