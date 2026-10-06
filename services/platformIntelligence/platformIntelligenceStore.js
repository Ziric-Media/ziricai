/**
 * Platform Intelligence persistence (memory + optional Firestore admin).
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import {
    platformIntelligenceDailyIdentityPath,
    platformIntelligenceMessageEventPath,
    platformIntelligenceRollupDailyCollectionPath,
    platformIntelligenceRollupDailyPath,
    PLATFORM_INTELLIGENCE_PLATFORM_COMPANY_ID,
} from "../database/schema.js";
import { dailyIdentityDocId, rollupDailyDocId } from "./eventIds.js";

const memoryEvents = new Map();
const memoryRollups = new Map();
const memoryDailyIdentities = new Set();

function emptyRollup(date, companyId, channel) {
    return {
        date,
        companyId,
        channel,
        inboundMessages: 0,
        outboundMessages: 0,
        uniqueChannelIdentities: 0,
        updatedAt: new Date().toISOString(),
    };
}

async function claimEventMemory(eventId, payload) {
    if (memoryEvents.has(eventId)) return { created: false };
    memoryEvents.set(eventId, { ...payload, eventId, recordedAt: new Date().toISOString() });
    return { created: true };
}

async function claimEventFirestore(eventId, payload) {
    const db = getAdminFirestore();
    const ref = db.doc(platformIntelligenceMessageEventPath(eventId));
    try {
        await ref.create({
            ...payload,
            eventId,
            recordedAt: new Date().toISOString(),
        });
        return { created: true };
    } catch (err) {
        if (err?.code === 6 || /already exists/i.test(err.message)) {
            return { created: false };
        }
        throw err;
    }
}

async function claimDailyIdentityMemory(identityDocId) {
    if (memoryDailyIdentities.has(identityDocId)) return false;
    memoryDailyIdentities.add(identityDocId);
    return true;
}

async function claimDailyIdentityFirestore(identityDocId) {
    const db = getAdminFirestore();
    const ref = db.doc(platformIntelligenceDailyIdentityPath(identityDocId));
    try {
        await ref.create({ createdAt: new Date().toISOString() });
        return true;
    } catch (err) {
        if (err?.code === 6 || /already exists/i.test(err.message)) return false;
        throw err;
    }
}

function bumpRollupMemory(docId, { direction, newIdentity }, rollupMeta) {
    const parts = docId.split("__");
    const rollup =
        memoryRollups.get(docId) ||
        emptyRollup(rollupMeta.date || parts[0], rollupMeta.companyId || parts[1], rollupMeta.channel || parts[2]);
    if (direction === "inbound") rollup.inboundMessages += 1;
    else if (direction === "outbound") rollup.outboundMessages += 1;
    if (newIdentity) rollup.uniqueChannelIdentities += 1;
    rollup.updatedAt = new Date().toISOString();
    memoryRollups.set(docId, rollup);
}

async function bumpRollupFirestore(docId, { direction, newIdentity }, rollupMeta) {
    const db = getAdminFirestore();
    const ref = db.doc(platformIntelligenceRollupDailyPath(docId));
    const { FieldValue } = await import("firebase-admin/firestore");
    const patch = {
        ...rollupMeta,
        updatedAt: new Date().toISOString(),
    };
    if (direction === "inbound") patch.inboundMessages = FieldValue.increment(1);
    else if (direction === "outbound") patch.outboundMessages = FieldValue.increment(1);
    if (newIdentity) patch.uniqueChannelIdentities = FieldValue.increment(1);
    await ref.set(patch, { merge: true });
}

export async function claimPlatformMessageEvent(eventId, payload) {
    if (useAdminBackend()) return claimEventFirestore(eventId, payload);
    return claimEventMemory(eventId, payload);
}

/**
 * @param {{ date: string, companyId: string, channel: string, direction: 'inbound'|'outbound', externalUserId: string }} input
 */
export async function applyDailyRollupsForMessage(input) {
    const { date, companyId, channel, direction, externalUserId } = input;
    const identityDocId = dailyIdentityDocId(date, companyId, channel, externalUserId);
    const newIdentity = useAdminBackend()
        ? await claimDailyIdentityFirestore(identityDocId)
        : await claimDailyIdentityMemory(identityDocId);

    const rollupMeta = { date, companyId, channel };
    const orgDocId = rollupDailyDocId(date, companyId, channel);
    const platformDocId = rollupDailyDocId(date, PLATFORM_INTELLIGENCE_PLATFORM_COMPANY_ID, channel);

    if (useAdminBackend()) {
        await bumpRollupFirestore(orgDocId, { direction, newIdentity }, rollupMeta);
        await bumpRollupFirestore(
            platformDocId,
            { direction, newIdentity },
            { ...rollupMeta, companyId: PLATFORM_INTELLIGENCE_PLATFORM_COMPANY_ID }
        );
    } else {
        bumpRollupMemory(orgDocId, { direction, newIdentity }, rollupMeta);
        bumpRollupMemory(platformDocId, { direction, newIdentity }, {
            ...rollupMeta,
            companyId: PLATFORM_INTELLIGENCE_PLATFORM_COMPANY_ID,
        });
    }
}

export async function listDailyRollupsForDate(dateUtc) {
    if (useAdminBackend()) {
        const db = getAdminFirestore();
        const snap = await db
            .collection(platformIntelligenceRollupDailyCollectionPath())
            .where("date", "==", dateUtc)
            .get();
        const items = [];
        snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
        return items;
    }

    const prefix = `${dateUtc}__`;
    const items = [];
    for (const [key, rollup] of memoryRollups.entries()) {
        if (key.startsWith(prefix)) items.push({ id: key, ...rollup });
    }
    return items;
}

/** @internal PI-4A verifier */
export function __resetPlatformIntelligenceStoreForTests() {
    memoryEvents.clear();
    memoryRollups.clear();
    memoryDailyIdentities.clear();
}

/** @internal */
export function __getPlatformIntelligenceMemoryRollup(docId) {
    return memoryRollups.get(docId) || null;
}

/** @internal */
export function __getPlatformIntelligenceMemoryEvent(eventId) {
    return memoryEvents.get(eventId) || null;
}
