/**
 * ST-UX-01 — assign task to Sarah, task-scoped conversation, approval + working phases.
 */
import {
    getPersonalSarahTask,
    updatePersonalSarahTask,
} from "./personalSarahTaskStore.js";
import {
    createPersonalSarahSession,
    getPersonalSarahSessionForUser,
    appendPersonalSarahMessage,
} from "./personalSarahSessionStore.js";
import { handlePersonalSarahChat } from "./personalSarahOrchestrator.js";

export const TASK_LIFECYCLE = {
    DRAFT: "draft",
    ASSIGNED: "assigned",
    ACKNOWLEDGING: "acknowledging",
    AWAITING_APPROVAL: "awaiting_approval",
    IN_PROGRESS: "in_progress",
    AWAITING_USER: "awaiting_user",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
    FAILED: "failed",
};

function needsExplicitApproval(task) {
    if (task?.taskKind === "execution" || task?.categoryId === "delegate") return true;
    if (task?.categoryId === "applications" || task?.taskType === "government") return true;
    if (task?.categoryId === "shopping" && ["payment", "compare_products"].includes(task?.taskType)) return true;
    return false;
}

function buildAcknowledgment(task) {
    const title = task.title || "this task";
    if (task.taskKind === "reminder" || task.categoryId === "reminders") {
        return `I've received your reminder: ${title}. I'll alert you at the scheduled times. You can message me here to adjust timing or add what to bring.`;
    }
    if (task.categoryId === "preparation") {
        return `I've received your preparation task: ${title}. I'll help you work through your checklist and get ready step by step.`;
    }
    if (task.taskType === "government" || (task.categoryId === "applications" && task.meta?.govService)) {
        const dept = task.meta?.govDepartmentName || task.meta?.organisation || "government";
        const svc = task.meta?.govService || title;
        return `I've received your government service task: ${svc} (${dept}). I'll explain requirements and check the official route. I won't submit anything until you explicitly approve.`;
    }
    if (task.categoryId === "applications") {
        const org = task.meta?.organisation || task.meta?.organization || task.meta?.company || "the organisation";
        return `I've received your application task for ${title} (${org}). I'll research requirements and prepare a plan. I won't submit or pay anything until you explicitly approve.`;
    }
    if (task.categoryId === "delegate" || task.taskKind === "execution") {
        return `I've received your request: ${title}. I'll propose a plan first, then wait for your go-ahead before doing any external action.`;
    }
    return `I've received your task: ${title}. Tell me what you'd like me to focus on first, or say "go ahead" if you want me to start helping.`;
}

function buildPlanProposal(task) {
    const lines = [
        "Here's what I suggest next:",
        "1. Confirm the details you entered are complete.",
        "2. Gather any missing documents or links.",
        "3. Prepare a short draft or checklist for your review.",
    ];
    if (task.categoryId === "applications") {
        lines.push("4. When you approve, I can help complete the official application route.");
    }
    lines.push('\nReply with "yes, go ahead" when you want me to start working on this.');
    return lines.join("\n");
}

function buildWorkingResult(task) {
    if (task.categoryId === "preparation" && Array.isArray(task.checklist) && task.checklist.length) {
        const next = task.checklist.find((c) => c && !c.done);
        if (next) return `I'm working on your preparation. Next on your checklist: ${next.label}. Tell me when you've done it, or ask for help with any item.`;
    }
    if (task.categoryId === "applications") {
        return "I'm researching eligibility and required documents. I'll post a comparison here shortly — keep this workspace open or I'll notify you when there's an update.";
    }
    return "I'm working on this now. I'll update you here with progress. You can add more details anytime.";
}

function isGoAheadMessage(message) {
    return /\b(yes|go ahead|proceed|approved?|do it|start now|please start)\b/i.test(String(message || ""));
}

/**
 * @param {string} uid
 * @param {string} taskId
 */
export async function assignPersonalSarahTask(uid, taskId) {
    if (!uid || !taskId) throw Object.assign(new Error("uid and taskId required"), { status: 400 });
    const task = await getPersonalSarahTask(uid, taskId);
    if (!task) throw Object.assign(new Error("Task not found"), { status: 404, code: "TASK_NOT_FOUND" });

    let session = task.sessionId ? await getPersonalSarahSessionForUser(uid, task.sessionId) : null;
    if (!session) {
        session = await createPersonalSarahSession(uid, {
            title: task.title,
            mode: "task",
            context: {
                taskId: task.id,
                categoryId: task.categoryId,
                taskType: task.taskType,
                taskKind: task.taskKind,
            },
        });
    }

    await updatePersonalSarahTask(uid, taskId, {
        sessionId: session.id,
        lifecycleState: TASK_LIFECYCLE.ACKNOWLEDGING,
        sarahPhase: "typing",
        assignedAt: Date.now(),
    });

    const ack = buildAcknowledgment(task);
    await appendPersonalSarahMessage(session, "assistant", ack);

    const needsApproval = needsExplicitApproval(task);
    let planSummary = null;
    if (needsApproval) {
        planSummary = buildPlanProposal(task);
        await appendPersonalSarahMessage(session, "assistant", planSummary);
    }

    let lifecycleState = TASK_LIFECYCLE.AWAITING_USER;
    if (needsApproval) lifecycleState = TASK_LIFECYCLE.AWAITING_APPROVAL;
    else if (task.taskKind === "reminder") lifecycleState = TASK_LIFECYCLE.IN_PROGRESS;

    const updated = await updatePersonalSarahTask(uid, taskId, {
        sessionId: session.id,
        lifecycleState,
        sarahPhase: "idle",
        planSummary,
        status: task.status === "draft" ? "open" : task.status,
    });

    return { task: updated, session };
}

/**
 * @param {string} uid
 * @param {string} taskId
 * @param {string} message
 * @param {{ uid: string, consumerProfile?: object }} auth
 */
export async function handlePersonalSarahTaskMessage(uid, taskId, message, auth = {}) {
    const text = String(message || "").trim();
    if (!text) throw Object.assign(new Error("Message required"), { status: 400, code: "MESSAGE_REQUIRED" });

    const task = await getPersonalSarahTask(uid, taskId);
    if (!task) throw Object.assign(new Error("Task not found"), { status: 404, code: "TASK_NOT_FOUND" });
    if (!task.sessionId) {
        const assigned = await assignPersonalSarahTask(uid, taskId);
        task.sessionId = assigned.task.sessionId;
    }

    const session = await getPersonalSarahSessionForUser(uid, task.sessionId);
    if (!session) throw Object.assign(new Error("Task conversation not found"), { status: 404, code: "SESSION_NOT_FOUND" });

    await updatePersonalSarahTask(uid, taskId, { sarahPhase: "typing" });

    if (task.lifecycleState === TASK_LIFECYCLE.AWAITING_APPROVAL && isGoAheadMessage(text)) {
        await appendPersonalSarahMessage(session, "user", text);
        await updatePersonalSarahTask(uid, taskId, { sarahPhase: "working", lifecycleState: TASK_LIFECYCLE.IN_PROGRESS });
        const workMsg = buildWorkingResult(task);
        await appendPersonalSarahMessage(session, "assistant", workMsg);
        const updated = await updatePersonalSarahTask(uid, taskId, {
            sarahPhase: "idle",
            lifecycleState: TASK_LIFECYCLE.AWAITING_USER,
        });
        void notifyTaskUpdate(uid, taskId, workMsg.slice(0, 200));
        return { task: updated, session, reply: workMsg };
    }

    const result = await handlePersonalSarahChat(
        { uid, consumerProfile: auth.consumerProfile || {} },
        { message: text, sessionId: session.id }
    );

    const fresh = await getPersonalSarahSessionForUser(uid, task.sessionId);
    const updated = await updatePersonalSarahTask(uid, taskId, {
        sarahPhase: "idle",
        lifecycleState:
            task.lifecycleState === TASK_LIFECYCLE.AWAITING_APPROVAL
                ? TASK_LIFECYCLE.AWAITING_APPROVAL
                : TASK_LIFECYCLE.AWAITING_USER,
    });

    return { task: updated, session: fresh || session, reply: result.reply };
}

async function notifyTaskUpdate(uid, taskId, body) {
    try {
        const { createSarahTaskUpdateNotification } = await import("../../network/notificationService.js");
        await createSarahTaskUpdateNotification(uid, { taskId, title: "Sarah Tasks update", body });
    } catch (err) {
        console.warn("[personalSarahTaskOrchestrator] notify", err?.message || err);
    }
}

export async function getPersonalSarahTaskWorkspace(uid, taskId) {
    const task = await getPersonalSarahTask(uid, taskId);
    if (!task) return null;
    const session = task.sessionId ? await getPersonalSarahSessionForUser(uid, task.sessionId) : null;
    return { task, session };
}