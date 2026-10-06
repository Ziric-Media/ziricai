import { getPlatformIntelligence } from "./getPlatformIntelligence.js";

/**
 * PI-4B/4C read model — platform user network (delegates to unified facade).
 */
export async function getPlatformUserNetwork(query = {}) {
    const intel = await getPlatformIntelligence(query);
    if (intel.error) return intel;

    return {
        period: intel.period,
        periodKey: intel.periodKey,
        date: intel.period === "day" ? intel.periodKey : undefined,
        generatedAt: intel.generatedAt,
        meta: intel.meta,
        totals: intel.userNetwork.totals,
        byOrganisationType: intel.userNetwork.byOrganisationType,
        bySector: intel.userNetwork.bySector,
    };
}
