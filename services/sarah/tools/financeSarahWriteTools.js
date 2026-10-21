/**
 * F2 — Finance Sarah confirm-gated writes (prepare → user confirms → confirmFinanceWrite).
 */
import { randomUUID } from "node:crypto";
import {
    createFinanceInvoiceForAccess,
    getFinanceInvoiceForAccess,
    recordInvoicePaymentForAccess,
} from "../../finance/financeInvoiceService.js";
import { assertFinanceSarahPaymentsEnabled } from "../../finance/financeSarahPaymentsGate.js";
import { createFinanceTransactionForAccess } from "../../finance/financeTransactionService.js";
import { createFinanceJournalEntryForAccess } from "../../finance/financeJournalService.js";
import { computeInvoiceLineItems, computeInvoiceTotals } from "../../finance/invoiceCalculations.js";
import { toMinorUnits } from "../../finance/money.js";
import { markQuotationNotes } from "../../../js/portal/financeQuotation.js";
import {
    clearFinanceSarahDraft,
    getFinanceSarahDraft,
    putFinanceSarahDraft,
} from "../financeSarahDraftStore.js";
import { financeWriteAccessFromCtx } from "./financeToolAccess.js";

const LINE_ITEM_SCHEMA = {
    type: "array",
    items: {
        type: "object",
        properties: {
            description: { type: "string" },
            quantity: { type: "number" },
            unitAmount: { type: "number", description: "Major currency units per line" },
        },
        required: ["description", "unitAmount"],
    },
};

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function normalizeLineItems(items) {
    return (Array.isArray(items) ? items : []).map((row) => ({
        description: String(row?.description || "").trim(),
        quantity: Number(row?.quantity) > 0 ? Number(row.quantity) : 1,
        unitAmount: Number(row?.unitAmount),
    }));
}

function previewInvoiceBody(args, { quotation = false } = {}) {
    const currency = String(args.currency || "ZAR").trim().toUpperCase();
    const lineItems = normalizeLineItems(args.lineItems);
    const { lineItems: computedLines, subtotalMinor } = computeInvoiceLineItems(lineItems, currency);
    const taxMinor = args.taxAmount != null ? toMinorUnits(Number(args.taxAmount), currency) : 0;
    const totals = computeInvoiceTotals(subtotalMinor, taxMinor);
    const userNotes = String(args.notes || "").trim();
    const notes = quotation ? markQuotationNotes(userNotes) : userNotes;
    return {
        invoiceKind: args.invoiceKind === "payable" ? "payable" : "receivable",
        status: args.status === "sent" ? "sent" : "draft",
        counterpartyName: String(args.counterpartyName || "").trim(),
        contactId: args.contactId || null,
        issueDate: args.issueDate || todayIso(),
        dueDate: args.dueDate || null,
        currency,
        lineItems: computedLines,
        taxAmount: args.taxAmount != null ? Number(args.taxAmount) : 0,
        notes,
        previewTotals: {
            subtotalMinor: totals.subtotalMinor,
            taxAmountMinor: totals.taxAmountMinor,
            totalMinor: totals.totalMinor,
            currency,
        },
    };
}

async function prepareDraft(ctx, args, { kind, quotation = false }) {
    financeWriteAccessFromCtx(ctx);
    const counterpartyName = String(args.counterpartyName || "").trim();
    if (!counterpartyName) {
        throw Object.assign(new Error("counterpartyName is required."), {
            code: "FINANCE_DRAFT_VALIDATION",
            status: 400,
        });
    }
    const lineItems = normalizeLineItems(args.lineItems);
    const createBody = previewInvoiceBody({ ...args, lineItems }, { quotation });
    if (!lineItems.length) {
        throw Object.assign(new Error("At least one line item is required."), {
            code: "FINANCE_DRAFT_VALIDATION",
            status: 400,
        });
    }

    const label = quotation ? "quotation" : "invoice";
    const entry = await putFinanceSarahDraft(ctx, {
        kind,
        createBody: {
            invoiceKind: createBody.invoiceKind,
            status: createBody.status,
            counterpartyName: createBody.counterpartyName,
            contactId: createBody.contactId,
            issueDate: createBody.issueDate,
            dueDate: createBody.dueDate,
            currency: createBody.currency,
            lineItems,
            taxAmount: createBody.taxAmount,
            notes: createBody.notes,
        },
        preview: createBody,
        summary: `${label} for ${counterpartyName}, ${createBody.currency}, total minor ${createBody.previewTotals.totalMinor}`,
    });

    return {
        message: `Prepared ${label} draft for ${counterpartyName} (${createBody.currency}). Total: ${createBody.previewTotals.totalMinor} minor units. Ask the user to confirm before saving. draftId: ${entry.draftId}`,
        data: {
            draftId: entry.draftId,
            kind: entry.kind,
            preview: createBody,
            expiresInMinutes: 30,
            userMustConfirm: true,
        },
        completionType: "draft_prepared",
        limitations: ["Nothing is saved until confirmFinanceWrite with userConfirmed true."],
    };
}

export const prepareFinanceInvoiceDraft = {
    name: "prepareFinanceInvoiceDraft",
    description:
        "Prepare a workspace Finance invoice (receivable or payable) for user review. Does not save until confirmFinanceWrite after explicit user confirmation.",
    parameters: {
        type: "object",
        properties: {
            invoiceKind: { type: "string", enum: ["receivable", "payable"] },
            counterpartyName: { type: "string" },
            currency: { type: "string" },
            lineItems: LINE_ITEM_SCHEMA,
            issueDate: { type: "string" },
            dueDate: { type: "string" },
            status: { type: "string", enum: ["draft", "sent"] },
            taxAmount: { type: "number" },
            notes: { type: "string" },
            contactId: { type: "string" },
        },
        required: ["counterpartyName", "lineItems"],
    },
    requiredPermissions: ["canCreateFinance"],
    async execute(ctx, args) {
        return prepareDraft(ctx, args, { kind: "invoice", quotation: false });
    },
};

export const prepareFinanceQuotationDraft = {
    name: "prepareFinanceQuotationDraft",
    description:
        "Prepare a Finance quotation (stored as a draft receivable with quotation marker). Does not save until confirmFinanceWrite after explicit user confirmation.",
    parameters: {
        type: "object",
        properties: {
            counterpartyName: { type: "string" },
            currency: { type: "string" },
            lineItems: LINE_ITEM_SCHEMA,
            issueDate: { type: "string" },
            dueDate: { type: "string" },
            taxAmount: { type: "number" },
            notes: { type: "string" },
            contactId: { type: "string" },
        },
        required: ["counterpartyName", "lineItems"],
    },
    requiredPermissions: ["canCreateFinance"],
    async execute(ctx, args) {
        return prepareDraft(ctx, { ...args, invoiceKind: "receivable", status: "draft" }, {
            kind: "quotation",
            quotation: true,
        });
    },
};

export const prepareFinanceLedgerEntryDraft = {
    name: "prepareFinanceLedgerEntryDraft",
    description:
        "Prepare a posted income or expense ledger transaction for user review. Does not save until confirmFinanceWrite after explicit user confirmation.",
    parameters: {
        type: "object",
        properties: {
            recordType: { type: "string", enum: ["income", "expense"] },
            amount: { type: "number", description: "Major currency units" },
            currency: { type: "string" },
            occurredAt: { type: "string" },
            category: { type: "string" },
            description: { type: "string" },
            paymentMethod: { type: "string" },
            reference: { type: "string" },
        },
        required: ["recordType", "amount", "description"],
    },
    requiredPermissions: ["canCreateFinance"],
    async execute(ctx, args) {
        financeWriteAccessFromCtx(ctx);
        const recordType = args.recordType === "income" ? "income" : "expense";
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw Object.assign(new Error("amount must be a positive number."), {
                code: "FINANCE_DRAFT_VALIDATION",
                status: 400,
            });
        }
        const currency = String(args.currency || "ZAR").trim().toUpperCase();
        const description = String(args.description || "").trim();
        if (!description) {
            throw Object.assign(new Error("description is required."), {
                code: "FINANCE_DRAFT_VALIDATION",
                status: 400,
            });
        }
        const createBody = {
            recordType,
            amount,
            currency,
            occurredAt: args.occurredAt || new Date().toISOString(),
            category: args.category || (recordType === "income" ? "Income" : "Expense"),
            description,
            paymentMethod: args.paymentMethod || "",
            reference: args.reference || "",
            status: "posted",
        };

        const entry = await putFinanceSarahDraft(ctx, {
            kind: "ledger_entry",
            createBody,
            preview: createBody,
            summary: `${recordType} ${amount} ${currency} — ${description}`,
        });

        return {
            message: `Prepared ${recordType} entry draft (${amount} ${currency}). Ask the user to confirm before posting. draftId: ${entry.draftId}`,
            data: {
                draftId: entry.draftId,
                kind: entry.kind,
                preview: createBody,
                expiresInMinutes: 30,
                userMustConfirm: true,
            },
            completionType: "draft_prepared",
            limitations: ["Not a bank payment; no invoice payment recording."],
        };
    },
};

const JOURNAL_LINE_SCHEMA = {
    type: "array",
    minItems: 2,
    items: {
        type: "object",
        properties: {
            accountCode: { type: "string" },
            currency: { type: "string" },
            debitAmount: { type: "number" },
            creditAmount: { type: "number" },
            description: { type: "string" },
        },
        required: ["accountCode"],
    },
};

export const prepareFinanceManualJournalDraft = {
    name: "prepareFinanceManualJournalDraft",
    description:
        "Prepare a balanced manual journal entry (minimum two lines). Debits must equal credits per currency. confirmFinanceWrite after user confirmation.",
    parameters: {
        type: "object",
        properties: {
            entryDate: { type: "string", description: "YYYY-MM-DD" },
            memo: { type: "string" },
            lines: JOURNAL_LINE_SCHEMA,
        },
        required: ["lines"],
    },
    requiredPermissions: ["canCreateFinance"],
    async execute(ctx, args) {
        financeWriteAccessFromCtx(ctx);
        const createBody = {
            entryDate: args.entryDate || todayIso(),
            memo: String(args.memo || "").trim(),
            lines: args.lines,
            source: "sarah_finance",
        };
        const entry = await putFinanceSarahDraft(ctx, {
            kind: "manual_journal",
            createBody,
            preview: createBody,
            summary: `Manual journal ${createBody.entryDate} (${(createBody.lines || []).length} lines)`,
        });
        return {
            message: `Prepared manual journal draft (${createBody.lines.length} lines). User must confirm. draftId: ${entry.draftId}`,
            data: { draftId: entry.draftId, kind: entry.kind, preview: createBody, userMustConfirm: true },
            completionType: "draft_prepared",
            limitations: ["Entry is validated for balance on confirm; inactive account codes are rejected."],
        };
    },
};

export const prepareFinanceInvoicePaymentDraft = {
    name: "prepareFinanceInvoicePaymentDraft",
    description:
        "Prepare recording a payment against an open invoice (requires FINANCE_SARAH_PAYMENTS_ENABLED on server). Does not post until confirmFinanceWrite after user confirmation.",
    parameters: {
        type: "object",
        properties: {
            invoiceId: { type: "string" },
            amount: { type: "number", description: "Major currency units" },
            paymentMethod: { type: "string" },
            reference: { type: "string" },
            occurredAt: { type: "string" },
        },
        required: ["invoiceId", "amount"],
    },
    requiredPermissions: ["canCreateFinance"],
    async execute(ctx, args) {
        assertFinanceSarahPaymentsEnabled();
        const access = financeWriteAccessFromCtx(ctx);
        const invoiceId = String(args.invoiceId || "").trim();
        const invoice = await getFinanceInvoiceForAccess(ctx.companyId, invoiceId, access);
        if (!invoice) {
            throw Object.assign(new Error("Invoice not found."), { code: "FINANCE_INVOICE_NOT_FOUND", status: 404 });
        }
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw Object.assign(new Error("amount must be positive."), { code: "FINANCE_DRAFT_VALIDATION", status: 400 });
        }
        const currency = String(invoice.currency || "ZAR").trim().toUpperCase();
        const createBody = {
            invoiceId,
            amount,
            currency,
            idempotencyKey: `sarah-pay-${randomUUID()}`,
            occurredAt: args.occurredAt || new Date().toISOString(),
            paymentMethod: args.paymentMethod || "other",
            reference: args.reference || "",
            category: "Invoice payment",
            description: `Payment for invoice ${invoice.invoiceNumber || invoiceId}`,
        };
        const entry = await putFinanceSarahDraft(ctx, {
            kind: "invoice_payment",
            createBody,
            preview: { invoiceId, counterpartyName: invoice.counterpartyName, amount, currency },
            summary: `Payment ${amount} ${currency} on invoice ${invoiceId}`,
        });
        return {
            message: `Prepared invoice payment draft (${amount} ${currency}). User must confirm before recording. draftId: ${entry.draftId}`,
            data: { draftId: entry.draftId, kind: entry.kind, preview: createBody, userMustConfirm: true },
            completionType: "draft_prepared",
            limitations: ["Records ledger payment via recordInvoicePaymentForAccess when confirmed."],
        };
    },
};

export const confirmFinanceWrite = {
    name: "confirmFinanceWrite",
    description:
        "Persist the Finance draft from prepareFinance* after the user explicitly confirmed in chat. Requires draftId and userConfirmed true.",
    parameters: {
        type: "object",
        properties: {
            draftId: { type: "string" },
            userConfirmed: {
                type: "boolean",
                description: "Must be true only after the user explicitly said yes to save/post this draft.",
            },
        },
        required: ["draftId", "userConfirmed"],
    },
    requiredPermissions: ["canCreateFinance"],
    async execute(ctx, args) {
        const access = financeWriteAccessFromCtx(ctx);
        if (args.userConfirmed !== true) {
            throw Object.assign(
                new Error("User must explicitly confirm before saving. Set userConfirmed true only after they agree."),
                { code: "FINANCE_CONFIRM_REQUIRED", status: 400 }
            );
        }
        const draftId = String(args.draftId || "").trim();
        const draft = getFinanceSarahDraft(ctx, draftId);
        if (!draft) {
            throw Object.assign(new Error("Draft not found or expired. Prepare the draft again."), {
                code: "FINANCE_DRAFT_NOT_FOUND",
                status: 404,
            });
        }

        const companyId = ctx.companyId;
        let record;
        if (draft.kind === "invoice" || draft.kind === "quotation") {
            record = await createFinanceInvoiceForAccess(companyId, access, draft.createBody);
        } else if (draft.kind === "ledger_entry") {
            record = await createFinanceTransactionForAccess(companyId, access, draft.createBody);
        } else if (draft.kind === "invoice_payment") {
            assertFinanceSarahPaymentsEnabled();
            const body = draft.createBody;
            record = await recordInvoicePaymentForAccess(companyId, access, body.invoiceId, body);
        } else if (draft.kind === "manual_journal") {
            record = await createFinanceJournalEntryForAccess(companyId, access, draft.createBody);
        } else {
            throw Object.assign(new Error(`Unknown draft kind: ${draft.kind}`), {
                code: "FINANCE_DRAFT_INVALID",
                status: 400,
            });
        }

        await clearFinanceSarahDraft(ctx);

        return {
            message: `Saved ${draft.kind.replace("_", " ")} successfully (id ${record.id}).`,
            data: { kind: draft.kind, record, draftId },
            completionType: "write_confirmed",
            userFacingTruth: draft.summary,
        };
    },
};
