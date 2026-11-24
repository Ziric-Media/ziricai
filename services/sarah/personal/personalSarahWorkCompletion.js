/**
 * SNA-01F — detect work-task completion after Personal Sarah chat and fan out inbox notification.
 */
import { createSarahWorkCompletionNotification } from "../../network/notificationService.js";

const COMPLETE_RE = /\b(submit|run (the )?task|complete|finish|done|go ahead)\b/i;

export function userRequestedWorkCompletion(message) {
    return COMPLETE_RE.test(String(message || ""));
}

export function shouldCompleteWorkAfterTurn(session, userMessage) {
    if (!session || session.mode !== "work" || session.workCompletedAt || session.workCancelledAt || !session.workSubmittedAt) return false;
    const userTurns = (session.messages || []).filter((m) => m.role === "user").length;
    if (userRequestedWorkCompletion(userMessage)) return true;
    return userTurns >= 2;
}

function taskTitleFromSession(session) {
    const t = String(session.title || "").trim();
    if (t && t !== "My Sarah" && t !== "New work item") return t;
    const lastUser = [...(session.messages || [])].reverse().find((m) => m.role === "user");
    const text = String(lastUser?.content || "").trim();
    if (!text) return "Work task";
    return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

/**
 * @param {object} session
 * @param {string} assistantReply
 */
export async function maybeCompleteSarahWorkTask(session, { userMessage = "", assistantReply = "" } = {}) {
    if (!shouldCompleteWorkAfterTurn(session, userMessage)) return { completed: false };
    session.workCompletedAt = new Date().toISOString();
    const taskTitle = taskTitleFromSession(session);
    const summary =
        String(assistantReply || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 400) || `Sarah completed: ${taskTitle}`;
    await createSarahWorkCompletionNotification(session.userId, {
        sessionId: session.id,
        taskTitle,
        summary,
    });
    return { completed: true, taskTitle };
}
