/**
 * SNET-07 — relationships MVP: discover ≠ subscribe; subscribe/connect are consent-linked; business-side block;
 * pseudonymous business view; durability.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { clearConsentGrantsForTests, createConsentGrant, dropConsentGrantCacheForTests, revokeConsentGrant } from "../services/users/consentGrantService.js";
import { clearSarahNetworkStoreForTests } from "../services/sarah/network/sarahNetworkStore.js";
import { resetSarahNetworkRateLimitsForTests, submitPersonalToCompanyEnquiry } from "../services/sarah/network/sarahNetworkService.js";
import { clearNetworkChatLinksForTests } from "../services/users/sarahNetworkChatLinkService.js";
import { flushNetworkWrites } from "../services/network/networkWriteQueue.js";
import {
    clearBusinessDirectoryForTests,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests, ensureOrgEntity, setOrgEntityStatus } from "../services/network/networkIdentityService.js";
import { invalidateDirectoryEntity } from "../services/users/businessDirectoryService.js";
import {
    applyBusinessAction,
    applyConsumerAction,
    clearNetworkConnectionsForTests,
    CONNECT_SCOPE,
    getConnectionStatus,
    listConnectionsForOrg,
    listConnectionsForUser,
    SUBSCRIBE_SCOPE,
} from "../services/network/connectionService.js";
import { mintSnId } from "../services/network/snId.js";
import { mountNetworkConnectionRoutes } from "../services/api/networkConnectionRoutes.js";

const tick = () => new Promise((r) => setImmediate(r));
let snId;
let hiddenSnId;

async function reset() {
    clearConsentGrantsForTests();
    clearSarahNetworkStoreForTests();
    clearNetworkChatLinksForTests();
    clearNetworkEntitiesForTests();
    clearNetworkConnectionsForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    resetSarahNetworkRateLimitsForTests();
    upsertBusinessDirectoryEntry("hidden-1", { discoverability: "hidden", displayName: "Hidden", industry: "x", location: "y", shortDescription: "z" });
    await tick();
    snId = (await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID)).snId;
    hiddenSnId = (await ensureOrgEntity("hidden-1")).snId;
}

const act = (uid, action, grantId, id = snId) => applyConsumerAction(uid, id, action, { grantId });
const grant = (uid, scope) => createConsentGrant(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID, snId, scope });

test("no relationship until the user acts; discover/follow need no consent and share nothing", async () => {
    await reset();
    const uid = "u1";
    assert.deepEqual(await getConnectionStatus(uid, snId), { snId, state: "none" });
    assert.deepEqual(await listConnectionsForUser(uid), []);

    assert.equal((await act(uid, "discover")).state, "discovered");
    assert.equal((await act(uid, "discover")).state, "discovered", "idempotent");
    const followed = await act(uid, "follow");
    assert.equal(followed.state, "following");
    assert.equal(followed.consent, null);
    assert.equal((await act(uid, "follow")).state, "following");
    assert.equal((await act(uid, "unfollow")).state, "discovered");
    assert.equal((await listConnectionsForOrg(SMILEMORE_DEMO_COMPANY_ID)).length, 1);
});

test("subscribe is consent-linked: needs a matching, active, entity-scoped grant", async () => {
    await reset();
    const uid = "u2";
    await assert.rejects(() => act(uid, "subscribe"), { code: "GRANT_REQUIRED" });
    await assert.rejects(() => act(uid, "subscribe", grant(uid, "sarah_network_enquiry").grantId), { code: "GRANT_SCOPE_MISMATCH" });
    await assert.rejects(() => act(uid, "subscribe", grant("someone-else", SUBSCRIBE_SCOPE).grantId), { code: "GRANT_FORBIDDEN" });
    const other = createConsentGrant(uid, { companyId: "another-co", scope: SUBSCRIBE_SCOPE });
    await assert.rejects(() => act(uid, "subscribe", other.grantId), { code: "GRANT_COMPANY_MISMATCH" });

    const g = grant(uid, SUBSCRIBE_SCOPE);
    assert.ok(new Date(g.expiresAt).getTime() - Date.now() > 300 * 24 * 3600 * 1000, "standing grants last long");
    const sub = await act(uid, "subscribe", g.grantId);
    assert.equal(sub.state, "subscribed");
    assert.equal(sub.consent.grantId, g.grantId);

    assert.equal((await act(uid, "unsubscribe")).state, "following");
    assert.equal((await getConnectionStatus(uid, snId)).consent, null);
});

test("revoking the grant drops subscribed/connected to following (also after restart)", async () => {
    await reset();
    const uid = "u3";
    const g = grant(uid, SUBSCRIBE_SCOPE);
    await act(uid, "subscribe", g.grantId);
    await flushNetworkWrites();
    dropConsentGrantCacheForTests();
    assert.equal((await getConnectionStatus(uid, snId)).state, "subscribed", "survives restart");
    await revokeConsentGrant(uid, g.grantId);
    dropConsentGrantCacheForTests();
    assert.equal((await getConnectionStatus(uid, snId)).state, "following");
    assert.equal((await listConnectionsForUser(uid))[0].state, "following");
});

test("connect flow: request (consent) → business accept → connected → disconnect", async () => {
    await reset();
    const uid = "u4";
    const g = grant(uid, CONNECT_SCOPE);
    assert.equal((await act(uid, "request_connection", g.grantId)).state, "connect_requested");

    const [row] = await listConnectionsForOrg(SMILEMORE_DEMO_COMPANY_ID, { state: "connect_requested" });
    assert.ok(row.connectionId.startsWith("conn_"));
    assert.equal(row.scope, CONNECT_SCOPE);
    assert.ok(!JSON.stringify(row).includes(uid), "business view is pseudonymous");
    assert.ok(!("uid" in row) && !("grantId" in row) && !("consentGrantId" in row));

    await assert.rejects(() => applyBusinessAction("some-other-company", row.connectionId, "accept"), { code: "CONNECTION_NOT_FOUND" });
    assert.equal((await applyBusinessAction(SMILEMORE_DEMO_COMPANY_ID, row.connectionId, "accept")).state, "connected");
    assert.equal((await getConnectionStatus(uid, snId)).state, "connected");
    await assert.rejects(() => act(uid, "unfollow"), { code: "CONNECTION_STATE_INVALID" });
    await assert.rejects(() => applyBusinessAction(SMILEMORE_DEMO_COMPANY_ID, row.connectionId, "accept"), { code: "CONNECTION_STATE_INVALID" });

    assert.equal((await act(uid, "disconnect")).state, "following");

    // decline + cancel paths
    const g2 = grant(uid, CONNECT_SCOPE);
    await act(uid, "request_connection", g2.grantId);
    assert.equal((await applyBusinessAction(SMILEMORE_DEMO_COMPANY_ID, row.connectionId, "decline")).state, "following");
    const g3 = grant(uid, CONNECT_SCOPE);
    await act(uid, "request_connection", g3.grantId);
    assert.equal((await act(uid, "cancel_request")).state, "following");
});

test("business block is invisible to the user, sticky, and stops enquiries; unblock restores", async () => {
    await reset();
    const uid = "u5";
    await act(uid, "follow");
    const [row] = await listConnectionsForOrg(SMILEMORE_DEMO_COMPANY_ID);
    const eg = createConsentGrant(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID, snId });

    assert.equal((await applyBusinessAction(SMILEMORE_DEMO_COMPANY_ID, row.connectionId, "block")).blockedBy, "business");
    assert.equal((await getConnectionStatus(uid, snId)).state, "unavailable", "user is not told they were blocked");
    await assert.rejects(() => act(uid, "follow"), { code: "CONNECTION_UNAVAILABLE" });
    await assert.rejects(() => act(uid, "unblock"), { code: "CONNECTION_UNAVAILABLE" });
    await assert.rejects(
        () => submitPersonalToCompanyEnquiry(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID, grantId: eg.grantId, naturalLanguage: "hi" }),
        { code: "CONNECTION_UNAVAILABLE" }
    );

    // another user is unaffected
    const eg2 = createConsentGrant("u5b", { companyId: SMILEMORE_DEMO_COMPANY_ID, snId });
    const ok = await submitPersonalToCompanyEnquiry("u5b", { companyId: SMILEMORE_DEMO_COMPANY_ID, grantId: eg2.grantId, naturalLanguage: "hi" });
    assert.ok(ok.requestId);

    assert.equal((await applyBusinessAction(SMILEMORE_DEMO_COMPANY_ID, row.connectionId, "unblock")).state, "discovered");
    assert.equal((await act(uid, "follow")).state, "following");
});

test("user block: only unblock allowed; clears consent", async () => {
    await reset();
    const uid = "u6";
    await act(uid, "subscribe", grant(uid, SUBSCRIBE_SCOPE).grantId);
    const blocked = await act(uid, "block");
    assert.equal(blocked.state, "blocked");
    assert.equal(blocked.consent, null);
    assert.equal((await act(uid, "block")).state, "blocked", "idempotent");
    await assert.rejects(() => act(uid, "follow"), { code: "CONNECTION_BLOCKED" });
    const [row] = await listConnectionsForOrg(SMILEMORE_DEMO_COMPANY_ID);
    await assert.rejects(() => applyBusinessAction(SMILEMORE_DEMO_COMPANY_ID, row.connectionId, "unblock"), { code: "CONNECTION_STATE_INVALID" });
    assert.equal((await act(uid, "unblock")).state, "discovered");
});

test("creating a relationship requires a listed, non-suspended org; leaving always works", async () => {
    await reset();
    const uid = "u7";
    await assert.rejects(() => act(uid, "follow", undefined, hiddenSnId), { code: "COMPANY_NOT_DISCOVERABLE" });
    await assert.rejects(() => act(uid, "follow", undefined, mintSnId("org")), { code: "ENTITY_NOT_FOUND" });
    await assert.rejects(() => act(uid, "follow", undefined, "sn_biz_0000000000000000"), { code: "SN_ID_INVALID" });
    await assert.rejects(() => act(uid, "teleport"), { code: "CONNECTION_ACTION_INVALID" });

    await act(uid, "follow");
    await setOrgEntityStatus(SMILEMORE_DEMO_COMPANY_ID, "suspended", { reason: "t", actor: "t" });
    invalidateDirectoryEntity(SMILEMORE_DEMO_COMPANY_ID);
    await assert.rejects(() => act(uid, "subscribe", grant(uid, SUBSCRIBE_SCOPE).grantId), (e) => e.status === 404 || e.status === 403);
    assert.equal((await act(uid, "unfollow")).state, "discovered", "users can always leave");
});

test("API: consumer + tenant routes", async () => {
    await reset();
    const app = express();
    app.use(express.json());
    mountNetworkConnectionRoutes(app, {
        consumerGuard: (req, _res, next) => {
            req.consumerAuth = { uid: String(req.headers["x-uid"] || "api-user") };
            next();
        },
        authorize: async (req, companyId, { write }) => {
            if (req.headers["x-role"] === "agent" && write) throw Object.assign(new Error("no"), { status: 403, code: "PERMISSION_DENIED" });
            return { uid: "member-1", companyId };
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const j = (path, init = {}) =>
        fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const post = (body, headers) => j("/api/network/v1/connections", { method: "POST", body: JSON.stringify(body), headers });
    try {
        assert.equal((await j(`/api/network/v1/connections/${snId}`)).body.data.connection.state, "none");
        assert.equal((await post({ snId, action: "follow" })).body.data.connection.state, "following");
        assert.equal((await post({ snId, action: "subscribe" })).status, 403);
        const g = grant("api-user", CONNECT_SCOPE);
        assert.equal((await post({ snId, action: "request_connection", grantId: g.grantId })).body.data.connection.state, "connect_requested");
        assert.equal((await j("/api/network/v1/connections?state=connect_requested")).body.data.connections.length, 1);
        assert.equal((await j("/api/network/v1/connections", { headers: { "x-uid": "nobody" } })).body.data.connections.length, 0);

        const org = await j(`/api/network/v1/orgs/${SMILEMORE_DEMO_COMPANY_ID}/connections`);
        const id = org.body.data.connections[0].connectionId;
        assert.equal((await j(`/api/network/v1/orgs/${SMILEMORE_DEMO_COMPANY_ID}/connections/${id}/accept`, { method: "POST", headers: { "x-role": "agent" } })).status, 403);
        const acc = await j(`/api/network/v1/orgs/${SMILEMORE_DEMO_COMPANY_ID}/connections/${id}/accept`, { method: "POST" });
        assert.equal(acc.body.data.connection.state, "connected");
        assert.equal((await j(`/api/network/v1/orgs/${SMILEMORE_DEMO_COMPANY_ID}/connections/${id}/explode`, { method: "POST" })).status, 422);
    } finally {
        server.close();
    }
});

test("routes require consumer auth by default", async () => {
    const app = express();
    mountNetworkConnectionRoutes(app);
    const server = app.listen(0);
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/network/v1/connections`);
        assert.ok([401, 403].includes(res.status));
    } finally {
        server.close();
    }
});
