/**
 * RS02 — append-only style payment ledger (put once per reference).
 */
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";

const ledger = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_PAYMENT_LEDGER);

/**
 * @param {object} entry
 */
export async function recordConsumerPayment(entry) {
    const reference = String(entry.paymentReference || "").trim();
    if (!reference) return { created: false, reason: "REFERENCE_REQUIRED" };
    const doc = {
        paymentReference: reference,
        uid: entry.uid,
        skuId: entry.skuId,
        amountCents: entry.amountCents,
        currency: entry.currency || "ZAR",
        provider: entry.provider,
        status: entry.status || "captured",
        completedAt: entry.completedAt || new Date().toISOString(),
        schemaVersion: 1,
    };
    const existing = await ledger.createIfAbsent(reference, doc);
    return { created: existing === null, duplicate: existing !== null, row: existing || doc };
}

/**
 * @param {string} reference
 * @param {{ reason?: string, providerEventId?: string }} patch
 */
export async function markConsumerPaymentRevoked(reference, patch = {}) {
    const ref = String(reference || "").trim();
    if (!ref) return null;
    const row = await ledger.get(ref);
    if (!row || row.status === "revoked") return row;
    const next = {
        ...row,
        status: "revoked",
        revokedAt: new Date().toISOString(),
        revokeReason: patch.reason || "provider_refund",
        revokeEventId: patch.providerEventId || null,
    };
    await ledger.put(ref, next, { merge: false });
    return next;
}

export async function getConsumerPaymentByReference(reference) {
    return ledger.get(String(reference || "").trim());
}

export function clearConsumerPaymentLedgerForTests() {
    ledger.clearMemory();
}
