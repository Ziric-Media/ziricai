/**
 * PI-4C — dimensional rollups (day/week/month × org/type/sector × channel).
 * Segment fields are snapshotted at event time.
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import {
    platformIntelligenceDimensionalRollupCollectionPath,
    platformIntelligencePeriodClaimPath,
    PLATFORM_INTELLIGENCE_PLATFORM_COMPANY_ID,
} from "../database/schema.js";
import { PERIOD_GRAINS, periodKeyForGrain } from "./periodKeys.js";
import {
    encodeDimensionalRollupId,
    organisationTypeScopeKey,
    ROLLUP_SCOPE,
    sectorScopeKey,
} from "./rollupScopes.js";
import { resolveOrganisationSegmentSnapshot } from "./organisationSegmentSnapshot.js";

const memoryRollups = new Map();
const memoryClaims = new Set();

function emptyRollup(meta) {
    return {
        ...meta,
        inboundMessages: 0,
        outboundMessages: 0,
        uniqueChannelIdentities: 0,
        conversationsActive: 0,
        updatedAt: new Date().toISOString(),
    };
}

async function claimActivityMemory(claimId) {
    if (memoryClaims.has(claimId)) return false;
    memoryClaims.add(claimId);
    return true;
}

async function claimActivityFirestore(claimId) {
    const db = getAdminFirestore();
    const ref = db.doc(platformIntelligencePeriodClaimPath(claimId));
    try {
        await ref.create({ createdAt: new Date().toISOString() });
        return true;
    } catch (err) {
        if (err?.code === 6 || /already exists/i.test(err.message)) return false;
        throw err;
    }
}

async function claimOnce(claimId) {
    if (useAdminBackend()) return claimActivityFirestore(claimId);
    return claimActivityMemory(claimId);
}

function bumpRollupMemory(docId, meta, { direction, newIdentity, newConversation }) {
    const rollup = memoryRollups.get(docId) || emptyRollup(meta);
    if (direction === "inbound") rollup.inboundMessages += 1;
    else if (direction === "outbound") rollup.outboundMessages += 1;
    if (newIdentity && meta.scope === ROLLUP_SCOPE.ORGANISATION) {
        rollup.uniqueChannelIdentities += 1;
    }
    if (newConversation && meta.scope === ROLLUP_SCOPE.ORGANISATION) {
        rollup.conversationsActive += 1;
    }
    rollup.updatedAt = new Date().toISOString();
    memoryRollups.set(docId, rollup);
}

async function bumpRollupFirestore(docId, meta, { direction, newIdentity, newConversation }) {
    const db = getAdminFirestore();
    const ref = db.doc(`${platformIntelligenceDimensionalRollupCollectionPath()}/${docId}`);
    const { FieldValue } = await import("firebase-admin/firestore");
    const patch = { ...meta, updatedAt: new Date().toISOString() };
    if (direction === "inbound") patch.inboundMessages = FieldValue.increment(1);
    else if (direction === "outbound") patch.outboundMessages = FieldValue.increment(1);
    if (newIdentity && meta.scope === ROLLUP_SCOPE.ORGANISATION) {
        patch.uniqueChannelIdentities = FieldValue.increment(1);
    }
    if (newConversation && meta.scope === ROLLUP_SCOPE.ORGANISATION) {
        patch.conversationsActive = FieldValue.increment(1);
    }
    await ref.set(patch, { merge: true });
}

async function bumpTarget(target, input) {
    const docId = encodeDimensionalRollupId(target);
    const meta = {
        grain: target.grain,
        periodKey: target.periodKey,
        scope: target.scope,
        scopeKey: target.scopeKey,
        channel: target.channel,
        companyId: target.companyId || null,
        organisationTypeSnapshot: target.organisationTypeSnapshot,
        sectorSnapshot: target.sectorSnapshot,
        sectorLabelSnapshot: target.sectorLabelSnapshot,
    };
    if (useAdminBackend()) {
        await bumpRollupFirestore(docId, meta, input);
    } else {
        bumpRollupMemory(docId, meta, input);
    }
}

/**
 * Apply day/week/month rollups for one message event.
 */
export async function applyDimensionalRollupsForMessage(input) {
    const {
        timestamp,
        companyId,
        channel,
        direction,
        externalUserId,
        conversationId,
        organisationTypeSnapshot,
        sectorSnapshot,
        sectorLabelSnapshot,
    } = input;

    const orgType = organisationTypeSnapshot || "company";
    const sector = sectorSnapshot || "other";
    const sectorLabel = sectorLabelSnapshot || "Other";

    for (const grain of PERIOD_GRAINS) {
        const periodKey = periodKeyForGrain(grain, timestamp);

        const identityClaim = `${grain}|${periodKey}|id|${companyId}|${channel}|${externalUserId}`;
        const newIdentity = await claimOnce(identityClaim);

        let newConversation = false;
        if (conversationId) {
            const convClaim = `${grain}|${periodKey}|conv|${companyId}|${conversationId}`;
            newConversation = await claimOnce(convClaim);
        }

        const bump = { direction, newIdentity, newConversation };

        await bumpTarget(
            {
                grain,
                periodKey,
                scope: ROLLUP_SCOPE.ORGANISATION,
                scopeKey: companyId,
                channel,
                companyId,
                organisationTypeSnapshot: orgType,
                sectorSnapshot: sector,
                sectorLabelSnapshot: sectorLabel,
            },
            bump
        );

        await bumpTarget(
            {
                grain,
                periodKey,
                scope: ROLLUP_SCOPE.PLATFORM,
                scopeKey: PLATFORM_INTELLIGENCE_PLATFORM_COMPANY_ID,
                channel,
                companyId: PLATFORM_INTELLIGENCE_PLATFORM_COMPANY_ID,
                organisationTypeSnapshot: "all",
                sectorSnapshot: "all",
                sectorLabelSnapshot: "All",
            },
            { direction, newIdentity: false, newConversation: false }
        );

        await bumpTarget(
            {
                grain,
                periodKey,
                scope: ROLLUP_SCOPE.ORGANISATION_TYPE,
                scopeKey: organisationTypeScopeKey(orgType),
                channel,
                companyId: null,
                organisationTypeSnapshot: orgType,
                sectorSnapshot: "all",
                sectorLabelSnapshot: "All",
            },
            { direction, newIdentity: false, newConversation: false }
        );

        await bumpTarget(
            {
                grain,
                periodKey,
                scope: ROLLUP_SCOPE.ORGANISATION_TYPE_SECTOR,
                scopeKey: sectorScopeKey(orgType, sector),
                channel,
                companyId: null,
                organisationTypeSnapshot: orgType,
                sectorSnapshot: sector,
                sectorLabelSnapshot: sectorLabel,
            },
            { direction, newIdentity: false, newConversation: false }
        );
    }
}

export async function listDimensionalRollups(grain, periodKey) {
    if (useAdminBackend()) {
        const db = getAdminFirestore();
        const snap = await db
            .collection(platformIntelligenceDimensionalRollupCollectionPath())
            .where("grain", "==", grain)
            .where("periodKey", "==", periodKey)
            .get();
        const items = [];
        snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
        return items;
    }

    const prefix = `${grain}|${periodKey}|`;
    const items = [];
    for (const [key, rollup] of memoryRollups.entries()) {
        if (key.startsWith(prefix)) items.push({ id: key, ...rollup });
    }
    return items;
}

/** @internal */
export function __resetDimensionalRollupsForTests() {
    memoryRollups.clear();
    memoryClaims.clear();
}

/** @internal */
export function __getDimensionalRollupMemory(docId) {
    return memoryRollups.get(docId) || null;
}
