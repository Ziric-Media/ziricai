/**
 * Personal Sarah — live open web search and page read (beyond Sarah News RSS).
 */
import {
    formatOpenWebPageForModel,
    formatOpenWebSearchForModel,
    personalSarahOpenWebEnabled,
    readOpenWebPage,
    searchOpenWeb,
} from "../openWeb/openWebSearchService.js";
import { enrichQueryWithUserLocale, resolvePersonalSarahUserLocale } from "./personalSarahUserLocale.js";

export const PERSONAL_SARAH_OPEN_WEB_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "searchOpenWeb",
            description:
                "Search the public internet (Google News RSS, Wikipedia, DuckDuckGo, optional Brave). Use for local politics, elections, coalition talks, current events in the user's country, definitions, facts, how-to — **prefer this over Sarah News** for local/current affairs. Automatically biases toward the user's profile country/city.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search query in natural language" },
                    maxResults: { type: "number", description: "Max snippets (1-10, default 6)" },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "readOpenWebPage",
            description:
                "Fetch and read the main text of a public https web page the user linked or that appeared in search results. Use for detail beyond search snippets.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "Full https URL" },
                },
                required: ["url"],
            },
        },
    },
];

export async function executePersonalSarahOpenWebTool(toolName, ctx, args = {}) {
    if (!ctx.uid) {
        return { success: false, tool: toolName, error: "Not signed in" };
    }
    if (!personalSarahOpenWebEnabled()) {
        return {
            success: false,
            tool: toolName,
            error: "Open web access is disabled on the server.",
        };
    }
    if (toolName === "searchOpenWeb") {
        const query = String(args.query || "").trim();
        if (!query) {
            return { success: false, tool: toolName, error: "query is required" };
        }
        try {
            const locale = resolvePersonalSarahUserLocale(ctx);
            const enriched = enrichQueryWithUserLocale(query, locale);
            const payload = await searchOpenWeb(enriched, {
                maxResults: args.maxResults,
                localeHint: locale,
                includeGoogleNews: true,
            });
            const message = formatOpenWebSearchForModel(payload);
            return {
                success: payload.ok,
                tool: toolName,
                message,
                data: payload,
            };
        } catch (err) {
            return { success: false, tool: toolName, error: err.message || "Search failed" };
        }
    }
    if (toolName === "readOpenWebPage") {
        const url = String(args.url || "").trim();
        if (!url) {
            return { success: false, tool: toolName, error: "url is required" };
        }
        try {
            const payload = await readOpenWebPage(url);
            const message = formatOpenWebPageForModel(payload);
            return {
                success: payload.ok,
                tool: toolName,
                message,
                data: payload,
            };
        } catch (err) {
            return { success: false, tool: toolName, error: err.message || "Could not read page" };
        }
    }
    return { success: false, tool: toolName, error: `Unknown open web tool: ${toolName}` };
}