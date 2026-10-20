/**
 * Atomic invoice payment — idempotency + balance + ledger (+ invoice paid state).
 * Firestore Admin: true transaction. Memory: serialized locks (single-process only).
 */
import { randomUUID } from "node:crypto";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    tenantDocRef,
    runAdminFirestoreTransaction,
    adminFirestoreTransactionsAvailable,
} from "../database/firestoreClient.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { FINANCE_IDEMPOTENCY_SCOPES, idempotencyDocId, withInvoicePaymentLock } from "./financeIdempotency.js";
import { buildPaymentRequestFingerprint, assertMatchingPaymentFingerprint } from "./financePaymentFingerprint.js";
import {
    assertInvoiceAcceptsPayment,
    assertPaymentAmountWithinBalance,
} from "./financePaymentRules.js";
import { invoiceStatusFromPaidMinor } from "./financeInvoiceStatus.js";
import { toMinorUnits, assertPositiveMinor, fromMinorUnits, addMinor } from "./money.js";
import { ServiceBase } from "../core/serviceBase.js";
import { assertFinanceRecordTenant, requireFinanceActor } from "./financeAccess.js";
import { assertCanViewFinance } from "../auth/financePermissionPolicy.js";
import { syncInvoicePaymentState } from "./financeInvoiceSync.js";

class FinanceIdempotencyRepository extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_IDEMPOTENCY_KEYS);
    }
}

class FinanceTransactionRepository extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_TRANSACTIONS);
    }
}

class FinanceInvoiceRepository extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_INVOICES);
    }
}

const idempotencyRepo = new FinanceIdempotencyRepository();
const txRepo = new FinanceTransactionRepository();
const invoiceRepo = new FinanceInvoiceRepository();

const STALE_PENDING_MS = Number(process.env.FINANCE_IDEM_STALE_MS ?? 30_000);

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

async function loadInvoice(companyId, invoiceId, access) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    const row = await invoiceRepo.get(companyId, invoiceId);
    if (!row) return null;
    assertFinanceRecordTenant(companyId, row);
    return row;
}

async function loadTransaction(companyId, transactionId, access) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    const row = await txRepo.get(companyId, transactionId);
    if (!row) return null;
    assertFinanceRecordTenant(companyId, row);
    return row;
}

function directionForRecordType(recordType) {
    if (recordType === "income") return "in";
    return "out";
}

function buildPaymentContext(invoice, invoiceId, access, input) {
    const payCurrency = String(input.currency || invoice.currency || "ZAR").trim().toUpperCase();
    if (payCurrency !== invoice.currency) {
        throw httpError("Payment currency must match invoice currency", 400, "FINANCE_INVOICE_INVALID");
    }
    const amountMinor = toMinorUnits(input.amount, payCurrency);
    assertPositiveMinor(amountMinor);
    const recordType = invoice.invoiceKind === "receivable" ? "income" : "expense";
    const fingerprint = buildPaymentRequestFingerprint({
        invoiceId,
        currency: payCurrency,
        amountMinor,
    });
    return {
        payCurrency,
        amountMinor,
        recordType,
        fingerprint,
        occurredAt: input.occurredAt || new Date().toISOString(),
        category:
            input.category || (recordType === "income" ? "invoice_payment" : "invoice_disbursement"),
        description: input.description || `Payment for invoice ${invoice.invoiceNumber || invoiceId}`,
        paymentMethod: input.paymentMethod || null,
        reference: input.reference || null,
        idempotencyKey: String(input.idempotencyKey || "").trim(),
    };
}

function buildTransactionRecord(companyId, access, invoiceId, ctx, txId) {
    return {
        id: txId,
        companyId,
        recordType: ctx.recordType,
        direction: directionForRecordType(ctx.recordType),
        amountMinor: ctx.amountMinor,
        currency: ctx.payCurrency,
        occurredAt: ctx.occurredAt,
        category: ctx.category,
        description: ctx.description,
        paymentMethod: ctx.paymentMethod,
        reference: ctx.reference,
        invoiceId,
        contactId: null,
        status: "posted",
        idempotencyKey: ctx.idempotencyKey,
        createdByUid: access.uid,
        updatedByUid: access.uid,
        voidReason: null,
        voidedByUid: null,
        voidedAt: null,
    };
}

async function findTransactionByIdempotencyKey(companyId, idempotencyKey) {
    const items = await txRepo.list(companyId, {
        max: 20,
        filters: { idempotencyKey: String(idempotencyKey) },
    });
    return items.find((t) => t.status === "posted") || items[0] || null;
}

async function completeIdempotencyFromExistingTx(companyId, docId, existingRecord, fingerprint, tx) {
    assertMatchingPaymentFingerprint(existingRecord?.fingerprint, fingerprint);
    const completed = await idempotencyRepo.update(companyId, docId, {
        status: "completed",
        resourceType: "financeTransaction",
        resourceId: tx.id,
        fingerprint,
    });
    return { replay: true, record: completed, transactionId: tx.id };
}

async function recoverStalePending(companyId, docId, record, fingerprint) {
    if (!record || record.status !== "pending") return null;
    const createdAt = Date.parse(record.createdAt || "");
    const stale = !Number.isFinite(createdAt) || Date.now() - createdAt >= STALE_PENDING_MS;
    if (!stale && STALE_PENDING_MS > 0) {
        throw httpError("Idempotency key in progress — retry shortly", 409, "FINANCE_IDEMPOTENCY_IN_PROGRESS");
    }
    if (record.resourceId) {
        const tx = await txRepo.get(companyId, record.resourceId);
        if (tx) {
            return completeIdempotencyFromExistingTx(companyId, docId, record, fingerprint, tx);
        }
    }
    const linked = await findTransactionByIdempotencyKey(companyId, record.clientKey);
    if (linked) {
        return completeIdempotencyFromExistingTx(companyId, docId, record, fingerprint, linked);
    }
    await idempotencyRepo.delete(companyId, docId);
    return null;
}

async function handleExistingIdempotency(companyId, docId, record, fingerprint) {
    if (!record) return null;
    if (record.status === "completed" && record.resourceId) {
        assertMatchingPaymentFingerprint(record.fingerprint, fingerprint);
        return { replay: true, transactionId: record.resourceId, record };
    }
    if (record.status === "pending") {
        const recovered = await recoverStalePending(companyId, docId, record, fingerprint);
        if (recovered) return recovered;
    }
    return null;
}

async function memoryAtomicPayment(companyId, access, invoiceId, input) {
    const invoice = await loadInvoice(companyId, invoiceId, access);
    if (!invoice) {
        throw httpError("Invoice not found", 404, "FINANCE_INVOICE_NOT_FOUND");
    }
    assertInvoiceAcceptsPayment(invoice);
    const ctx = buildPaymentContext(invoice, invoiceId, access, input);
    if (!ctx.idempotencyKey) {
        throw httpError("idempotencyKey is required for payments", 400, "FINANCE_IDEMPOTENCY_REQUIRED");
    }

    const scope = FINANCE_IDEMPOTENCY_SCOPES.INVOICE_PAYMENT;
    const docId = idempotencyDocId(scope, ctx.idempotencyKey);

    return withInvoicePaymentLock(companyId, invoiceId, async () => {
        let existing = await idempotencyRepo.get(companyId, docId);
        const replayEarly = await handleExistingIdempotency(companyId, docId, existing, ctx.fingerprint);
        if (replayEarly) {
            await syncInvoicePaymentState(companyId, invoiceId);
            const transaction = await loadTransaction(companyId, replayEarly.transactionId, access);
            const refreshed = await loadInvoice(companyId, invoiceId, access);
            return { transaction, invoice: refreshed, idempotentReplay: true };
        }

        const freshInvoice = await invoiceRepo.get(companyId, invoiceId);
        assertInvoiceAcceptsPayment(freshInvoice);
        assertPaymentAmountWithinBalance(freshInvoice, ctx.amountMinor);

        const txId = `ftx-${randomUUID()}`;
        try {
            await idempotencyRepo.createIfAbsent(companyId, docId, {
                scope,
                clientKey: ctx.idempotencyKey,
                status: "pending",
                fingerprint: ctx.fingerprint,
                resourceType: null,
                resourceId: txId,
            });
        } catch (err) {
            if (err.code === "DOCUMENT_ALREADY_EXISTS") {
                existing = await idempotencyRepo.get(companyId, docId);
                const replay = await handleExistingIdempotency(companyId, docId, existing, ctx.fingerprint);
                if (replay) {
                    await syncInvoicePaymentState(companyId, invoiceId);
                    const transaction = await loadTransaction(companyId, replay.transactionId, access);
                    const refreshed = await loadInvoice(companyId, invoiceId, access);
                    return { transaction, invoice: refreshed, idempotentReplay: true };
                }
                throw httpError("Idempotency conflict — retry with same key", 409, "FINANCE_IDEMPOTENCY_CONFLICT");
            }
            throw err;
        }

        try {
            const txPayload = buildTransactionRecord(companyId, access, invoiceId, ctx, txId);
            await txRepo.create(companyId, txPayload, txId);
            await syncInvoicePaymentState(companyId, invoiceId);
            await idempotencyRepo.update(companyId, docId, {
                status: "completed",
                resourceType: "financeTransaction",
                resourceId: txId,
            });
        } catch (err) {
            const orphan = await txRepo.get(companyId, txId);
            if (orphan) {
                await idempotencyRepo.update(companyId, docId, {
                    status: "completed",
                    resourceType: "financeTransaction",
                    resourceId: txId,
                });
                await syncInvoicePaymentState(companyId, invoiceId);
                const transaction = await loadTransaction(companyId, txId, access);
                const refreshed = await loadInvoice(companyId, invoiceId, access);
                return { transaction, invoice: refreshed, idempotentReplay: false };
            }
            await idempotencyRepo.delete(companyId, docId);
            throw err;
        }

        const transaction = await loadTransaction(companyId, txId, access);
        const refreshed = await loadInvoice(companyId, invoiceId, access);
        return { transaction, invoice: refreshed, idempotentReplay: false };
    });
}

async function firestoreAtomicPayment(companyId, access, invoiceId, input) {
    const invoice = await loadInvoice(companyId, invoiceId, access);
    if (!invoice) {
        throw httpError("Invoice not found", 404, "FINANCE_INVOICE_NOT_FOUND");
    }
    assertInvoiceAcceptsPayment(invoice);
    const ctx = buildPaymentContext(invoice, invoiceId, access, input);
    if (!ctx.idempotencyKey) {
        throw httpError("idempotencyKey is required for payments", 400, "FINANCE_IDEMPOTENCY_REQUIRED");
    }

    const scope = FINANCE_IDEMPOTENCY_SCOPES.INVOICE_PAYMENT;
    const docId = idempotencyDocId(scope, ctx.idempotencyKey);
    const idemRef = tenantDocRef(companyId, TENANT_COLLECTIONS.FINANCE_IDEMPOTENCY_KEYS, docId);
    const invRef = tenantDocRef(companyId, TENANT_COLLECTIONS.FINANCE_INVOICES, invoiceId);

    const txResult = await runAdminFirestoreTransaction(async (tx) => {
        const idemSnap = await tx.get(idemRef);
        if (idemSnap.exists()) {
            const idem = idemSnap.data();
            if (idem.status === "completed" && idem.resourceId) {
                assertMatchingPaymentFingerprint(idem.fingerprint, ctx.fingerprint);
                return { replay: true, transactionId: idem.resourceId };
            }
            if (idem.status === "pending") {
                assertMatchingPaymentFingerprint(idem.fingerprint, ctx.fingerprint);
                if (idem.resourceId) {
                    const txSnap = await tx.get(
                        tenantDocRef(companyId, TENANT_COLLECTIONS.FINANCE_TRANSACTIONS, idem.resourceId)
                    );
                    if (txSnap.exists()) {
                        tx.update(idemRef, { status: "completed", resourceType: "financeTransaction" });
                        return { replay: true, transactionId: idem.resourceId };
                    }
                }
                throw httpError("Idempotency key in progress — retry shortly", 409, "FINANCE_IDEMPOTENCY_IN_PROGRESS");
            }
        }

        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) {
            throw httpError("Invoice not found", 404, "FINANCE_INVOICE_NOT_FOUND");
        }
        const inv = invSnap.data();
        assertInvoiceAcceptsPayment({ ...inv, id: invoiceId });
        assertPaymentAmountWithinBalance(
            { totalMinor: inv.totalMinor, amountPaidMinor: inv.amountPaidMinor },
            ctx.amountMinor
        );

        const txId = `ftx-${randomUUID()}`;
        const txRef = tenantDocRef(companyId, TENANT_COLLECTIONS.FINANCE_TRANSACTIONS, txId);
        const txPayload = buildTransactionRecord(companyId, access, invoiceId, ctx, txId);

        tx.create(idemRef, {
            companyId,
            scope,
            clientKey: ctx.idempotencyKey,
            status: "pending",
            fingerprint: ctx.fingerprint,
            resourceType: null,
            resourceId: txId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        tx.create(txRef, {
            ...txPayload,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        const paidMinor = addMinor(Number(inv.amountPaidMinor) || 0, ctx.amountMinor);
        const nextStatus =
            inv.status === "draft" ? "draft" : invoiceStatusFromPaidMinor(inv.totalMinor, paidMinor);

        tx.update(invRef, {
            amountPaidMinor: paidMinor,
            status: nextStatus,
            updatedAt: new Date().toISOString(),
        });
        tx.update(idemRef, {
            status: "completed",
            resourceType: "financeTransaction",
            resourceId: txId,
            updatedAt: new Date().toISOString(),
        });

        return { replay: false, transactionId: txId };
    });

    await syncInvoicePaymentState(companyId, invoiceId);
    const transaction = await loadTransaction(companyId, txResult.transactionId, access);
    const refreshed = await loadInvoice(companyId, invoiceId, access);
    return {
        transaction,
        invoice: refreshed,
        idempotentReplay: Boolean(txResult.replay),
    };
}

/**
 * @returns {Promise<{ distributedAtomic: boolean, description: string }>}
 */
export async function paymentAtomicityCapabilities() {
    if (await adminFirestoreTransactionsAvailable()) {
        return {
            distributedAtomic: true,
            description: "Firestore Admin transactions coordinate idempotency, invoice balance, and ledger write.",
        };
    }
    const adapter = await getStorageAdapter();
    return {
        distributedAtomic: false,
        description: `Storage adapter "${adapter.name}" uses in-process locks only — not safe for multi-instance live payments.`,
    };
}

export async function recordInvoicePaymentAtomic(companyId, access, invoiceId, input) {
    if (await adminFirestoreTransactionsAvailable()) {
        return firestoreAtomicPayment(companyId, access, invoiceId, input);
    }
    return memoryAtomicPayment(companyId, access, invoiceId, input);
}
