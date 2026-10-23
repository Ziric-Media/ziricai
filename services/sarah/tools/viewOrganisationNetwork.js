import {
    PI_PERIOD_PARAMETERS,
    buildToolEnvelope,
    loadPlatformIntelligence,
    pct,
} from "../../platformIntelligence/sarahReadModels.js";
import { ORGANISATION_TYPE_LABELS } from "../../../js/shared/organisationTaxonomy.js";
import { piSarahResponse } from "./platformIntelligenceToolCommon.js";

export default {
    name: "viewOrganisationNetwork",
    description:
        "Mission Control: organisation census — total organisations, by organisation type (Companies, Government, Political/Public Service), sector distribution, and active organisations in the period. Use for “how many organisations” and sector ranking questions.",
    parameters: {
        ...PI_PERIOD_PARAMETERS,
        properties: {
            ...PI_PERIOD_PARAMETERS.properties,
            topSectors: {
                type: "number",
                description: "How many top sectors to return (default 10).",
            },
        },
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute(_ctx, args = {}) {
        const intel = await loadPlatformIntelligence(args);
        if (intel.error) {
            return piSarahResponse(buildToolEnvelope(intel), { error: intel.error }, intel.error);
        }

        const topN = Math.min(Math.max(Number(args.topSectors) || 10, 1), 50);
        const census = intel.organisationNetwork || {};
        const total = Number(census.totalOrganisations || 0);

        const byType = Object.entries(census.byOrganisationType || {}).map(([type, count]) => ({
            organisationType: type,
            label: ORGANISATION_TYPE_LABELS[type] || type,
            organisations: count,
            shareOfNetworkPct: pct(count, total),
        }));

        const topSectors = Object.entries(census.bySector || {})
            .map(([key, count]) => {
                const [organisationType, sectorId] = key.split("::");
                return { key, organisationType, sectorId, organisations: count };
            })
            .sort((a, b) => b.organisations - a.organisations)
            .slice(0, topN);

        const envelope = buildToolEnvelope(intel, { censusAsOf: "current_metadata" });
        return piSarahResponse(
            envelope,
            {
                organisationNetwork: {
                    totalOrganisations: total,
                    activeOrganisations: census.activeOrganisations,
                    byOrganisationType: byType,
                    topSectors,
                },
            },
            `${total} organisations on the platform (${census.activeOrganisations ?? 0} active this ${intel.period}).`
        );
    },
};
