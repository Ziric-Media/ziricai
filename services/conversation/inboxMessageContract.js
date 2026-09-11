/**
 * Portal inbox message API contract — authoritative source/role mapping.
 */
import { toIsoTimestamp } from "../core/timestampUtils.js";

/**
 * @param {object} m — raw tenant message record
 * @returns {object}
 */
export function mapMessageForInboxApi(m) {
    const rawRole = m.role;
    const source =
        m.source ||
        (rawRole === "user" ? "customer" : rawRole === "assistant" ? "ai" : rawRole || "customer");

    let role = "customer";
    if (source === "human") role = "human";
    else if (source === "ai" || rawRole === "assistant") role = "ai";
    else if (source === "customer" || rawRole === "user") role = "customer";

    const content = m.content || m.message || "";

    return {
        id: m.id || m.messageId || null,
        role,
        source,
        content,
        message: content,
        createdAt: toIsoTimestamp(m.createdAt),
        channel: m.channel || "whatsapp",
        externalId: m.externalId || null,
        senderName: m.senderName || null,
        mediaUrl: m.mediaUrl || null,
    };
}
