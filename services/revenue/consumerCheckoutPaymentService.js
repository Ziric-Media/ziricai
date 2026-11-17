/**
 * RS02 — consumer plan checkout (Paystack or Stripe); free tier applies immediately.
 */
import { randomBytes } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import {
    getCatalogueSku,
    isConsumerCreditPackSku,
    getCreditPackCreditsForSku,
} from "./catalogueService.js";
import { applyConsumerCheckout, getConsumerSubscription } from "./consumerSubscriptionService.js";
import {
    creditConsumerTopUpBalance,
    debitConsumerTopUpBalance,
    getConsumerSarahCreditShadowSummary,
} from "./consumerSarahCreditMeter.js";
import { isCommercialActive } from "./revenueConfig.js";
import {
    recordConsumerPayment,
    getConsumerPaymentByReference,
    markConsumerPaymentRevoked,
    clearConsumerPaymentLedgerForTests,
} from "./consumerPaymentLedger.js";
import { DEFAULT_CONSUMER_SKU } from "./legacyPlanAliases.js";
import { useAdminBackend, runAdminFirestoreTransaction, networkDocRef } from "../database/firestoreClient.js";
import {
    paystackConfigured,
    paystackInitializeTransaction,
    paystackVerifyTransaction,
    verifyPaystackWebhookSignature,
} from "../payments/paystackClient.js";
import {
    stripeConfigured,
    stripeCreateCheckoutSession,
    stripeRetrieveCheckoutSession,
    verifyStripeWebhookSignature,
} from "../payments/stripeClient.js";

const sessions = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_CHECKOUT_SESSIONS);
const webhookEvents = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_CHECKOUT_WEBHOOK_EVENTS);

/** @type {Map<string, Promise<unknown>>} */
const sessionCompleteLocks = new Map();

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function defaultReturnUrl() {
    return (
        String(process.env.SARAH_CHECKOUT_RETURN_URL || "").trim() ||
        String(process.env.APP_BASE_URL || "").trim() ||
        "https://sarah.ziricai.com"
    ).replace(/\/$/, "");
}

function referenceForSku(sku) {
    const prefix = isConsumerCreditPackSku(sku) ? "rs06" : "rs02";
    return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function isRs02PlanSku(sku) {
    return sku?.revenueStreamId === "RS02" && sku.public && sku.accountTypes?.includes("consumer");
}

function assertValidConsumerCheckoutSku(sku) {
    if (!sku || !sku.accountTypes?.includes("consumer")) {
        throw err(422, "SKU_INVALID", "Choose a valid Sarah product.");
    }
    if (isConsumerCreditPackSku(sku)) return sku;
    if (isRs02PlanSku(sku)) return sku;
    throw err(422, "SKU_INVALID", "Choose a valid Sarah plan or credit pack.");
}

async function applyConsumerCreditPackCheckout(uid, skuId, extra = {}) {
    const credits = getCreditPackCreditsForSku(skuId);
    if (credits <= 0) throw err(422, "SKU_INVALID", "Invalid credit pack.");
    const credited = await creditConsumerTopUpBalance(uid, credits * 100);
    if (!credited.ok) {
        throw err(500, "TOPUP_CREDIT_FAILED", credited.error || "Could not credit top-up balance.");
    }
    const [subscription, usage] = await Promise.all([
        getConsumerSubscription(uid),
        getConsumerSarahCreditShadowSummary(uid),
    ]);
    return {
        checkoutKind: "rs06_credit_pack",
        creditsAdded: credits,
        topUpBalanceCredits: usage.topUpBalanceCredits,
        topUpCreditsMicro: credited.topUpCreditsMicro,
        subscription,
        paymentProvider: extra.paymentProvider || null,
        paymentReference: extra.paymentReference || null,
    };
}

function normCurrency(c) {
    return String(c || "ZAR").toUpperCase();
}

/**
 * @param {{ provider?: string }} opts
 * @returns {"paystack"|"stripe"|null}
 */
export function resolveCheckoutProvider(opts = {}) {
    const explicit = String(opts.provider || process.env.RS02_CONSUMER_CHECKOUT_PROVIDER || "")
        .trim()
        .toLowerCase();
    if (explicit) {
        if (explicit !== "paystack" && explicit !== "stripe") {
            throw err(422, "CHECKOUT_PROVIDER_INVALID", "Provider must be paystack or stripe.");
        }
        if (explicit === "paystack" && !paystackConfigured()) {
            throw err(503, "PAYSTACK_NOT_CONFIGURED", "Paystack is not configured.");
        }
        if (explicit === "stripe" && !stripeConfigured()) {
            throw err(503, "STRIPE_NOT_CONFIGURED", "Stripe is not configured.");
        }
        return explicit;
    }
    if (paystackConfigured()) return "paystack";
    if (stripeConfigured()) return "stripe";
    return null;
}

async function withSessionCompleteLock(reference, fn) {
    const prev = sessionCompleteLocks.get(reference) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    sessionCompleteLocks.set(reference, prev.then(() => gate));
    await prev;
    try {
        return await fn();
    } finally {
        sessionCompleteLocks.delete(reference);
        release();
    }
}

function assertReconcileSession(row, { amountCents, currency, uid, skuId }) {
    const sku = getCatalogueSku(row.skuId);
    const expectedAmount = Number(row.amountCents ?? sku?.amountCents);
    const paidAmount = Number(amountCents);
    if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
        throw err(402, "PAYMENT_AMOUNT_MISMATCH", "Paid amount does not match the plan.");
    }
    const expectedCur = normCurrency(row.currency || sku?.currency);
    if (normCurrency(currency) !== expectedCur) {
        throw err(402, "PAYMENT_CURRENCY_MISMATCH", "Paid currency does not match the plan.");
    }
    if (uid != null && String(uid) !== String(row.uid)) {
        throw err(403, "PAYMENT_UID_MISMATCH", "Payment consumer does not match checkout session.");
    }
    if (skuId != null && String(skuId) !== String(row.skuId)) {
        throw err(403, "PAYMENT_SKU_MISMATCH", "Payment plan does not match checkout session.");
    }
}

async function initPaystackCheckout(uid, sku, email, returnUrl) {
    const reference = referenceForSku(sku);
    const baseReturn = String(returnUrl || defaultReturnUrl()).split("?")[0];
    const callbackUrl = `${baseReturn}?checkoutRef=${encodeURIComponent(reference)}`;
    const init = await paystackInitializeTransaction({
        email,
        amountCents: sku.amountCents,
        reference,
        callbackUrl,
        metadata: {
            uid,
            skuId: sku.skuId,
            custom_fields: [{ display_name: "Plan", variable_name: "plan", value: sku.name }],
        },
    });
    if (!init.ok) {
        throw err(502, "PAYSTACK_INIT_FAILED", init.error || "Could not start payment.");
    }
    const session = {
        reference,
        provider: "paystack",
        uid,
        skuId: sku.skuId,
        amountCents: sku.amountCents,
        currency: sku.currency || "ZAR",
        status: "pending",
        authorizationUrl: init.data.authorization_url,
        createdAt: new Date().toISOString(),
    };
    await sessions.put(reference, session, { merge: false });
    return {
        provider: "paystack",
        completed: false,
        reference,
        authorizationUrl: init.data.authorization_url,
        amountCents: sku.amountCents,
        currency: sku.currency || "ZAR",
    };
}

async function initStripeCheckout(uid, sku, email, returnUrl) {
    const reference = referenceForSku(sku);
    const baseReturn = String(returnUrl || defaultReturnUrl()).split("?")[0];
    const successUrl = `${baseReturn}?checkoutRef=${encodeURIComponent(reference)}`;
    const cancelUrl = `${baseReturn}?checkoutCancelled=1`;
    const init = await stripeCreateCheckoutSession({
        email,
        amountCents: sku.amountCents,
        currency: sku.currency || "ZAR",
        reference,
        successUrl,
        cancelUrl,
        productName: sku.name,
        metadata: { uid, skuId: sku.skuId, checkoutRef: reference },
    });
    if (!init.ok) {
        throw err(502, "STRIPE_INIT_FAILED", init.error || "Could not start payment.");
    }
    const session = {
        reference,
        provider: "stripe",
        stripeSessionId: init.data.id,
        uid,
        skuId: sku.skuId,
        amountCents: sku.amountCents,
        currency: sku.currency || "ZAR",
        status: "pending",
        authorizationUrl: init.data.url,
        createdAt: new Date().toISOString(),
    };
    await sessions.put(reference, session, { merge: false });
    return {
        provider: "stripe",
        completed: false,
        reference,
        authorizationUrl: init.data.url,
        amountCents: sku.amountCents,
        currency: sku.currency || "ZAR",
    };
}

/**
 * @param {string} uid
 * @param {string} skuId
 * @param {{ email?: string, returnUrl?: string, provider?: string }} opts
 */
export async function initConsumerCheckout(uid, skuId, opts = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    const sku = assertValidConsumerCheckoutSku(getCatalogueSku(String(skuId || "").trim()));
    if (isConsumerCreditPackSku(sku)) {
        const enabled = await isCommercialActive("rs06Credits");
        if (!enabled) {
            throw err(503, "CHECKOUT_DISABLED", "Credit top-up checkout is not enabled yet.");
        }
    }
    if (sku.amountCents <= 0) {
        const applied = await applyConsumerCheckout(uid, sku.skuId);
        return { provider: "none", completed: true, ...applied };
    }
    const provider = resolveCheckoutProvider(opts);
    if (!provider) {
        throw err(
            503,
            "PAYMENT_PROVIDER_NOT_CONFIGURED",
            "No payment provider configured (Paystack or Stripe)."
        );
    }
    const email = String(opts.email || "").trim();
    if (!email || !email.includes("@")) {
        throw err(422, "EMAIL_REQUIRED", "A valid email is required for checkout.");
    }
    const returnUrl = opts.returnUrl || defaultReturnUrl();
    if (provider === "stripe") return initStripeCheckout(uid, sku, email, returnUrl);
    return initPaystackCheckout(uid, sku, email, returnUrl);
}

function requireLedgerMatchString(value, code, message) {
    if (value == null || value === "") {
        throw err(402, code, message);
    }
    const s = String(value).trim();
    if (!s) throw err(402, code, message);
    return s;
}

function requireAmountCents(value) {
    if (value == null || value === "") {
        throw err(402, "PAYMENT_AMOUNT_MISMATCH", "Paid amount does not match the plan.");
    }
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        throw err(402, "PAYMENT_AMOUNT_MISMATCH", "Paid amount does not match the plan.");
    }
    return n;
}

function requireMatchCurrency(value) {
    if (value == null || value === "") {
        throw err(402, "PAYMENT_CURRENCY_MISMATCH", "Paid currency does not match the plan.");
    }
    const raw = String(value).trim();
    if (raw.length < 3) {
        throw err(402, "PAYMENT_CURRENCY_MISMATCH", "Paid currency does not match the plan.");
    }
    return normCurrency(raw);
}

function assertLedgerMatchesSession(ledger, session, reference) {
    const ref = String(reference || "").trim();
    if (!ref) throw err(400, "REFERENCE_REQUIRED", "Payment reference required.");
    const ledgerRef = requireLedgerMatchString(
        ledger.paymentReference,
        "CHECKOUT_REFERENCE_MISMATCH",
        "Payment reference mismatch."
    );
    if (ledgerRef !== ref) {
        throw err(403, "CHECKOUT_REFERENCE_MISMATCH", "Payment reference mismatch.");
    }
    const ledgerUid = requireLedgerMatchString(ledger.uid, "PAYMENT_UID_MISMATCH", "Payment consumer does not match checkout session.");
    const sessionUid = requireLedgerMatchString(session.uid, "PAYMENT_UID_MISMATCH", "Payment consumer does not match checkout session.");
    if (ledgerUid !== sessionUid) {
        throw err(403, "PAYMENT_UID_MISMATCH", "Payment consumer does not match checkout session.");
    }
    const ledgerSku = requireLedgerMatchString(ledger.skuId, "PAYMENT_SKU_MISMATCH", "Payment plan does not match checkout session.");
    const sessionSku = requireLedgerMatchString(session.skuId, "PAYMENT_SKU_MISMATCH", "Payment plan does not match checkout session.");
    if (ledgerSku !== sessionSku) {
        throw err(403, "PAYMENT_SKU_MISMATCH", "Payment plan does not match checkout session.");
    }
    const sessionAmount = requireAmountCents(session.amountCents);
    const ledgerAmount = requireAmountCents(ledger.amountCents);
    if (sessionAmount !== ledgerAmount) {
        throw err(402, "PAYMENT_AMOUNT_MISMATCH", "Paid amount does not match the plan.");
    }
    const sessionCur = requireMatchCurrency(session.currency);
    const ledgerCur = requireMatchCurrency(ledger.currency);
    if (sessionCur !== ledgerCur) {
        throw err(402, "PAYMENT_CURRENCY_MISMATCH", "Paid currency does not match the plan.");
    }
    const catalogueSku = getCatalogueSku(sessionSku);
    const expectedCur = requireMatchCurrency(catalogueSku?.currency || session.currency);
    if (sessionCur !== expectedCur || ledgerCur !== expectedCur) {
        throw err(402, "PAYMENT_CURRENCY_MISMATCH", "Paid currency does not match the plan.");
    }
}

/**
 * Session-only repair when payment ledger is already captured (no entitlement or ledger writes).
 * @param {string} reference
 * @param {string} [paymentProvider]
 */
async function ensureSessionCompleted(reference, paymentProvider) {
    const ref = String(reference || "").trim();
    const ledger = await getConsumerPaymentByReference(ref);
    if (!ledger || ledger.status !== "captured") {
        return { repaired: false, reason: "LEDGER_NOT_CAPTURED" };
    }
    const row = await sessions.get(ref);
    if (!row) throw err(404, "CHECKOUT_NOT_FOUND", "Checkout session not found.");
    if (row.status === "completed") {
        return { repaired: false, reason: "SESSION_ALREADY_COMPLETED", row };
    }
    assertLedgerMatchesSession(ledger, row, ref);
    const provider = paymentProvider || ledger.provider || row.provider || "paystack";
    const completedAt = ledger.completedAt || new Date().toISOString();
    if (useAdminBackend()) {
        const tx = await markSessionCompletedFirestore(ref, row, provider, completedAt);
        return {
            repaired: !tx.duplicate,
            row: tx.row,
            reason: tx.duplicate ? "SESSION_ALREADY_COMPLETED" : "SESSION_REPAIRED",
        };
    }
    const next = {
        ...row,
        status: "completed",
        completedAt,
        paymentReference: ref,
        paymentProvider: provider,
    };
    await sessions.put(ref, next, { merge: false });
    return { repaired: true, row: next, reason: "SESSION_REPAIRED" };
}

async function markSessionCompletedFirestore(reference, row, provider, completedAt) {
    const col = NETWORK_COLLECTIONS.CONSUMER_CHECKOUT_SESSIONS;
    return runAdminFirestoreTransaction(async (tx) => {
        const ref = networkDocRef(col, reference);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw err(404, "CHECKOUT_NOT_FOUND", "Checkout session not found.");
        const current = snap.data();
        if (current.status === "completed") return { duplicate: true, row: current };
        const completedAtTs = completedAt || new Date().toISOString();
        const next = {
            ...current,
            status: "completed",
            completedAt: completedAtTs,
            paymentReference: reference,
            paymentProvider: provider,
        };
        tx.set(ref, next);
        return { duplicate: false, row: next };
    });
}

async function completeSession(reference, uidFromSession, paymentProvider) {
    return withSessionCompleteLock(reference, async () => {
        const row = await sessions.get(reference);
        if (!row) throw err(404, "CHECKOUT_NOT_FOUND", "Checkout session not found.");
        if (uidFromSession && row.uid !== uidFromSession) {
            throw err(403, "CHECKOUT_FORBIDDEN", "This checkout belongs to another account.");
        }
        const existingPay = await getConsumerPaymentByReference(reference);
        const sessionSku = getCatalogueSku(row.skuId);
        const creditPack = isConsumerCreditPackSku(sessionSku);
        if (existingPay?.status === "captured" && row.status !== "completed") {
            const repairProvider = existingPay.provider || row.provider || paymentProvider || "paystack";
            await ensureSessionCompleted(reference, repairProvider);
        }
        if (existingPay?.status === "captured" || row.status === "completed") {
            if (creditPack) {
                const usage = await getConsumerSarahCreditShadowSummary(row.uid);
                return {
                    checkoutKind: "rs06_credit_pack",
                    topUpBalanceCredits: usage.topUpBalanceCredits,
                    subscription: await getConsumerSubscription(row.uid),
                    duplicate: true,
                };
            }
            const subscription = await getConsumerSubscription(row.uid);
            return { subscription, duplicate: true };
        }
        const provider = paymentProvider || row.provider || "paystack";
        const applied = creditPack
            ? await applyConsumerCreditPackCheckout(row.uid, row.skuId, {
                  paymentProvider: provider,
                  paymentReference: reference,
              })
            : await applyConsumerCheckout(row.uid, row.skuId, {
                  paymentProvider: provider,
                  paymentReference: reference,
              });
        const completedAt = new Date().toISOString();
        const ledger = await recordConsumerPayment({
            paymentReference: reference,
            uid: row.uid,
            skuId: row.skuId,
            amountCents: row.amountCents,
            currency: row.currency,
            provider,
            completedAt,
        });
        if (!ledger.created && ledger.duplicate) {
            await ensureSessionCompleted(reference, provider);
            if (creditPack) {
                const usage = await getConsumerSarahCreditShadowSummary(row.uid);
                return {
                    checkoutKind: "rs06_credit_pack",
                    topUpBalanceCredits: usage.topUpBalanceCredits,
                    subscription: await getConsumerSubscription(row.uid),
                    duplicate: true,
                };
            }
            const subscription = await getConsumerSubscription(row.uid);
            return { subscription, duplicate: true };
        }
        if (useAdminBackend()) {
            const tx = await markSessionCompletedFirestore(reference, row, provider);
            if (tx.duplicate) {
                return { subscription: applied.subscription, duplicate: true };
            }
        } else {
            await sessions.put(
                reference,
                {
                    ...row,
                    status: "completed",
                    completedAt,
                    paymentReference: reference,
                    paymentProvider: provider,
                },
                { merge: false }
            );
        }
        return { ...applied, duplicate: false };
    });
}

async function revokeEntitlementForPaymentReference(reference, { provider, eventId, reason }) {
    const ref = String(reference || "").trim();
    if (!ref.startsWith("rs02_") && !ref.startsWith("rs06_")) return { handled: false };
    const pay = await getConsumerPaymentByReference(ref);
    if (!pay || pay.status !== "captured") return { handled: false, reason: "NO_LEDGER" };
    if (ref.startsWith("rs06_")) {
        const credits = getCreditPackCreditsForSku(pay.skuId);
        if (credits > 0) {
            await debitConsumerTopUpBalance(pay.uid, credits * 100);
        }
        await markConsumerPaymentRevoked(ref, { reason, providerEventId: eventId });
        const sessionRow = await sessions.get(ref);
        if (sessionRow) {
            await sessions.put(ref, { ...sessionRow, status: "revoked", revokedAt: new Date().toISOString() }, { merge: false });
        }
        return { handled: true, reference: ref, uid: pay.uid, provider, checkoutKind: "rs06_credit_pack", clawedBackCredits: credits };
    }
    const sub = await getConsumerSubscription(pay.uid);
    if (sub?.paymentReference === ref) {
        await applyConsumerCheckout(pay.uid, DEFAULT_CONSUMER_SKU);
    }
    await markConsumerPaymentRevoked(ref, { reason, providerEventId: eventId });
    const sessionRow = await sessions.get(ref);
    if (sessionRow) {
        await sessions.put(ref, { ...sessionRow, status: "revoked", revokedAt: new Date().toISOString() }, { merge: false });
    }
    return { handled: true, reference: ref, uid: pay.uid, provider };
}

async function verifyPaystackReference(reference, uid, row) {
    if (!paystackConfigured()) {
        throw err(503, "PAYMENT_PROVIDER_NOT_CONFIGURED", "Paystack is not configured.");
    }
    if (!row || row.provider !== "paystack") {
        throw err(404, "CHECKOUT_NOT_FOUND", "Checkout session not found.");
    }
    const verified = await paystackVerifyTransaction(reference);
    if (!verified.ok) {
        throw err(502, "PAYSTACK_VERIFY_FAILED", verified.error || "Verification failed.");
    }
    const data = verified.data || {};
    const status = data.status;
    if (status !== "success") {
        throw err(402, "PAYMENT_NOT_SUCCESS", `Payment status: ${status || "unknown"}`);
    }
    const meta = data.metadata || {};
    assertReconcileSession(row, {
        amountCents: data.amount,
        currency: data.currency,
        uid: meta.uid,
        skuId: meta.skuId,
    });
    return completeSession(reference, uid, "paystack");
}

async function verifyStripeReference(reference, uid, row) {
    if (!stripeConfigured()) {
        throw err(503, "PAYMENT_PROVIDER_NOT_CONFIGURED", "Stripe is not configured.");
    }
    if (!row || row.provider !== "stripe" || !row.stripeSessionId) {
        throw err(404, "CHECKOUT_NOT_FOUND", "Checkout session not found.");
    }
    const session = await stripeRetrieveCheckoutSession(row.stripeSessionId);
    if (!session.ok) {
        throw err(502, "STRIPE_VERIFY_FAILED", session.error || "Verification failed.");
    }
    const data = session.data || {};
    const payStatus = data.payment_status;
    if (data.client_reference_id !== reference) {
        throw err(403, "CHECKOUT_REFERENCE_MISMATCH", "Checkout reference mismatch.");
    }
    if (payStatus !== "paid") {
        throw err(402, "PAYMENT_NOT_SUCCESS", `Payment status: ${payStatus || "unknown"}`);
    }
    const meta = data.metadata || {};
    assertReconcileSession(row, {
        amountCents: data.amount_total,
        currency: data.currency,
        uid: meta.uid,
        skuId: meta.skuId,
    });
    return completeSession(reference, uid, "stripe");
}

/**
 * @param {string} reference
 * @param {string} [uid] consumer uid when called from authenticated verify
 */
export async function verifyConsumerCheckout(reference, uid) {
    const ref = String(reference || "").trim();
    if (!ref) throw err(400, "REFERENCE_REQUIRED", "Payment reference required.");
    const row = await sessions.get(ref);
    if (!row) throw err(404, "CHECKOUT_NOT_FOUND", "Checkout session not found.");
    if (row.provider === "stripe") return verifyStripeReference(ref, uid, row);
    if (row.provider === "paystack") return verifyPaystackReference(ref, uid, row);
    throw err(422, "CHECKOUT_PROVIDER_UNKNOWN", "Unknown checkout provider on session.");
}

async function claimWebhookEvent(provider, eventId) {
    const id = `${provider}_${String(eventId || "").trim()}`;
    if (!eventId) return { claim: true, duplicate: false };
    const existing = await webhookEvents.createIfAbsent(id, {
        provider,
        eventId: String(eventId),
        processedAt: new Date().toISOString(),
    });
    return { claim: existing === null, duplicate: existing !== null };
}

/** @param {Buffer|string} rawBody @param {string} signature */
export async function handlePaystackCheckoutWebhook(rawBody, signature) {
    if (!verifyPaystackWebhookSignature(rawBody, signature)) {
        throw err(401, "WEBHOOK_SIGNATURE_INVALID", "Invalid Paystack signature.");
    }
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);
    const event = JSON.parse(bodyStr);
    const eventId = event.data?.id ?? event.id;
    const refundEvents = new Set(["refund.processed", "charge.reversal"]);
    if (refundEvents.has(event.event)) {
        const reference = event.data?.reference || event.data?.transaction_reference;
        const { claim } = await claimWebhookEvent("paystack", eventId);
        if (!claim) return { handled: true, duplicate: true, reference };
        return revokeEntitlementForPaymentReference(reference, {
            provider: "paystack",
            eventId,
            reason: event.event,
        });
    }
    if (event.event !== "charge.success") return { handled: false };
    const reference = event.data?.reference;
    if (!reference) return { handled: false };
    const { claim } = await claimWebhookEvent("paystack", eventId);
    if (!claim) {
        await ensureSessionCompleted(reference);
        return { handled: true, duplicate: true, reference };
    }
    const row = await sessions.get(reference);
    await verifyPaystackReference(reference, null, row);
    return { handled: true, reference };
}

/** @param {Buffer|string} rawBody @param {string} signature */
export async function handleStripeCheckoutWebhook(rawBody, signature) {
    if (!verifyStripeWebhookSignature(rawBody, signature)) {
        throw err(401, "WEBHOOK_SIGNATURE_INVALID", "Invalid Stripe signature.");
    }
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);
    const event = JSON.parse(bodyStr);
    if (event.type === "charge.refunded") {
        const meta = event.data?.object?.metadata || {};
        const reference = meta.checkoutRef || meta.client_reference_id;
        const { claim } = await claimWebhookEvent("stripe", event.id);
        if (!claim) return { handled: true, duplicate: true, reference };
        return revokeEntitlementForPaymentReference(reference, {
            provider: "stripe",
            eventId: event.id,
            reason: "charge.refunded",
        });
    }
    if (event.type !== "checkout.session.completed") return { handled: false };
    const reference = event.data?.object?.client_reference_id;
    if (!reference) return { handled: false };
    const { claim } = await claimWebhookEvent("stripe", event.id);
    if (!claim) {
        await ensureSessionCompleted(reference);
        return { handled: true, duplicate: true, reference };
    }
    const row = await sessions.get(reference);
    await verifyStripeReference(reference, null, row);
    return { handled: true, reference };
}

export function clearConsumerCheckoutSessionsForTests() {
    sessions.clearMemory();
    webhookEvents.clearMemory();
    clearConsumerPaymentLedgerForTests();
    sessionCompleteLocks.clear();
}
