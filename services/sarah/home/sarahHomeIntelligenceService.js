/**
 * SHI-01 — rank and populate My Sarah home cards (max 4) from authorised facts only.
 */
import { listPersonalSarahSessions } from "../personal/personalSarahSessionStore.js";
import { listPersonalReminders } from "../personal/personalSarahTaskStore.js";
import { consumerRegistrationComplete, getConsumerProfile } from "../../users/consumerProfileService.js";
import { listUpdatesForUser } from "../../network/subscriberUpdatesService.js";
import { getSarahNewsProfile } from "../news/sarahNewsProfileService.js";
import { getSarahNewsSnapshotForUser } from "../news/sarahNewsIntelligenceService.js";
import { breakingAlertsForProfile } from "../news/sarahNewsBreakingService.js";
import { slotsDueNow } from "../news/sarahNewsBriefingSchedule.js";
import { slotForNow } from "../news/sarahNewsEditionService.js";
import { getConsumerNotificationPrefs } from "../../network/consumerNotificationPrefsService.js";

const MAX_CARDS = 4;

function timeOfDay(date = new Date()) {
    const h = date.getHours();
    if (h < 12) return "morning";
    if (h < 17) return "day";
    return "evening";
}

function timeGreeting(timeOfDay) {
    if (timeOfDay === "morning") return "Good morning";
    if (timeOfDay === "evening") return "Good evening";
    return "Good afternoon";
}

function greetingFor(ctx) {
    const first = ctx.displayName ? String(ctx.displayName).trim().split(/\s+/)[0] : "";
    const named = first ? `, ${first}` : "";
    const part = timeGreeting(ctx.timeOfDay);
    if (ctx.mode === "work") {
        if (ctx.work.awaitingInput.length) return `Your work needs attention${named}`;
        if (ctx.work.inProgress.length) return `Your work is progressing${named}`;
        return `${part}${named}. What should Sarah Work tackle next?`;
    }
    if (ctx.isNewUser && !first) return `Welcome to Sarah — ${part}. How can I help you today?`;
    if (first) return `${part}${named}. How can I help you today?`;
    return `${part}. How can I help you today?`;
}

/**
 * @param {string} uid
 * @param {object} opts
 * @param {'chat'|'work'} opts.mode
 * @param {string[]} [opts.dismissedCardIds]
 * @param {string[]} [opts.pinnedCardIds]
 * @param {boolean} [opts.staticHome]
 */
export async function gatherSarahHomeContext(uid, { mode = "chat" } = {}) {
    const [profile, sessions, reminders, updates, newsProfile, notifPrefs] = await Promise.all([
        getConsumerProfile(uid).catch(() => null),
        listPersonalSarahSessions(uid, { limit: 40 }).catch(() => []),
        listPersonalReminders(uid, { limit: 30 }).catch(() => []),
        listUpdatesForUser(uid, { limit: 8 }).catch(() => ({ updates: [] })),
        getSarahNewsProfile(uid).catch(() => null),
        getConsumerNotificationPrefs(uid).catch(() => ({ prefs: { timezoneOffsetMinutes: 0 } })),
    ]);
    const workSessions = sessions.filter((s) => s.mode === "work");
    const inProgress = workSessions.filter((s) => s.workSubmittedAt && !s.workCompletedAt && !s.workCancelledAt);
    const completed = workSessions.filter((s) => s.workCompletedAt && !s.workCancelledAt);
    const awaitingInput = workSessions.filter((s) => s.workPausedAt && !s.workCompletedAt && !s.workCancelledAt);
    const now = Date.now();
    const dueReminders = reminders
        .filter((r) => r.status === "scheduled" && r.dueAt)
        .map((r) => ({ ...r, dueMs: new Date(r.dueAt).getTime() }))
        .filter((r) => Number.isFinite(r.dueMs))
        .sort((a, b) => a.dueMs - b.dueMs);
    const nextReminder = dueReminders.find((r) => r.dueMs >= now) || dueReminders[0] || null;
    const orgUpdates = updates?.updates || [];
    const chatCount = sessions.filter((s) => s.mode !== "work").length;
    const workCount = workSessions.length;
    const displayName = profile
        ? String(
              profile.preferredName ||
                  profile.firstName ||
                  profile.displayName ||
                  profile.fullName ||
                  profile.name ||
                  ""
          )
              .trim()
              .split(/\s+/)[0] || null
        : null;

    /** @type {object} */
    const news = {
        configured: Boolean(newsProfile?.regions?.length),
        ready: false,
        slot: slotForNow(),
        topHeadline: null,
        storyId: null,
        headlineCount: 0,
        breaking: [],
        dueSlots: [],
    };
    if (news.configured) {
        const tz = Number(notifPrefs?.prefs?.timezoneOffsetMinutes) || 0;
        news.dueSlots = slotsDueNow(newsProfile, tz);
        try {
            const snap = await getSarahNewsSnapshotForUser(uid, {
                slot: news.slot,
                maxItems: 4,
                persistEdition: false,
            });
            if (snap.success && snap.headlines?.length) {
                news.ready = true;
                news.topHeadline = snap.headlines[0].headline;
                news.storyId = snap.headlines[0].storyId;
                news.headlineCount = snap.headlines.length;
                news.slot = snap.edition?.slot || news.slot;
            }
        } catch {
            /* news optional on home */
        }
        if (newsProfile.breaking) {
            try {
                news.breaking = (await breakingAlertsForProfile(newsProfile)).slice(0, 2);
            } catch {
                news.breaking = [];
            }
        }
    }

    return {
        uid,
        mode,
        timeOfDay: timeOfDay(),
        displayName,
        isNewUser: sessions.length === 0 && (!profile || !consumerRegistrationComplete(profile)),
        work: { inProgress, completed: completed.slice(0, 3), awaitingInput },
        reminders: { next: nextReminder, dueCount: dueReminders.length },
        organisations: { updates: orgUpdates.slice(0, 4) },
        behaviour: { chatCount, workCount, prefersWork: workCount > chatCount && workCount >= 2 },
        news,
    };
}

/** @param {ReturnType<typeof gatherSarahHomeContext> extends Promise<infer T> ? T : never} ctx */
function buildCandidates(ctx) {
    /** @type {object[]} */
    const out = [];
    const push = (card) => {
        if (card) out.push(card);
    };

    if (ctx.isNewUser && ctx.mode === "chat") {
        push({
            id: "onboard_meet_sarah",
            title: "Meet Sarah",
            lines: ["Discover what your AI assistant can do"],
            reason: "Getting started",
            icon: "insight",
            prompt: "Give me a short tour of what Personal Sarah can do for me.",
            priority: 100,
            action: { type: "prompt" },
        });
        push({
            id: "onboard_profile",
            title: "Set up your profile",
            lines: ["Help Sarah understand your preferences"],
            icon: "tasks",
            prompt: "What should I add to my profile so Sarah can personalise better?",
            priority: 95,
            action: { type: "route", route: "profile" },
        });
        push({
            id: "onboard_knowledge",
            title: "My Knowledge",
            lines: ["Choose what Sarah can learn and remember"],
            icon: "knowledge",
            priority: 90,
            prompt: "Walk me through My Knowledge — what should I save so you can answer better?",
            action: { type: "panel", panel: "knowledge" },
        });
        push({
            id: "onboard_discover",
            title: "Explore Discover",
            lines: ["Find organisations and services"],
            icon: "calendar",
            priority: 85,
            prompt: "Help me find organisations and services that fit me in Discover.",
            action: { type: "route", route: "discover" },
        });
        if (ctx.news?.configured) {
            push({
                id: "onboard_news",
                title: "Sarah News",
                lines: ["Your personalised briefing is ready"],
                icon: "insight",
                priority: 84,
                action: { type: "route", route: "news" },
            });
        }
        return out;
    }

    const slotLabel = { morning: "Morning", lunch: "Lunchtime", evening: "Evening" };

    if (ctx.mode === "chat" && ctx.news?.breaking?.length) {
        const b = ctx.news.breaking[0];
        push({
            id: `news_breaking_${b.storyId}`,
            title: "Sarah Breaking",
            lines: [String(b.headline || "Developing story").slice(0, 88)],
            reason: b.confidence === "verified" ? "Verified from multiple sources" : "Developing — Sarah is watching",
            icon: "insight",
            priority: 97,
            action: { type: "news_story", storyId: b.storyId, route: "news" },
        });
    }

    if (ctx.mode === "chat" && ctx.news?.ready && ctx.news.topHeadline) {
        const label = slotLabel[ctx.news.slot] || "News";
        const lines = [String(ctx.news.topHeadline).slice(0, 88)];
        if (ctx.news.headlineCount > 1) lines.push(`${ctx.news.headlineCount} headlines in your edition`);
        push({
            id: `news_briefing_${ctx.news.slot}`,
            title: `${label} briefing ready`,
            lines,
            reason: ctx.news.dueSlots?.includes(ctx.news.slot)
                ? `Your ${label.toLowerCase()} window is open`
                : "From Sarah News",
            icon: "insight",
            priority: 91,
            action: { type: "route", route: "news" },
            prompt: "Summarise the top headlines in my Sarah News briefing today.",
        });
    } else if (ctx.mode === "chat" && ctx.news?.configured) {
        push({
            id: "news_open",
            title: "Sarah News",
            lines: ["Open your personalised briefing"],
            reason: "Tap to load today's headlines",
            icon: "insight",
            priority: 60,
            action: { type: "route", route: "news" },
        });
    }

    if (ctx.mode === "chat" && !ctx.news?.configured && !ctx.isNewUser) {
        push({
            id: "news_setup",
            title: "Set up Sarah News",
            lines: ["Personal briefings for SA, Zimbabwe, and world"],
            reason: "New flagship experience",
            icon: "insight",
            priority: 58,
            action: { type: "route", route: "news" },
        });
    }

    if (ctx.mode === "work") {
        for (const s of ctx.work.completed.slice(0, 2)) {
            const capLine = s.capabilityLabel ? `${s.capabilityLabel} assignment` : null;
            push({
                id: `work_done_${s.id}`,
                title: s.title || "Completed work",
                lines: [
                    capLine || "Your report is ready.",
                    s.workReport?.summary ? String(s.workReport.summary).slice(0, 80) : "Open to review.",
                ],
                reason: "Completed assignment",
                icon: "tasks",
                priority: 92,
                action: { type: "thread", sessionId: s.id },
            });
        }
        for (const s of ctx.work.awaitingInput) {
            push({
                id: `work_input_${s.id}`,
                title: s.title || "Work needs your input",
                lines: ["Sarah needs your approval to continue."],
                reason: "Awaiting your approval",
                icon: "tasks",
                priority: 98,
                action: { type: "thread", sessionId: s.id },
            });
        }
        for (const s of ctx.work.inProgress.slice(0, 2)) {
            push({
                id: `work_progress_${s.id}`,
                title: s.title || "Work in progress",
                lines: [
                    s.capabilityLabel ? `${s.capabilityLabel} · in progress` : "Sarah is working on this for you.",
                ],
                reason: "Active assignment",
                icon: "tasks",
                priority: 90,
                action: { type: "thread", sessionId: s.id },
            });
        }
        push({
            id: "work_new",
            title: "Delegate a task",
            lines: ["Start a new Sarah Work item"],
            icon: "tasks",
            prompt: "I want Sarah to help me with a new work task.",
            priority: 40,
            action: { type: "panel", panel: "tasks" },
        });
        return out;
    }

    if (ctx.timeOfDay === "morning") {
        push({
            id: "morning_plan",
            title: "Ask Sarah",
            lines: ["Plan your day with me"],
            reason: ctx.reminders.next
                ? `Next reminder at ${new Date(ctx.reminders.next.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Good time to plan your day",
            icon: "calendar",
            prompt: "Help me plan my day based on what you know about my priorities.",
            priority: 88,
        });
        push({
            id: "morning_priorities",
            title: "Your priorities",
            lines: [
                ctx.reminders.dueCount ? `${ctx.reminders.dueCount} reminder(s) on your list` : "Review what matters today",
            ],
            reason: ctx.reminders.dueCount ? "From your reminders" : null,
            icon: "tasks",
            prompt: "What should I focus on first today?",
            priority: 75,
        });
    }

    for (const u of ctx.organisations.updates) {
        const orgName = u.organisation?.displayName;
        const title = u.title || "Organisation update";
        const shortTitle = String(title).slice(0, 48);
        push({
            id: `org_${u.eventId || u.snId || title}`.slice(0, 64),
            title: shortTitle,
            lines: [u.body ? String(u.body).slice(0, 72) : "New update from an organisation you follow"],
            reason: orgName ? `From ${orgName}` : "From My Organisations",
            icon: "insight",
            priority: 80,
            prompt: orgName
                ? `Summarise the latest update from ${orgName} (${shortTitle}) and what I should do next.`
                : `Summarise this organisation update (${shortTitle}) and what I should do next.`,
            action: u.snId ? { type: "entity", snId: u.snId } : { type: "route", route: "discover" },
        });
    }

    if (ctx.behaviour.prefersWork && !ctx.staticHome) {
        push({
            id: "chat_work_status",
            title: "Sarah Work",
            lines: [`${ctx.work.inProgress.length} active · ${ctx.work.completed.length} completed recently`],
            reason: "You often use Work",
            icon: "tasks",
            priority: 70,
            action: { type: "mode", mode: "work" },
        });
    }

    push({
        id: "chat_knowledge",
        title: "Use My Knowledge",
        lines: ["Answers from what you saved", "Sarah cites your saved facts"],
        icon: "knowledge",
        prompt:
            "Answer using my saved My Knowledge where you have permission. If something is missing, say what you would need me to add.",
        priority: 55,
    });
    push({
        id: "chat_insights",
        title: "Quick insights",
        lines: ["One focused tip for this week"],
        icon: "insight",
        prompt: "Give me one insight to improve how I use Sarah this week.",
        priority: 50,
    });

    return out;
}

/** Evergreen pool so dismiss always backfills to MAX_CARDS. */
function buildEvergreenCards(ctx) {
    const part = ctx.timeOfDay === "morning" ? "today" : ctx.timeOfDay === "evening" ? "this evening" : "this afternoon";
    return [
        {
            id: "evergreen_plan",
            title: "Plan your day",
            lines: [`Shape priorities for ${part}`],
            icon: "calendar",
            prompt: "Help me plan my day based on what you know about my priorities and schedule.",
            priority: 42,
        },
        {
            id: "evergreen_tasks",
            title: "Organise tasks",
            lines: ["Name what matters most", "Turn errands into a short list"],
            icon: "tasks",
            prompt: "Help me organise my tasks and set clear priorities.",
            priority: 41,
        },
        {
            id: "evergreen_knowledge",
            title: "Use My Knowledge",
            lines: ["Answers grounded in what I saved"],
            icon: "knowledge",
            prompt:
                "Answer using my saved My Knowledge where you have permission. If something is missing, say what you would need me to add.",
            priority: 40,
        },
        {
            id: "evergreen_tip",
            title: "Quick insight",
            lines: ["One focused Sarah tip"],
            icon: "insight",
            prompt: "Give me one practical insight to get more from Sarah this week.",
            priority: 39,
        },
        {
            id: "evergreen_week",
            title: "Week ahead",
            lines: ["Map the next few days", "Spot conflicts early"],
            icon: "calendar",
            prompt: "Help me plan the week ahead — priorities, commitments, and buffers.",
            priority: 38,
        },
        {
            id: "evergreen_discover",
            title: "Discover nearby",
            lines: ["Organisations you might like"],
            icon: "insight",
            prompt: "Suggest organisations or services I should explore in Discover.",
            priority: 37,
        },
        {
            id: "evergreen_news",
            title: "Sarah News",
            lines: ["Your personalised briefing"],
            icon: "insight",
            priority: 36,
            action: { type: "route", route: "news" },
            prompt: "What's in my Sarah News briefing today?",
        },
    ];
}

function rankCards(candidates, prefs) {
    const dismissed = new Set((prefs.dismissedCardIds || []).map(String));
    const pinned = new Set((prefs.pinnedCardIds || []).map(String));
    const filtered = candidates.filter((c) => !dismissed.has(c.id));
    const scored = filtered.map((c) => ({
        ...c,
        score: (pinned.has(c.id) ? 1000 : 0) + (Number(c.priority) || 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    const seen = new Set();
    const unique = [];
    for (const c of scored) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        unique.push(c);
        if (unique.length >= MAX_CARDS) break;
    }
    return unique;
}

export async function getSarahHomeCards(uid, options = {}) {
    const mode = options.mode === "work" ? "work" : "chat";
    const ctx = await gatherSarahHomeContext(uid, { mode });
    ctx.staticHome = Boolean(options.staticHome);
    const candidates = [...buildCandidates(ctx), ...buildEvergreenCards(ctx)];
    const dismissed = new Set((options.dismissedCardIds || []).map(String));
    const pinned = new Set((options.pinnedCardIds || []).map(String));
    const scored = candidates
        .filter((c) => !dismissed.has(c.id))
        .map((c) => ({
            ...c,
            score: (pinned.has(c.id) ? 1000 : 0) + (Number(c.priority) || 0),
        }))
        .sort((a, b) => b.score - a.score);
    const seen = new Set();
    const ranked = [];
    for (const c of scored) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        ranked.push(c);
    }
    const cards = ranked.slice(0, MAX_CARDS);
    const moreCards = ranked.slice(MAX_CARDS, MAX_CARDS + 8);
    return {
        greeting: greetingFor(ctx),
        mode,
        cards,
        moreCards,
        refreshedAt: new Date().toISOString(),
        signals: {
            timeOfDay: ctx.timeOfDay,
            isNewUser: ctx.isNewUser,
            workActive: ctx.work.inProgress.length,
            remindersDue: ctx.reminders.dueCount,
            orgUpdates: ctx.organisations.updates.length,
            newsConfigured: Boolean(ctx.news?.configured),
            newsReady: ctx.news?.ready || false,
            newsBreaking: ctx.news?.breaking?.length || 0,
        },
    };
}
