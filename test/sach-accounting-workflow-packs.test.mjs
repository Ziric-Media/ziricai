#!/usr/bin/env node
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";

const companyId = `sach-wf-${Date.now()}`;
const clientUid = `client_wf_${Date.now()}`;

const { createCompany } = await import("../services/tenants/companyService.js");
const { getWorkflowPack, listIntakeGaps } = await import("../services/consulting/sachAccountingWorkflowPacks.js");
const {
    createServiceRequestDraft,
    registerServiceDocument,
} = await import("../services/consulting/sachAccountingServiceRequestService.js");
const { SACH_ACCOUNTING_CHAT_TOOLS } = await import("../services/consulting/sachAccountingChatTools.js");

await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

await createCompany(companyId, {
    name: "Sach WF Test",
    status: "active",
    ownerUid: "staff",
    settings: { accountingPractice: { enabled: true } },
});

const pack = getWorkflowPack("vat");
assert.ok(pack);
assert.equal(pack.department, "tax");

const wfTool = SACH_ACCOUNTING_CHAT_TOOLS.find((t) => t.name === "getSachServiceWorkflow");
const wf = await wfTool.execute({}, { serviceType: "vat" });
assert.equal(wf.ok, true);
assert.ok(wf.message.includes("INTAKE FIELDS"));

const draft = await createServiceRequestDraft(companyId, clientUid, {
    serviceType: "payroll_monthly",
    intakeAnswers: { business_name: "Acme", payroll_month: "2025-11", employee_count: "12" },
    summary: "November payroll",
});
assert.equal(draft.assignedDepartment, undefined); // publicRequest omits department - check checklist
assert.ok(draft.documentChecklist?.length >= 2);
const gaps = listIntakeGaps(getWorkflowPack("payroll_monthly"), draft.intakeAnswers);
assert.equal(gaps.length, 0);

const withDoc = await registerServiceDocument(companyId, clientUid, draft.requestId, {
    type: "payroll_input_schedule",
    fileName: "nov-input.xlsx",
});
const row = withDoc.documentChecklist.find((d) => d.docKey === "payroll_input_schedule");
assert.equal(row.status, "uploaded");

console.log("sach-accounting-workflow-packs.test.mjs OK");