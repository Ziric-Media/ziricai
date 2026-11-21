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

export const PERSONAL_SARAH_OPEN_WEB_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "searchOpenWeb",
            description:
                "Search the public internet for factual answers: definitions, who/what/when, how-to, places, sports, weather summaries, exchange rates, general knowledge. Use for anything not covered by Sarah News headlines. Returns Wikipedia, DuckDuckGo, and optional Brave web snippets with URLs.",
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
            const payload = await searchOpenWeb(query, { maxResults: args.maxResults });
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