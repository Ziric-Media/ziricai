import { generatePlatformOperationsReportReadModel } from "../../platformIntelligence/sarahReadModels.js";
import { piSarahResponse } from "./platformIntelligenceToolCommon.js";

export default {
    name: "generatePlatformOperationsReport",
    description:
        "Mission Control flagship: full structured platform operations report — executive summary, organisation network, people network, communications, platform health, commercial, growth, and rule-based assessmentFacts for Sarah to interpret. Use when the operator asks for a full platform operations report or executive briefing.",
    parameters: {
        type: "object",
        properties: {
            period: {
                type: "string",
                enum: ["day", "week", "month"],
                description: "Primary reporting grain (default month).",
            },
            periodKey: { type: "string" },
            date: { type: "string" },
        },
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute(_ctx, args = {}) {
        const { envelope, report } = await generatePlatformOperationsReportReadModel(args);
        if (report.periodKey == null && envelope.dataCompleteness?.partial) {
            return piSarahResponse(envelope, { report }, "Platform operations report could not be loaded.");
        }

        const es = report.executiveSummary || {};
        const msg = es.messages?.all ?? 0;
        return piSarahResponse(
            envelope,
            { report },
            `Platform operations report (${report.period} ${report.periodKey}): ` +
                `${es.organisations ?? "—"} organisations, ${es.uniquePeople ?? 0} people, ${msg} messages. ` +
                `Use report sections and assessmentFacts — do not invent numbers.`
        );
    },
};
