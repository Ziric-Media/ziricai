/**
 * Gate 6 — SNET completion run: canManageNetwork, verification evidence file refs (tenant-scoped media token).
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { hasPermission, PERMISSION_MATRIX } from "../services/auth/permissionsService.js";
import {
    clearBusinessDirectoryForTests,
    setBusinessDirectoryStoreForTests,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests } from "../services/network/networkIdentityService.js";
import { publishListing, saveListingDraft } from "../services/network/networkProfileService.js";
import {
    clearVerificationCasesForTests,
    getVerificationCase,
    getVerificationStatus,
    submitVerification,
    addVerificationEvidence,
} from "../services/network/verificationService.js";
import { clearNetworkAdminAuditForTests } from "../services/network/networkAdminAudit.js";
import { mountNetworkVerificationRoutes } from "../services/api/networkVerificationRoutes.js";
import {
    clearChatMediaForTests,
    createChatMediaUpload,
    completeChatMediaUpload,
    createScopedMediaUpload,
    consumeScopedMediaUpload,
} from "../services/users/chatMediaService.js";
import { ROUTE_CATALOG } from "../services/api/routeRegistry.js";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { clearConsentGrantsForTests, createConsentGrant } from "../services/users/consentGrantService.js";
import { ensureOrgEntity, setOrgEntityStatus } from "../services/network/networkIdentityService.js";
import { applyConsumerAction, clearNetworkConnectionsForTests, SUBSCRIBE_SCOPE } from "../services/network/connectionService.js";
import { updateMyOrganisationPreferences } from "../services/network/myOrganisationsService.js";
import { clearSubscriberEventsForTests, recordSubscriberEvent } from "../services/network/subscriberEventService.js";
import { listUpdatesForUser } from "../services/network/subscriberUpdatesService.js";
import { mountNetworkConnectionRoutes } from "../services/api/networkConnectionRoutes.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { ensureCompanyChatThread } from "../services/sarah/company/companyReceptionChatService.js";
import { clearUserConversationsForTests } from "../services/users/userConversationService.js";
import { buildConsumerConversationId } from "../services/users/identityContracts.js";
import { listFederatedChatConversations } from "../services/users/chatConversationIndexService.js";
import { attachSnIds } from "../services/network/networkIntegration.js";
import { searchDiscoverCompanies, assertCompanyDiscoverableAsync } from "../services/users/businessDirectoryService.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

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
}

/* ------------------------------------------------------------------ 1. canManageNetwork */

test("canManageNetwork: server matrix, portal matrix and module gate agree", () => {
    assert.deepEqual([...PERMISSION_MATRIX.canManageNetwork].sort(), ["manager", "owner"]);
    const portalSrc = read("js/portal/permissions.js");
    const m = portalSrc.match(/^\s{2}canManageNetwork:\s*\[([^\]]+)\]/m);
    assert.ok(m, "portal matrix defines canManageNetwork");
    const portalRoles = m[1].split(",").map((s) => s.replace(/['"]/g, "").trim()).sort();
    assert.deepEqual(portalRoles, [...PERMISSION_MATRIX.canManageNetwork].sort());
    assert.match(portalSrc, /network: 'canManageNetwork'/);
    assert.match(portalSrc, /canManageNetwork: 'Can Manage Sarah Network'/);

    for (const role of ["owner", "manager", "superadmin"]) assert.equal(hasPermission(role, "canManageNetwork"), true, role);
    for (const role of ["support", "sales", "finance", "viewer", "reception", "hr", "marketing", undefined]) {
        assert.equal(hasPermission(role, "canManageNetwork"), false, String(role));
    }
});

test("canManageNetwork: gates every tenant network write (listing, verification, connections, events) and the editor UI", () => {
    const listing = read("services/api/networkListingRoutes.js");
    assert.match(listing, /hasPermission\(req\.tenant\.role, "canManageNetwork"\)/);
    assert.match(listing, /canEdit: Boolean\(ctx\?\.role\) && hasPermission\(ctx\.role, "canManageNetwork"\)/);
    assert.ok(!/canManageWorkspace/.test(listing), "network routes no longer use canManageWorkspace");
    // verification / connections / agent routes share defaultAuthorize, so they inherit the key
    for (const f of ["networkVerificationRoutes", "networkConnectionRoutes", "networkAgentRoutes"]) {
        assert.match(read(`services/api/${f}.js`), /defaultAuthorize/, f);
    }
    const mod = read("js/portal/modules/network.js");
    assert.match(mod, /can\(state\.profile\?\.role, 'canManageNetwork'\)/);
    assert.ok(!/canManageWorkspace/.test(mod.replace(/\/\*[\s\S]*?\*\//, "")));
});

/* ------------------------------------------------------------------ 2. evidence upload */

async function evidenceApp(role = "manager") {
    const state = { role };
    const app = express();
    app.use(express.json());
    mountNetworkVerificationRoutes(app, {
        authorize: async (req, companyId, { write }) => {
            if (write && !hasPermission(state.role, "canManageNetwork")) {
                throw Object.assign(new Error("denied"), { status: 403, code: "PERMISSION_DENIED" });
            }
            req.tenant = { companyId, uid: "uid-1", role: state.role };
            return req.tenant;
        },
        platformGuard: (req, _res, next) => {
            req.platformAuth = { uid: "mc-1" };
            next();
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, method = "GET", body, headers = {}) => {
        const isRaw = Buffer.isBuffer(body);
        const res = await fetch(base + path, {
            method,
            headers: isRaw ? headers : { "content-type": "application/json", ...headers },
            body: isRaw ? body : body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json() };
    };
    return { state, call, close: () => server.close() };
}

const V = `/api/network/v1/orgs/${PROD.id}/verification`;
const PDF = Buffer.from("%PDF-1.4 fake registration certificate");

async function openCase() {
    await saveListingDraft(PROD.id, FULL, "o", deps);
    await publishListing(PROD.id, "o", deps);
    return submitVerification(PROD.id, "owner-1");
}

test("evidence upload: token → PUT → attach stores a file ref (size + sha256) on the case; MC detail lists it", async () => {
    reset();
    const kase = await openCase();
    const { call, close } = await evidenceApp();
    try {
        let r = await call(`${V}/evidence-uploads`, "POST", { mimeType: "application/pdf", fileName: "cipc.pdf", byteLength: PDF.length });
        assert.equal(r.status, 201);
        const { uploadId, token, putPath } = r.body.data;
        assert.match(uploadId, /^smed_/);
        assert.ok(token && putPath.endsWith(uploadId));

        // attach before the bytes arrive → not ready
        r = await call(`${V}/evidence`, "POST", { items: [{ kind: "registration_certificate", label: "CIPC", uploadId }] });
        assert.equal(r.status, 409);
        assert.equal(r.body.error.code, "UPLOAD_NOT_READY");

        // wrong token
        r = await call(`${putPath}?token=nope`, "PUT", PDF, { "content-type": "application/pdf" });
        assert.equal(r.status, 403);
        assert.equal(r.body.error.code, "UPLOAD_TOKEN_INVALID");

        r = await call(`${putPath}?token=${token}`, "PUT", PDF, { "content-type": "application/pdf" });
        assert.equal(r.status, 200);
        assert.equal(r.body.data.file.byteLength, PDF.length);
        assert.match(r.body.data.file.sha256, /^[0-9a-f]{64}$/);

        r = await call(`${V}/evidence`, "POST", { items: [{ kind: "registration_certificate", label: "CIPC certificate", uploadId }] });
        assert.equal(r.status, 201);
        assert.equal(r.body.data.evidence[0].file.fileName, "cipc.pdf");
        assert.equal(r.body.data.evidence[0].file.uploadId, uploadId);

        // single use
        r = await call(`${V}/evidence`, "POST", { items: [{ kind: "other", label: "again", uploadId }] });
        assert.equal(r.status, 409);
        assert.equal(r.body.error.code, "UPLOAD_ALREADY_ATTACHED");

        // tenant status + officer case detail both carry the reference; no storage keys leak
        const status = await getVerificationStatus(PROD.id);
        assert.equal(status.latestCase.evidence[0].file.byteLength, PDF.length);
        const detail = await getVerificationCase(kase.caseId);
        assert.equal(detail.evidenceRefs[0].file.sha256, status.latestCase.evidence[0].file.sha256);
        assert.ok(!JSON.stringify(detail).includes("storageKey"));
    } finally {
        close();
    }
});

test("evidence upload: submit-time attach, forged fileRef ignored, type/size/permission refused, failure releases the upload", async () => {
    reset();
    await saveListingDraft(PROD.id, FULL, "o", deps);
    await publishListing(PROD.id, "o", deps);
    const { state, call, close } = await evidenceApp();
    try {
        // wrong type
        let r = await call(`${V}/evidence-uploads`, "POST", { mimeType: "application/x-msdownload", fileName: "a.exe" });
        assert.equal(r.status, 415);
        assert.equal(r.body.error.code, "UPLOAD_TYPE_NOT_ALLOWED");
        // too large (declared)
        r = await call(`${V}/evidence-uploads`, "POST", { mimeType: "application/pdf", byteLength: 6 * 1024 * 1024 });
        assert.equal(r.status, 400);
        assert.equal(r.body.error.code, "FILE_TOO_LARGE");
        // permission
        state.role = "support";
        r = await call(`${V}/evidence-uploads`, "POST", { mimeType: "application/pdf" });
        assert.equal(r.status, 403);
        state.role = "owner";

        r = await call(`${V}/evidence-uploads`, "POST", { mimeType: "application/pdf", fileName: "doc.pdf" });
        const { uploadId, token, putPath } = r.body.data;
        r = await call(`${putPath}?token=${token}`, "PUT", PDF, { "content-type": "application/pdf" });
        assert.equal(r.status, 200);

        // evidence with no open case fails AFTER the upload was resolved → upload must be released for a retry
        r = await call(`${V}/evidence`, "POST", { items: [{ kind: "other", label: "Doc", uploadId }] });
        assert.equal(r.status, 409);
        assert.equal(r.body.error.code, "NO_OPEN_CASE");

        // forged fileRef from the client never becomes a file ref
        r = await call(V, "POST", {
            evidence: [{ kind: "other", label: "Forged", ref: "R-1", fileRef: { uploadId: "x", sha256: "f".repeat(64), mimeType: "application/pdf", byteLength: 1 } }],
        });
        assert.equal(r.status, 201);
        const forged = (await getVerificationStatus(PROD.id)).latestCase.evidence;
        assert.equal(forged[0].file, null);

        // the released upload can still be attached
        r = await call(`${V}/evidence`, "POST", { items: [{ kind: "registration_certificate", label: "Doc", uploadId }] });
        assert.equal(r.status, 201);
        assert.equal(r.body.data.evidence[0].file.uploadId, uploadId);
    } finally {
        close();
    }
});

test("evidence upload: tokens are tenant-bound and chat-media (consumer) and scoped (tenant) records cannot be mixed", async () => {
    reset();
    await openCase();
    const scope = (id) => ({ subject: `tenant:${id}`, purpose: "network_verification_evidence", allowedMimeTypes: ["application/pdf"] });
    const mine = createScopedMediaUpload(scope(PROD.id), { mimeType: "application/pdf", fileName: "a.pdf" });

    // another tenant cannot consume it
    assert.throws(() => consumeScopedMediaUpload(mine.uploadId, "tenant:other-co", "network_verification_evidence"), { code: "UPLOAD_FORBIDDEN" });
    // consumer chat-media completion refuses scoped records
    assert.throws(() => completeChatMediaUpload(mine.uploadId, "person_x", mine.token, Buffer.from("x")), { code: "UPLOAD_NOT_FOUND" });
    // and a consumer upload id is unknown to the scoped path
    const consumer = createChatMediaUpload("consumer-uid-1", { mimeType: "application/pdf" });
    assert.throws(() => consumeScopedMediaUpload(consumer.uploadId, `tenant:${PROD.id}`, "network_verification_evidence"), { code: "UPLOAD_NOT_FOUND" });
    assert.throws(() => consumeScopedMediaUpload("smed_missing", `tenant:${PROD.id}`, "network_verification_evidence"), { code: "UPLOAD_NOT_FOUND" });
    // the direct service path ignores a client-supplied fileRef too
    const res = await addVerificationEvidence(PROD.id, [
        { kind: "other", label: "Direct", ref: "R-2", fileRef: { uploadId: "u", sha256: "a".repeat(64), mimeType: "application/pdf", byteLength: 1 } },
    ]);
    assert.equal(res.evidence[0].file, null);
});

test("evidence upload routes are documented in ROUTE_CATALOG and UIs show file refs", () => {
    const keys = new Set(ROUTE_CATALOG.map((r) => `${r.method} ${r.path}`));
    assert.ok(keys.has("POST /api/network/v1/orgs/:companyId/verification/evidence-uploads"));
    assert.ok(keys.has("PUT /api/network/v1/orgs/:companyId/verification/evidence-uploads/:uploadId"));
    assert.match(read("js/portal/api.js"), /export async function uploadNetworkEvidenceFile/);
    assert.match(read("js/portal/modules/network.js"), /uploadNetworkEvidenceFile/);
    assert.match(read("js/admin/modules/sarah-network.js"), /ev\.file/);
    assert.equal(read("js/admin/modules/sarah-network.js"), read("admin/js/admin/modules/sarah-network.js"), "admin/ copy in sync");
});

/* ------------------------------------------------------------------ 4. subscriber updates (pull) */

const tick = () => new Promise((r) => setTimeout(r, 8));

async function updatesSetup() {
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
        return g;
    };
    return { snId, subscribe };
}

test("updates feed: subscribers see events from their subscription start; followers, prefs, back-reading and leaks are handled", async () => {
    const { snId, subscribe } = await updatesSetup();
    await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "announcement", title: "Before anyone subscribed" });
    await tick();
    await subscribe("g6-sub");
    await subscribe("g6-quiet");
    await applyConsumerAction("g6-follower", snId, "follow");
    await tick();
    await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "announcement", title: "New hours", body: "Open until 18:00" }, "member:owner-uid");
    await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "reminder", title: "Check-up due" });
    await updateMyOrganisationPreferences("g6-quiet", snId, { reminders: false });

    const feed = await listUpdatesForUser("g6-sub");
    assert.equal(feed.delivery, "pull");
    assert.equal(feed.organisations, 1);
    assert.deepEqual(feed.updates.map((u) => u.title).sort(), ["Check-up due", "New hours"], "no events from before the subscription");
    assert.equal(feed.updates[0].snId, snId);
    assert.ok(feed.updates[0].organisation.displayName);
    const raw = JSON.stringify(feed);
    for (const leak of [SMILEMORE_DEMO_COMPANY_ID, "owner-uid", "createdBy", "audience", "g6-quiet"]) assert.equal(raw.includes(leak), false, `no ${leak} in the feed`);

    assert.deepEqual((await listUpdatesForUser("g6-quiet")).updates.map((u) => u.title), ["New hours"], "reminders channel switched off");
    assert.equal((await listUpdatesForUser("g6-follower")).updates.length, 0, "following is not subscribing");
    assert.equal((await listUpdatesForUser("g6-nobody")).updates.length, 0);

    // unsubscribe → feed empties; re-subscribe does not resurrect old events
    await applyConsumerAction("g6-sub", snId, "unsubscribe");
    assert.equal((await listUpdatesForUser("g6-sub")).updates.length, 0);
    await tick();
    await subscribe("g6-sub").catch(() => null);
    assert.deepEqual((await listUpdatesForUser("g6-sub")).updates, [], "old events stay hidden after re-subscribing");

    // suspended organisation contributes nothing
    await setOrgEntityStatus(SMILEMORE_DEMO_COMPANY_ID, "suspended", { reason: "gate6" });
    assert.equal((await listUpdatesForUser("g6-quiet")).updates.length, 0);
});

test("updates feed: consumer route, auth seam and catalogue", async () => {
    const { subscribe } = await updatesSetup();
    await subscribe("g6-route");
    await tick();
    await recordSubscriberEvent(SMILEMORE_DEMO_COMPANY_ID, { type: "notification", title: "Hello subscribers" });
    const app = express();
    app.use(express.json());
    mountNetworkConnectionRoutes(app, {
        consumerGuard: (req, res, next) => {
            if (!req.headers["x-uid"]) return res.status(401).json({ ok: false, error: { code: "AUTH_REQUIRED" } });
            req.consumerAuth = { uid: String(req.headers["x-uid"]) };
            next();
        },
        authorize: async () => ({ uid: "m" }),
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        let res = await fetch(`${base}/api/network/v1/my-updates`);
        assert.equal(res.status, 401);
        res = await fetch(`${base}/api/network/v1/my-updates?limit=5`, { headers: { "x-uid": "g6-route" } });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.data.updates[0].title, "Hello subscribers");
        res = await fetch(`${base}/api/network/v1/my-updates`, { headers: { "x-uid": "someone-else" } });
        assert.deepEqual((await res.json()).data.updates, []);
    } finally {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
    assert.ok(ROUTE_CATALOG.some((r) => r.method === "GET" && r.path === "/api/network/v1/my-updates"));
});
test("Sarah App: live bridge exposes fetchMyUpdates and My Organisations renders updates best-effort", () => {
    const bridge = read("prototype/sarah-app-ux/js/live-bridge.mjs");
    const app = read("prototype/sarah-app-ux/js/app.js");
    assert.match(bridge, /export async function fetchMyUpdates/);
    assert.match(bridge, /\/api\/network\/v1\/my-updates/);
    assert.match(app, /window\.SarahLive\.fetchMyUpdates/);
    assert.match(app, /id="msOrgUpdates"/);
    assert.ok(!/window\.prompt/.test(app.slice(app.indexOf("Gate 2: My Organisations backed"))));
});
/* ------------------------------------------------------------------ 5. Central Motors chat id alignment */

test("Central Motors (central-motors-rtb): Discover id, company chat id, chat-list row and snId all align (allow-listed)", async () => {
    const KEY = "SARAH_NETWORK_PILOT_COMPANY_IDS";
    const saved = process.env[KEY];
    process.env[KEY] = `smilemore-demo,${CENTRAL_MOTORS_RTB_COMPANY_ID}`;
    setBusinessDirectoryStoreForTests(null);
    clearNetworkEntitiesForTests();
    clearBusinessDirectoryForTests();
    clearUserConversationsForTests();
    try {
        const { companies } = await searchDiscoverCompanies({ q: "central motors" });
        const card = companies.find((c) => c.companyId === CENTRAL_MOTORS_RTB_COMPANY_ID);
        assert.ok(card, "listed in Discover");
        assert.equal(card.verified, false);
        await assertCompanyDiscoverableAsync(CENTRAL_MOTORS_RTB_COMPANY_ID);

        const uid = "g6-cm-user";
        const { conversation, messages } = await ensureCompanyChatThread(uid, CENTRAL_MOTORS_RTB_COMPANY_ID, { firstName: "Thandi" });
        // the thread is keyed by the Discover card's companyId, deterministically, and carries the directory name
        assert.equal(conversation.companyId, card.companyId);
        assert.equal(conversation.id, buildConsumerConversationId(uid, CENTRAL_MOTORS_RTB_COMPANY_ID));
        assert.equal(conversation.companyName, "Central Motors Rustenburg");
        assert.ok(messages.length >= 1, "greeting present");
        // opening again returns the same thread (no duplicate chat for the same company)
        const again = await ensureCompanyChatThread(uid, CENTRAL_MOTORS_RTB_COMPANY_ID, {});
        assert.equal(again.conversation.id, conversation.id);

        const rows = listFederatedChatConversations(uid, { filter: "businesses" });
        assert.equal(rows.length, 1);
        assert.equal(rows[0].listKey, `business:${CENTRAL_MOTORS_RTB_COMPANY_ID}`);
        const [withSn] = await attachSnIds(rows);
        assert.equal(withSn.snId, card.snId, "chat row snId equals the Discover card snId");

        // the fixture id still never produces a thread
        await assert.rejects(() => ensureCompanyChatThread(uid, "central-motors", {}), { code: "COMPANY_NOT_DISCOVERABLE" });
        assert.equal(listFederatedChatConversations(uid, { filter: "businesses" }).length, 1);
    } finally {
        if (saved === undefined) delete process.env[KEY];
        else process.env[KEY] = saved;
        setBusinessDirectoryStoreForTests(null);
        clearNetworkEntitiesForTests();
        clearBusinessDirectoryForTests();
        clearUserConversationsForTests();
    }
});