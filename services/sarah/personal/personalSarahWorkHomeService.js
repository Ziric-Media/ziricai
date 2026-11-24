/**
 * SW-08 — Sarah Work home dashboard aggregates.
 */
import {
    listPersonalSarahSessions,
    getPersonalSarahSessionForUser,
} from "./personalSarahSessionStore.js";
import { syncWorkWorkspace, CAPABILITY_LABELS, listWorkCapabilityCatalog } from "./personalSarahWorkWorkspace.js";
import { listWorkApprovals } from "./personalSarahWorkApprovals.js";

function priorityForSession(session, ws) {
    const pendingApprovals = listWorkApprovals(session, { status: "pending" }).length;
    if (session.workPausedAt) return { band: "urgent", score: 100, label: "Paused" };
    if (pendingApprovals > 0) return { band: "urgent", score: 90, label: "Needs approval" };
    if (session.workSubmittedAt && !session.workCompletedAt && !session.workCancelledAt) {
        return { band: "active", score: 70, label: "In progress" };
    }
    if (!session.workSubmittedAt && ws?.assignmentStatus === "draft") {
        return { band: "planned", score: 40, label: "Draft" };
    }
    if (session.workCompletedAt) return { band: "done", score: 10, label: "Complete" };
    return { band: "planned", score: 30, label: "Open" };
}

function serializeWorkHomeAssignment(session) {
    const ws = session.workWorkspace || {};
    const priority = priorityForSession(session, ws);
    const pendingApprovals = listWorkApprovals(session, { status: "pending" });
    return {
        id: session.id,
        title: session.title || "Work assignment",
        assignmentStatus: ws.assignmentStatus || "draft",
        progressPercent: Number(ws.progressPercent) || 0,
        phaseLabel: ws.phaseLabel || "",
        capability: ws.capability || null,
        capabilityLabel: ws.capabilityLabel || (ws.capability && CAPABILITY_LABELS[ws.capability]) || null,
        updatedAt: session.updatedAt,
        lastMessageAt: session.lastMessageAt,
        lastMessagePreview: session.lastMessagePreview || null,
        workSubmitted: Boolean(session.workSubmittedAt),
        workCompleted: Boolean(session.workCompletedAt),
        workPaused: Boolean(session.workPausedAt),
        pendingApprovals: pendingApprovals.length,
        priorityBand: priority.band,
        priorityLabel: priority.label,
        priorityScore: priority.score,
    };
}

function buildDaySummary(stats, urgent) {
    const parts = [];
    if (urgent.length) {
        parts.push(
            `${urgent.length} assignment${urgent.length === 1 ? "" : "s"} need${urgent.length === 1 ? "s" : ""} your attention today`
        );
    }
    if (stats.inProgress > 0) {
        parts.push(`${stats.inProgress} in progress`);
    }
    if (stats.draft > 0) {
        parts.push(`${stats.draft} draft${stats.draft === 1 ? "" : "s"} waiting to submit`);
    }
    if (stats.completed > 0 && !parts.length) {
        parts.push(`You've completed ${stats.completed} assignment${stats.completed === 1 ? "" : "s"} recently`);
    }
    if (!parts.length) return "Start a work item — Sarah will track milestones and deliverables for you.";
    return `Today's Work: ${parts.join(" · ")}.`;
}

/**
 * @param {string} uid
 */
export async function buildPersonalSarahWorkHome(uid) {
    if (!uid) {
        return {
            dayKey: new Date().toISOString().slice(0, 10),
            summary: "Sign in to see your Sarah Work dashboard.",
            stats: { total: 0, inProgress: 0, completed: 0, draft: 0, urgent: 0, avgProgress: 0 },
            priority: [],
            assignments: [],
        };
    }

    const summaries = await listPersonalSarahSessions(uid, { limit: 60 });
    const workSummaries = summaries.filter((s) => s.mode === "work");
    const assignments = [];
    for (const row of workSummaries) {
        const session = await getPersonalSarahSessionForUser(uid, row.id);
        if (!session || session.mode !== "work") continue;
        syncWorkWorkspace(session);
        assignments.push(serializeWorkHomeAssignment(session));
    }

    const byCapability = {};
    for (const a of assignments) {
        const cap = a.capability || "coordination";
        byCapability[cap] = (byCapability[cap] || 0) + 1;
    }

    const stats = {
        total: assignments.length,
        inProgress: assignments.filter((a) => a.priorityBand === "active").length,
        completed: assignments.filter((a) => a.assignmentStatus === "completed").length,
        draft: assignments.filter((a) => a.assignmentStatus === "draft").length,
        urgent: assignments.filter((a) => a.priorityBand === "urgent").length,
        avgProgress: assignments.length
            ? Math.round(assignments.reduce((s, a) => s + (a.progressPercent || 0), 0) / assignments.length)
            : 0,
        byCapability,
    };

    const priority = [...assignments]
        .sort((a, b) => b.priorityScore - a.priorityScore || (b.lastMessageAt || 0) - (a.lastMessageAt || 0))
        .slice(0, 8);
    const urgent = priority.filter((a) => a.priorityBand === "urgent");

    return {
        dayKey: new Date().toISOString().slice(0, 10),
        generatedAt: new Date().toISOString(),
        summary: buildDaySummary(stats, urgent),
        stats,
        priority,
        assignments: assignments
            .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))
            .slice(0, 20),
        capabilities: listWorkCapabilityCatalog(),
    };
}