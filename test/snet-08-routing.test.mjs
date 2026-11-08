/**
 * SNET-08 — routing durability: federated chat index rebuilds from the durable store; Central Motors fixture id fails
 * closed; route catalog documents every mounted network/consumer route.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { clearUserConversationsForTests, getUserConversationMessages, listUserConversations, openUserConversation } from "../services/users/userConversationService.js";
import { clearNetworkChatLinksForTests, getNetworkChatMessages, listNetworkLinkedConversations } from "../services/users/sarahNetworkChatLinkService.js";
import {
    hydrateFederatedChatIndex,
    listFederatedChatConversationsAsync,
    resetFederatedHydrationForTests,
} from "../services/users/chatConversationIndexService.js";
import { personIdFromUserId } from "../services/users/identityContracts.js";
import { CONVERSATION_TYPES } from "../services/users/messagingContracts.js";
import { clearBusinessDirectoryForTests, assertCompanyDiscoverableAsync, setBusinessDirectoryStoreForTests } from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests } from "../services/network/networkIdentityService.js";
import { ensureCompanyChatThread } from "../services/sarah/company/companyReceptionChatService.js";
import { clearConsentGrantsForTests, createConsentGrant } from "../services/users/consentGrantService.js";
import { resetSarahNetworkRateLimitsForTests, submitPersonalToCompanyEnquiry } from "../services/sarah/network/sarahNetworkService.js";
import { clearSarahNetworkStoreForTests } from "../services/sarah/network/sarahNetworkStore.js";
import { ROUTE_CATALOG } from "../services/api/routeRegistry.js";
import { mountNetworkEntityRoutes } from "../services/api/networkEntityRoutes.js";
import { mountNetworkListingRoutes } from "../services/api/networkListingRoutes.js";
import { mountNetworkVerificationRoutes } from "../services/api/networkVerificationRoutes.js";
import { mountNetworkSearchRoutes } from "../services/api/networkSearchRoutes.js";
import { mountNetworkAgentRoutes } from "../services/api/networkAgentRoutes.js";
import { mountNetworkConnectionRoutes } from "../services/api/networkConnectionRoutes.js";
import { mountNetworkPlatformRoutes } from "../services/api/networkPlatformRoutes.js";
import { mountNetworkTrustRoutes } from "../services/api/networkTrustRoutes.js";
import { mountSarahNetworkRoutes } from "../services/api/sarahNetworkRoutes.js";
import { mountChatIndexRoutes } from "../services/api/chatIndexRoutes.js";
import { mountUserConversationRoutes } from "../services/api/userConversationRoutes.js";

function reset() {
    clearUserConversationsForTests();
    clearNetworkChatLinksForTests();
    resetFederatedHydrationForTests();
    clearConsentGrantsForTests();
    clearSarahNetworkStoreForTests();
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    resetSarahNetworkRateLimitsForTests();
}

const now = (offsetMin = 0) => new Date(Date.now() + offsetMin * 60000).toISOString();

function fakeStore(convs, messages = {}) {
    const calls = { list: 0, messages: 0 };
    return {
        calls,
        async listConversationsByUserId() {
            calls.list += 1;
            return convs;
        },
        async listMessages(id) {
            calls.messages += 1;
            return messages[id] || [];
        },
    };
}

const uid = "u-hydrate";
const bizConv = {
    id: "cv_biz_1",
    userId: uid,
    personId: personIdFromUserId(uid),
    companyId: SMILEMORE_DEMO_COMPANY_ID,
    companyName: "SmileMore Dentists",
    type: CONVERSATION_TYPES.PERSON_TO_BUSINESS,
    lastMessageAt: now(-5),
    preview: "Hello",
    createdAt: now(-10),
};
const netConv = {
    id: "cv_x_net_req_abc123",
    userId: uid,
    personId: personIdFromUserId(uid),
    companyId: SMILEMORE_DEMO_COMPANY_ID,
    companyName: "SmileMore Dentists",
    type: CONVERSATION_TYPES.AI_TO_AI,
    networkRequestId: "req_abc123",
    lastMessageAt: now(-1),
    preview: "Whitening costs…",
    createdAt: now(-2),
};
const msgs = {
    cv_biz_1: [{ id: "m1", role: "user", content: "Hello", createdAt: now(-5) }],
    cv_x_net_req_abc123: [
        { id: "n1", role: "user", content: "Do you do whitening?", createdAt: now(-2) },
        { id: "n2", role: "assistant", content: "Yes", createdAt: now(-1) },
    ],
};

test("index rebuilds business + network threads (with messages) from the durable store after a restart", async () => {
    reset();
    assert.deepEqual(listUserConversations(uid), [], "cold process: nothing in memory");
    const store = fakeStore([netConv, bizConv], msgs);
    const items = await listFederatedChatConversationsAsync(uid, {}, { enabled: true, store });
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((i) => i.conversationKind), ["ai_to_ai", "person_to_business"], "newest first");
    assert.equal(getUserConversationMessages("cv_biz_1").length, 1);
    assert.deepEqual(getNetworkChatMessages("cv_x_net_req_abc123").map((m) => m.content), ["Do you do whitening?", "Yes"]);
    assert.equal(listNetworkLinkedConversations(uid)[0].networkRequestId, "req_abc123");
});

test("hydration never overwrites live state, is rate-limited per user, and is a no-op when disabled", async () => {
    reset();
    await openUserConversation(uid, SMILEMORE_DEMO_COMPANY_ID, { companyName: "LIVE", preview: "live" });
    const store = fakeStore([bizConv], msgs);
    const first = await hydrateFederatedChatIndex(uid, { enabled: true, store });
    assert.equal(first.hydrated, 0, "live conversation kept");
    assert.equal(listUserConversations(uid)[0].companyName, "LIVE");
    assert.equal(store.calls.messages, 0, "no message reads for threads already in memory");

    assert.equal((await hydrateFederatedChatIndex(uid, { enabled: true, store })).skipped, "fresh");
    assert.equal(store.calls.list, 1);
    assert.equal((await hydrateFederatedChatIndex(uid, { enabled: true, store, force: true })).skipped, undefined);
    assert.equal(store.calls.list, 2);

    assert.deepEqual(await hydrateFederatedChatIndex(uid, { enabled: false, store }), { hydrated: 0, skipped: "disabled" });
    assert.deepEqual(await hydrateFederatedChatIndex(uid), { hydrated: 0, skipped: "disabled" }, "memory mode default");
});

test("store failure degrades to the in-memory index instead of failing the request", async () => {
    reset();
    await openUserConversation(uid, SMILEMORE_DEMO_COMPANY_ID, { companyName: "LIVE" });
    const store = {
        async listConversationsByUserId() {
            throw new Error("firestore down");
        },
        async listMessages() {
            return [];
        },
    };
    const items = await listFederatedChatConversationsAsync(uid, {}, { enabled: true, store, force: true });
    assert.equal(items.length, 1);
});

test("threads persisted before SNET-08 (no networkRequestId) are recovered from the id suffix; junk is skipped", async () => {
    reset();
    const legacy = { ...netConv, id: "cv_legacy_net_req_old9", networkRequestId: undefined };
    const orphan = { ...netConv, id: "cv_orphan_no_link", networkRequestId: undefined };
    const other = { ...bizConv, id: "cv_other", userId: "someone-else" };
    await hydrateFederatedChatIndex(uid, { enabled: true, store: fakeStore([legacy, orphan], {}) });
    const nets = listNetworkLinkedConversations(uid);
    assert.deepEqual(nets.map((c) => c.id), ["cv_legacy_net_req_old9"]);
    assert.equal(nets[0].networkRequestId, "req_old9");
    assert.equal(listUserConversations("someone-else").length, 0);
    void other;
});

test("Central Motors fixture id fails closed everywhere: not discoverable, no thread, no enquiry, no fake chat", async () => {
    reset();
    for (const id of ["central-motors", "central-motors-rtb"]) {
        await assert.rejects(() => assertCompanyDiscoverableAsync(id), { code: "COMPANY_NOT_DISCOVERABLE" }, id);
        await assert.rejects(() => ensureCompanyChatThread("u-cm", id), { code: "COMPANY_NOT_DISCOVERABLE" }, id);
        const grant = createConsentGrant("u-cm", { companyId: id });
        await assert.rejects(
            () => submitPersonalToCompanyEnquiry("u-cm", { companyId: id, grantId: grant.grantId, naturalLanguage: "test drive?" }),
            { code: "COMPANY_NOT_DISCOVERABLE" },
            id
        );
    }
    assert.deepEqual(listUserConversations("u-cm"), [], "nothing was created for a non-listed business");
    assert.deepEqual(listNetworkLinkedConversations("u-cm"), []);
});

test("route catalog documents every mounted network / consumer-chat route (and nothing stale)", () => {
    const app = express();
    const pass = (_req, _res, next) => next();
    mountNetworkEntityRoutes(app);
    mountNetworkListingRoutes(app, { consumerGuard: pass });
    mountNetworkVerificationRoutes(app, { platformGuard: pass });
    mountNetworkSearchRoutes(app, { consumerGuard: pass });
    mountNetworkAgentRoutes(app, { consumerGuard: pass });
    mountNetworkConnectionRoutes(app, { consumerGuard: pass });
    mountNetworkPlatformRoutes(app, { platformGuard: pass });
    mountNetworkTrustRoutes(app, { consumerGuard: pass, platformGuard: pass });
    mountSarahNetworkRoutes(app, { consumerGuard: pass });
    mountChatIndexRoutes(app);
    mountUserConversationRoutes(app);

    const mounted = new Set();
    for (const layer of app.router.stack) {
        if (!layer.route) continue;
        for (const m of Object.keys(layer.route.methods)) mounted.add(`${m.toUpperCase()} ${layer.route.path}`);
    }
    const scope = /^\/api\/(network\/|platform\/network\/|sarah-network|chat\/conversations|network-conversations|discover\/|user-conversations)/;
    const catalog = new Set(ROUTE_CATALOG.filter((r) => scope.test(r.path)).map((r) => `${r.method} ${r.path}`));

    const undocumented = [...mounted].filter((k) => !catalog.has(k));
    assert.deepEqual(undocumented, [], `mounted but missing from ROUTE_CATALOG: ${undocumented.join(", ")}`);
    const stale = [...catalog].filter((k) => !mounted.has(k));
    assert.deepEqual(stale, [], `in ROUTE_CATALOG but not mounted: ${stale.join(", ")}`);
});
