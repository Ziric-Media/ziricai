/**
 * Platform Intelligence read model — communications (delegates to unified facade).
 */
import { getPlatformIntelligence } from "./getPlatformIntelligence.js";

/**
 * @param {{ period?: string, date?: string, periodKey?: string }} query
 */
export async function getPlatformCommunications(query = {}) {
    const intel = await getPlatformIntelligence(query);
    if (intel.error) return intel;

    return {
        period: intel.period,
        periodKey: intel.periodKey,
        date: intel.period === "day" ? intel.periodKey : undefined,
        generatedAt: intel.generatedAt,
        meta: intel.meta,
        totals: intel.communications.totals,
        byChannel: intel.communications.byChannel,
        byOrganisation: intel.communications.byOrganisation,
        byOrganisationType: intel.communications.byOrganisationType,
        bySector: intel.communications.bySector,
    };
}
