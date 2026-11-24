/**
 * SW-05 — Assignment workspace model (overview, milestones, deliverables) backed by session JSON.
 */
import { assessWorkBand } from "./personalSarahWorkBudget.js";
import { mergeWorkArtifacts } from "./personalSarahWorkArtifacts.js";
import { mergeWorkAssignmentSettings } from "./personalSarahWorkSettings.js";
import { serializeWorkTrustSummary } from "./personalSarahWorkTrust.js";

/** @typedef {'pending'|'in_progress'|'complete'|'blocked'} MilestoneStatus */
/** @typedef {'pending'|'ready'|'failed'} DeliverableStatus */

export const WORK_EXECUTION_MILESTONES = [
    { id: "m1", title: "Review brief and source material", order: 1, stepKey: "review" },
    { id: "m2", title: "Research relevant information", order: 2, stepKey: "research" },
    { id: "m3", title: "Prepare assignment draft", order: 3, stepKey: "draft" },
    { id: "m4", title: "Final quality review", order: 4, stepKey: "quality" },
];

const DEFAULT_MILESTONES = WORK_EXECUTION_MILESTONES;

const CAPABILITY_BY_BAND = {
    S: "personal_assistance",
    M: "writing",
    L: "research",
};

export const WORK_CAPABILITY_IDS = [
    "research",
    "writing",
    "planning",
    "administration",
    "analysis",
    "monitoring",
    "coordination",
    "personal_assistance",
];

export const CAPABILITY_LABELS = {
    research: "Research",
    writing: "Writing & creation",
    planning: "Planning",
    administration: "Administration",
    analysis: "Analysis",
    monitoring: "Monitoring",
    coordination: "Coordination",
    personal_assistance: "Personal assistance",
};

export const WORK_ACTIVITY_KIND_LABELS = {
    submit: "Submitted",
    cancel: "Cancelled",
    pause: "Paused",
    complete: "Completed",
    run_start: "Execution",
    milestone_start: "Milestone",
    milestone_complete: "Milestone",
    milestone_blocked: "Blocked",
    approval_requested: "Approval",
    approval_resolved: "Approval",
    approval_approved: "Approval",
    approval_rejected: "Approval",
    step_meter: "Credits",
    message: "Update",
};

export function listWorkCapabilityCatalog() {
    return WORK_CAPABILITY_IDS.map((id) => ({ id, label: CAPABILITY_LABELS[id] || id }));
}

function userBrief(session) {
    const msgs = Array.isArray(session?.messages) ? session.messages : [];
    const first = msgs.find((m) => m.role === "user");
    return String(first?.content || session?.title || "").trim();
}

export function inferWorkCapability(session) {
    const text = userBrief(session).toLowerCase();
    if (/\b(research|compare|market|supplier|fact)\b/.test(text)) return "research";
    if (/\b(report|proposal|presentation|document|draft|write)\b/.test(text)) return "writing";
    if (/\b(plan|schedule|travel|event|project)\b/.test(text)) return "planning";
    if (/\b(spreadsheet|financial|analys|analyz|numbers)\b/.test(text)) return "analysis";
    if (/\b(track|monitor|deadline|price|reply|follow up|follow-up|watch)\b/.test(text)) return "monitoring";
    if (/\b(remind|organis|organiz|admin)\b/.test(text)) return "administration";
    const band = assessWorkBand(session);
    return CAPABILITY_BY_BAND[band] || "coordination";
}

export function deriveAssignmentStatus(session) {
    if (session?.workCancelledAt) return "cancelled";
    if (session?.workPausedAt) return "paused";
    if (session?.workCompletedAt) return "completed";
    if (session?.workSubmittedAt) {
        return session.status === "running" || !session.workCompletedAt ? "running" : "submitted";
    }
    const hasUser = (session?.messages || []).some((m) => m.role === "user");
    return hasUser ? "draft" : "draft";
}

function phaseLabelForStatus(status) {
    if (status === "draft") return "Planning";
    if (status === "running") return "Research and writing";
    if (status === "paused") return "Paused";
    if (status === "completed") return "Complete";
    if (status === "cancelled") return "Cancelled";
    return "Planning";
}

function milestoneStatusesForSession(session, milestones) {
    const status = deriveAssignmentStatus(session);
    const base = milestones.map((m) => ({ ...m, status: "pending" }));
    if (status === "draft") {
        if (base[0]) base[0].status = "in_progress";
        return base;
    }
    if (status === "running") {
        base[0].status = "complete";
        base[1].status = "complete";
        base[2].status = "in_progress";
        return base;
    }
    if (status === "paused") {
        base[0].status = "complete";
        base[1].status = "complete";
        const blocked = base.find((m) => m.status === "pending" || m.id === "m3");
        if (blocked) blocked.status = "blocked";
        else if (base[2]) base[2].status = "blocked";
        return base;
    }
    if (status === "completed") {
        return base.map((m) => ({ ...m, status: "complete" }));
    }
    if (status === "cancelled") {
        return base;
    }
    return base;
}

export function computeWorkProgressPercent(milestones = []) {
    const list = Array.isArray(milestones) ? milestones : [];
    if (!list.length) return 0;
    const weights = { complete: 1, in_progress: 0.5, blocked: 0.25, pending: 0 };
    const total = list.reduce((sum, m) => sum + (weights[m.status] ?? 0), 0);
    return Math.round((total / list.length) * 100);
}

function buildObjective(session, existing) {
    const brief = userBrief(session);
    if (existing && !brief) return existing;
    if (!brief) return "Describe what Sarah should complete for this assignment.";
    const cap = brief.length > 320 ? `${brief.slice(0, 317)}…` : brief;
    return `Complete this assignment: ${cap}`;
}

function normalizeMilestoneList(list) {
    const src = Array.isArray(list) && list.length ? list : DEFAULT_MILESTONES;
    return src.map((m, i) => ({
        id: m.id || `m${i + 1}`,
        title: m.title || DEFAULT_MILESTONES[i]?.title || "Step",
        order: Number(m.order) || i + 1,
        stepKey: m.stepKey || DEFAULT_MILESTONES[i]?.stepKey || null,
        status: m.status || "pending",
        startedAt: m.startedAt || null,
        completedAt: m.completedAt || null,
    }));
}

function phaseLabelFromMilestones(milestones) {
    const active = milestones.find((m) => m.status === "in_progress");
    if (active) return active.title;
    const blocked = milestones.find((m) => m.status === "blocked");
    if (blocked) return "Paused";
    const pending = milestones.find((m) => m.status === "pending");
    if (pending) return pending.title;
    if (milestones.length && milestones.every((m) => m.status === "complete")) return "Complete";
    return "Planning";
}

/**
 * @param {object} session
 * @param {{ kind: string, label: string, milestoneId?: string }} entry
 */
export function appendWorkActivity(session, entry) {
    if (!session.workWorkspace || typeof session.workWorkspace !== "object") {
        session.workWorkspace = { activity: [], milestones: [] };
    }
    const ws = session.workWorkspace;
    const kind = String(entry.kind || "message").trim();
    const row = {
        at: entry.at || new Date().toISOString(),
        kind,
        kindLabel: WORK_ACTIVITY_KIND_LABELS[kind] || "Update",
        label: entry.label,
        detail: entry.detail ? String(entry.detail).slice(0, 240) : null,
        milestoneId: entry.milestoneId || null,
        credits: entry.credits != null ? Number(entry.credits) : null,
    };
    ws.activity = [...(Array.isArray(ws.activity) ? ws.activity : []), row].slice(-48);
    ws.executionDriven = true;
}

export function initExecutionMilestones(session) {
    syncWorkWorkspace(session);
    const ws = session.workWorkspace;
    ws.milestones = normalizeMilestoneList(WORK_EXECUTION_MILESTONES).map((m) => ({
        ...m,
        status: "pending",
        startedAt: null,
        completedAt: null,
    }));
    ws.executionDriven = true;
    ws.progressPercent = 0;
    return ws.milestones;
}

export function beginMilestone(session, milestoneId) {
    if (!session.workWorkspace?.milestones) initExecutionMilestones(session);
    const ws = session.workWorkspace;
    ws.executionDriven = true;
    for (const m of ws.milestones) {
        if (m.id === milestoneId) {
            m.status = "in_progress";
            m.startedAt = m.startedAt || new Date().toISOString();
        }
    }
    ws.phaseLabel = phaseLabelFromMilestones(ws.milestones);
    ws.progressPercent = computeWorkProgressPercent(ws.milestones);
    appendWorkActivity(session, {
        kind: "milestone_start",
        label: `Started: ${ws.milestones.find((x) => x.id === milestoneId)?.title || milestoneId}`,
        milestoneId,
    });
}

export function completeMilestone(session, milestoneId) {
    const ws = session.workWorkspace;
    if (!ws?.milestones) return;
    for (const m of ws.milestones) {
        if (m.id === milestoneId) {
            m.status = "complete";
            m.completedAt = new Date().toISOString();
        }
    }
    ws.phaseLabel = phaseLabelFromMilestones(ws.milestones);
    ws.progressPercent = computeWorkProgressPercent(ws.milestones);
    appendWorkActivity(session, {
        kind: "milestone_complete",
        label: `Completed: ${ws.milestones.find((x) => x.id === milestoneId)?.title || milestoneId}`,
        milestoneId,
    });
}

export function blockActiveMilestone(session, reason) {
    const ws = session.workWorkspace;
    if (!ws?.milestones) return null;
    const active = ws.milestones.find((m) => m.status === "in_progress");
    if (active) {
        active.status = "blocked";
        appendWorkActivity(session, {
            kind: "milestone_blocked",
            label: reason || "Step blocked",
            milestoneId: active.id,
        });
    }
    ws.phaseLabel = "Paused";
    ws.progressPercent = computeWorkProgressPercent(ws.milestones);
    return active?.id || null;
}

function withKindMeta(row) {
    const kind = row.kind || "message";
    return {
        ...row,
        kind,
        kindLabel: row.kindLabel || WORK_ACTIVITY_KIND_LABELS[kind] || "Update",
    };
}

function activityTail(session, prevActs = []) {
    const items = [];
    const wsActs = Array.isArray(session?.workWorkspace?.activity) ? session.workWorkspace.activity : [];
    const seed = wsActs.length ? wsActs : prevActs;
    for (const a of seed) items.push(withKindMeta(a));
    const hasKind = (k) => items.some((r) => r.kind === k);
    if (session?.workSubmittedAt && !hasKind("submit")) {
        items.push(
            withKindMeta({
                at: session.workSubmittedAt,
                kind: "submit",
                label: "Assignment submitted to Sarah",
            })
        );
    }
    if (session?.workPausedAt && !hasKind("pause")) {
        items.push(
            withKindMeta({
                at: session.workPausedAt,
                kind: "pause",
                label: session.workPauseReason || "Assignment paused",
            })
        );
    }
    if (session?.workCompletedAt && !hasKind("complete")) {
        items.push(
            withKindMeta({
                at: session.workCompletedAt,
                kind: "complete",
                label: "Assignment completed",
            })
        );
    }
    if (session?.workCancelledAt && !hasKind("cancel")) {
        items.push(
            withKindMeta({
                at: session.workCancelledAt,
                kind: "cancel",
                label: "Assignment cancelled",
            })
        );
    }
    const seen = new Set();
    const merged = [];
    for (const row of items) {
        const key = `${row.at}|${row.kind}|${row.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(row);
    }
    merged.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return merged.slice(-48);
}

/**
 * Synchronise `session.workWorkspace` from session lifecycle (idempotent).
 * @param {object} session
 */
export function syncWorkWorkspace(session) {
    if (!session || session.mode !== "work") return null;

    const prev = session.workWorkspace && typeof session.workWorkspace === "object" ? session.workWorkspace : {};
    const assignmentStatus = deriveAssignmentStatus(session);
    const capability = prev.capability || inferWorkCapability(session);
    const baseList = normalizeMilestoneList(prev.milestones);
    const executionDriven = Boolean(prev.executionDriven || baseList.some((m) => m.startedAt || m.completedAt));
    let milestones;
    if (executionDriven) {
        milestones = baseList;
    } else if (assignmentStatus === "draft" && !session.workSubmittedAt) {
        milestones = milestoneStatusesForSession(session, baseList);
    } else if (assignmentStatus !== "draft") {
        milestones = milestoneStatusesForSession(session, baseList);
    } else {
        milestones = baseList;
    }

    const workspace = {
        version: 2,
        executionDriven,
        assignmentStatus,
        phaseLabel: executionDriven ? phaseLabelFromMilestones(milestones) : phaseLabelForStatus(assignmentStatus),
        capability,
        capabilityLabel: CAPABILITY_LABELS[capability] || "Coordination",
        objective: buildObjective(session, prev.objective),
        milestones,
        deliverables: [],
        approvals: Array.isArray(prev.approvals) ? prev.approvals : [],
        files: [],
        activity: activityTail(session, Array.isArray(prev.activity) ? prev.activity : []),
        settings: mergeWorkAssignmentSettings(session, prev.settings),
        trust: serializeWorkTrustSummary(session),
        progressPercent: computeWorkProgressPercent(milestones),
        budget: session.workBudgetCapCredits
            ? {
                  band: session.workBudgetBand,
                  capCredits: session.workBudgetCapCredits,
                  estimateMin: session.workBudgetEstimateMin,
                  estimateMax: session.workBudgetEstimateMax,
                  usedCredits: session.workCreditsUsedCredits,
              }
            : prev.budget || null,
    };

    mergeWorkArtifacts(workspace, session);
    session.workWorkspace = workspace;
    return workspace;
}

export function serializeWorkWorkspace(session) {
    if (!session?.workWorkspace) syncWorkWorkspace(session);
    return session?.workWorkspace || null;
}