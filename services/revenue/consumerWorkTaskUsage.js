/**
 * SWP-01 — Sarah Work task allowance per billing period.
 * Paid plans: usage keyed by subscription billing period; free tier uses UTC day.
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
import { getConsumerWorkPeriodKey, workTaskLimitForPeriod } from "./consumerUsagePeriod.js";
import { getConsumerSubscription } from "./consumerSubscriptionService.js";

/** @type {Map<string, number>} */
const memoryCounts = new Map();
/** @type {Map<string, Promise<unknown>>} */
const memoryLocks = new Map();

function utcDayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function memoryKey(uid, dayKey) {
    return `${uid}:${dayKey}:work`;
}

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

async function incrementMemoryCount(uid, dayKey) {
    return withMemoryLock(uid, async () => {
        const key = memoryKey(uid, dayKey);
        const next = (memoryCounts.get(key) || 0) + 1;
        memoryCounts.set(key, next);
        return next;
    });
}

async function readFirestoreWorkCount(uid, dayKey) {
    if (!useAdminBackend()) {
        const key = memoryKey(uid, dayKey);
        return memoryCounts.get(key) || 0;
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, dayKey);
    const snap = await getDoc(ref);
    return snap.exists() ? Number(snap.data()?.workTasks || 0) : 0;
}

async function decrementFirestoreWorkCount(uid, dayKey) {
    if (!useAdminBackend()) {
        return withMemoryLock(uid, async () => {
            const key = memoryKey(uid, dayKey);
            const prev = memoryCounts.get(key) || 0;
            const next = Math.max(0, prev - 1);
            memoryCounts.set(key, next);
            return next;
        });
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, dayKey);
    try {
        return await runAdminFirestoreTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const prev = snap.exists() ? Number(snap.data()?.workTasks || 0) : 0;
            const next = Math.max(0, prev - 1);
            if (!snap.exists() && next === 0) return 0;
            const base = snap.exists()
                ? { ...snap.data() }
                : { userId: uid, dayKey, chatTurns: 0, createdAt: serverTimestamp() };
            tx.set(
                ref,
                {
                    ...base,
                    workTasks: next,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            return next;
        });
    } catch (err) {
        console.warn("[consumerWorkTaskUsage] decrement failed, memory fallback:", err.message);
        return withMemoryLock(uid, async () => {
            const key = memoryKey(uid, dayKey);
            const prev = memoryCounts.get(key) || 0;
            const next = Math.max(0, prev - 1);
            memoryCounts.set(key, next);
            return next;
        });
    }
}

async function incrementFirestoreWorkCount(uid, dayKey) {
    if (!useAdminBackend()) {
        return incrementMemoryCount(uid, dayKey);
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, dayKey);
    try {
        return await runAdminFirestoreTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const prev = snap.exists() ? Number(snap.data()?.workTasks || 0) : 0;
            const next = prev + 1;
            const base = snap.exists()
                ? { ...snap.data() }
                : { userId: uid, dayKey, chatTurns: 0, createdAt: serverTimestamp() };
            tx.set(
                ref,
                {
                    ...base,
                    workTasks: next,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            return next;
        });
    } catch (err) {
        console.warn("[consumerWorkTaskUsage] transaction failed, memory fallback:", err.message);
        return incrementMemoryCount(uid, dayKey);
    }
}

/**
 * Reserve one Sarah Work task submission against the user's plan allowance.
 * Free tier: 1 concurrent light task when monthly credits available (US-01).
 */
export async function reserveConsumerWorkTask(uid) {
    if (!uid) {
        return { allowed: false, usage: 0, limit: 0, enforcementMode: "enforce", dayKey: utcDayKey() };
    }
    const [entitlements, enforcementMode, sub] = await Promise.all([
        getConsumerEntitlements(uid),
        getEnforcementMode("rs02Limits"),
        getConsumerSubscription(uid),
    ]);
    const periodKey = await getConsumerWorkPeriodKey(uid);
    const daily = Math.max(0, Number(entitlements?.sarahLimits?.workTasksPerDay ?? 0));
    const limit = workTaskLimitForPeriod(daily, sub);
    if (limit <= 0) {
        return { allowed: false, usage: 0, limit: 0, enforcementMode, dayKey: periodKey, period: true };
    }
    const usage = await incrementFirestoreWorkCount(uid, periodKey);
    const overLimit = usage > limit;
    /** Credit enforcement (US-04): paid tiers gate Work on credits, not task count. */
    const creditsPrimary = enforcementMode === "enforce" && limit > 0;
    const allowed = limit <= 0 ? false : creditsPrimary ? true : !overLimit;
    return {
        allowed,
        usage,
        limit,
        enforcementMode,
        dayKey: periodKey,
        period: !sub?.skuId?.includes(".free."),
        creditsPrimary,
    };
}

/** Read-only snapshot for UI / quota endpoint. */
export async function getConsumerWorkTaskUsage(uid) {
    const [entitlements, sub] = uid
        ? await Promise.all([getConsumerEntitlements(uid), getConsumerSubscription(uid)])
        : [null, null];
    const periodKey = uid ? await getConsumerWorkPeriodKey(uid) : utcDayKey();
    const daily = Math.max(0, Number(entitlements?.sarahLimits?.workTasksPerDay ?? 0));
    const limit = workTaskLimitForPeriod(daily, sub);
    const usage = uid ? await readFirestoreWorkCount(uid, periodKey) : 0;
    return {
        usage,
        limit,
        dayKey: periodKey,
        remaining: Math.max(0, limit - usage),
        periodScoped: Boolean(sub && !sub.skuId?.includes(".free.")),
        periodEnd: sub?.periodEnd || null,
    };
}

/**
 * SWP — restore one task when the user cancels after submit but before Sarah runs/completes the task.
 * @param {string} uid
 * @param {{ dayKey?: string }} [opts]
 */
export async function releaseConsumerWorkTask(uid, opts = {}) {
    if (!uid) {
        return { released: false, usage: 0, limit: 0, dayKey: utcDayKey() };
    }
    const periodKey = String(opts.dayKey || (await getConsumerWorkPeriodKey(uid)));
    const usage = await decrementFirestoreWorkCount(uid, periodKey);
    const [entitlements, sub] = await Promise.all([getConsumerEntitlements(uid), getConsumerSubscription(uid)]);
    const limit = workTaskLimitForPeriod(Number(entitlements?.sarahLimits?.workTasksPerDay ?? 0), sub);
    return { released: true, usage, limit, dayKey: periodKey, remaining: Math.max(0, limit - usage) };
}

export function clearConsumerWorkTaskUsageForTests() {
    memoryCounts.clear();
    memoryLocks.clear();
}

/** @param {string} uid @param {number} usage */
export function setConsumerWorkTaskUsageForTests(uid, usage) {
    if (process.env.STORAGE_BACKEND !== "memory") return;
    const dayKey = utcDayKey();
    memoryCounts.set(memoryKey(uid, dayKey), Math.max(0, Number(usage) || 0));
}
