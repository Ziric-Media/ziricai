/**
 * Unified conversation pipeline — normalize inbound → persist → enqueue worker.
 */
import {
    saveInboundMessage,
    upsertCustomerFromWhatsApp,
} from "../conversationService.js";
import { enqueue, JOB_TYPES } from "../queue/jobQueue.js";
import { isValidUnifiedMessage } from "./types/unifiedMessage.js";
import { logInfo, logError } from "./integrationLogger.js";
import { publish, EventTypes } from "../events/index.js";
import { upsertConversationMeta } from "../tenants/conversationService.js";

/**
 * Ingest a normalized UnifiedMessage into the existing conversation + queue pipeline.
 * @param {import('./types/unifiedMessage.js').UnifiedMessage} message
 */
export async function ingest(message) {
    if (!isValidUnifiedMessage(message)) {
        throw new Error("Invalid UnifiedMessage — missing channel or from");
    }

    const { companyId, channel, from, text, metadata } = message;
    const contactName = metadata?.contactName || null;
    const messageType = metadata?.messageType || "text";

    logInfo(channel, companyId, "Pipeline ingest", {
        from,
        messageType,
        textLen: text?.length ?? 0,
    });

    try {
        if (messageType === "text" && String(text || "").trim()) {
            await saveInboundMessage(from, text, { channel, companyId, contactName });
            await upsertCustomerFromWhatsApp(from, {
                contactName,
                companyId,
                messagePreview: text.slice(0, 120),
            });
            if (companyId) {
                await upsertConversationMeta(companyId, from, {
                    channel,
                    lastMessage: text.slice(0, 120),
                    preview: text.slice(0, 120),
                    customerName: contactName || from,
                    status: "in_progress",
                    unread: true,
                    updatedAt: message.timestamp || new Date().toISOString(),
                });
            }
        } else {
            await upsertCustomerFromWhatsApp(from, { contactName, companyId });
        }

        enqueue({
            type: JOB_TYPES.PROCESS_INBOUND_MESSAGE,
            phone: from,
            from,
            text,
            contactName,
            messageType,
            channel,
            timestamp: message.timestamp || new Date().toISOString(),
            companyId,
        });

        if (companyId && messageType === "text" && String(text || "").trim()) {
            await publish(companyId, EventTypes.MESSAGE_RECEIVED, {
                phone: from,
                text,
                channel,
                contactName,
            });
        }

        return { success: true, from, channel, companyId };
    } catch (err) {
        logError(channel, companyId, "Pipeline ingest failed", { error: err.message });
        throw err;
    }
}

/**
 * Process adapter receiveMessage output (single or array).
 * @param {import('./types/unifiedMessage.js').UnifiedMessage|import('./types/unifiedMessage.js').UnifiedMessage[]|null} messages
 */
export async function ingestBatch(messages) {
    if (!messages) return { processed: 0 };
    const list = Array.isArray(messages) ? messages : [messages];
    const results = [];
    for (const msg of list) {
        results.push(await ingest(msg));
    }
    return { processed: results.length, results };
}
