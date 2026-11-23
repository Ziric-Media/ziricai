/**
 * MC-PO-01 — Sarah App consumer growth census (read-only).
 */
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import {
    listConsumerProfilesForPlatform,
    profileTimestampMs,
} from "../users/consumerProfileService.js";
import { getNetworkStats } from "../network/networkPlatformService.js";
import { listAllCompaniesFromStorage } from "../tenants/companyService.js";
import { countPlatformEventsSince } from "./platformEventService.js";

const SCAN_CAP = 5000;
const statusPostsCol = createNetworkCollection(NETWORK_COLLECTIONS.STATUS_POSTS);

function parsePeriodMs(period) {
    const map = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 };
    const days = map[String(period || "30d").toLowerCase()] || 30;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - days);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    return { days, startMs: start.getTime(), startIso: start.toISOString(), todayStartMs: todayStart.getTime() };
}

/**
 * @param {{ period?: string }} [opts]
 */
export async function getConsumerGrowthOverview({ period = "30d" } = {}) {
    const { days, startMs, startIso, todayStartMs } = parsePeriodMs(period);
    const profiles = await listConsumerProfilesForPlatform({ limit: SCAN_CAP });
    let newInPeriod = 0;
    let newToday = 0;
    let activeInPeriod = 0;
    let onboardingCompleted = 0;

    for (const p of profiles) {
        const created = profileTimestampMs(p, "createdAt");
        const updated = profileTimestampMs(p, "updatedAt") ?? profileTimestampMs(p, "lastActiveAt");
        if (created != null && created >= startMs) newInPeriod += 1;
        if (created != null && created >= todayStartMs) newToday += 1;
        if (updated != null && updated >= startMs) activeInPeriod += 1;
        if (p.onboardingCompletedAt) onboardingCompleted += 1;
    }

    const companies = await listAllCompaniesFromStorage();
    let network;
    try {
        network = await getNetworkStats();
    } catch {
        network = null;
    }

    const posts = await statusPostsCol.list({ limit: 2000 });
    const statusPostsPublished = posts.filter((p) => String(p.status || "published") === "published").length;

    const platformEventsInPeriod = await countPlatformEventsSince(startIso).catch(() => null);

    return {
        period: `${days}d`,
        periodStart: startIso,
        sarahAppUsers: {
            totalRegistered: profiles.length,
            activeInPeriod,
            newInPeriod,
            newToday,
            onboardingCompleted,
            profilesScanned: profiles.length,
            profileScanCap: SCAN_CAP,
            availability: profiles.length >= SCAN_CAP ? "partial" : profiles.length ? "full" : "unavailable",
        },
        organisations: {
            tenantRecords: companies.length,
            networkEntitiesListed: network?.entities?.listed ?? null,
            networkEntitiesTotal: network?.entities?.total ?? null,
        },
        engagement: {
            statusPostsPublished,
            platformEventsInPeriod,
            messagesPersonalSarah: null,
            messagesCompanySarah: null,
            note: "Personal and company message totals ship with MC-PO-03 channel rollups.",
        },
    };
}
