/**
 * AI task execution safety — v1 blocks consequential side effects until explicit approval gates exist.
 */

/** Tool names that must never run autonomously from the Operations AI task worker (v1). */
export const AI_TASK_BLOCKED_AUTONOMOUS_TOOLS = new Set([
    "bookAppointment",
    "createTask",
    "connectWhatsApp",
    "connectIntegration",
    "inviteUser",
    "manageTeam",
    "generateQuote",
    "sendConversationReply",
]);

/** Categories requiring human approval before an AI employee may act (future gate). */
export const AI_TASK_REQUIRES_APPROVAL_CATEGORIES = [
    "send_external_message",
    "payment_or_billing_change",
    "modify_production_record",
    "assign_or_invite_user",
];

export function assertAutonomousToolAllowed(toolName) {
    if (AI_TASK_BLOCKED_AUTONOMOUS_TOOLS.has(toolName)) {
        throw Object.assign(new Error(`Tool "${toolName}" requires human approval for AI task execution.`), {
            code: "AI_TASK_APPROVAL_REQUIRED",
        });
    }
}
