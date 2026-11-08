/**
 * SNET-11 — ecosystem integration: company conversation payloads (chat index, user-conversations, network thread,
 * handover) carry the opaque `snId`; companies without a network entity get null; people/group rows are untouched;
 * no id is minted as a side effect of reading.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { clearNetworkEntitiesForTests, ensureOrgEntity, getOrgEntityByCompanyId } from "../services/network/networkIdentityService.js";
import { attachSnId, attachSnIds, snIdForCompany, snIdsForCompanies } from "../services/network/networkIntegration.js";
import {
    clearUserConversationsForTests,
    openUserConversation,
    seedUserConversationFromStore,
} from "../services/users/userConversationService.js";
import { clearNetworkChatLinksForTests, seedNetworkConversationFromStore } from "../services/users/sarahNetworkChatLinkService.js";
import { resetFederatedHydrationForTests } from "../services/users/chatConversationIndexService.js";
import { personIdFromUserId } from "../services/users/identityContracts.js";
import { CONVERSATION_TYPES } from "../services/users/messagingContracts.js";
import { mountChatIndexRoutes } from "../services/api/chatIndexRoutes.js";
import { mountChatHandoverRoutes } from "../services/api/chatHandoverRoutes.js";
import { mountUserConversationRoutes } from "../services/api/userConversationRoutes.js";

const uid = "u-snet11";
const NO_ENTITY = "company-without-entity";
const now = (m = 0) => new Date(Date.now() + m * 60000).toISOString();

function reset() {
    clearUserConversationsForTests();
    clearNetworkChatLinksForTests();
    resetFederatedHydrationForTests();
    clearNetworkEntitiesForTests();
}

async function withServer(fn) {
    const app = express();
    app.use(express.json());
    const consumerGuard = (req, _res, next) => {
        req.consumerAuth = { uid: String(req.headers["x-uid"] || uid), profile: {} };
        next();
    };
    mountChatIndexRoutes(app, { consumerGuard });
    mountChatHandoverRoutes(app, { consumerGuard });
    mountUserConversationRoutes(app, { consumerGuard });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const j = (path, init = {}) =>
        fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } }).then(async (r) => ({
            status: r.status,
            body: await r.json(),
        }));
    try {
        return await fn(j);
    } finally {
        server.close();
    }
}

function seedThreads() {
    const base = { userId: uid, personId: personIdFromUserId(uid), createdAt: now(-10) };
    seedUserConversationFromStore(
        { ...base, id: "cv_biz", companyId: SMILEMORE_DEMO_COMPANY_ID, companyName: "SmileMore Dentists", type: CONVERSATION_TYPES.PERSON_TO_BUSINESS, lastMessageAt: now(-5), preview: "Hi" },
        []
    );
    seedUserConversationFromStore(
        { ...base, id: "cv_biz2", companyId: NO_ENTITY, companyName: "No Entity Ltd", type: CONVERSATION_TYPES.PERSON_TO_BUSINESS, lastMessageAt: now(-6), preview: "Yo" },
        []
    );
    seedNetworkConversationFromStore(
        { ...base, id: "cv_x_net_req_abc", companyId: SMILEMORE_DEMO_COMPANY_ID, companyName: "SmileMore Dentists", type: CONVERSATION_TYPES.AI_TO_AI, networkRequestId: "req_abc", lastMessageAt: now(-1), preview: "Whitening?" },
        [{ id: "n1", role: "user", content: "Whitening?", createdAt: now(-1) }]
    );
}

test("helpers: snId lookup is read-only, tolerant, and batched", async () => {
    reset();
    assert.equal(await snIdForCompany(""), null);
    assert.equal(await snIdForCompany(NO_ENTITY), null);
    assert.equal(await getOrgEntityByCompanyId(NO_ENTITY), null, "reading must not mint an entity");

    const entity = await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID);
    assert.equal(await snIdForCompany(SMILEMORE_DEMO_COMPANY_ID), entity.snId);

    const map = await snIdsForCompanies([SMILEMORE_DEMO_COMPANY_ID, SMILEMORE_DEMO_COMPANY_ID, NO_ENTITY, null]);
    assert.equal(map.size, 2);
    assert.equal(map.get(SMILEMORE_DEMO_COMPANY_ID), entity.snId);
    assert.equal(map.get(NO_ENTITY), null);

    const rows = [{ companyId: SMILEMORE_DEMO_COMPANY_ID, k: 1 }, { id: "p2p", k: 2 }, { companyId: NO_ENTITY, k: 3 }];
    const out = await attachSnIds(rows);
    assert.equal(out[0].snId, entity.snId);
    assert.ok(!("snId" in out[1]), "rows without a company are untouched");
    assert.equal(out[2].snId, null);
    assert.ok(!("snId" in rows[0]), "input rows are not mutated");

    assert.equal(await attachSnId(null), null);
    assert.equal((await attachSnId({ companyId: SMILEMORE_DEMO_COMPANY_ID })).snId, entity.snId);
    assert.deepEqual(await attachSnIds(undefined), []);
});

test("GET /api/chat/conversations: business and network rows carry snId; unknown company gets null", async () => {
    reset();
    const entity = await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID);
    seedThreads();
    await withServer(async (j) => {
        const { status, body } = await j("/api/chat/conversations");
        assert.equal(status, 200);
        const byKey = Object.fromEntries(body.conversations.map((c) => [c.listKey, c]));
        assert.equal(byKey[`business:${SMILEMORE_DEMO_COMPANY_ID}`].snId, entity.snId);
        assert.equal(byKey["network:cv_x_net_req_abc"].snId, entity.snId);
        assert.equal(byKey[`business:${NO_ENTITY}`].snId, null);
        assert.equal(byKey[`business:${SMILEMORE_DEMO_COMPANY_ID}`].companyId, SMILEMORE_DEMO_COMPANY_ID, "companyId kept for existing clients");
    });
    assert.equal(await getOrgEntityByCompanyId(NO_ENTITY), null, "listing chats did not mint an entity");
});

test("user-conversations list + thread payloads and the network thread carry snId", async () => {
    reset();
    const entity = await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID);
    seedThreads();
    await withServer(async (j) => {
        const list = await j("/api/user-conversations");
        assert.equal(list.status, 200);
        const sm = list.body.conversations.find((c) => c.companyId === SMILEMORE_DEMO_COMPANY_ID);
        assert.equal(sm.snId, entity.snId);
        assert.equal(list.body.conversations.find((c) => c.companyId === NO_ENTITY).snId, null);

        const byId = await j("/api/user-conversations/id/cv_biz/messages");
        assert.equal(byId.status, 200);
        assert.equal(byId.body.conversation.snId, entity.snId);

        const net = await j("/api/network-conversations/cv_x_net_req_abc/messages");
        assert.equal(net.status, 200);
        assert.equal(net.body.conversation.snId, entity.snId);
        assert.equal(net.body.messages.length, 1);
    });
});

test("handover payloads (GET state + request-human) carry snId; other users' threads stay private", async () => {
    reset();
    const entity = await ensureOrgEntity(SMILEMORE_DEMO_COMPANY_ID);
    await openUserConversation(uid, SMILEMORE_DEMO_COMPANY_ID, { companyName: "SmileMore Dentists" });
    await withServer(async (j) => {
        const state = await j(`/api/chat/conversations/${SMILEMORE_DEMO_COMPANY_ID}/handover`);
        assert.equal(state.status, 200);
        assert.equal(state.body.snId, entity.snId);
        assert.equal(state.body.conversation.snId, entity.snId);

        const req = await j(`/api/user-conversations/${SMILEMORE_DEMO_COMPANY_ID}/request-human`, { method: "POST" });
        assert.equal(req.status, 200);
        assert.equal(req.body.snId, entity.snId);
        assert.equal(req.body.conversation.snId, entity.snId);
        assert.equal(req.body.next, "human_requested");

        // A different user sees none of this user's threads, with or without snId.
        const other = await j("/api/chat/conversations", { headers: { "x-uid": "someone-else" } });
        assert.deepEqual(other.body.conversations, []);
    });
});

test("Discover cards (SNET-01b) and chat rows use the same snId for the same company", async () => {
    reset();
    const { upsertBusinessDirectoryEntry, clearBusinessDirectoryForTests, setBusinessDirectoryStoreForTests } = await import(
        "../services/users/businessDirectoryService.js"
    );
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    upsertBusinessDirectoryEntry("cafe-int", { discoverability: "public", displayName: "Cafe Integration", industry: "cafe", location: "Leeds", shortDescription: "Coffee" });
    await ensureOrgEntity("cafe-int", { displayName: "Cafe Integration" }); // what publish does
    await new Promise((r) => setTimeout(r, 25));
    seedUserConversationFromStore(
        { id: "cv_cafe", userId: uid, personId: personIdFromUserId(uid), companyId: "cafe-int", companyName: "Cafe Integration", type: CONVERSATION_TYPES.PERSON_TO_BUSINESS, lastMessageAt: now(), createdAt: now(-1), preview: "" },
        []
    );
    await withServer(async (j) => {
        const discover = await j("/api/discover/companies?q=cafe");
        assert.equal(discover.status, 200);
        const card = discover.body.companies.find((c) => c.companyId === "cafe-int");
        assert.ok(card?.snId, "discover card has snId");
        const chat = await j("/api/chat/conversations?filter=businesses");
        assert.equal(chat.body.conversations.find((c) => c.companyId === "cafe-int").snId, card.snId);
    });
    clearBusinessDirectoryForTests();
});
