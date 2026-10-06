/**
 * PI-4B — Platform end-user identity (strong channel-native links only).
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import {
    platformIntelligenceChannelIdentityPath,
    platformIntelligenceEndUserPath,
    platformIntelligenceDailyPlatformUserPath,
} from "../database/schema.js";
import {
    channelIdentityDocId,
    dailyPlatformUserActivityDocId,
    platformUserIdForStrongChannelIdentity,
} from "./identityIds.js";
import { PI_CHANNELS } from "./constants.js";

const memoryChannelIdentities = new Map();
const memoryEndUsers = new Map();
const memoryDailyPlatformUsers = new Set();

const STRONG_CHANNELS = new Set([PI_CHANNELS.WHATSAPP]);

function nowIso() {
    return new Date().toISOString();
}

function emptyEndUser(platformUserId) {
    return {
        platformUserId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        matchPolicy: "strong_channel_native_only",
        channels: [],
        organisationIds: [],
        organisationCount: 0,
        isMultiOrganisation: false,
        isMultiChannel: false,
    };
}

async function readChannelIdentityMemory(docId) {
    return memoryChannelIdentities.get(docId) || null;
}

async function writeChannelIdentityMemory(docId, data) {
    memoryChannelIdentities.set(docId, data);
    return data;
}

async function readEndUserMemory(platformUserId) {
    return memoryEndUsers.get(platformUserId) || null;
}

async function writeEndUserMemory(platformUserId, data) {
    memoryEndUsers.set(platformUserId, data);
    return data;
}

async function readChannelIdentityFirestore(docId) {
    const db = getAdminFirestore();
    const snap = await db.doc(platformIntelligenceChannelIdentityPath(docId)).get();
    return snap.exists ? snap.data() : null;
}

async function writeChannelIdentityFirestore(docId, data) {
    const db = getAdminFirestore();
    await db.doc(platformIntelligenceChannelIdentityPath(docId)).set(data, { merge: true });
    return data;
}

async function readEndUserFirestore(platformUserId) {
    const db = getAdminFirestore();
    const snap = await db.doc(platformIntelligenceEndUserPath(platformUserId)).get();
    return snap.exists ? snap.data() : null;
}

async function writeEndUserFirestore(platformUserId, data) {
    const db = getAdminFirestore();
    await db.doc(platformIntelligenceEndUserPath(platformUserId)).set(data, { merge: true });
    return data;
}

async function claimDailyPlatformUserMemory(docId) {
    if (memoryDailyPlatformUsers.has(docId)) return false;
    memoryDailyPlatformUsers.add(docId);
    return true;
}

async function claimDailyPlatformUserFirestore(docId) {
    const db = getAdminFirestore();
    const ref = db.doc(platformIntelligenceDailyPlatformUserPath(docId));
    try {
        await ref.create({ createdAt: nowIso() });
        return true;
    } catch (err) {
        if (err?.code === 6 || /already exists/i.test(err.message)) return false;
        throw err;
    }
}

/**
 * Attach / update platform end-user identity after a message event (PI-4B).
 * @returns {Promise<{ platformUserId: string, newPlatformUserToday: boolean, becameMultiOrganisation: boolean }>}
 */
export async function attachEndUserIdentityForMessage({
    channel,
    externalUserId,
    companyId,
    timestamp,
}) {
    const ch = String(channel || "").trim().toLowerCase();
    const ext = String(externalUserId || "").trim();
    const org = String(companyId || "").trim();
    if (!ch || !ext || !org) {
        throw new Error("attachEndUserIdentityForMessage: channel, externalUserId, companyId required");
    }

    if (!STRONG_CHANNELS.has(ch)) {
        return { skipped: true, reason: "channel_not_enabled_for_strong_identity_v1" };
    }

    const ciDocId = channelIdentityDocId(ch, ext);
    const platformUserId = platformUserIdForStrongChannelIdentity(ch, ext);
    const ts = timestamp || nowIso();
    const date = ts.slice(0, 10);

    const readCi = useAdminBackend() ? readChannelIdentityFirestore : readChannelIdentityMemory;
    const writeCi = useAdminBackend() ? writeChannelIdentityFirestore : writeChannelIdentityMemory;
    const readEu = useAdminBackend() ? readEndUserFirestore : readEndUserMemory;
    const writeEu = useAdminBackend() ? writeEndUserFirestore : writeEndUserMemory;

    let channelIdentity = await readCi(ciDocId);
    if (!channelIdentity) {
        channelIdentity = {
            id: ciDocId,
            channel: ch,
            externalUserId: ext,
            platformUserId,
            matchConfidence: "strong",
            firstSeenAt: ts,
            lastSeenAt: ts,
            organisationIds: [org],
        };
    } else {
        channelIdentity.lastSeenAt = ts;
        const orgs = new Set(channelIdentity.organisationIds || []);
        orgs.add(org);
        channelIdentity.organisationIds = [...orgs];
        channelIdentity.platformUserId = platformUserId;
    }
    await writeCi(ciDocId, channelIdentity);

    let endUser = await readEu(platformUserId);
    let becameMultiOrganisation = false;
    const isNewEndUserEver = !endUser;
    if (!endUser) {
        endUser = emptyEndUser(platformUserId);
        endUser.firstSeenAt = ts;
        endUser.channels = [ch];
        endUser.organisationIds = [org];
        endUser.organisationCount = 1;
    } else {
        const channels = new Set(endUser.channels || []);
        channels.add(ch);
        endUser.channels = [...channels];
        const orgs = new Set(endUser.organisationIds || []);
        const before = orgs.size;
        orgs.add(org);
        endUser.organisationIds = [...orgs];
        endUser.organisationCount = orgs.size;
        if (before < 2 && orgs.size >= 2) becameMultiOrganisation = true;
        endUser.isMultiOrganisation = orgs.size > 1;
        endUser.isMultiChannel = endUser.channels.length > 1;
    }
    endUser.updatedAt = ts;
    await writeEu(platformUserId, endUser);

    const dailyDoc = dailyPlatformUserActivityDocId(date, platformUserId);
    const newPlatformUserToday = useAdminBackend()
        ? await claimDailyPlatformUserFirestore(dailyDoc)
        : await claimDailyPlatformUserMemory(dailyDoc);

    return {
        platformUserId,
        firstSeenAt: endUser.firstSeenAt || ts,
        newPlatformUserToday,
        isNewEndUserEver,
        becameMultiOrganisation,
        isMultiOrganisation: endUser.isMultiOrganisation,
        isMultiChannel: endUser.isMultiChannel,
        organisationCount: endUser.organisationCount,
    };
}

/** @internal */
export function __resetEndUserIdentityStoreForTests() {
    memoryChannelIdentities.clear();
    memoryEndUsers.clear();
    memoryDailyPlatformUsers.clear();
}

/** @internal */
export function __getEndUserMemory(platformUserId) {
    return memoryEndUsers.get(platformUserId) || null;
}
