#!/usr/bin/env node
/**
 * Sach Accounting — service request tools + tenant gate (memory).
 */
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";

const companyId = `sach-practice-${Date.now()}`;
const clientUid = `client_${Date.now()}`;

const { createCompany } = await import("../services/tenants/companyService.js");
const { shouldRunSachAccountingChat } = await import("../services/consulting/sachAccountingIndustryPreset.js");
const {
    createServiceRequestDraft,
    submitServiceRequest,
    listServiceRequestsForStaff,
} = await import("../services/consulting/sachAccountingServiceRequestService.js");
const { SACH_ACCOUNTING_CHAT_TOOLS } = await import("../services/consulting/sachAccountingChatTools.js");

await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

await createCompany(companyId, {
    name: "Sach Practice Test",
    industry: "Professional Services",
    status: "active",
    ownerUid: "staff",
    settings: { accountingPractice: { enabled: true } },
});

assert.equal(await shouldRunSachAccountingChat(companyId), true);

const draft = await createServiceRequestDraft(companyId, clientUid, {
    serviceType: "vat",
    categories: ["tax"],
    summary: "VAT return assistance for Q3",
    reportingPeriod: "2025-09",
});
assert.ok(draft.reference?.startsWith("SACH-"));

const saveTool = SACH_ACCOUNTING_CHAT_TOOLS.find((t) => t.name === "saveSachServiceRequest");
const saved = await saveTool.execute(
    { companyId, customerId: clientUid, customerName: "Test Client", channel: "test" },
    {
        requestId: draft.requestId,
        summary: "Updated summary",
        businessLegalName: "Test Co Pty Ltd",
    }
);
assert.equal(saved.ok, true);
assert.match(saved.message, /Saved service request/i);

const submitTool = SACH_ACCOUNTING_CHAT_TOOLS.find((t) => t.name === "submitSachServiceRequest");
const submitted = await submitTool.execute(
    { companyId, customerId: clientUid, customerName: "Test Client", channel: "test" },
    { requestId: draft.requestId }
);
assert.equal(submitted.ok, true);
assert.equal(submitted.data.status, "ready_for_review");

const staffList = await listServiceRequestsForStaff(companyId);
assert.equal(staffList.total, 1);
assert.equal(staffList.requests[0].status, "ready_for_review");

console.log("sach-accounting-service-requests.test.mjs OK");