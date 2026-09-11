#!/usr/bin/env node
/**
 * PORTAL-3C — Inbox data contract, slim context, mark-read authorization.
 * Static + in-memory unit matrix (always). Optional live API matrix with --live.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
    assertAuthenticatedTenantMemberAccess,
} from "../services/core/tenantContext.js";
import {
    conversationDocId,
    resolveCanonicalConversationId,
} from "../services/storage/tenantStorage.js";
import { resetMemoryTenantStore, TenantRepository } from "../services/database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../services/database/schema.js";
import { mapMessageForInboxApi } from "../services/conversation/inboxMessageContract.js";
import { resolveStaffSenderName } from "../services/conversation/inboxStaffIdentity.js";
import { saveInboundMessage, saveOutboundMessage } from "../services/conversationService.js";
import { getTenantConversationHistory } from "../services/storage/tenantStorage.js";
import { PRODUCTION_WEB_CONFIG } from "../js/firebase-config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
const API_BASE = (process.env.PORTAL_3C_API_BASE || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const COMPANY_ID = "central-motors-rtb";
const CANONICAL_ID = conversationDocId("27849000523");
const credPath = join(ROOT, ".portal-rtb-smoke-credentials.json");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

function extractRouteBlock(source, method, path) {
    const pattern = new RegExp(
        `app\\.${method}\\(\\s*["']${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
    );
    const match = pattern.exec(source);
    assert.ok(match, `Missing route: app.${method}("${path}")`);
    const end = source.indexOf("\n    });", match.index);
    return source.slice(match.index, end > match.index ? end + 8 : match.index + 600);
}

async function expectAccess(fn, message) {
    try {
        await fn();
        assert.fail(message || "Expected access check to throw");
    } catch (err) {
        return err;
    }
}

async function firebaseToken(email, password) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${PRODUCTION_WEB_CONFIG.apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Firebase auth failed");
    return data.idToken;
}

async function postRead(token, companyId) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const path = `/api/companies/${companyId}/conversations/${encodeURIComponent(CANONICAL_ID)}/read`;
    const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: "{}" });
    const text = await res.text();
    let data = {};
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }
    return { status: res.status, data };
}

console.log("verify-portal-3c-inbox-contract");

/* ── Forbidden subsystem guard (3A takeover safety patterns preserved) ── */
const messageWorker = read("services/queue/workers/messageWorker.js");
const conversationPipeline = read("services/integrations/conversationPipeline.js");
const takeoverSafety = read("services/conversation/takeoverSafety.js");

assert.match(messageWorker, /getConversationTakeoverState/);
assert.match(messageWorker, /Takeover early skip/);
assert.match(messageWorker, /Takeover outbound suppressed/);
assert.match(conversationPipeline, /unread: true/);
assert.match(takeoverSafety, /meta\.humanTakeover === true \|\| meta\.mode === "human"/);
assert.doesNotMatch(takeoverSafety, /getCustomer|customer\.mode/);
console.log("✓ messageWorker, conversationPipeline, takeoverSafety retain 3A safety patterns");

/* ── Static route wiring ── */
const customerOps = read("services/api/customerOpsRoutes.js");
const tenantConversationService = read("services/tenants/conversationService.js");
const tenantStorage = read("services/storage/tenantStorage.js");
const conversationService = read("services/conversationService.js");

const readBlock = extractRouteBlock(
    customerOps,
    "post",
    "/api/companies/:companyId/conversations/:conversationId/read"
);
const replyBlock = extractRouteBlock(
    customerOps,
    "post",
    "/api/companies/:companyId/conversations/:conversationId/reply"
);

assert.match(readBlock, /requireAuthenticatedTenantMember\(\)/);
assert.match(readBlock, /markConversationRead/);
console.log("✓ mark-read route uses requireAuthenticatedTenantMember()");

assert.match(replyBlock, /resolveStaffSenderName\(req\.tenant\)/);
assert.match(replyBlock, /requireAuthenticatedTenantMember\(\)/);
console.log("✓ reply route resolves staff senderName from authenticated tenant context");

assert.match(tenantConversationService, /mapMessageForInboxApi/);
assert.match(tenantConversationService, /buildSlimInboxContext/);
assert.match(tenantConversationService, /export async function markConversationRead/);
assert.match(tenantConversationService, /source: "human"/);
console.log("✓ tenant conversationService exposes inbox contract + mark-read");

assert.match(tenantStorage, /source: resolvedSource/);
assert.match(tenantStorage, /senderName: options\.senderName/);
assert.match(tenantStorage, /source: m\.source/);
assert.match(tenantStorage, /createdAt: m\.createdAt/);
console.log("✓ tenantStorage persists and returns message metadata");

assert.match(conversationService, /source: options\.source \|\| "customer"/);
assert.match(conversationService, /source: options\.source \|\| "ai"/);
console.log("✓ conversationService defaults inbound=customer, outbound=ai");

/* ── Message contract mapping ── */
const customerMsg = mapMessageForInboxApi({
    id: "m1",
    role: "user",
    content: "Hello",
    createdAt: "2026-01-01T10:00:00.000Z",
    channel: "whatsapp",
    externalId: "wamid.abc",
});
assert.equal(customerMsg.role, "customer");
assert.equal(customerMsg.source, "customer");
assert.equal(customerMsg.createdAt, "2026-01-01T10:00:00.000Z");
assert.equal(customerMsg.externalId, "wamid.abc");
console.log("✓ inbound message maps to role=customer, source=customer with timestamp");

const aiMsg = mapMessageForInboxApi({ role: "assistant", content: "Hi from Sarah" });
assert.equal(aiMsg.role, "ai");
assert.equal(aiMsg.source, "ai");
console.log("✓ AI outbound / historical assistant without source → role=ai, source=ai");

const humanMsg = mapMessageForInboxApi({
    role: "assistant",
    source: "human",
    senderName: "John Smith",
    content: "I'll assist you personally",
});
assert.equal(humanMsg.role, "human");
assert.equal(humanMsg.source, "human");
assert.equal(humanMsg.senderName, "John Smith");
console.log("✓ human reply maps to role=human, source=human with senderName");

const historicAssistant = mapMessageForInboxApi({ role: "assistant", content: "legacy" });
assert.equal(historicAssistant.source, "ai");
assert.equal(historicAssistant.role, "ai");
console.log("✓ historical assistant messages remain readable as ai");

assert.doesNotMatch(JSON.stringify(mapMessageForInboxApi({ role: "assistant", content: "" })), /phantom/i);
console.log("✓ no phantom assistant messages in contract mapping");

/* ── Staff sender identity ── */
assert.equal(
    resolveStaffSenderName({
        companyId: COMPANY_ID,
        profile: { fullName: "John Smith", companyId: COMPANY_ID },
    }),
    "John Smith"
);
assert.equal(
    resolveStaffSenderName({
        companyId: COMPANY_ID,
        profile: { fullName: COMPANY_ID, companyId: COMPANY_ID },
    }),
    null
);
assert.equal(resolveStaffSenderName({ companyId: COMPANY_ID, profile: null }), null);
console.log("✓ staff senderName uses profile display fields, never company name");

/* ── Persistence (memory) ── */
const testCompany = "verify-portal-3c-company";
const testPhone = "27849999001";
resetMemoryTenantStore();

await saveInboundMessage(testPhone, "Customer hello", { companyId: testCompany });
await saveOutboundMessage(testPhone, "Sarah reply", { companyId: testCompany });
await saveOutboundMessage(testPhone, "Staff reply", {
    companyId: testCompany,
    source: "human",
    senderName: "Jane Doe",
});

const history = await getTenantConversationHistory(testCompany, testPhone, "whatsapp", 20);
assert.equal(history.length, 3);
assert.equal(history[0].source, "customer");
assert.equal(history[1].source, "ai");
assert.equal(history[2].source, "human");
assert.equal(history[2].senderName, "Jane Doe");
assert.ok(history[0].createdAt);
console.log("✓ message persistence: customer/ai/human sources stored correctly");

const apiMessages = history.map((m) => mapMessageForInboxApi(m));
assert.deepEqual(
    apiMessages.map((m) => m.source),
    ["customer", "ai", "human"]
);
assert.ok(apiMessages.every((m) => m.createdAt));
console.log("✓ API mapping exposes timestamps for persisted messages");

/* ── Mark-read (memory) ── */
const conversationsRepo = new TenantRepository(TENANT_COLLECTIONS.CONVERSATIONS);
const canonicalTestId = resolveCanonicalConversationId(testPhone, "whatsapp");

resetMemoryTenantStore();
await conversationsRepo.set(testCompany, canonicalTestId, {
    conversationId: canonicalTestId,
    customerId: testPhone,
    channel: "whatsapp",
    unread: true,
});

const { markConversationRead, getTenantConversation } = await import("../services/tenants/conversationService.js");
const readResult = await markConversationRead(testCompany, canonicalTestId);
assert.equal(readResult.success, true);
assert.equal(readResult.unread, false);
assert.ok(readResult.readAt);
const updated = await conversationsRepo.get(testCompany, canonicalTestId);
assert.equal(updated.unread, false);
assert.ok(updated.readAt);
console.log("✓ mark-read persists unread:false and readAt on canonical conversation");

let notFoundErr;
try {
    await markConversationRead(testCompany, "whatsapp::00000000000");
    assert.fail("expected 404 for missing conversation");
} catch (err) {
    notFoundErr = err;
}
assert.equal(notFoundErr.status, 404);
console.log("✓ mark-read rejects missing canonical conversation");

/* ── Slim context on detail ── */
resetMemoryTenantStore();
await conversationsRepo.set(testCompany, canonicalTestId, {
    conversationId: canonicalTestId,
    customerId: testPhone,
    channel: "whatsapp",
    customerName: "Test User",
    unread: false,
});
await saveInboundMessage(testPhone, "Context probe", { companyId: testCompany });

const detail = await getTenantConversation(testCompany, canonicalTestId);
assert.ok(detail.context);
assert.ok("customer" in detail.context);
assert.ok("aiEmployee" in detail.context);
assert.ok("nextUpcomingAppointment" in detail.context);
assert.ok(Array.isArray(detail.context.timeline));
assert.ok(detail.messages.length >= 1);
assert.equal(detail.messages[0].source, "customer");
assert.doesNotMatch(JSON.stringify(detail), /Central Motors hardcoded/i);
console.log("✓ conversation detail includes slim context + mapped messages");

const detailNoCustomer = await getTenantConversation(testCompany, "whatsapp::27849999999");
assert.ok(detailNoCustomer.context);
assert.equal(detailNoCustomer.context.customer, null);
console.log("✓ missing customer yields honest null context");

/* ── Mark-read authorization unit matrix ── */
const membership = async (uid, tenantId) =>
    uid === "rtb-owner" && tenantId === COMPANY_ID ? { uid, companyId: tenantId, role: "owner" } : null;

const allowMember = await assertAuthenticatedTenantMemberAccess(
    { companyId: COMPANY_ID, uid: "rtb-owner", isSuperAdmin: false, profile: null },
    { getTenantMembership: membership }
);
assert.deepEqual(allowMember, { via: "tenant" });
console.log("✓ mark-read auth: valid RTB member → ALLOW");

const unauthErr = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        { companyId: COMPANY_ID, uid: null, isSuperAdmin: false, profile: null },
        { getTenantMembership: membership }
    )
);
assert.equal(unauthErr.status, 401);
console.log("✓ mark-read auth: unauthenticated → 401");

const wrongTenantErr = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        {
            companyId: COMPANY_ID,
            uid: "demo-user",
            isSuperAdmin: false,
            profile: { companyId: "demo-central-motors", role: "owner" },
        },
        { getTenantMembership: async () => null }
    )
);
assert.equal(wrongTenantErr.status, 403);
console.log("✓ mark-read auth: wrong tenant → 403");

const noMembershipErr = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        { companyId: COMPANY_ID, uid: "user-no-membership", isSuperAdmin: false, profile: null },
        { getTenantMembership: async () => null }
    )
);
assert.equal(noMembershipErr.status, 403);
console.log("✓ mark-read auth: no membership → 403");

/* ── PORTAL-3A regression (takeover safety unchanged) ── */
execSync("node scripts/verify-portal-3a-takeover.js", { cwd: ROOT, stdio: "inherit" });
execSync("node scripts/verify-portal-3a-takeover-auth.js", { cwd: ROOT, stdio: "inherit" });

if (LIVE) {
    console.log("\n--- Live mark-read authorization matrix ---");
    if (!fs.existsSync(credPath)) {
        throw new Error("Missing .portal-rtb-smoke-credentials.json for --live tests");
    }
    const creds = JSON.parse(fs.readFileSync(credPath, "utf8").replace(/^\uFEFF/, ""));
    const token = await firebaseToken(creds.email, creds.password);

    const noHeader = await postRead(undefined, COMPANY_ID);
    assert.equal(noHeader.status, 401, `expected 401, got ${noHeader.status}`);
    console.log("✓ Live: mark-read no auth → 401");

    const wrongTenant = await postRead(token, "wrong-tenant-xyz");
    assert.equal(wrongTenant.status, 403, `expected 403, got ${wrongTenant.status}`);
    console.log("✓ Live: mark-read wrong tenant → 403");

    const ownerRead = await postRead(token, COMPANY_ID);
    assert.equal(ownerRead.status, 200, `expected 200, got ${ownerRead.status}`);
    assert.equal(ownerRead.data?.unread, false);
    assert.ok(ownerRead.data?.readAt);
    console.log("✓ Live: RTB member mark-read → 200 + unread:false");
} else {
    console.log("\n(Skipping live mark-read matrix — run with --live after deploy)");
}

console.log("\nAll PORTAL-3C inbox contract checks passed.");
