/**
 * U2 — Personal Sarah tool implementations.
 */
import { createPersonalReminder } from "./personalSarahTaskStore.js";
import { createSarahReminderScheduledNotification } from "../../network/notificationService.js";
import {
    getUserConversationByCompany,
    summarizeConversationForUser,
    syncMessagesFromTenant,
} from "../../users/userConversationService.js";
import {
    PERSONAL_SARAH_NETWORK_TOOL_DEFINITIONS,
    executePersonalSarahNetworkTool,
} from "./personalSarahNetworkTools.js";
import {
    PERSONAL_SARAH_RECOMMENDATION_TOOL_DEFINITIONS,
    executePersonalSarahRecommendationTool,
} from "./personalSarahRecommendationTools.js";
import {
    PERSONAL_SARAH_NEWS_TOOL_DEFINITIONS,
    executePersonalSarahNewsTool,
} from "./personalSarahNewsTools.js";
import {
    PERSONAL_SARAH_INTELLIGENCE_TOOL_DEFINITIONS,
    executePersonalSarahIntelligenceTool,
} from "./personalSarahIntelligenceTools.js";
import {
    PERSONAL_SARAH_OPEN_WEB_TOOL_DEFINITIONS,
    executePersonalSarahOpenWebTool,
} from "./personalSarahOpenWebTools.js";

function defaultDueAtIso(minutesFromNow = 30) {
    return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

/** Resolve due time from tool args and optional user wording (ISO, relative, or short defaults). */
export function resolveReminderDueAt(dueAtInput, { userMessage = "", title = "" } = {}) {
    const rawDue = String(dueAtInput || "").trim();
    const haystack = [rawDue, String(userMessage || ""), String(title || "")].filter(Boolean).join(" ");
    const lower = haystack.toLowerCase();

    if (rawDue) {
        const explicit = Date.parse(rawDue);
        if (Number.isFinite(explicit)) return new Date(explicit).toISOString();
    }

    const rel = lower.match(/\bin\s+(\d+)\s*(minute|min|mins|hour|hr|hrs|day|days)\b/);
    if (rel) {
        const n = Number(rel[1]);
        let ms = n * 60_000;
        const unit = rel[2];
        if (unit.startsWith("hour") || unit.startsWith("hr")) ms = n * 3_600_000;
        else if (unit.startsWith("day")) ms = n * 86_400_000;
        return new Date(Date.now() + ms).toISOString();
    }

  const setClock = (baseDate, match) => {
        if (!match) return baseDate;
        let hour = Number(match[1]);
        const minute = match[2] ? Number(match[2]) : 0;
        const ampm = (match[3] || "").toLowerCase();
        if (ampm === "pm" && hour < 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        baseDate.setHours(hour, minute, 0, 0);
        return baseDate;
    };

    if (/\btomorrow\b/.test(lower)) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const tm = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        return setClock(d, tm).toISOString();
    }

    const atTime = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (atTime) {
        const d = new Date();
        return setClock(d, atTime).toISOString();
    }

    if (/\btoday\b/.test(lower)) {
        const tm = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        const d = new Date();
        return setClock(d, tm).toISOString();
    }

    const clock24 = lower.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
    if (clock24) {
        const d = new Date();
        return setClock(d, clock24).toISOString();
    }

    return defaultDueAtIso(30);
}

/** Detect reminder intent from user message (used when the model skips the tool). */
export function matchPersonalReminderIntent(message) {
    const text = String(message || "").trim();
    if (!text) return null;
    if (!/\bremind\b|\breminder\b|\balarm\b|\bremember to\b/i.test(text)) return null;
    const titleMatch = text.match(/remind(?: me)?(?: to| as(?: an?)? alarm)?\s+(.+)/i);
    let rawTitle = (titleMatch?.[1] || text).trim();
    rawTitle = rawTitle.replace(/\b(today|tomorrow)\b.*/i, "").trim() || rawTitle;
    rawTitle = rawTitle.slice(0, 120) || "Reminder";
    const dueAt = resolveReminderDueAt(null, { userMessage: text, title: rawTitle });
    return { title: rawTitle, dueAt };
}

function formatReminderDueLabel(iso) {
    if (!iso) return "";
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return String(iso);
    try {
        return new Date(ms).toLocaleString("en-ZA", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

const PERSONAL_SARAH_CORE_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "createPersonalReminder",
            description:
                "Schedule a personal reminder for the user. It appears in Sarah App under My Notifications and is delivered via push notification and in-app alarm when due. Always call this when the user asks to be reminded — do not say reminders are unavailable.",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string", description: "Short reminder title (what to do or remember)" },
                    dueAt: {
                        type: "string",
                        description:
                            "When to fire: ISO-8601 datetime, or phrases like in 10 minutes, tomorrow 9am, today at 3pm. If omitted, default is about 30 minutes from now.",
                    },
                    notes: { type: "string", description: "Optional extra detail" },
                },
                required: ["title"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "summarizeCompanyConversation",
            description:
                "Summarize the user's existing Sarah App chat thread with a business (requires they already chatted with that company).",
            parameters: {
                type: "object",
                properties: {
                    companyId: { type: "string", description: "Business company id e.g. smilemore-demo" },
                },
                required: ["companyId"],
            },
        },
    },
];

export const PERSONAL_SARAH_TOOL_DEFINITIONS = [
    ...PERSONAL_SARAH_CORE_TOOL_DEFINITIONS,
    ...PERSONAL_SARAH_NEWS_TOOL_DEFINITIONS,
    ...PERSONAL_SARAH_OPEN_WEB_TOOL_DEFINITIONS,
    ...PERSONAL_SARAH_INTELLIGENCE_TOOL_DEFINITIONS,
    ...PERSONAL_SARAH_NETWORK_TOOL_DEFINITIONS,
    ...PERSONAL_SARAH_RECOMMENDATION_TOOL_DEFINITIONS,
];

export async function executePersonalSarahTool(toolName, ctx, args = {}, opts = {}) {
    if (PERSONAL_SARAH_NETWORK_TOOL_DEFINITIONS.some((t) => t.function.name === toolName)) {
        return executePersonalSarahNetworkTool(toolName, ctx, args);
    }
    if (PERSONAL_SARAH_RECOMMENDATION_TOOL_DEFINITIONS.some((t) => t.function.name === toolName)) {
        return executePersonalSarahRecommendationTool(toolName, ctx, args, opts);
    }
    if (PERSONAL_SARAH_NEWS_TOOL_DEFINITIONS.some((t) => t.function.name === toolName)) {
        return executePersonalSarahNewsTool(toolName, ctx, args);
    }
    if (PERSONAL_SARAH_OPEN_WEB_TOOL_DEFINITIONS.some((t) => t.function.name === toolName)) {
        return executePersonalSarahOpenWebTool(toolName, ctx, args);
    }
    if (PERSONAL_SARAH_INTELLIGENCE_TOOL_DEFINITIONS.some((t) => t.function.name === toolName)) {
        return executePersonalSarahIntelligenceTool(toolName, ctx, args);
    }
    if (toolName === "createPersonalReminder") {
        try {
            const dueAt = resolveReminderDueAt(args.dueAt, {
                userMessage: opts.userMessage || "",
                title: args.title,
            });
            const task = await createPersonalReminder(ctx.uid, { ...args, dueAt });
            try {
                await createSarahReminderScheduledNotification(ctx.uid, {
                    reminderId: task.id,
                    title: task.title,
                    body: task.notes || task.title,
                    dueAt: task.dueAt,
                });
            } catch (err) {
                console.warn("[personalSarah] scheduled reminder inbox:", err?.message || err);
            }
            const when = formatReminderDueLabel(task.dueAt);
            return {
                success: true,
                tool: toolName,
                message: `Done — I've set your reminder "${task.title}"${when ? ` for ${when}` : ""}. You'll get a push and see it under My Notifications (★) when it's due.`,
                data: { taskId: task.id, dueAt: task.dueAt, title: task.title },
            };
        } catch (err) {
            return {
                success: false,
                tool: toolName,
                error: err.message || "Could not save reminder",
            };
        }
    }
    if (toolName === "summarizeCompanyConversation") {
        const companyId = String(args.companyId || "").trim();
        if (!companyId) {
            return { success: false, tool: toolName, error: "companyId is required" };
        }
        const conv = getUserConversationByCompany(ctx.uid, companyId);
        if (!conv) {
            return {
                success: false,
                tool: toolName,
                error: "No conversation found with that business yet. Start a chat from Discover or Chats first.",
            };
        }
        await syncMessagesFromTenant(conv);
        const summary = summarizeConversationForUser(conv.id);
        return {
            success: true,
            tool: toolName,
            message: summary,
            data: { conversationId: conv.id, companyId },
        };
    }
    return { success: false, tool: toolName, error: `Unknown personal tool: ${toolName}` };
}