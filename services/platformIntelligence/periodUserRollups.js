/**
 * PI-4C — platform user network rollups (day/week/month).
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import { platformIntelligenceRollupUserDailyPath } from "../database/schema.js";
import { PERIOD_GRAINS, periodKeyForGrain, periodStartIso } from "./periodKeys.js";
import { organisationTypeScopeKey, sectorScopeKey } from "./rollupScopes.js";

const memoryUserRollups = new Map();
const memoryUserClaims = new Set();

function rollupDocId(grain, periodKey) {
    return `${grain}|${periodKey}|platform`;
}

function emptyUserRollup(grain, periodKey) {
    return {
        grain,
        periodKey,
        uniquePlatformUsersActive: 0,
        newPlatformUsers: 0,
        returningPlatformUsersActive: 0,
        multiOrganisationUsersActive: 0,
        multiChannelUsersActive: 0,
        byOrganisationType: {},
        bySector: {},
        updatedAt: new Date().toISOString(),
    };
}

async function claimMemory(id) {
    if (memoryUserClaims.has(id)) return false;
    memoryUserClaims.add(id);
    return true;
}

async function claimFirestore(id) {
    const db = getAdminFirestore();
    const ref = db.doc(platformIntelligenceRollupUserDailyPath(`claim__${id.replace(/\|/g, "_")}`));
    try {
        await ref.create({ createdAt: new Date().toISOString() });
        return true;
    } catch (err) {
        if (err?.code === 6 || /already exists/i.test(err.message)) return false;
        throw err;
    }
}

async function claim(id) {
    if (useAdminBackend()) return claimFirestore(id);
    return claimMemory(id);
}

function bumpUserRollupMemory(docId, grain, periodKey, deltas) {
    const rollup = memoryUserRollups.get(docId) || emptyUserRollup(grain, periodKey);
    for (const [k, v] of Object.entries(deltas)) {
        if (k === "byOrganisationType" || k === "bySector") {
            rollup[k] = rollup[k] || {};
            for (const [key, typeDelta] of Object.entries(v)) {
                rollup[k][key] = rollup[k][key] || { uniquePlatformUsersActive: 0 };
                rollup[k][key].uniquePlatformUsersActive += typeDelta.uniquePlatformUsersActive || 0;
            }
        } else {
            rollup[k] = (rollup[k] || 0) + v;
        }
    }
    rollup.updatedAt = new Date().toISOString();
    memoryUserRollups.set(docId, rollup);
}

async function bumpUserRollupFirestore(docId, grain, periodKey, deltas) {
    const db = getAdminFirestore();
    const ref = db.doc(platformIntelligenceRollupUserDailyPath(docId));
    const { FieldValue } = await import("firebase-admin/firestore");
    const patch = { grain, periodKey, updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(deltas)) {
        if (k === "byOrganisationType" || k === "bySector") continue;
        patch[k] = FieldValue.increment(v);
    }
    if (deltas.byOrganisationType) {
        for (const [type, typeDelta] of Object.entries(deltas.byOrganisationType)) {
            if (typeDelta.uniquePlatformUsersActive) {
                patch[`byOrganisationType.${type}.uniquePlatformUsersActive`] =
                    FieldValue.increment(typeDelta.uniquePlatformUsersActive);
            }
        }
    }
    if (deltas.bySector) {
        for (const [sk, secDelta] of Object.entries(deltas.bySector)) {
            if (secDelta.uniquePlatformUsersActive) {
                patch[`bySector.${sk}.uniquePlatformUsersActive`] = FieldValue.increment(
                    secDelta.uniquePlatformUsersActive
                );
            }
        }
    }
    await ref.set(patch, { merge: true });
}

/**
 * @param {string} timestamp ISO
 * @param {object} identity attachEndUserIdentityForMessage result
 * @param {{ organisationType?: string }} segment snapshot at event time
 */
export async function applyPeriodUserRollupsForMessage(timestamp, identity, segment = {}) {
    if (!identity || identity.skipped || !identity.platformUserId) return;

    const firstSeenAt = identity.firstSeenAt || timestamp;
    const orgType = organisationTypeScopeKey(segment.organisationType || "company");
    const sectorKey = sectorScopeKey(orgType, segment.sectorId || "other");

    for (const grain of PERIOD_GRAINS) {
        const periodKey = periodKeyForGrain(grain, timestamp);
        const periodStart = periodStartIso(grain, periodKey);
        const isNewInPeriod = firstSeenAt >= periodStart;
        const isReturning = !isNewInPeriod;

        const activeClaim = await claim(
            `user|${grain}|${periodKey}|active|${identity.platformUserId}`
        );

        const docId = rollupDocId(grain, periodKey);
        const deltas = {
            uniquePlatformUsersActive: 0,
            newPlatformUsers: 0,
            returningPlatformUsersActive: 0,
            multiOrganisationUsersActive: 0,
            multiChannelUsersActive: 0,
            byOrganisationType: {},
            bySector: {},
        };

        if (activeClaim) {
            deltas.uniquePlatformUsersActive = 1;
            deltas.newPlatformUsers = identity.isNewEndUserEver && isNewInPeriod ? 1 : 0;
            deltas.returningPlatformUsersActive = isReturning ? 1 : 0;

            const typeClaim = await claim(
                `user|${grain}|${periodKey}|type|${orgType}|${identity.platformUserId}`
            );
            if (typeClaim) {
                deltas.byOrganisationType[orgType] = { uniquePlatformUsersActive: 1 };
            }

            const sectorClaim = await claim(
                `user|${grain}|${periodKey}|sector|${sectorKey}|${identity.platformUserId}`
            );
            if (sectorClaim) {
                deltas.bySector[sectorKey] = { uniquePlatformUsersActive: 1 };
            }
        }

        if (identity.isMultiOrganisation) {
            const mo = await claim(`user|${grain}|${periodKey}|multiorg|${identity.platformUserId}`);
            if (mo) deltas.multiOrganisationUsersActive = 1;
        }
        if (identity.isMultiChannel) {
            const mc = await claim(
                `user|${grain}|${periodKey}|multichannel|${identity.platformUserId}`
            );
            if (mc) deltas.multiChannelUsersActive = 1;
        }

        const hasDelta =
            deltas.uniquePlatformUsersActive ||
            deltas.newPlatformUsers ||
            deltas.returningPlatformUsersActive ||
            deltas.multiOrganisationUsersActive ||
            deltas.multiChannelUsersActive ||
            Object.keys(deltas.byOrganisationType).length ||
            Object.keys(deltas.bySector).length;
        if (!hasDelta) continue;

        if (useAdminBackend()) {
            await bumpUserRollupFirestore(docId, grain, periodKey, deltas);
        } else {
            bumpUserRollupMemory(docId, grain, periodKey, deltas);
        }
    }
}

export async function getPeriodUserRollup(grain, periodKey) {
    const docId = rollupDocId(grain, periodKey);
    if (useAdminBackend()) {
        const db = getAdminFirestore();
        const snap = await db.doc(platformIntelligenceRollupUserDailyPath(docId)).get();
        return snap.exists ? snap.data() : emptyUserRollup(grain, periodKey);
    }
    return memoryUserRollups.get(docId) || emptyUserRollup(grain, periodKey);
}

/** @internal */
export function __resetPeriodUserRollupsForTests() {
    memoryUserRollups.clear();
    memoryUserClaims.clear();
}
