/**
 * SWI-M1 — Personal Sarah tools for Sarah World Intelligence Memory.
 */
import {
    formatWorldContextForModel,
    recallWorldContext,
    sarahIntelligenceMemoryActive,
} from "../intelligence/sarahIntelligenceRecallService.js";

export const PERSONAL_SARAH_INTELLIGENCE_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "recallWorldContext",
            description:
                "Recall Sarah's stored World Intelligence Memory for a topic (historical admitted headlines with timelines). Use with fetchSarahNewsHeadlines for now+before comparisons on Zimbabwe, mining, SA business, tech, etc.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Topic or keywords e.g. Zimbabwe mining, Eskom, inflation",
                    },
                    region: {
                        type: "string",
                        description: "Optional region filter: zw, za, africa, world",
                    },
                    domain: {
                        type: "string",
                        description: "Optional memory domain: industry, economy, global_events, technology",
                    },
                    maxItems: { type: "number", description: "How many memory rows (1-12, default 6)" },
                },
                required: ["query"],
            },
        },
    },
];

export async function executePersonalSarahIntelligenceTool(toolName, ctx, args = {}) {
    if (toolName !== "recallWorldContext") {
        return { success: false, tool: toolName, error: `Unknown intelligence tool: ${toolName}` };
    }
    if (!ctx.uid) {
        return { success: false, tool: toolName, error: "Not signed in" };
    }
    const query = String(args.query || "").trim();
    if (!query) {
        return { success: false, tool: toolName, error: "query is required" };
    }
    if (!sarahIntelligenceMemoryActive()) {
        return {
            success: true,
            tool: toolName,
            message:
                "World intelligence memory is not enabled on the server yet. Use fetchSarahNewsHeadlines for current headlines.",
            data: { active: false },
        };
    }
    try {
        const payload = await recallWorldContext({
            query,
            region: args.region,
            domain: args.domain,
            limit: args.maxItems,
        });
        const message = formatWorldContextForModel(payload);
        return {
            success: true,
            tool: toolName,
            message,
            data: {
                count: payload.count,
                observations: payload.observations,
                entities: payload.entities,
                timeline: payload.timeline,
                trends: payload.trends,
                graphEdges: payload.graphEdges,
                graphActive: payload.graphActive,
            },
        };
    } catch (err) {
        return {
            success: false,
            tool: toolName,
            error: err.message || "Could not recall world context",
        };
    }
}