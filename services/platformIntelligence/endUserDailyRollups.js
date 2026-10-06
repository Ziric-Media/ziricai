import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import { platformIntelligenceRollupUserDailyPath } from "../database/schema.js";

const memoryUserRollups = new Map();
const memoryMultiOrgDaily = new Set();

function rollupDocId(dateUtc) {
    return `${dateUtc}__platform`;
}

function emptyUserRollup(date) {
    return {
        date,
        uniquePlatformUsersActive: 0,
        newPlatformUsers: 0,
        multiOrganisationUsersActive: 0,
        updatedAt: new Date().toISOString(),
    };
}

async function bumpMemory(date, { newPlatformUserToday, isNewEndUserEver, multiOrgActiveToday }) {
    const id = rollupDocId(date);
    const rollup = memoryUserRollups.get(id) || emptyUserRollup(date);
    if (newPlatformUserToday) rollup.uniquePlatformUsersActive += 1;
    if (isNewEndUserEver) rollup.newPlatformUsers += 1;
    if (multiOrgActiveToday) rollup.multiOrganisationUsersActive += 1;
    rollup.updatedAt = new Date().toISOString();
    memoryUserRollups.set(id, rollup);
}

async function bumpFirestore(date, { newPlatformUserToday, isNewEndUserEver, multiOrgActiveToday }) {
    const db = getAdminFirestore();
    const ref = db.doc(platformIntelligenceRollupUserDailyPath(rollupDocId(date)));
    const { FieldValue } = await import("firebase-admin/firestore");
    const patch = { date, updatedAt: new Date().toISOString() };
    if (newPlatformUserToday) patch.uniquePlatformUsersActive = FieldValue.increment(1);
    if (isNewEndUserEver) patch.newPlatformUsers = FieldValue.increment(1);
    if (multiOrgActiveToday) patch.multiOrganisationUsersActive = FieldValue.increment(1);
    await ref.set(patch, { merge: true });
}

export async function claimMultiOrganisationActiveForDay(date, platformUserId) {
    const key = `${date}__multiorg__${platformUserId}`;
    if (useAdminBackend()) {
        const db = getAdminFirestore();
        const ref = db.doc(
            platformIntelligenceRollupUserDailyPath(`${date}__multiorg__${platformUserId}`)
        );
        try {
            await ref.create({ createdAt: new Date().toISOString() });
            return true;
        } catch (err) {
            if (err?.code === 6 || /already exists/i.test(err.message)) return false;
            throw err;
        }
    }
    if (memoryMultiOrgDaily.has(key)) return false;
    memoryMultiOrgDaily.add(key);
    return true;
}

export async function applyEndUserDailyRollups(
    date,
    { newPlatformUserToday, isNewEndUserEver, isMultiOrganisation, platformUserId }
) {
    let multiOrgActiveToday = false;
    if (isMultiOrganisation && platformUserId) {
        multiOrgActiveToday = await claimMultiOrganisationActiveForDay(date, platformUserId);
    }
    if (useAdminBackend()) {
        await bumpFirestore(date, { newPlatformUserToday, isNewEndUserEver, multiOrgActiveToday });
    } else {
        await bumpMemory(date, { newPlatformUserToday, isNewEndUserEver, multiOrgActiveToday });
    }
}

export async function getUserDailyRollup(dateUtc) {
    const id = rollupDocId(dateUtc);
    if (useAdminBackend()) {
        const db = getAdminFirestore();
        const snap = await db.doc(platformIntelligenceRollupUserDailyPath(id)).get();
        return snap.exists ? snap.data() : emptyUserRollup(dateUtc);
    }
    return memoryUserRollups.get(id) || emptyUserRollup(dateUtc);
}

/** @internal */
export function __resetEndUserDailyRollupsForTests() {
    memoryUserRollups.clear();
    memoryMultiOrgDaily.clear();
}
