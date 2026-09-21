#!/usr/bin/env node
/**
 * CORPORATE-P0-3E — automation send_message canonical outbound path.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTERED_COMMUNICATION_ADAPTERS } from "../services/conversation/canonicalCommunicationContract.js";
import {
    executeAction,
    __setIntegrationSendOverride,
} from "../services/automation/actionExecutor.js";
import { getTenantConversationHistory } from "../services/storage/tenantStorage.js";
import { setHumanTakeover } from "../services/tenants/conversationService.js";
import { mapMessageForInboxApi } from "../services/conversation/inboxMessageContract.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_COMPANY = "p0-3e-automation-co";
const TEST_PHONE = "27821112233";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

process.env.NODE_ENV = "test";
process.env.STORAGE_BACKEND = "memory";
process.env.TENANT_SCOPE_ENFORCEMENT = "strict";

console.log("CORPORATE-P0-3E — automation canonical outbound");

const actionExecutorSrc = read("services/automation/actionExecutor.js");
assert.match(actionExecutorSrc, /saveOutboundMessage/);
assert.match(actionExecutorSrc, /getConversationTakeoverState/);
assert.match(actionExecutorSrc, /metaMessageId/);
assert.match(actionExecutorSrc, /source: "automation"/);
assert.match(actionExecutorSrc, /await saveOutboundMessage\([\s\S]*?source: "automation"/);
console.log("✓ actionExecutor uses canonical outbound + takeover guard");

assert.ok(
    REGISTERED_COMMUNICATION_ADAPTERS.some((a) => a.id === "automation-send-message"),
    "automation adapter registered in contract"
);
console.log("✓ canonicalCommunicationContract registers automation adapter");

const inboxContract = read("services/conversation/inboxMessageContract.js");
assert.match(inboxContract, /source === "automation"/);
console.log("✓ inbox API maps automation source to ai role for display");

let sendCalls = 0;
__setIntegrationSendOverride(async (_channel, _ctx, payload) => {
    sendCalls++;
    if (payload.text === "FAIL_SEND") {
        throw new Error("Meta send failed (verify mock)");
    }
    return { messages: [{ id: `wamid-p0-3e-${sendCalls}` }] };
});

const eventBase = {
    companyId: TEST_COMPANY,
    type: "MESSAGE_RECEIVED",
    payload: { phone: TEST_PHONE, channel: "whatsapp" },
};

const workflow = { id: "wf-p0-3e", name: "P0-3E Verify Workflow" };

const ok = await executeAction(
    { type: "send_message", config: { text: "Automation canonical outbound test" } },
    eventBase,
    workflow
);
assert.equal(ok.ok, true);
assert.ok(ok.metaMessageId);

const history = await getTenantConversationHistory(TEST_COMPANY, TEST_PHONE, "whatsapp", 10);
const saved = history.find((m) => m.content?.includes("Automation canonical outbound"));
assert.ok(saved, "canonical tenant message must exist after successful send");
assert.equal(saved.source, "automation");
assert.equal(saved.externalId, ok.metaMessageId);
assert.equal(saved.role, "assistant");

const mapped = mapMessageForInboxApi(saved);
assert.equal(mapped.source, "automation");
assert.equal(mapped.role, "ai");
console.log("✓ automation outbound persisted with companyId, source, externalId");

await setHumanTakeover(TEST_COMPANY, TEST_PHONE, { enabled: true, humanAgent: "Staff" });
const blocked = await executeAction(
    { type: "send_message", config: { text: "Should not send under takeover" } },
    eventBase,
    workflow
);
assert.equal(blocked.skipped, true);
assert.equal(blocked.reason, "human_takeover");
const historyAfterTakeover = await getTenantConversationHistory(TEST_COMPANY, TEST_PHONE, "whatsapp", 10);
assert.equal(
    historyAfterTakeover.filter((m) => m.content?.includes("Should not send")).length,
    0,
    "takeover must block automation outbound"
);
console.log("✓ human takeover blocks automation send_message");

await setHumanTakeover(TEST_COMPANY, TEST_PHONE, { enabled: false, humanAgent: "Staff" });

const beforeFailCount = (await getTenantConversationHistory(TEST_COMPANY, TEST_PHONE, "whatsapp", 20)).length;
const fail = await executeAction(
    { type: "send_message", config: { text: "FAIL_SEND" } },
    eventBase,
    workflow
);
assert.equal(fail.ok, false);
const afterFailCount = (await getTenantConversationHistory(TEST_COMPANY, TEST_PHONE, "whatsapp", 20)).length;
assert.equal(afterFailCount, beforeFailCount, "failed Meta send must not create canonical message");
console.log("✓ failed integration send does not persist outbound message");

__setIntegrationSendOverride(null);

console.log("\nCORPORATE-P0-3E PASS");
