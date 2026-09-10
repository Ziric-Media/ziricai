#!/usr/bin/env node
/**
 * PORTAL-3A — Human takeover runtime safety verification.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    isHumanControlledConversation,
    getConversationTakeoverState,
} from "../services/conversation/takeoverSafety.js";
import {
    resolveCanonicalConversationId,
    conversationDocId,
} from "../services/storage/tenantStorage.js";
import { TenantRepository, resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../services/database/schema.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

console.log("verify-portal-3a-takeover");

const tenantConversationService = read("services/tenants/conversationService.js");
const conversationPipeline = read("services/integrations/conversationPipeline.js");
const messageWorker = read("services/queue/workers/messageWorker.js");
const takeoverSafety = read("services/conversation/takeoverSafety.js");
const tenantStorage = read("services/storage/tenantStorage.js");
const conversationService = read("services/conversationService.js");
const customerService = read("services/customerService.js");
const portalConversations = read("js/portal/modules/conversations.js");

assert.match(tenantStorage, /export function resolveCanonicalConversationId/);
assert.match(tenantStorage, /whatsapp::/);
console.log("✓ resolveCanonicalConversationId exported from tenantStorage");

assert.equal(resolveCanonicalConversationId("27849000523"), "whatsapp::27849000523");
assert.equal(resolveCanonicalConversationId("whatsapp::27849000523"), "whatsapp::27849000523");
assert.equal(conversationDocId("27849000523"), "whatsapp::27849000523");
console.log("✓ canonical conversation ID resolves to whatsapp::{phone}");

assert.match(tenantConversationService, /resolveCanonicalConversationId/);
assert.match(tenantConversationService, /setHumanTakeover[\s\S]*resolveCanonicalConversationId/);
assert.doesNotMatch(
    tenantConversationService.slice(tenantConversationService.indexOf("setHumanTakeover")),
    /conversationRepo\.upsert\(companyId, id,/
);
console.log("✓ setHumanTakeover writes canonical conversation document");

assert.match(tenantConversationService, /upsertConversationMeta[\s\S]*resolveCanonicalConversationId/);
console.log("✓ upsertConversationMeta uses canonical conversation ID");

assert.match(tenantConversationService, /getCanonicalConversationMeta/);
assert.match(tenantConversationService, /getConversationTakeoverState/);
console.log("✓ getTenantConversation reads canonical conversation + takeover state");

assert.match(conversationService, /humanTakeover: Boolean\(c\.humanTakeover\)/);
console.log("✓ listConversations mapping includes humanTakeover");

assert.match(conversationService, /mode, assignedHumanAgent/);
assert.match(customerService, /mode != null \? mode : existing\.mode/);
assert.match(customerService, /assignedHumanAgent !== undefined/);
console.log("✓ customer mode propagation fixed (derived only, not worker authority)");

assert.match(takeoverSafety, /meta\.humanTakeover === true \|\| meta\.mode === "human"/);
assert.match(takeoverSafety, /getTenantConversation/);
assert.doesNotMatch(takeoverSafety, /getCustomer|customer\.mode/);
console.log("✓ takeoverSafety uses conversation doc only (not customer.mode)");

assert.match(messageWorker, /getConversationTakeoverState/);
assert.match(messageWorker, /Takeover early skip/);
assert.match(messageWorker, /Takeover outbound suppressed/);
assert.match(messageWorker, /Takeover outbound plan suppressed/);
assert.match(messageWorker, /guard: "early_pre_ai"/);
assert.match(messageWorker, /guard: "final_pre_outbound"/);

const processInbound = messageWorker.slice(messageWorker.indexOf("async function processInboundMessage"));
const earlyIdx = processInbound.indexOf("Takeover early skip");
const typingIdx = processInbound.indexOf("sendWhatsAppTypingIndicator");
const openAiIdx = processInbound.indexOf("askAIWithTools");
const nonTextOutboundIdx = processInbound.indexOf("NON_TEXT_REPLY");
assert.ok(earlyIdx > 0 && earlyIdx < typingIdx, "early guard must precede typing indicator");
assert.ok(earlyIdx < openAiIdx, "early guard must precede OpenAI");
assert.ok(earlyIdx < nonTextOutboundIdx, "early guard must precede non-text fallback outbound");
console.log("✓ messageWorker has early guard before typing/OpenAI/non-text paths");

assert.match(messageWorker, /if \(metaMessageId\)/);
console.log("✓ suppressed outbound does not persist assistant messages without send");

assert.match(conversationPipeline, /getConversationTakeoverState/);
assert.match(conversationPipeline, /skip enqueue — human takeover active/);
console.log("✓ optional ingest-time enqueue skip when human takeover active");

assert.match(portalConversations, /Release to AI/);
assert.match(portalConversations, /enabled: !human/);
assert.match(portalConversations, /isHumanControlled/);
console.log("✓ Portal conversations module exposes Take over / Release to AI toggle");

assert.equal(isHumanControlledConversation({ humanTakeover: true, mode: "ai" }), true);
assert.equal(isHumanControlledConversation({ humanTakeover: false, mode: "human" }), true);
assert.equal(isHumanControlledConversation({ humanTakeover: false, mode: "ai" }), false);
assert.equal(isHumanControlledConversation(null), false);
console.log("✓ isHumanControlledConversation runtime checks");

assert.equal(typeof getConversationTakeoverState, "function");
console.log("✓ getConversationTakeoverState exported for worker/pipeline");

assert.doesNotMatch(messageWorker, /COLLECTION = 'conversations'/);
assert.doesNotMatch(takeoverSafety, /admin\/js\/admin/);
console.log("✓ runtime enforcement does not depend on Admin top-level conversations collection");

const conversationsRepo = new TenantRepository(TENANT_COLLECTIONS.CONVERSATIONS);
const testCompanyId = "verify-portal-3a-company";
const testPhone = "27849000523";
const canonicalId = conversationDocId(testPhone);

resetMemoryTenantStore();
await conversationsRepo.set(testCompanyId, canonicalId, {
    humanTakeover: true,
    mode: "human",
    channel: "whatsapp",
});
const canonicalState = await getConversationTakeoverState(testCompanyId, testPhone, "whatsapp");
assert.equal(canonicalState.humanControlled, true);
assert.equal(canonicalState.conversationId, canonicalId);
console.log("✓ runtime: canonical takeover state detected on whatsapp::{phone} doc");

resetMemoryTenantStore();
await conversationsRepo.set(testCompanyId, testPhone, {
    humanTakeover: true,
    mode: "human",
});
const legacyState = await getConversationTakeoverState(testCompanyId, testPhone, "whatsapp");
assert.equal(legacyState.humanControlled, true);
assert.equal(legacyState.migratedFrom, testPhone);
const backfilled = await conversationsRepo.get(testCompanyId, canonicalId);
assert.equal(backfilled?.humanTakeover, true);
assert.equal(backfilled?.mode, "human");
console.log("✓ runtime: legacy phone-only takeover lazily backfills canonical doc");

const { setHumanTakeover } = await import("../services/tenants/conversationService.js");
resetMemoryTenantStore();
const releaseResult = await setHumanTakeover(testCompanyId, testPhone, { enabled: false });
assert.equal(releaseResult.conversationId, canonicalId);
assert.equal(releaseResult.mode, "ai");
assert.equal(releaseResult.humanTakeover, false);
const releasedState = await getConversationTakeoverState(testCompanyId, testPhone, "whatsapp");
assert.equal(releasedState.humanControlled, false);
console.log("✓ runtime: setHumanTakeover release writes canonical ai mode");

console.log("\nPORTAL-3A verification passed.");
