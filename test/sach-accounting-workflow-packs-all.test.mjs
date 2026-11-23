#!/usr/bin/env node
/**
 * Sach workflow packs — coverage for ordered PAYE → EMP201 → personal tax → registration → COIDA/CIDB.
 */
import assert from "node:assert/strict";
import {
    SACH_WORKFLOW_PACKS,
    SACH_WORKFLOW_PACK_ORDER,
    getWorkflowPack,
    listWorkflowPackSummaries,
} from "../services/consulting/sachAccountingWorkflowPacks.js";

const ORDER_TAIL = [
    "paye",
    "emp201",
    "income_tax_personal",
    "cipc_registration",
    "coida",
    "cidb",
];

assert.equal(SACH_WORKFLOW_PACK_ORDER.length, 22);
assert.equal(Object.keys(SACH_WORKFLOW_PACKS).length, SACH_WORKFLOW_PACK_ORDER.length);
assert.equal(listWorkflowPackSummaries().length, SACH_WORKFLOW_PACK_ORDER.length);

for (let i = 0; i < ORDER_TAIL.length; i++) {
    assert.equal(SACH_WORKFLOW_PACK_ORDER[SACH_WORKFLOW_PACK_ORDER.indexOf(ORDER_TAIL[i])], ORDER_TAIL[i]);
}

for (const serviceType of ORDER_TAIL) {
    const pack = getWorkflowPack(serviceType);
    assert.ok(pack, serviceType);
    assert.ok(pack.intakeQuestions.length >= 5, `${serviceType} questions`);
    assert.ok(pack.documentChecklist.length >= 2, `${serviceType} docs`);
    assert.ok(pack.department, `${serviceType} department`);
}

const payeRequired = getWorkflowPack("paye").intakeQuestions.filter((q) => q.required).map((q) => q.id);
assert.ok(payeRequired.includes("paye_registered"));
assert.ok(getWorkflowPack("emp201").intakeQuestions.some((q) => q.id === "emp201_period"));
assert.ok(getWorkflowPack("income_tax_personal").intakeQuestions.some((q) => q.id === "taxpayer_type"));
assert.ok(getWorkflowPack("cipc_registration").intakeQuestions.some((q) => q.id === "proposed_name"));
assert.ok(getWorkflowPack("coida").intakeQuestions.some((q) => q.id === "coida_scenario"));
assert.ok(getWorkflowPack("cidb").intakeQuestions.some((q) => q.id === "cidb_scenario"));

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
for (const serviceType of BATCH2) {
    assert.ok(getWorkflowPack(serviceType), `batch2 ${serviceType}`);
}

console.log("sach-accounting-workflow-packs-all.test.mjs OK", { packCount: SACH_WORKFLOW_PACK_ORDER.length });