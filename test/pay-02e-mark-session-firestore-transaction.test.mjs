/**
 * PAY-02E — markSessionCompletedInTransaction (Firestore transaction semantics via test double).
 */
process.env.STORAGE_BACKEND = "memory";
import assert from "node:assert/strict";
import { markSessionCompletedInTransaction } from "../services/revenue/consumerCheckoutPaymentService.js";
import { createFirestoreTransactionDouble } from "./helpers/firestore-transaction-double.mjs";

const refKey = "rs02_tx_test_ref";

// --- pending session gets ledger completedAt ---
{
    const ledgerTs = "2026-08-01T10:00:00.000Z";
    const { runAdminFirestoreTransaction, committed } = createFirestoreTransactionDouble(
        new Map([
            [
                refKey,
                {
                    uid: "u1",
                    skuId: "rs02.sarah.plus.zar.monthly",
                    status: "pending",
                    provider: "paystack",
                },
            ],
        ])
    );
    const out = await runAdminFirestoreTransaction((tx) =>
        markSessionCompletedInTransaction(tx, refKey, "paystack", ledgerTs)
    );
    assert.equal(out.duplicate, false);
    assert.equal(out.row.completedAt, ledgerTs);
    assert.equal(committed.get(refKey).completedAt, ledgerTs);
}

// --- already completed: preserve metadata ---
{
    const frozenAt = "2026-01-15T12:00:00.000Z";
    const { runAdminFirestoreTransaction, committed } = createFirestoreTransactionDouble(
        new Map([
            [
                refKey,
                {
                    uid: "u1",
                    status: "completed",
                    completedAt: frozenAt,
                    paymentReference: refKey,
                    paymentProvider: "paystack",
                },
            ],
        ])
    );
    const out = await runAdminFirestoreTransaction((tx) =>
        markSessionCompletedInTransaction(tx, refKey, "stripe", "2026-12-31T00:00:00.000Z")
    );
    assert.equal(out.duplicate, true);
    assert.equal(out.row.completedAt, frozenAt);
    assert.equal(committed.get(refKey).completedAt, frozenAt);
}

// --- concurrent completion: first writer wins; second sees completed row ---
{
    const firstTs = "2026-02-01T00:00:00.000Z";
    const secondTs = "2026-02-01T00:00:01.000Z";
    const { runAdminFirestoreTransaction, committed } = createFirestoreTransactionDouble(
        new Map([
            [
                refKey,
                {
                    uid: "u1",
                    status: "pending",
                    provider: "paystack",
                },
            ],
        ])
    );
    const [a, b] = await Promise.all([
        runAdminFirestoreTransaction((tx) =>
            markSessionCompletedInTransaction(tx, refKey, "paystack", firstTs)
        ),
        runAdminFirestoreTransaction((tx) =>
            markSessionCompletedInTransaction(tx, refKey, "paystack", secondTs)
        ),
    ]);
    const outcomes = [a, b];
    assert.equal(outcomes.filter((o) => o.duplicate === false).length, 1);
    assert.equal(outcomes.filter((o) => o.duplicate === true).length, 1);
    const finalRow = committed.get(refKey);
    assert.equal(finalRow.status, "completed");
    assert.ok(finalRow.completedAt === firstTs || finalRow.completedAt === secondTs);
    assert.equal(finalRow.completedAt, a.duplicate ? b.row.completedAt : a.row.completedAt);
}

console.log("pay-02e-mark-session-firestore-transaction.test.mjs: ok");