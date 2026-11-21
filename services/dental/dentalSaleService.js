/**
 * SmileMore till sales. Prices come from the practice price list.
 * A sale is a receipt. It does not submit a medical-aid claim.
 */
import { createHash, randomUUID } from "node:crypto";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    adminFirestoreTransactionsAvailable,
    runAdminFirestoreTransaction,
    tenantDocRef,
} from "../database/firestoreClient.js";
import { getStorageBackendName } from "../storage/storageAdapter.js";
import { assertDentalPracticeTenant } from "./assertDentalPracticeTenant.js";
import { getDentalPatient, dentalPatientId } from "./dentalPatientService.js";
import { DENTAL_POS_METHODS, dentalPosTreatment } from "./dentalPosCatalog.js";
import { sendWhatsAppMessage } from "../whatsapp.js";
import { idempotencyDocId } from "../finance/financeIdempotency.js";
import { assertCanCreateFinance } from "../auth/financePermissionPolicy.js";
import { requireFinanceActor } from "../finance/financeAccess.js";
import {
    buildPostedFinanceTransactionPayloadForServer,
    ensurePostedFinanceTransactionForServer,
    getFinanceTransaction,
} from "../finance/financeTransactionService.js";

class DentalSaleService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.DENTAL_SALES);
    }
}

const sales = new DentalSaleService();

class DentalSaleIdempotencyService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_IDEMPOTENCY_KEYS);
    }
}

const saleIdempotency = new DentalSaleIdempotencyService();
const DENTAL_POS_SALE_SCOPE = "dental_pos_sale";
const localSaleLocks = new Map();

async function assertDentalTill(companyId) {
    await assertDentalPracticeTenant(companyId, "The till is only available for dental-clinic tenants.");
}

function money(cents) {
    return Math.round(cents) / 100;
}

function randsToCents(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.round(number * 100);
}

export async function listDentalSales(companyId) {
    await assertDentalTill(companyId);
    const items = await sales.list(companyId, { max: 300 });
    return items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function createDentalSale(companyId, input = {}, servedBy = "", access = {}) {
    await assertDentalTill(companyId);
    requireFinanceActor(access);
    assertCanCreateFinance(access.role);
    const phone = dentalPatientId(input.phone);
    const patient = await getDentalPatient(companyId, phone);
    if (!patient) throw new Error("Select a client from the file before taking payment. Add them on the till if they are new.");

    const lines = Array.isArray(input.items) ? input.items : [];
    if (!lines.length) throw new Error("Add at least one treatment.");
    const items = lines.map((line) => {
        const treatment = dentalPosTreatment(line.id);
        const qty = Math.round(Number(line.qty) || 0);
        if (!treatment) throw new Error("That treatment is not on the SmileMore price list.");
        if (qty < 1 || qty > 20) throw new Error("Quantity must be between 1 and 20.");
        return {
            id: treatment.id,
            name: treatment.name,
            qty,
            price: treatment.price,
            lineTotal: money(treatment.price * qty * 100),
        };
    });

    const subtotalCents = items.reduce((sum, item) => sum + Math.round(item.price * item.qty * 100), 0);
    const discountPercent = Math.round(Number(input.discountPercent) || 0);
    if (discountPercent < 0 || discountPercent > 100) throw new Error("Discount must be between 0 and 100 percent.");
    const discountCents = Math.round(subtotalCents * discountPercent / 100);
    const totalCents = Math.max(0, subtotalCents - discountCents);
    const method = String(input.method || "");
    if (!DENTAL_POS_METHODS.includes(method)) throw new Error("Choose cash, card, medical aid, EFT, mobile, or split.");

    const payment = readPayment(method, input, totalCents);
    const clientKey = String(input.idempotencyKey || "").trim();
    if (!clientKey || clientKey.length > 200) throw new Error("A valid payment request id is required.");
    const fingerprint = paymentFingerprint({ phone, items, discountPercent, totalCents, method, payment });
    const docId = idempotencyDocId(DENTAL_POS_SALE_SCOPE, clientKey);
    const saleId = `dps-${randomUUID()}`;
    const sale = {
        receiptNo: `RCP-${saleId.slice(-8).toUpperCase()}`,
        patientId: patient.phone || patient.id,
        patientName: patient.fullName,
        phone: patient.phone || phone,
        items,
        subtotal: money(subtotalCents),
        discountPercent,
        discountAmount: money(discountCents),
        total: money(totalCents),
        method,
        ...payment,
        servedBy: String(servedBy || input.servedBy || "Practice desk").replace(/\s+/g, " ").trim().slice(0, 80),
        claimSubmitted: false,
    };

    if ((await getStorageBackendName()) === "firestore" && await adminFirestoreTransactionsAvailable()) {
        return createDentalSaleFirestore(companyId, access, docId, fingerprint, saleId, sale);
    }
    return createDentalSaleRecoverably(companyId, access, docId, fingerprint, saleId, sale);
}

/**
 * Backfill ledger projections for receipts that were recorded before the POS
 * projection existed. This is intentionally server-only: the receipt itself
 * remains the source of truth and every ledger row uses a deterministic ID.
 */
export async function reconcileDentalSalesToFinance(companyId, access = {}) {
    await assertDentalTill(companyId);
    requireFinanceActor(access);
    assertCanCreateFinance(access.role);

    const receipts = await listDentalSales(companyId);
    const summary = {
        scanned: receipts.length,
        eligible: 0,
        created: 0,
        alreadyProjected: 0,
        excluded: 0,
        transactionIds: [],
    };

    for (const receipt of receipts) {
        const projection = saleFinanceProjection(receipt);
        if (!projection) {
            summary.excluded += 1;
            continue;
        }
        summary.eligible += 1;
        const prior = await getFinanceTransaction(companyId, projection.transactionId);
        const existing = await ensurePostedFinanceTransactionForServer(companyId, access, projection.body, {
            transactionId: projection.transactionId,
            expectedSource: { source: "dental_pos", sourceSaleId: receipt.id },
            ...projection.extras,
        });
        summary.transactionIds.push(existing.id);
        if (prior) summary.alreadyProjected += 1;
        else summary.created += 1;
    }
    return summary;
}

function paymentFingerprint(value) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

function assertFingerprint(existing, fingerprint) {
    if (existing?.fingerprint !== fingerprint) {
        throw httpError("That payment request id was already used for different payment details", 409, "DENTAL_POS_IDEMPOTENCY_CONFLICT");
    }
}

function saleFinanceProjection(sale) {
    let amount = Number(sale.total) || 0;
    let paymentMethod = sale.method;
    if (sale.method === "medical_aid") {
        if (!(amount > 0)) return null;
        return {
            transactionId: `ftx-dental-pos-${sale.id}`,
            body: {
                recordType: "income",
                amount,
                currency: "ZAR",
                occurredAt: sale.createdAt || new Date().toISOString(),
                category: "Dental POS (medical aid tender)",
                description: `SmileMore POS receipt ${sale.receiptNo} — recorded tender, not a scheme payment`,
                paymentMethod: "medical_aid",
                reference: sale.receiptNo,
            },
            extras: {
                source: "dental_pos",
                sourceSaleId: sale.id,
                sourceReceiptNo: sale.receiptNo,
                sourcePaymentMethod: sale.method,
            },
        };
    }
    if (sale.method === "split") {
        const split = sale.split || {};
        amount = (Number(split.cash) || 0) + (Number(split.card) || 0);
        paymentMethod = "split_cash_card";
    }
    if (!(amount > 0)) return null;
    return {
        transactionId: `ftx-dental-pos-${sale.id}`,
        body: {
            recordType: "income",
            amount,
            currency: "ZAR",
            occurredAt: sale.createdAt || new Date().toISOString(),
            category: "Dental POS",
            description: `SmileMore POS receipt ${sale.receiptNo}`,
            paymentMethod,
            reference: sale.receiptNo,
        },
        extras: {
            source: "dental_pos",
            sourceSaleId: sale.id,
            sourceReceiptNo: sale.receiptNo,
            sourcePaymentMethod: sale.method,
        },
    };
}

async function createDentalSaleFirestore(companyId, access, docId, fingerprint, saleId, sale) {
    const idemRef = tenantDocRef(companyId, TENANT_COLLECTIONS.FINANCE_IDEMPOTENCY_KEYS, docId);
    const result = await runAdminFirestoreTransaction(async (tx) => {
        const existingSnap = await tx.get(idemRef);
        if (existingSnap.exists()) {
            const existing = existingSnap.data();
            assertFingerprint(existing, fingerprint);
            if (!existing.resourceId) {
                throw httpError("The existing payment request is incomplete; retry shortly", 409, "DENTAL_POS_IDEMPOTENCY_IN_PROGRESS");
            }
            return { saleId: existing.resourceId, replay: true };
        }

        const createdAt = new Date().toISOString();
        const fullSale = { ...sale, id: saleId, companyId, createdAt, updatedAt: createdAt };
        const projection = saleFinanceProjection(fullSale);
        const saleRef = tenantDocRef(companyId, TENANT_COLLECTIONS.DENTAL_SALES, saleId);
        const { id: _ignoredSaleId, ...saleDocument } = fullSale;
        tx.create(saleRef, saleDocument);
        if (projection) {
            const financeRef = tenantDocRef(companyId, TENANT_COLLECTIONS.FINANCE_TRANSACTIONS, projection.transactionId);
            const finance = buildPostedFinanceTransactionPayloadForServer(companyId, access, projection.body, projection.extras);
            tx.create(financeRef, { ...finance, companyId, createdAt, updatedAt: createdAt });
        }
        tx.create(idemRef, {
            companyId,
            scope: DENTAL_POS_SALE_SCOPE,
            keyHash: docId,
            fingerprint,
            status: "completed",
            resourceType: "dentalSale",
            resourceId: saleId,
            financeTransactionId: projection?.transactionId || null,
            createdAt,
            updatedAt: createdAt,
        });
        return { saleId, replay: false };
    });
    const created = await sales.get(companyId, result.saleId);
    if (!created) throw httpError("The payment receipt could not be loaded after completion", 500, "DENTAL_POS_RECEIPT_MISSING");
    return created;
}

async function withLocalSaleLock(key, fn) {
    const previous = localSaleLocks.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const chain = previous.then(() => gate);
    localSaleLocks.set(key, chain);
    await previous;
    try {
        return await fn();
    } finally {
        release();
        if (localSaleLocks.get(key) === chain) localSaleLocks.delete(key);
    }
}

async function createDentalSaleRecoverably(companyId, access, docId, fingerprint, saleId, sale) {
    return withLocalSaleLock(`${companyId}:${docId}`, async () => {
        let receipt = await saleIdempotency.get(companyId, docId);
        if (receipt) {
            assertFingerprint(receipt, fingerprint);
        } else {
            receipt = await saleIdempotency.create(companyId, {
                scope: DENTAL_POS_SALE_SCOPE,
                keyHash: docId,
                fingerprint,
                status: "pending",
                resourceType: "dentalSale",
                resourceId: saleId,
                financeTransactionId: null,
            }, docId);
        }

        const resolvedSaleId = receipt.resourceId;
        let created = await sales.get(companyId, resolvedSaleId);
        if (!created) {
            created = await sales.create(companyId, sale, resolvedSaleId);
        }

        const projection = saleFinanceProjection(created);
        if (projection) {
            await ensurePostedFinanceTransactionForServer(companyId, access, projection.body, {
                transactionId: projection.transactionId,
                expectedSource: { source: "dental_pos", sourceSaleId: created.id },
                ...projection.extras,
            });
        }
        if (receipt.status !== "completed") {
            await saleIdempotency.update(companyId, docId, {
                status: "completed",
                financeTransactionId: projection?.transactionId || null,
            });
        }
        return created;
    });
}

export function dentalReceiptText(sale) {
    const lines = (sale.items || []).map((item) => `${item.name} × ${item.qty}: R ${Number(item.lineTotal ?? item.price * item.qty).toLocaleString("en-ZA")}`);
    return [
        "SmileMore Dentists",
        "Shop 04, City Square Mall, Rustenburg",
        "Tel: 014 592 9220",
        `Receipt: ${sale.receiptNo || ""}`,
        `Patient: ${sale.patientName || ""} (${sale.phone || ""})`,
        ...lines,
        `Total: R ${Number(sale.total || 0).toLocaleString("en-ZA")}`,
        `Payment: ${String(sale.method || "").replaceAll("_", " ")}`,
        `Served by: ${sale.servedBy || "Practice desk"}`,
        "Thank you.",
    ].join("\n");
}

export function whatsAppDigits(phone) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
    else if (digits.length === 9) digits = `27${digits}`;
    return digits;
}

export async function sendDentalReceipt(companyId, saleId, { channel, email } = {}) {
    await assertDentalTill(companyId);
    const sale = await sales.get(companyId, saleId);
    if (!sale) throw new Error("That receipt was not found.");
    const text = dentalReceiptText(sale);
    if (channel === "whatsapp") {
        const to = whatsAppDigits(sale.phone);
        if (to.length < 11) throw new Error("This client has no phone number for WhatsApp.");
        const waUrl = `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
        try {
            await sendWhatsAppMessage(to, text, { companyId });
            const updated = await sales.update(companyId, saleId, { sentWhatsappAt: new Date().toISOString() });
            return { channel: "whatsapp", delivered: true, sale: updated };
        } catch (err) {
            return { channel: "whatsapp", delivered: false, waUrl, error: err.message || "WhatsApp could not send from the practice number." };
        }
    }
    if (channel === "email") {
        const to = String(email || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Add an email address for this client.");
        const updated = await sales.update(companyId, saleId, { sentEmailAt: new Date().toISOString(), emailTo: to });
        const subject = encodeURIComponent(`SmileMore Dentists receipt ${sale.receiptNo || ""}`);
        const body = encodeURIComponent(text);
        return { channel: "email", delivered: true, mailto: `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`, sale: updated };
    }
    throw new Error("Choose WhatsApp or email.");
}

function readPayment(method, input, totalCents) {
    const text = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
    if (method === "cash") {
        const received = randsToCents(input.cashReceived);
        if (received < totalCents) {
            throw new Error(`Insufficient amount. Still need R ${money(totalCents - received).toLocaleString("en-ZA")}`);
        }
        return { cashReceived: money(received), change: money(received - totalCents) };
    }
    if (method === "split") {
        const split = input.split || {};
        const cash = randsToCents(split.cash);
        const card = randsToCents(split.card);
        const medical = randsToCents(split.medical);
        if (cash + card + medical < totalCents) throw new Error("Split payments must cover the full amount.");
        return {
            split: { cash: money(cash), card: money(card), medical: money(medical) },
            change: money(Math.max(0, cash + card + medical - totalCents)),
        };
    }
    if (method === "card") return { cardReference: text(input.cardReference, 8) };
    if (method === "medical_aid") {
        return {
            medicalScheme: text(input.medicalScheme, 80),
            membershipNumber: text(input.membershipNumber, 40),
        };
    }
    if (method === "eft") return { eftReference: text(input.eftReference, 40) };
    return { mobileReference: text(input.mobileReference, 40) };
}
