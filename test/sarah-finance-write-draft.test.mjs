import assert from "node:assert/strict";
import test from "node:test";
import {
    prepareFinanceInvoiceDraft,
    confirmFinanceWrite,
} from "../services/sarah/tools/financeSarahWriteTools.js";
import { FINANCE_SARAH_ALLOWED_TOOL_NAMES } from "../services/sarah/financeSarahToolPolicy.js";

test("F2 write tools are on Finance allowlist", () => {
    for (const name of [
        "prepareFinanceInvoiceDraft",
        "prepareFinanceQuotationDraft",
        "prepareFinanceLedgerEntryDraft",
        "confirmFinanceWrite",
    ]) {
        assert.ok(FINANCE_SARAH_ALLOWED_TOOL_NAMES.has(name), name);
    }
    assert.ok(!FINANCE_SARAH_ALLOWED_TOOL_NAMES.has("generateQuote"));
});

test("confirmFinanceWrite rejects without userConfirmed", async () => {
    const session = { id: "sess-f2-test", context: {} };
    const ctx = {
        companyId: "tenant-a",
        uid: "user-a",
        role: "finance",
        sarahSession: session,
    };
    await assert.rejects(
        () => confirmFinanceWrite.execute(ctx, { draftId: "abc", userConfirmed: false }),
        (err) => err?.code === "FINANCE_CONFIRM_REQUIRED"
    );
});

test("prepareFinanceInvoiceDraft requires Sarah session", async () => {
    const ctx = { companyId: "tenant-a", uid: "user-a", role: "finance" };
    await assert.rejects(
        () =>
            prepareFinanceInvoiceDraft.execute(ctx, {
                counterpartyName: "Acme",
                lineItems: [{ description: "Service", unitAmount: 100 }],
            }),
        (err) => err?.code === "FINANCE_DRAFT_NO_SESSION"
    );
});
