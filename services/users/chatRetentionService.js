/**
 * CH9 — Chat retention + audit policy (MVP in-memory).
 */
import { auditLog } from "../audit/auditLog.js";

export const CHAT_RETENTION_DAYS = Number(process.env.CHAT_RETENTION_DAYS || 365);

/**
 * @param {object} conversation
 */
export function applyRetentionPolicy(conversation) {
    const created = conversation?.createdAt ? new Date(conversation.createdAt).getTime() : Date.now();
    const ageDays = (Date.now() - created) / (86400 * 1000);
    const eligible = ageDays >= CHAT_RETENTION_DAYS;
    if (eligible && conversation.ownershipState !== "closed") {
        auditLog("chat_retention_eligible", {
            conversationId: conversation.id,
            ageDays: Math.floor(ageDays),
            policyDays: CHAT_RETENTION_DAYS,
        });
    }
    return {
        conversationId: conversation?.id || null,
        retentionDays: CHAT_RETENTION_DAYS,
        eligibleForArchive: eligible,
        policy: "messages_retained_until_resolved_then_ttl",
    };
}

export function recordChatSecurityAudit(event, payload = {}) {
    return auditLog(`chat_security_${event}`, payload);
}
