/**
 * Personal Sarah — Sarah News intelligence (same RSS engine as Sarah News tab).
 */
import { getSarahNewsSnapshotForUser } from "../news/sarahNewsIntelligenceService.js";
import { formatSarahNewsSnapshotForPersonalSarah } from "./personalSarahConversationVoice.js";
import {
    addSarahNewsFollowTopic,
    getSarahNewsProfile,
    removeSarahNewsFollowTopic,
} from "../news/sarahNewsProfileService.js";

export const PERSONAL_SARAH_NEWS_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "followSarahNewsTopic",
            description:
                "Add a topic, person, team, or subject for Sarah News to prioritise in future briefings (e.g. Elon Musk, Manchester United, Zimbabwe mining). Requires News setup.",
            parameters: {
                type: "object",
                properties: {
                    topic: { type: "string", description: "Short label to follow" },
                },
                required: ["topic"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "unfollowSarahNewsTopic",
            description: "Stop prioritising a previously followed Sarah News topic.",
            parameters: {
                type: "object",
                properties: {
                    topic: { type: "string", description: "Topic label to remove" },
                },
                required: ["topic"],
            },
        },
    },
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
    if (!ctx.uid) {
        return { success: false, tool: toolName, error: "Not signed in" };
    }
    if (toolName === "followSarahNewsTopic" || toolName === "unfollowSarahNewsTopic") {
        const topic = String(args.topic || "").trim();
        if (!topic) {
            return { success: false, tool: toolName, error: "topic is required" };
        }
        const profile = await getSarahNewsProfile(ctx.uid);
        if (!profile?.regions?.length) {
            return {
                success: false,
                tool: toolName,
                error: "Sarah News is not set up yet. Ask the user to open News and save preferences once.",
                code: "NEWS_PROFILE_MISSING",
            };
        }
        if (toolName === "followSarahNewsTopic") {
            const { profile: updated, added } = await addSarahNewsFollowTopic(ctx.uid, profile, topic);
            const list = (updated.followTopics || []).join(", ") || "none";
            return {
                success: true,
                tool: toolName,
                message: added
                    ? `Done — I'll prioritise "${topic}" in your briefings. You're now following: ${list}.`
                    : `You're already following "${topic}". Current follows: ${list}.`,
                data: { followTopics: updated.followTopics },
            };
        }
        const { profile: updated, removed } = await removeSarahNewsFollowTopic(ctx.uid, profile, topic);
        const list = (updated.followTopics || []).join(", ") || "none";
        return {
            success: true,
            tool: toolName,
            message: removed
                ? `Stopped prioritising "${topic}". You're now following: ${list}.`
                : `I didn't find "${topic}" on your follow list. Current follows: ${list}.`,
            data: { followTopics: updated.followTopics },
        };
    }
    if (toolName !== "fetchSarahNewsHeadlines") {
        return { success: false, tool: toolName, error: `Unknown news tool: ${toolName}` };
    }
    try {
        const snap = await getSarahNewsSnapshotForUser(ctx.uid, {
            query: args.query,
            maxItems: args.maxItems,
            useDefaultProfileIfMissing: true,
        });
        if (!snap.success) {
            return {
                success: false,
                tool: toolName,
                error: snap.error,
                code: snap.code,
            };
        }
        const message = formatSarahNewsSnapshotForPersonalSarah(snap);
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