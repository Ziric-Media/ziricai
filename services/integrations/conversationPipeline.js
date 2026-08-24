/**
 * Unified conversation pipeline — normalize inbound → persist → enqueue worker.
 */
import {
    saveInboundMessage,
    upsertCustomerFromWhatsApp,
    isInboundMessageProcessed,
    markInboundMessageProcessed,
} from "../conversationService.js";
import { enqueue, JOB_TYPES } from "../queue/jobQueue.js";
import { isValidUnifiedMessage } from "./types/unifiedMessage.js";
import { logInfo, logError } from "./integrationLogger.js";
import { publish, EventTypes } from "../events/index.js";
import { upsertConversationMeta } from "../tenants/conversationService.js";
import { getOrCreateConversation } from "../storage/tenantStorage.js";

/**
 * Ingest a normalized UnifiedMessage into the existing conversation + queue pipeline.
 * @param {import('./types/unifiedMessage.js').UnifiedMessage} message
 */
export async function ingest(message) {
    if (!isValidUnifiedMessage(message)) {
        throw new Error("Invalid UnifiedMessage — missing channel or from");
    }

    const { companyId, channel, from, text, metadata, externalId } = message;
    const contactName = metadata?.contactName || null;
    const messageType = metadata?.messageType || "text";

    if (externalId && (await isInboundMessageProcessed(externalId))) {
        console.log("[whatsapp] Duplicate inbound skipped", {
            companyId,
            from,
            externalIdPrefix: String(externalId).slice(0, 24),
        });
        logInfo(channel, companyId, "Duplicate inbound skipped (idempotent)", {
            from,
            externalIdPrefix: String(externalId).slice(0, 24),
        });
        return { success: true, duplicate: true, from, channel, companyId };
    }

    logInfo(channel, companyId, "Pipeline ingest", {
        from,
        messageType,
        textLen: text?.length ?? 0,
        externalIdPrefix: externalId ? String(externalId).slice(0, 24) : null,
    });
    console.log("[whatsapp] Pipeline ingest", {
        companyId,
        from,
        messageType,
        textLen: text?.length ?? 0,
    });

    try {
        if (messageType === "text" && String(text || "").trim()) {
            await saveInboundMessage(from, text, {
                channel,
                companyId,
                contactName,
                externalId,
            });
            await upsertCustomerFromWhatsApp(from, {
                contactName,
                companyId,
                messagePreview: text.slice(0, 120),
            });
            if (companyId) {
                await getOrCreateConversation(companyId, from, channel, {
                    lastMessage: text.slice(0, 120),
                    preview: text.slice(0, 120),
                    customerName: contactName || from,
                    status: "in_progress",
                    unread: true,
                    updatedAt: message.timestamp || new Date().toISOString(),
                });
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
            externalId: externalId || null,
        });

        if (externalId) {
            await markInboundMessageProcessed(externalId, { from, companyId, channel });
        }

        if (companyId && messageType === "text" && String(text || "").trim()) {
            await publish(companyId, EventTypes.MESSAGE_RECEIVED, {
                phone: from,
                text,
                channel,
                contactName,
                aiReplyPending: true,
            });
        }

        return { success: true, from, channel, companyId };
    } catch (err) {
        logError(channel, companyId, "Pipeline ingest failed", { error: err.message });
        console.error("[whatsapp] Pipeline ingest failed", { companyId, from, error: err.message });
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
