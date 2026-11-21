/**
 * US-02 / US-04 — Sarah credit metering (shadow default; enforce via rs02Limits).
 */
import { PERSONAL_SARAH_COLLECTIONS } from "../database/schema.js";
import {
    personalSarahDocRef,
    getDoc,
    runAdminFirestoreTransaction,
    useAdminBackend,
    serverTimestamp,
} from "../database/firestoreClient.js";
import { getConsumerEntitlements } from "./entitlementEngine.js";
import { getEnforcementMode } from "./revenueConfig.js";
import { estimateSarahCredits, monthlyCreditsForSkuId } from "./sarahCreditEstimator.js";
import { getConsumerCreditPeriodKey } from "./consumerUsagePeriod.js";
import { getConsumerSubscription } from "./consumerSubscriptionService.js";

const WALLET_DOC_ID = "_wallet";
const USAGE_EVENT_CAP = 50;

/** @type {Map<string, number>} */
const memoryCreditsMicro = new Map();
/** @type {Map<string, number>} */
const memoryTopUpMicro = new Map();
/** @type {Map<string, object[]>} */
const memoryEvents = new Map();
/** @type {Map<string, Promise<unknown>>} */
const memoryLocks = new Map();

async function withMemoryLock(uid, fn) {
    const prev = memoryLocks.get(uid) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    memoryLocks.set(uid, prev.then(() => gate));
    await prev;
    try {
        return await fn();
    } finally {
        release();
        if (memoryLocks.get(uid) === gate) memoryLocks.delete(uid);
    }
}

function memoryKey(uid, periodKey) {
    return `${uid}:${periodKey}:credits`;
}

function usageAlertLevel(usagePercent, enforcementMode, availableMicro, topUpMicro, monthlyRemainingMicro) {
    if (enforcementMode === "enforce" && availableMicro <= 0) return "exhausted";
    if (enforcementMode !== "enforce" && monthlyRemainingMicro <= 0 && topUpMicro <= 0 && usagePercent >= 100) {
        return "exhausted_preview";
    }
    if (usagePercent >= 95) return "approaching_95";
    if (usagePercent >= 80) return "approaching_80";
    return null;
}

async function incrementMemoryCredits(uid, periodKey, creditsMicro, event) {
    return withMemoryLock(uid, async () => {
        const key = memoryKey(uid, periodKey);
        const next = (memoryCreditsMicro.get(key) || 0) + creditsMicro;
        memoryCreditsMicro.set(key, next);
        const evKey = `${uid}:${periodKey}:events`;
        const prev = memoryEvents.get(evKey) || [];
        memoryEvents.set(evKey, [{ ...event, at: new Date().toISOString() }, ...prev].slice(0, USAGE_EVENT_CAP));
        return next;
    });
}

async function decrementMemoryTopUp(uid, creditsMicro) {
    return withMemoryLock(uid, async () => {
        const key = `${uid}:topup`;
        const prev = memoryTopUpMicro.get(key) || 0;
        const next = prev - creditsMicro;
        if (next < 0) {
            const err = new Error("Not enough top-up credits.");
            err.code = "CREDITS_EXHAUSTED";
            err.status = 429;
            throw err;
        }
        memoryTopUpMicro.set(key, next);
        return next;
    });
}

async function readCreditsMicro(uid, periodKey) {
    if (!useAdminBackend()) {
        return memoryCreditsMicro.get(memoryKey(uid, periodKey)) || 0;
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, periodKey);
    const snap = await getDoc(ref);
    return snap.exists() ? Number(snap.data()?.shadowCreditsMicro || 0) : 0;
}

async function readRecentEvents(uid, periodKey) {
    if (!useAdminBackend()) {
        return memoryEvents.get(`${uid}:${periodKey}:events`) || [];
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, periodKey);
    const snap = await getDoc(ref);
    const rows = snap.exists() ? snap.data()?.shadowCreditRecent || [] : [];
    return Array.isArray(rows) ? rows : [];
}

async function readTopUpCreditsMicro(uid) {
    if (!useAdminBackend()) {
        return memoryTopUpMicro.get(`${uid}:topup`) || 0;
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, WALLET_DOC_ID);
    const snap = await getDoc(ref);
    return snap.exists() ? Number(snap.data()?.topUpCreditsMicro || 0) : 0;
}

async function incrementFirestoreCredits(uid, periodKey, deltaMicro, meta = {}, event = {}) {
    if (!useAdminBackend()) {
        return incrementMemoryCredits(uid, periodKey, deltaMicro, event);
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, periodKey);
    try {
        return await runAdminFirestoreTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const prev = snap.exists() ? Number(snap.data()?.shadowCreditsMicro || 0) : 0;
            const next = prev + deltaMicro;
            const events = snap.exists() ? Number(snap.data()?.shadowCreditEvents || 0) + 1 : 1;
            const recent = snap.exists() && Array.isArray(snap.data()?.shadowCreditRecent) ? [...snap.data().shadowCreditRecent] : [];
            recent.unshift({ ...event, at: new Date().toISOString() });
            const shadowCreditRecent = recent.slice(0, USAGE_EVENT_CAP);
            const payload = {
                userId: uid,
                periodKey,
                shadowCreditsMicro: next,
                shadowCreditEvents: events,
                shadowCreditRecent,
                lastShadowArchetype: meta.archetype || null,
                lastShadowSurface: meta.surface || null,
                meteringMode: "shadow",
                updatedAt: serverTimestamp(),
            };
            if (snap.exists()) {
                tx.update(ref, payload);
            } else {
                tx.create(ref, { ...payload, createdAt: serverTimestamp(), chatTurns: 0, workTasks: 0 });
            }
            return next;
        });
    } catch (err) {
        console.warn("[consumerSarahCreditMeter] transaction failed, memory fallback:", err.message);
        return incrementMemoryCredits(uid, periodKey, deltaMicro, event);
    }
}

async function decrementFirestoreTopUp(uid, deltaMicro) {
    if (!useAdminBackend()) {
        return decrementMemoryTopUp(uid, deltaMicro);
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, WALLET_DOC_ID);
    return runAdminFirestoreTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prev = snap.exists() ? Number(snap.data()?.topUpCreditsMicro || 0) : 0;
        const next = prev - deltaMicro;
        if (next < 0) {
            const err = new Error("Not enough top-up credits.");
            err.code = "CREDITS_EXHAUSTED";
            err.status = 429;
            throw err;
        }
        if (snap.exists()) {
            tx.update(ref, { topUpCreditsMicro: next, updatedAt: serverTimestamp() });
        } else {
            tx.create(ref, {
                userId: uid,
                topUpCreditsMicro: next,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        }
        return next;
    });
}

/**
 * @returns {Promise<object>}
 */
export async function computeConsumerCreditBalances(uid) {
    const periodKey = await getConsumerCreditPeriodKey(uid);
    const entitlements = await getConsumerEntitlements(uid);
    const [usedMicro, topUpMicro] = await Promise.all([readCreditsMicro(uid, periodKey), readTopUpCreditsMicro(uid)]);
    const monthlyAllowanceCredits = monthlyCreditsForSkuId(entitlements.skuId);
    const monthlyAllowanceMicro = monthlyAllowanceCredits * 100;
    const monthlyRemainingMicro = Math.max(0, monthlyAllowanceMicro - usedMicro);
    return {
        periodKey,
        monthlyAllowanceCredits,
        monthlyAllowanceMicro,
        monthlyUsedCreditsMicro: usedMicro,
        monthlyRemainingMicro,
        topUpMicro,
        availableMicro: monthlyRemainingMicro + topUpMicro,
        tierSkuId: entitlements.skuId,
    };
}

/**
 * US-04 — pre-request gate (enforce only).
 * @param {string} uid
 * @param {object} [estimateInput]
 */
export async function assertConsumerSarahCreditsForRequest(uid, estimateInput = {}) {
    if (!uid) {
        const err = new Error("Sign in required.");
        err.status = 401;
        err.code = "AUTH_REQUIRED";
        throw err;
    }
    const enforcementMode = await getEnforcementMode("rs02Limits");
    const estimate = estimateSarahCredits(estimateInput);
    const balances = await computeConsumerCreditBalances(uid);
    const usagePercent =
        balances.monthlyAllowanceMicro > 0
            ? Math.min(100, Math.round((balances.monthlyUsedCreditsMicro / balances.monthlyAllowanceMicro) * 100))
            : 0;
    const usageAlert = usageAlertLevel(
        usagePercent,
        enforcementMode,
        balances.availableMicro,
        balances.topUpMicro,
        balances.monthlyRemainingMicro
    );
    const wouldBlockAtEnforce = balances.availableMicro < estimate.creditsMicro;
    const base = {
        allowed: true,
        enforcementMode,
        estimate,
        usagePercent,
        usageAlert,
        wouldBlockAtEnforce,
        ...balances,
    };
    if (enforcementMode !== "enforce") {
        return base;
    }
    if (balances.availableMicro < estimate.creditsMicro) {
        return {
            ...base,
            allowed: false,
            code: "CREDITS_EXHAUSTED",
            resumeHint: "top_up_or_renewal",
        };
    }
    return base;
}

async function consumeSarahCredits(uid, periodKey, est, meta, event) {
    const enforcementMode = await getEnforcementMode("rs02Limits");
    const balances = await computeConsumerCreditBalances(uid);
    const deltaMicro = est.creditsMicro;

    if (enforcementMode !== "enforce") {
        const usedMicro = await incrementFirestoreCredits(uid, periodKey, deltaMicro, meta, event);
        return { ...est, periodKey, usedCreditsMicro: usedMicro, debitedFrom: { monthly: est.credits, topUp: 0 } };
    }

    const monthlyRoom = balances.monthlyRemainingMicro;
    const fromMonthly = Math.min(deltaMicro, monthlyRoom);
    const fromTopUp = deltaMicro - fromMonthly;
    if (fromTopUp > balances.topUpMicro) {
        const err = new Error(
            "Your monthly allowance and top-up credits are used up. Buy a top-up or wait for your plan to renew."
        );
        err.code = "CREDITS_EXHAUSTED";
        err.status = 429;
        throw err;
    }

    const richEvent = {
        ...event,
        debitedFromMonthlyMicro: fromMonthly,
        debitedFromTopUpMicro: fromTopUp,
    };
    let usedMicro = balances.monthlyUsedCreditsMicro;
    if (fromMonthly > 0) {
        usedMicro = await incrementFirestoreCredits(uid, periodKey, fromMonthly, meta, {
            ...richEvent,
            debitSource: fromTopUp > 0 ? "monthly_and_top_up" : "monthly",
        });
    }
    if (fromTopUp > 0) {
        await decrementFirestoreTopUp(uid, fromTopUp);
        if (fromMonthly <= 0) {
            await incrementFirestoreCredits(uid, periodKey, 0, meta, { ...richEvent, debitSource: "top_up" });
        }
    }
    return {
        ...est,
        periodKey,
        usedCreditsMicro: usedMicro,
        debitedFrom: { monthly: fromMonthly / 100, topUp: fromTopUp / 100 },
    };
}

/**
 * Record credits (shadow: always succeeds; enforce: monthly then top-up).
 */
export async function recordShadowSarahCredits(uid, estimateInput = {}) {
    if (!uid) return null;
    const est = estimateSarahCredits(estimateInput);
    const periodKey = await getConsumerCreditPeriodKey(uid);
    const preview = String(estimateInput.messagePreview || estimateInput.displayMessage || "").trim();
    const event = {
        credits: est.credits,
        archetype: est.archetype,
        surface: estimateInput.surface || null,
        model: estimateInput.model || null,
        sessionId: estimateInput.sessionId ? String(estimateInput.sessionId) : null,
        interaction: estimateInput.interaction || null,
        messagePreview: preview ? preview.slice(0, 100) : null,
    };
    const recorded = await consumeSarahCredits(uid, periodKey, est, {
        archetype: est.archetype,
        surface: estimateInput.surface,
    }, event);
    void import("./consumerSarahUsageAlertService.js")
        .then((m) => m.maybeNotifySarahCreditUsageAlert(uid))
        .catch((err) => console.warn("[consumerSarahCreditMeter] usage alert:", err?.message || err));
    return recorded;
}

/**
 * Full recent credit events for the current billing period (up to USAGE_EVENT_CAP).
 * @param {string} uid
 */
export async function getConsumerSarahCreditUsageEvents(uid) {
    if (!uid) return [];
    const periodKey = await getConsumerCreditPeriodKey(uid);
    const rows = await readRecentEvents(uid, periodKey);
    return Array.isArray(rows) ? rows : [];
}

/**
 * @param {string} uid
 */
export async function getConsumerSarahCreditUsageExport(uid) {
    const [summary, events] = await Promise.all([
        getConsumerSarahCreditShadowSummary(uid),
        getConsumerSarahCreditUsageEvents(uid),
    ]);
    return {
        exportedAt: new Date().toISOString(),
        uid,
        periodKey: summary.periodKey,
        enforcementMode: summary.enforcementMode,
        meteringMode: summary.meteringMode,
        summary: {
            monthlyAllowanceCredits: summary.monthlyAllowanceCredits,
            monthlyUsedCredits: summary.monthlyUsedCredits,
            monthlyRemainingCredits: summary.monthlyRemainingCredits,
            topUpBalanceCredits: summary.topUpBalanceCredits,
            availableCredits: summary.availableCredits,
            usagePercent: summary.usagePercent,
            renewalDate: summary.renewalDate,
        },
        events,
    };
}

/**
 * @returns {Promise<object>} Summary for quota API / Profile.
 */
export async function getConsumerSarahCreditShadowSummary(uid) {
    const periodKey = await getConsumerCreditPeriodKey(uid);
    const [entitlements, enforcementMode, usedMicro, topUpMicro, recentEvents, sub, balances] = await Promise.all([
        getConsumerEntitlements(uid),
        getEnforcementMode("rs02Limits"),
        readCreditsMicro(uid, periodKey),
        readTopUpCreditsMicro(uid),
        readRecentEvents(uid, periodKey),
        uid ? getConsumerSubscription(uid) : null,
        computeConsumerCreditBalances(uid),
    ]);
    const monthlyAllowanceCredits = balances.monthlyAllowanceCredits;
    const monthlyAllowanceMicro = balances.monthlyAllowanceMicro;
    const usedCredits = Math.round((usedMicro / 100) * 10) / 10;
    const monthlyRemainingMicro = balances.monthlyRemainingMicro;
    const availableMicro = balances.availableMicro;
    const wouldBlockAtEnforce = availableMicro < 100;
    const usagePercent =
        monthlyAllowanceMicro > 0 ? Math.min(100, Math.round((usedMicro / monthlyAllowanceMicro) * 100)) : 0;
    const usageAlert = usageAlertLevel(
        usagePercent,
        enforcementMode,
        availableMicro,
        topUpMicro,
        monthlyRemainingMicro
    );

    return {
        meteringMode: enforcementMode === "enforce" ? "enforce" : "shadow",
        enforcementMode,
        periodKey,
        periodStart: sub?.periodStart || null,
        periodEnd: sub?.periodEnd || null,
        renewalDate: sub?.periodEnd || null,
        monthlyAllowanceCredits,
        monthlyUsedCredits: usedCredits,
        monthlyUsedCreditsMicro: usedMicro,
        monthlyRemainingCredits: Math.round((monthlyRemainingMicro / 100) * 10) / 10,
        topUpBalanceCredits: Math.round((topUpMicro / 100) * 10) / 10,
        topUpBalanceCreditsMicro: topUpMicro,
        availableCredits: Math.round((availableMicro / 100) * 10) / 10,
        usagePercent,
        usageAlert,
        wouldBlockAtEnforce,
        creditsBlocked: enforcementMode === "enforce" && availableMicro <= 0,
        tierSkuId: entitlements.skuId,
        dailyCreditSoftCap: Number(entitlements?.sarahLimits?.dailyCreditSoftCap) || null,
        recentUsage: recentEvents.slice(0, 30),
    };
}

/** US-05 stub — credit top-up balance (micro-credits). */
export async function creditConsumerTopUpBalance(uid, creditsMicro) {
    if (!uid || !Number.isFinite(creditsMicro) || creditsMicro <= 0) return { ok: false };
    const delta = Math.floor(creditsMicro);
    if (!useAdminBackend()) {
        const key = `${uid}:topup`;
        memoryTopUpMicro.set(key, (memoryTopUpMicro.get(key) || 0) + delta);
        return { ok: true, topUpCreditsMicro: memoryTopUpMicro.get(key) };
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, WALLET_DOC_ID);
    try {
        await runAdminFirestoreTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const prev = snap.exists() ? Number(snap.data()?.topUpCreditsMicro || 0) : 0;
            const next = prev + delta;
            if (snap.exists()) {
                tx.update(ref, { topUpCreditsMicro: next, updatedAt: serverTimestamp() });
            } else {
                tx.create(ref, {
                    userId: uid,
                    topUpCreditsMicro: next,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }
        });
        const balance = await readTopUpCreditsMicro(uid);
        return { ok: true, topUpCreditsMicro: balance };
    } catch (err) {
        console.warn("[consumerSarahCreditMeter] top-up credit failed:", err.message);
        return { ok: false, error: err.message };
    }
}

/** Claw back top-up credits (RS06 refunds) — floors at zero. */
export async function debitConsumerTopUpBalance(uid, creditsMicro) {
    if (!uid || !Number.isFinite(creditsMicro) || creditsMicro <= 0) return { ok: false };
    const delta = Math.floor(creditsMicro);
    if (!useAdminBackend()) {
        const key = `${uid}:topup`;
        const prev = memoryTopUpMicro.get(key) || 0;
        const next = Math.max(0, prev - delta);
        memoryTopUpMicro.set(key, next);
        return { ok: true, topUpCreditsMicro: next, debitedMicro: prev - next };
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, WALLET_DOC_ID);
    try {
        return await runAdminFirestoreTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const prev = snap.exists() ? Number(snap.data()?.topUpCreditsMicro || 0) : 0;
            const next = Math.max(0, prev - delta);
            if (snap.exists()) {
                tx.update(ref, { topUpCreditsMicro: next, updatedAt: serverTimestamp() });
            }
            return { ok: true, topUpCreditsMicro: next, debitedMicro: prev - next };
        });
    } catch (err) {
        console.warn("[consumerSarahCreditMeter] top-up debit failed:", err.message);
        return { ok: false, error: err.message };
    }
}

export function clearConsumerSarahCreditMeterForTests() {
    memoryCreditsMicro.clear();
    memoryTopUpMicro.clear();
    memoryEvents.clear();
    memoryLocks.clear();
}