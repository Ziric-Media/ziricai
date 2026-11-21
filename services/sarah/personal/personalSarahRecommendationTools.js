/**
 * REC-06 — Personal Sarah ↔ Recommendations Engine.
 */
import { queryRecommendations } from "../../recommendations/queryService.js";
import { recordSponsoredPresentation } from "../../recommendations/presentationService.js";
import { isRecommendationsEngineEnabled } from "../../recommendations/recommendationConfig.js";

export const PERSONAL_SARAH_RECOMMENDATION_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "querySarahRecommendations",
            description:
                "Query Sarah Recommendations for organic and eligible sponsored offerings when the user wants a product, service, school, or business recommendation. Always disclose sponsored results clearly.",
            parameters: {
                type: "object",
                properties: {
                    categoryId: {
                        type: "string",
                        description: "Discover category e.g. education, auto, health",
                    },
                    queryText: { type: "string", description: "What the user is looking for" },
                    city: { type: "string", description: "City or area for relevance" },
                    region: { type: "string", description: "Province/region if known" },
                    limit: { type: "number", description: "Max results (default 5)" },
                },
                required: ["queryText"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "recordSponsoredRecommendationPresented",
            description:
                "After you show a sponsored recommendation to the user with a clear Sponsored disclosure in your reply, record the presentation for campaign allowance (once per message/offering).",
            parameters: {
                type: "object",
                properties: {
                    requestId: { type: "string", description: "From querySarahRecommendations" },
                    campaignId: { type: "string" },
                    offeringId: { type: "string" },
                    companyId: { type: "string" },
                    messageRef: { type: "string", description: "Assistant message id or stable ref for this turn" },
                },
                required: ["campaignId", "offeringId", "companyId", "messageRef"],
            },
        },
    },
];

function profileLocation(ctx) {
    return {
        country: ctx.country || ctx.consumerProfile?.country || "ZA",
        city: ctx.city || ctx.consumerProfile?.city || null,
        region: ctx.consumerProfile?.region || null,
    };
}

/**
 * @param {string} toolName
 * @param {object} ctx
 * @param {object} args
 * @param {{ sessionId?: string, userMessage?: string }} opts
 */
export async function executePersonalSarahRecommendationTool(toolName, ctx, args = {}, opts = {}) {
    if (toolName === "querySarahRecommendations") {
        if (!isRecommendationsEngineEnabled()) {
            return {
                success: false,
                tool: toolName,
                error: "Sarah Recommendations is not enabled on the server yet. Use listSarahNetworkOrganisations for Discover listings.",
            };
        }
        try {
            const location = profileLocation(ctx);
            if (args.city) location.city = String(args.city);
            if (args.region) location.region = String(args.region);
            const result = await queryRecommendations(
                {
                    intent: {
                        categoryId: args.categoryId || null,
                        queryText: String(args.queryText || opts.userMessage || "").trim(),
                    },
                    location,
                    surface: "personal_sarah",
                    conversationRef: opts.sessionId ? `ps:${opts.sessionId}` : null,
                    limit: Number(args.limit) || 5,
                },
                { consumerUid: ctx.uid, surface: "personal_sarah" }
            );
            const lines = [];
            if (result.organic?.length) {
                lines.push("Organic options:");
                result.organic.forEach((o) => lines.push(`• ${o.displayName} (${o.companyId}) — ${o.reason}`));
            }
            if (result.sponsored?.length) {
                lines.push("Sponsored (must disclose):");
                result.sponsored.forEach((o) =>
                    lines.push(`• [Sponsored] ${o.displayName} — campaign ${o.campaignId} — ${o.reason}`)
                );
            }
            if (!lines.length) lines.push("No matching recommendations right now. Try another area or category.");
            return {
                success: true,
                tool: toolName,
                message: `${lines.join("\n")}\n\nrequestId: ${result.requestId}`,
                data: result,
            };
        } catch (err) {
            return { success: false, tool: toolName, error: err.message || "Recommendations query failed" };
        }
    }

    if (toolName === "recordSponsoredRecommendationPresented") {
        try {
            const conversationRef = opts.sessionId ? `ps:${opts.sessionId}` : String(args.conversationRef || "unknown");
            const record = await recordSponsoredPresentation({
                requestId: args.requestId || null,
                campaignId: String(args.campaignId || "").trim(),
                offeringId: String(args.offeringId || "").trim(),
                companyId: String(args.companyId || "").trim(),
                conversationRef,
                messageRef: String(args.messageRef || "").trim(),
                disclosureShown: true,
                consumerUid: ctx.uid,
                surface: "personal_sarah",
            });
            return {
                success: true,
                tool: toolName,
                message: record.allowanceDebited
                    ? `Recorded sponsored presentation. Remaining presentations: ${record.remainingPresentations ?? "?"}`
                    : "Presentation already recorded for this message.",
                data: record,
            };
        } catch (err) {
            return { success: false, tool: toolName, error: err.message || "Could not record presentation" };
        }
    }

    return { success: false, tool: toolName, error: `Unknown recommendations tool: ${toolName}` };
}