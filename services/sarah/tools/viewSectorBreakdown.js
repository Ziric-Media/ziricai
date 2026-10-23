import { PI_PERIOD_PARAMETERS, getSectorBreakdownReadModel } from "../../platformIntelligence/sarahReadModels.js";
import { piSarahResponse } from "./platformIntelligenceToolCommon.js";

export default {
    name: "viewSectorBreakdown",
    description:
        "Mission Control: sector intelligence — organisations, message share, and people share per sector (organisation type filter, default Companies). Use for “Mining vs Retail”, sector share of network, and top sectors.",
    parameters: {
        type: "object",
        properties: {
            ...PI_PERIOD_PARAMETERS.properties,
            organisationType: {
                type: "string",
                enum: ["company", "government", "political_public_service"],
                description: "Organisation type filter (default company).",
            },
            top: {
                type: "number",
                description: "Max sectors to return (default 10).",
            },
            sectorIds: {
                type: "array",
                items: { type: "string" },
                description: "Optional filter to specific sector ids.",
            },
        },
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute(_ctx, args = {}) {
        const model = await getSectorBreakdownReadModel(args);
        if (model.intel?.error) {
            return piSarahResponse(model.envelope, { error: model.intel.error }, model.intel.error);
        }

        let sectors = model.sectors;
        if (Array.isArray(args.sectorIds) && args.sectorIds.length) {
            const want = new Set(args.sectorIds.map((s) => String(s).toLowerCase()));
            sectors = sectors.filter((s) => want.has(String(s.sectorId).toLowerCase()));
        }

        const lead = sectors[0];
        const msg =
            lead && lead.messages?.all
                ? `Top sector ${lead.sectorLabel}: ${lead.organisations} orgs, ${lead.messages.all} messages (${lead.messages.shareOfMessagesPct ?? "—"}% of period messages).`
                : `Sector breakdown for ${model.envelope.organisationTypeLabel || "network"} — ${sectors.length} sector row(s).`;

        return piSarahResponse(model.envelope, { sectors }, msg);
    },
};
