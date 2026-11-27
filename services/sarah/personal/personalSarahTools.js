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

function calendarYmdInZone(date, timeZone) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function addDaysToYmd(ymd, days) {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
}

function localYmdInZone(ref, timeZone, dayOffset = 0) {
    let ymd = calendarYmdInZone(ref, timeZone);
    if (dayOffset) ymd = addDaysToYmd(ymd, dayOffset);
    const [y, m, d] = ymd.split("-").map(Number);
    return { y, m, d };
}

/** Wall clock in user TZ → UTC ISO (Railway runs in UTC; never use setHours on server). */
export function wallClockToIsoUtc(y, m, d, hour, minute, timeZone) {
    let ts = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
    for (let n = 0; n < 8; n++) {
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(new Date(ts));
        const got = {
            y: Number(parts.find((p) => p.type === "year")?.value),
            m: Number(parts.find((p) => p.type === "month")?.value),
            d: Number(parts.find((p) => p.type === "day")?.value),
            h: Number(parts.find((p) => p.type === "hour")?.value),
            mi: Number(parts.find((p) => p.type === "minute")?.value),
        };
        if (got.y === y && got.m === m && got.d === d && got.h === hour && got.mi === minute) {
            return new Date(ts).toISOString();
        }
        const wantMin = hour * 60 + minute;
        const gotMin = got.h * 60 + got.mi;
        let deltaMin = wantMin - gotMin;
        if (got.y !== y || got.m !== m || got.d !== d) {
            deltaMin += (y - got.y) * 525_600;
        }
        if (deltaMin > 12 * 60) deltaMin -= 24 * 60;
        if (deltaMin < -12 * 60) deltaMin += 24 * 60;
        ts += deltaMin * 60_000;
    }
    return new Date(ts).toISOString();
}

function setWallClockInZone(ref, match, timeZone, dayOffset = 0) {
    if (!match) return defaultDueAtIso(30);
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const ampm = (match[3] || "").toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const { y, m, d } = localYmdInZone(ref, timeZone, dayOffset);
    return wallClockToIsoUtc(y, m, d, hour, minute, timeZone);
}

/** Resolve due time from tool args and optional user wording (ISO, relative, or short defaults). */
export function resolveReminderDueAt(dueAtInput, { userMessage = "", title = "", timeZone = "Africa/Johannesburg" } = {}) {
    const tz = String(timeZone || "Africa/Johannesburg").trim() || "Africa/Johannesburg";
    const rawDue = String(dueAtInput || "").trim();
    const haystack = [rawDue, String(userMessage || ""), String(title || "")].filter(Boolean).join(" ");
    const lower = haystack.toLowerCase();
    const now = new Date();

    if (rawDue) {
        const explicit = Date.parse(rawDue);
        if (Number.isFinite(explicit)) {
            const d = new Date(explicit);
            if (d.getTime() >= Date.now() - 60_000) return d.toISOString();
        }
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

    const timeMatch =
        lower.match(/\bat\s+(\d{1,2}):(\d{2})\b/i) ||
        lower.match(/\b(\d{1,2}):(\d{2})\b/) ||
        lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
        lower.match(/\bat\s+(\d{1,2})\b(?!\s*(am|pm))/);

    if (/\btomorrow\b/.test(lower)) {
        return setWallClockInZone(now, timeMatch, tz, 1);
    }

    if (/\bfor\s+today\b|\btoday\b|\bthis\s+evening\b|\btonight\b/i.test(lower)) {
        return setWallClockInZone(now, timeMatch, tz, 0);
    }

    if (timeMatch) {
        return setWallClockInZone(now, timeMatch, tz, 0);
    }

    return defaultDueAtIso(30);
}

/** Detect reminder intent from user message (used when the model skips the tool). */
export function matchPersonalReminderIntent(message, timeZone = "Africa/Johannesburg") {
    const text = String(message || "").trim();
    if (!text) return null;
    if (!/\bremind\b|\breminder\b|\balarm\b|\bremember to\b|\bset\s+a\s+reminder\b/i.test(text)) return null;
    let rawTitle = text
        .replace(/^[\s\S]*\bremind(?:\s+me)?\s+/i, "")
        .replace(/^(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+/i, "")
        .replace(/^today\s+(?:to\s+)?/i, "")
        .replace(/^(?:for|to)\s+/i, "")
        .trim();
    if (!rawTitle) rawTitle = text.slice(0, 120);
    rawTitle = rawTitle.slice(0, 120) || "Reminder";
    const dueAt = resolveReminderDueAt(null, { userMessage: text, title: rawTitle, timeZone });
    return { title: rawTitle, dueAt };
}

function formatReminderDueLabel(iso, timeZone = "Africa/Johannesburg") {
    if (!iso) return "";
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return String(iso);
    try {
        const now = new Date();
        const sameLocalDay =
            new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
                now
            ) ===
            new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
        const time = new Intl.DateTimeFormat("en-ZA", {
            timeZone,
            hour: "numeric",
            minute: "2-digit",
            hour12: false,
        }).format(ms);
        if (sameLocalDay) return `today at ${time}`;
        return new Intl.DateTimeFormat("en-ZA", {
            timeZone,
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: false,
        }).format(ms);
    } catch {
        return iso;
    }
}

export function timeZoneForCtx(ctx = {}) {
    const tz = String(ctx.timeZone || ctx.consumerProfile?.timeZone || "").trim();
    if (tz) return tz;
    const country = String(ctx.country || "").toUpperCase();
    if (country === "ZW" || country === "ZIMBABWE") return "Africa/Harare";
    return "Africa/Johannesburg";
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
                timeZone: timeZoneForCtx(ctx),
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
            const when = formatReminderDueLabel(task.dueAt, timeZoneForCtx(ctx));
            return {
                success: true,
                tool: toolName,
                message: `Done — I've set your reminder "${task.title}" for ${when || "soon"}. You'll get a push and an in-app alarm at the due time; track it under Work and My Notifications → Reminders.`,
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