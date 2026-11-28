/**
 * ST-05 v1 — task execution artifacts (research, drafts, booking proposals) with review gate.
 * No external submit/payment without explicit user "approve submit" message.
 */
import { organisationQueryFromTask } from "./personalSarahTaskNetworkMatch.js";

export const EXECUTION_REVIEW = "awaiting_review";
export const EXECUTION_SUBMITTED = "submitted_pending_external";

/**
 * @param {object} task
 */
export function executionModeForTask(task) {
    const type = String(task.taskType || "").toLowerCase();
    if (["research", "compare", "compare_products"].includes(type)) return "research";
    if (["draft_application", "prepare_doc", "online_process"].includes(type)) return "draft";
    if (["find_booking", "find_provider"].includes(type)) return "booking";
    if (type === "payment") return "payment";
    if (task.categoryId === "applications" || type === "government") return "application";
    if (task.categoryId === "delegate" || task.taskKind === "execution") return "delegate";
    return "assist";
}

function linesFromMeta(task) {
    const meta = task.meta || {};
    const bits = [];
    for (const [k, v] of Object.entries(meta)) {
        if (v == null || v === "") continue;
        if (typeof v === "object") continue;
        bits.push(`- **${k}:** ${String(v).slice(0, 240)}`);
    }
    return bits.length ? bits.join("\n") : "- (No extra fields — add detail in chat if needed.)";
}

/**
 * @param {object} task
 */
export function buildExecutionArtifact(task) {
    const mode = executionModeForTask(task);
    const org = organisationQueryFromTask(task);
    const createdAt = new Date().toISOString();
    const base = { status: "draft", createdAt, version: 1 };

    if (mode === "research") {
        const subject = task.meta?.item || task.meta?.criteria || task.title;
        return {
            ...base,
            type: "research",
            title: `Research: ${task.title}`,
            body: [
                `## ${task.title}`,
                "",
                "### Scope",
                `- Focus: ${subject}`,
                org ? `- Organisation: ${org}` : "",
                "",
                "### What I prepared (v1)",
                linesFromMeta(task),
                "",
                "### Recommendation",
                "I have not contacted anyone or spent money. Reply in chat with links or must-haves and I will refine this summary.",
                "",
                '_When you are satisfied, say **"approve submit"** only if you want me to treat this as final for external action (still no auto-payment in v1)._',
            ]
                .filter(Boolean)
                .join("\n"),
        };
    }
    if (mode === "draft") {
        return {
            ...base,
            type: "draft",
            title: `Draft for review: ${task.title}`,
            body: [
                `## Draft — ${task.title}`,
                "",
                "### Details captured",
                linesFromMeta(task),
                "",
                "### Proposed draft (edit in chat)",
                `Dear Sir/Madam,\n\nI am writing regarding ${task.title}.${task.notes ? ` ${task.notes}` : ""}\n\n[Sarah will expand this when you add facts in the workspace.]\n\nKind regards`,
                "",
                'Say **"approve submit"** when this draft is ready to copy to the official channel (I will not submit without that).',
            ].join("\n"),
        };
    }
    if (mode === "booking") {
        const when = task.dueAt ? new Date(task.dueAt).toLocaleString() : "your preferred window";
        return {
            ...base,
            type: "booking",
            title: `Booking options: ${task.title}`,
            body: [
                `## Booking research — ${task.title}`,
                "",
                "### Target window",
                `- Around: ${when}`,
                "",
                "### Proposal (v1)",
                "- I will shortlist providers that match your notes.",
                "- You choose a slot; I do not confirm bookings until you say **approve submit**.",
                "",
                linesFromMeta(task),
            ].join("\n"),
        };
    }
    if (mode === "payment") {
        return {
            ...base,
            type: "payment",
            title: `Payment plan: ${task.title}`,
            body: [
                `## Payment task — ${task.title}`,
                "",
                "### Amount / payee (from your form)",
                linesFromMeta(task),
                "",
                "**Safety:** I cannot move money in v1. **Approve submit** means you confirm you will pay manually using this plan.",
            ].join("\n"),
        };
    }
    if (mode === "application") {
        const svc = task.meta?.govService || task.title;
        return {
            ...base,
            type: "application",
            title: `Application pack: ${svc}`,
            body: [
                `## Application research — ${svc}`,
                org ? `**Organisation:** ${org}` : "",
                "",
                "### Checklist status",
                ...(Array.isArray(task.checklist) ? task.checklist.map((c) => `- [${c.done ? "x" : " "}] ${c.label}`) : []),
                "",
                "### Official route (v1)",
                "Confirm portal, fees, and ID requirements before you submit in person or online.",
                "",
                'Say **"approve submit"** when you want me to lock this pack as ready — I still will not file on government portals without a later ST-05+ gate.',
            ]
                .filter(Boolean)
                .join("\n"),
        };
    }
    return {
        ...base,
        type: "assist",
        title: `Work summary: ${task.title}`,
        body: [`## ${task.title}`, "", linesFromMeta(task), "", "Tell me what to do next in this workspace."].join("\n"),
    };
}

export function isSubmitApprovalMessage(message) {
    return /\b(approve submit|approved submit|send it|submit now|confirm submit|go ahead and submit)\b/i.test(String(message || ""));
}

/**
 * @param {string} uid
 * @param {object} task
 */
export async function runPersonalSarahTaskExecution(uid, task) {
    const { updatePersonalSarahTask, getPersonalSarahTask } = await import("./personalSarahTaskStore.js");
    const artifact = buildExecutionArtifact(task);
    const artifacts = [...(Array.isArray(task.artifacts) ? task.artifacts : []), artifact].slice(-8);
    const chatIntro =
        executionModeForTask(task) === "application"
            ? "I've prepared an application pack for your review (below). I have not submitted anything."
            : "I've completed the first execution pass for this task. Review the artifact below.";

    const updated = await updatePersonalSarahTask(uid, task.id, {
        artifacts,
        lifecycleState: EXECUTION_REVIEW,
        executionState: { mode: executionModeForTask(task), lastRunAt: new Date().toISOString() },
        meta: {
            ...(task.meta || {}),
            lastArtifactId: artifacts.length - 1,
        },
    });

    return {
        task: updated || (await getPersonalSarahTask(uid, task.id)),
        artifact,
        reply: `${chatIntro}\n\n---\n\n${artifact.body}`,
    };
}

/**
 * @param {string} uid
 * @param {object} task
 * @param {number} artifactIndex
 */
export async function approveTaskArtifactForSubmit(uid, task, artifactIndex = -1) {
    const { updatePersonalSarahTask } = await import("./personalSarahTaskStore.js");
    const idx =
        artifactIndex >= 0
            ? artifactIndex
            : Number.isFinite(Number(task.meta?.lastArtifactId))
              ? Number(task.meta.lastArtifactId)
              : (task.artifacts?.length || 1) - 1;
    const artifacts = (task.artifacts || []).map((a, i) =>
        i === idx ? { ...a, status: "approved", approvedAt: new Date().toISOString() } : a
    );
    return updatePersonalSarahTask(uid, task.id, {
        artifacts,
        lifecycleState: EXECUTION_SUBMITTED,
        status: "waiting",
        meta: {
            ...(task.meta || {}),
            executionApprovedAt: new Date().toISOString(),
        },
    });
}