import { PERIOD_GRAINS } from "../../platformIntelligence/periodKeys.js";
import { comparePlatformPeriodsReadModel } from "../../platformIntelligence/sarahReadModels.js";
import { piSarahResponse } from "./platformIntelligenceToolCommon.js";

export default {
    name: "comparePlatformPeriods",
    description:
        "Mission Control: compare two reporting periods (current vs previous by default) — message, people, and active organisation growth with percent change from Platform Intelligence. Optional sectorIds to compare Mining vs Retail etc.",
    parameters: {
        type: "object",
        properties: {
            period: { type: "string", enum: ["day", "week", "month"], description: "Grain (default month)." },
            periodKey: { type: "string", description: "Current period key." },
            date: { type: "string", description: "Anchor date for current period." },
            comparePeriodKey: { type: "string", description: "Previous period key (default: prior period)." },
            organisationType: {
                type: "string",
                enum: ["company", "government", "political_public_service"],
            },
            sectorIds: {
                type: "array",
                items: { type: "string" },
                description: "Sectors to compare across the two periods.",
            },
        },
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute(_ctx, args = {}) {
        const period = String(args.period || "month").trim().toLowerCase();
        if (!PERIOD_GRAINS.includes(period)) {
            return {
                success: false,
                error: `Unsupported period "${period}"`,
                completionType: "read",
            };
        }

        const { envelope, comparison, sectorCompare } = await comparePlatformPeriodsReadModel(args);
        const m = comparison.messages.all;
        const msg =
            `Period compare (${comparison.currentPeriodKey} vs ${comparison.previousPeriodKey}): ` +
            `messages ${m.current} vs ${m.previous} (${m.percentChange ?? "n/a"}% change).`;

        return piSarahResponse(envelope, { comparison, sectorCompare }, msg);
    },
};
