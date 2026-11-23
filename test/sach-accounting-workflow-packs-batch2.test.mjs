#!/usr/bin/env node
import assert from "node:assert/strict";
import {
    SACH_WORKFLOW_PACK_ORDER,
    getWorkflowPack,
} from "../services/consulting/sachAccountingWorkflowPacks.js";

const BATCH2 = [
    "income_tax_company",
    "provisional_tax",
    "tax_clearance",
    "sars_correspondence",
    "beneficial_ownership",
    "csd",
    "rma",
    "management_accounts",
    "annual_financial_statements",
    "payroll_onboarding",
];

assert.equal(SACH_WORKFLOW_PACK_ORDER.length, 22);

for (const serviceType of BATCH2) {
    assert.ok(SACH_WORKFLOW_PACK_ORDER.includes(serviceType), serviceType);
    const pack = getWorkflowPack(serviceType);
    assert.ok(pack, serviceType);
    assert.ok(pack.intakeQuestions.length >= 5);
    assert.ok(pack.documentChecklist.length >= 2);
}

console.log("sach-accounting-workflow-packs-batch2.test.mjs OK");