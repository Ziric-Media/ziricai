#!/usr/bin/env node
import assert from "node:assert/strict";
import {
    assistantAwaitedSubmissionConfirm,
    isAffirmativeConfirmation,
} from "../services/consulting/sachAccountingClientConfirm.js";

assert.equal(isAffirmativeConfirmation("Yes its correct"), true);
assert.equal(isAffirmativeConfirmation("Please go ahead"), true);
assert.equal(isAffirmativeConfirmation("I need VAT help for March"), false);

assert.equal(
    assistantAwaitedSubmissionConfirm([
        { role: "user", content: "Register Shalom Enterprise" },
        {
            role: "assistant",
            content: "Please confirm if everything looks correct, and I'll proceed to submit.",
        },
    ]),
    true
);
assert.equal(
    assistantAwaitedSubmissionConfirm([{ role: "assistant", content: "What service do you need?" }]),
    false
);

process.env.STORAGE_BACKEND = "memory";
const companyId = `sach-confirm-${Date.now()}`;
const clientUid = `client_${Date.now()}`;
const { createCompany } = await import("../services/tenants/companyService.js");
const { createServiceRequestDraft, findLatestEditableDraft } = await import(
    "../services/consulting/sachAccountingServiceRequestService.js"
);
const { SACH_ACCOUNTING_CHAT_TOOLS } = await import("../services/consulting/sachAccountingChatTools.js");

await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());
await createCompany(companyId, {
    name: "Sach Confirm Test",
    industry: "Professional Services",
    status: "active",
    ownerUid: "staff",
    settings: { accountingPractice: { enabled: true } },
});

const first = await createServiceRequestDraft(companyId, clientUid, {
    serviceType: "cipc_company_registration",
    summary: "Company registration for Shalom Enterprise",
});
const saveTool = SACH_ACCOUNTING_CHAT_TOOLS.find((t) => t.name === "saveSachServiceRequest");
const second = await saveTool.execute(
    { companyId, customerId: clientUid, customerName: "Test", channel: "test" },
    { serviceType: "cipc_company_registration", summary: "Same request again without requestId" }
);
assert.equal(second.data.requestId, first.requestId, "save without requestId should update latest draft");
assert.equal(second.data.reference, first.reference, "reference must stay stable");

const latest = await findLatestEditableDraft(companyId, clientUid);
assert.equal(latest.requestId, first.requestId);

console.log("sach-accounting-confirm-submit.test.mjs OK");