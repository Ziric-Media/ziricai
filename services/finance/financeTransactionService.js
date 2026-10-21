/**
 * Finance transactions — tenant ledger (expense / income / transfer).
 * Use *ForAccess from HTTP/automation; enforces financePermissionPolicy.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    assertCanViewFinance,
    sanitizeFinanceTransactionCreateBody,
    validateFinanceTransactionCreateBody,
    sanitizeFinanceTransactionUpdatePatch,
    assertCanUpdateFinanceTransaction,
    validateFinanceTransactionVoidBody,
    assertCanDeleteFinance,
} from "../auth/financePermissionPolicy.js";
import { assertFinanceRecordTenant, requireFinanceActor } from "./financeAccess.js";
import { toMinorUnits } from "./money.js";
import { syncInvoicePaymentState } from "./financeInvoiceSync.js";
import { withInvoicePaymentLock } from "./financeIdempotency.js";

class FinanceTransactionService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_TRANSACTIONS);
    }
}

const transactionService = new FinanceTransactionService();

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

function directionForRecordType(recordType) {
    if (recordType === "income") return "in";
    if (recordType === "expense" || recordType === "transfer") return "out";
    return null;
}


function buildTransactionPayload(access, validated, extra = {}) {
    const currency = String(validated.currency).trim().toUpperCase();
    const amountMinor = toMinorUnits(validated.amount, currency);
    const direction = directionForRecordType(validated.recordType);
    return {
        recordType: validated.recordType,
        direction,
        amountMinor,
        currency,
        occurredAt: validated.occurredAt,
        category: validated.category,
        description: validated.description || "",
        paymentMethod: validated.paymentMethod || null,
        reference: validated.reference || null,
        invoiceId: validated.invoiceId || null,
        contactId: validated.contactId || null,
        status: "posted",
        createdByUid: access.uid,
        updatedByUid: access.uid,
        voidReason: null,
        voidedByUid: null,
        voidedAt: null,
        ...extra,
    };
}

export async function listFinanceTransactionsForAccess(companyId, access = {}, options = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    return transactionService.list(companyId, options);
}

export async function listFinanceTransactionsPageForAccess(companyId, access = {}, options = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    return transactionService.listPage(companyId, options);
}

export async function getFinanceTransactionForAccess(companyId, transactionId, access = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    const row = await transactionService.get(companyId, transactionId);
    if (!row) return null;
    assertFinanceRecordTenant(companyId, row);
    return row;
}

export async function createFinanceTransactionForAccess(companyId, access = {}, body = {}) {
    requireFinanceActor(access);
    const sanitized = sanitizeFinanceTransactionCreateBody(body);
    const validated = validateFinanceTransactionCreateBody(access.role, companyId, sanitized);
    const payload = buildTransactionPayload(access, validated);
    const created = await transactionService.create(companyId, payload);
    if (created?.invoiceId) {
        await syncInvoicePaymentState(companyId, created.invoiceId);
        return getFinanceTransactionForAccess(companyId, created.id, access);
    }
    return created;
}

/**
 * Server-only posted transaction (invoice linkage + idempotency key are never client-set).
 * Used by invoice payment recording after idempotency reservation.
 */
export async function createPostedFinanceTransactionForServer(companyId, access, body, serverExtras = {}) {
    requireFinanceActor(access);
    const sanitized = sanitizeFinanceTransactionCreateBody(body);
    const validated = validateFinanceTransactionCreateBody(access.role, companyId, sanitized);
    const payload = buildTransactionPayload(access, validated, serverExtras);
    const created = await transactionService.create(companyId, payload);
    if (created?.invoiceId) {
        await syncInvoicePaymentState(companyId, created.invoiceId);
    }
    return transactionService.get(companyId, created.id);
}

export async function updateFinanceTransactionForAccess(companyId, transactionId, access = {}, patch = {}) {
    requireFinanceActor(access);
    const existing = await getFinanceTransactionForAccess(companyId, transactionId, access);
    if (!existing) return null;
    const sanitized = sanitizeFinanceTransactionUpdatePatch(patch);
    assertCanUpdateFinanceTransaction(access.role, existing, sanitized);

    const next = { ...sanitized, updatedByUid: access.uid };
    if (sanitized.amount !== undefined) {
        next.amountMinor = toMinorUnits(sanitized.amount, existing.currency || sanitized.currency || "ZAR");
        delete next.amount;
    }
    if (sanitized.recordType !== undefined) {
        next.direction = directionForRecordType(sanitized.recordType);
    }

    const updated = await transactionService.update(companyId, transactionId, next);
    if (existing.invoiceId || updated?.invoiceId) {
        const invId = updated?.invoiceId || existing.invoiceId;
        if (invId) await syncInvoicePaymentState(companyId, invId);
    }
    return updated;
}

export async function voidFinanceTransactionForAccess(companyId, transactionId, access = {}, { voidReason } = {}) {
    requireFinanceActor(access);
    const existing = await getFinanceTransactionForAccess(companyId, transactionId, access);
    if (!existing) return null;
    validateFinanceTransactionVoidBody(access.role, existing, { status: "void", voidReason });

    const performVoid = async () => {
        const now = new Date().toISOString();
        const updated = await transactionService.update(companyId, transactionId, {
            status: "void",
            voidReason: String(voidReason).trim(),
            voidedByUid: access.uid,
            voidedAt: now,
            updatedByUid: access.uid,
        });
        if (existing.invoiceId) {
            await syncInvoicePaymentState(companyId, existing.invoiceId);
        }
        return updated;
    };

    if (existing.invoiceId) {
        return withInvoicePaymentLock(companyId, existing.invoiceId, performVoid);
    }
    return performVoid();
}

export async function deleteFinanceTransactionForAccess(companyId, transactionId, access = {}) {
    requireFinanceActor(access);
    await getFinanceTransactionForAccess(companyId, transactionId, access);
    assertCanDeleteFinance(access.role);
}

/** Internal — tenant scope is caller's responsibility. */
export async function getFinanceTransaction(companyId, transactionId) {
    return transactionService.get(companyId, transactionId);
}
