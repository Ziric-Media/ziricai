/**
 * Finance invoices — AR/AP documents (workspace finance, not subscription billing).
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    assertCanViewFinance,
    assertCanCreateFinance,
    sanitizeFinanceInvoiceCreateBody,
    validateFinanceInvoiceCreateBody,
    sanitizeFinanceInvoiceUpdatePatch,
    assertCanUpdateFinanceInvoice,
    validateFinanceInvoiceVoidBody,
} from "../auth/financePermissionPolicy.js";
import { assertFinanceRecordTenant, requireFinanceActor } from "./financeAccess.js";
import { computeInvoiceLineItems, computeInvoiceTotals } from "./invoiceCalculations.js";
import { toMinorUnits } from "./money.js";
import { syncInvoicePaymentState } from "./financeInvoiceSync.js";
import { assertClientInvoiceStatusPatch } from "./financeInvoiceStatus.js";
import { recordInvoicePaymentAtomic } from "./financeAtomicPayment.js";

class FinanceInvoiceService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_INVOICES);
    }
}

const invoiceService = new FinanceInvoiceService();

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

export async function listFinanceInvoicesForAccess(companyId, access = {}, options = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    return invoiceService.list(companyId, options);
}

export async function listFinanceInvoicesPageForAccess(companyId, access = {}, options = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    return invoiceService.listPage(companyId, options);
}

export async function getFinanceInvoiceForAccess(companyId, invoiceId, access = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    const row = await invoiceService.get(companyId, invoiceId);
    if (!row) return null;
    assertFinanceRecordTenant(companyId, row);
    return row;
}

export async function createFinanceInvoiceForAccess(companyId, access = {}, body = {}) {
    requireFinanceActor(access);
    const sanitized = sanitizeFinanceInvoiceCreateBody(body);
    validateFinanceInvoiceCreateBody(access.role, companyId, sanitized);

    const currency = String(sanitized.currency).trim().toUpperCase();
    const { lineItems, subtotalMinor } = computeInvoiceLineItems(sanitized.lineItems, currency);
    const taxMinor = sanitized.taxAmount != null ? toMinorUnits(sanitized.taxAmount, currency) : 0;
    const totals = computeInvoiceTotals(subtotalMinor, taxMinor);

    return invoiceService.create(companyId, {
        invoiceKind: sanitized.invoiceKind,
        status: sanitized.status || "draft",
        invoiceNumber: sanitized.invoiceNumber || null,
        counterpartyName: sanitized.counterpartyName,
        contactId: sanitized.contactId || null,
        issueDate: sanitized.issueDate,
        dueDate: sanitized.dueDate || null,
        currency,
        lineItems,
        subtotalMinor: totals.subtotalMinor,
        taxAmountMinor: totals.taxAmountMinor,
        totalMinor: totals.totalMinor,
        amountPaidMinor: 0,
        notes: sanitized.notes || "",
        voidReason: null,
        voidedByUid: null,
        voidedAt: null,
        createdByUid: access.uid,
        updatedByUid: access.uid,
    });
}

export async function updateFinanceInvoiceForAccess(companyId, invoiceId, access = {}, patch = {}) {
    requireFinanceActor(access);
    const existing = await getFinanceInvoiceForAccess(companyId, invoiceId, access);
    if (!existing) return null;
    const sanitized = sanitizeFinanceInvoiceUpdatePatch(patch);
    assertCanUpdateFinanceInvoice(access.role, existing, sanitized);
    assertClientInvoiceStatusPatch(existing, sanitized.status);

    const next = { updatedByUid: access.uid };
    if (sanitized.invoiceKind !== undefined) next.invoiceKind = sanitized.invoiceKind;
    if (sanitized.status !== undefined) next.status = sanitized.status;
    if (sanitized.invoiceNumber !== undefined) next.invoiceNumber = sanitized.invoiceNumber;
    if (sanitized.counterpartyName !== undefined) next.counterpartyName = sanitized.counterpartyName;
    if (sanitized.contactId !== undefined) next.contactId = sanitized.contactId;
    if (sanitized.issueDate !== undefined) next.issueDate = sanitized.issueDate;
    if (sanitized.dueDate !== undefined) next.dueDate = sanitized.dueDate;
    if (sanitized.notes !== undefined) next.notes = sanitized.notes;

    if (sanitized.lineItems) {
        const currency = existing.currency;
        const { lineItems, subtotalMinor } = computeInvoiceLineItems(sanitized.lineItems, currency);
        const taxMinor =
            sanitized.taxAmount != null
                ? toMinorUnits(sanitized.taxAmount, currency)
                : Number(sanitized.taxAmountMinor ?? existing.taxAmountMinor) || 0;
        const totals = computeInvoiceTotals(subtotalMinor, taxMinor);
        next.lineItems = lineItems;
        next.subtotalMinor = totals.subtotalMinor;
        next.taxAmountMinor = totals.taxAmountMinor;
        next.totalMinor = totals.totalMinor;
    }

    const updated = await invoiceService.update(companyId, invoiceId, next);
    if (updated) await syncInvoicePaymentState(companyId, invoiceId);
    return updated;
}

export async function voidFinanceInvoiceForAccess(companyId, invoiceId, access = {}, { voidReason } = {}) {
    requireFinanceActor(access);
    const existing = await getFinanceInvoiceForAccess(companyId, invoiceId, access);
    if (!existing) return null;
    validateFinanceInvoiceVoidBody(access.role, existing, { status: "void", voidReason });

    const paid = Number(existing.amountPaidMinor) || 0;
    if (paid > 0) {
        throw httpError(
            "Cannot void an invoice with recorded payments; void linked transactions first",
            403,
            "FINANCE_INVOICE_VOID_PAYMENTS"
        );
    }

    const now = new Date().toISOString();
    return invoiceService.update(companyId, invoiceId, {
        status: "void",
        voidReason: String(voidReason).trim(),
        voidedByUid: access.uid,
        voidedAt: now,
        updatedByUid: access.uid,
    });
}

/**
 * Record invoice payment as a ledger transaction + sync invoice paid state.
 * Idempotent on idempotencyKey (safe client retries).
 */
export async function recordInvoicePaymentForAccess(
    companyId,
    access = {},
    invoiceId,
    { amount, currency, idempotencyKey, occurredAt, paymentMethod, reference, category, description } = {}
) {
    requireFinanceActor(access);
    assertCanCreateFinance(access.role);
    return recordInvoicePaymentAtomic(companyId, access, invoiceId, {
        amount,
        currency,
        idempotencyKey,
        occurredAt,
        paymentMethod,
        reference,
        category,
        description,
    });
}
