/**
 * Personal Sarah — Sarah News intelligence (same RSS engine as Sarah News tab).
 */
import {
    formatSarahNewsSnapshotForModel,
    getSarahNewsSnapshotForUser,
} from "../news/sarahNewsIntelligenceService.js";

export const PERSONAL_SARAH_NEWS_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "fetchSarahNewsHeadlines",
            description:
                "Fetch the user's personalised news headlines from Sarah News (same multi-publisher RSS engine as the News tab). Use for current events, SA/Zimbabwe/Africa/world/tech questions, and breaking context. Requires the user to have set up News preferences.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Optional keyword filter e.g. Zimbabwe, Eskom, tech",
                    },
                    maxItems: { type: "number", description: "How many headlines to return (1-20, default 8)" },
                },
            },
        },
    },
];

export async function executePersonalSarahNewsTool(toolName, ctx, args = {}) {
    if (toolName !== "fetchSarahNewsHeadlines") {
        return { success: false, tool: toolName, error: `Unknown news tool: ${toolName}` };
    }
  if (!ctx.uid) {
        return { success: false, tool: toolName, error: "Not signed in" };
    }
    try {
        const snap = await getSarahNewsSnapshotForUser(ctx.uid, {
            query: args.query,
            maxItems: args.maxItems,
        });
        if (!snap.success) {
            return {
                success: false,
                tool: toolName,
                error: snap.error,
                code: snap.code,
            };
        }
        const message = formatSarahNewsSnapshotForModel(snap);
        return {
            success: true,
            tool: toolName,
            message,
            data: { headlines: snap.headlines, edition: snap.edition },
        };
    } catch (err) {
        return {
            success: false,
            tool: toolName,
            error: err.message || "Could not compile Sarah News",
        };
    }
}