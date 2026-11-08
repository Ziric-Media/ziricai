/**
 * U5 — User ↔ Company Sarah chat (Company Reception persona).
 */
import { assertCompanyDiscoverable } from "../../users/businessDirectoryService.js";
import {
    openUserConversation,
    getUserConversationByCompany,
    getUserConversationMessages,
    appendUserConversationMessage,
    syncMessagesFromTenant,
    buildCompanySarahGreeting,
} from "../../users/userConversationService.js";
import { buildCompanyReceptionContext } from "../network/companyReceptionContext.js";
import { handleSarahChat } from "../sarahOrchestrator.js";
import { auditLog } from "../../audit/auditLog.js";
import { getConversationTakeoverState } from "../../conversation/takeoverSafety.js";
import {
    detectHumanHandoverIntent,
    isHumanControlledOwnership,
    transitionOwnershipState,
    syncOwnershipFromTenant,
} from "../../users/handoverStateService.js";
import { HANDOVER_STATES } from "../../users/messagingContracts.js";

/**
 * Ensure thread exists and greeting is present for new chats.
 */
export async function ensureCompanyChatThread(uid, companyId, consumerProfile = {}) {
    assertCompanyDiscoverable(companyId);
    const preferredName =
        consumerProfile.preferredName || consumerProfile.firstName || consumerProfile.displayName || null;
    const conv = await openUserConversation(uid, companyId, {
        consumerDisplayName: preferredName || "Guest",
    });
    await syncMessagesFromTenant(conv);
    let messages = getUserConversationMessages(conv.id);
    if (!messages.length) {
        const greeting = buildCompanySarahGreeting(preferredName, conv.companyName);
        await appendUserConversationMessage(conv, { role: "assistant", content: greeting, source: "greeting" });
        messages = getUserConversationMessages(conv.id);
    }
    return { conversation: conv, messages };
}

/**
 * @param {string} uid
 * @param {string} companyId
 * @param {string} message
 * @param {object} consumerProfile
 */
export async function sendCompanySarahMessage(uid, companyId, message, consumerProfile = {}) {
    const text = String(message || "").trim();
    if (!text) {
        throw Object.assign(new Error("message is required"), { status: 400, code: "MESSAGE_REQUIRED" });
    }

    const { conversation: conv } = await ensureCompanyChatThread(uid, companyId, consumerProfile);
    await appendUserConversationMessage(conv, { role: "user", content: text });

    if (detectHumanHandoverIntent(text)) {
        await transitionOwnershipState(conv, HANDOVER_STATES.HUMAN_REQUESTED);
    }
    await syncOwnershipFromTenant(uid, companyId);

    const takeover = await getConversationTakeoverState(companyId, uid, "sarah_app");
    if (Boolean(takeover?.humanTakeover) || isHumanControlledOwnership(conv.ownershipState)) {
        auditLog("company_sarah_chat_paused_human", { uid, companyId, conversationId: conv.id });
        return {
            conversationId: conv.id,
            companyId,
            companyName: conv.companyName,
            reply: null,
            humanActive: true,
            ownershipState: conv.ownershipState,
            messages: getUserConversationMessages(conv.id),
        };
    }

    const history = getUserConversationMessages(conv.id)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

    const ctx = await buildCompanyReceptionContext(companyId, uid, {
        consumerDisplayName: conv.consumerDisplayName,
    });

    const historyBlock = history
        .map((h) => `${h.role === "user" ? "Customer" : "Sarah"}: ${h.content}`)
        .join("\n");
    const prompt =
        `Continue this Sarah App chat as the company's reception Sarah.\n\n` +
        `Conversation so far:\n${historyBlock}\n\n` +
        `Reply to the customer's latest message helpfully and concisely.`;

    let reply;
    try {
        const result = await handleSarahChat(ctx, { message: prompt, sessionId: null });
        reply = result.reply || "Thanks for your message. We'll get back to you shortly.";
    } catch (err) {
        console.warn("[companyReceptionChat] orchestrator fallback:", err.message);
        const digest = ctx.kbSummary?.digest || "";
        reply = digest.length > 40
            ? `Thanks for reaching out to ${ctx.companyName}. ${digest.slice(0, 500)}`
            : `Thanks for your message. ${ctx.companyName} has received it and will follow up soon.`;
    }

    await appendUserConversationMessage(conv, { role: "assistant", content: reply });
    auditLog("company_sarah_chat", { uid, companyId, conversationId: conv.id });

    return {
        conversationId: conv.id,
        companyId,
        companyName: conv.companyName,
        reply,
        messages: getUserConversationMessages(conv.id),
    };
}

export function getCompanyConversationForUser(uid, companyId, consumerProfile = {}) {
    return ensureCompanyChatThread(uid, companyId, consumerProfile);
}
