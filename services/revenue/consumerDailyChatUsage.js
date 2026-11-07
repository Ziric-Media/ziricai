/**
 * RS02 — atomic daily Personal Sarah chat turn accounting (consumer).
 */
import { PERSONAL_SARAH_COLLECTIONS } from "../database/schema.js";
import {
    personalSarahDocRef,
    getDoc,
    setDoc,
    runAdminFirestoreTransaction,
    useAdminBackend,
    serverTimestamp,
} from "../database/firestoreClient.js";
import { getConsumerEntitlements } from "./entitlementEngine.js";
import { getEnforcementMode } from "./revenueConfig.js";

/** @type {Map<string, number>} */
const memoryCounts = new Map();
/** @type {Map<string, Promise<unknown>>} */
const memoryLocks = new Map();

function utcDayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function memoryKey(uid, dayKey) {
    return `${uid}:${dayKey}`;
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

async function incrementFirestoreCount(uid, dayKey) {
    if (!useAdminBackend()) {
        return incrementMemoryCount(uid, dayKey);
    }
    const ref = personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.USAGE, dayKey);
    try {
        return await runAdminFirestoreTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const prev = snap.exists() ? Number(snap.data()?.chatTurns || 0) : 0;
            const next = prev + 1;
            if (snap.exists()) {
                tx.update(ref, { chatTurns: next, updatedAt: serverTimestamp() });
            } else {
                tx.create(ref, {
                    userId: uid,
                    dayKey,
                    chatTurns: next,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }
            return next;
        });
    } catch (err) {
        console.warn("[consumerDailyChatUsage] transaction failed, memory fallback:", err.message);
        return incrementMemoryCount(uid, dayKey);
    }
}

/**
 * Reserve one chat turn against the user's daily RS02 allowance.
 * @returns {Promise<{ allowed: boolean, usage: number, limit: number, enforcementMode: string, dayKey: string }>}
 */
export async function reserveConsumerChatTurn(uid) {
    if (!uid) {
        return { allowed: false, usage: 0, limit: 0, enforcementMode: "enforce", dayKey: utcDayKey() };
    }
    const dayKey = utcDayKey();
    const [entitlements, enforcementMode] = await Promise.all([
        getConsumerEntitlements(uid),
        getEnforcementMode("rs02Limits"),
    ]);
    const limit = Math.max(0, Number(entitlements?.sarahLimits?.dailyChats ?? 0));
    const usage = await incrementFirestoreCount(uid, dayKey);
    const overLimit = limit > 0 && usage > limit;
    const allowed = !overLimit || enforcementMode !== "enforce";
    return { allowed, usage, limit, enforcementMode, dayKey };
}

export function clearConsumerDailyChatUsageForTests() {
    memoryCounts.clear();
    memoryLocks.clear();
}
