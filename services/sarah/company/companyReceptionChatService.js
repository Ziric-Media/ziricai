/**
 * U5 — User ↔ Company Sarah chat (Company Reception persona).
 */
import { assertCompanyDiscoverableAsync } from "../../users/businessDirectoryService.js";
import {
    openUserConversation,
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
import { enrichMessageWithAttachments } from "../../users/chatAttachmentUnderstanding.js";
import {
    enrichCompanySarahReplyWithVehicleMedia,
    wantsSarahAppVehicleGallery,
    automotiveReplyNeedsMedia,
    customerWantsVehicleMedia,
    customerAsksVehiclePhoto,
    replyDefersDelivery,
    stripDeferredDeliveryPhrases,
    scrubInvalidMarkdownImages,
    detectInventoryBodyTypeFilter,
    resolveMediaSearchContext,
    buildDirectShowroomMediaReply,
    planVehicleMediaSelection,
} from "./sarahAppVehicleMediaReply.js";
import { getRecommendedVehicles } from "../../conversation/recommendedVehicles.js";
import { extractSearchInventoryVehicles } from "../../conversation/vehicleOutboundPlan.js";
import { resolveSarahAppInventoryCompanyId } from "../../storage/centralMotorsPilot.js";
import { searchInventory } from "../../inventory/inventoryService.js";
import {
    runCompanySarahAutomotiveTurn,
    shouldRunAutomotiveSalesChat,
} from "./companyReceptionAutomotiveChat.js";
import {
    runCompanySarahDentalTurn,
    shouldRunDentalReceptionChat,
} from "./companyReceptionDentalChat.js";
import {
    runCompanySarahEducareTurn,
    shouldRunEducareReceptionChat,
} from "./companyReceptionEducareChat.js";
import {
    runCompanySarahSachAccountingTurn,
    shouldRunSachAccountingReceptionChat,
    buildSachCompanySarahGreeting,
    extractSachUiHints,
} from "./companyReceptionSachAccountingChat.js";
import { shouldRunSachAccountingChat } from "../../consulting/sachAccountingIndustryPreset.js";
import {
    buildEducareCompanySarahGreeting,
    extractEducareUiHints,
} from "../../education/educareSchoolChatTools.js";
import { shouldRunEducareSchoolChat } from "../../education/educareIndustryPreset.js";
import { retrieveAgentKnowledgeContext } from "../../ai-core/aiCoreBridge.js";

/**
 * Ensure thread exists and greeting is present for new chats.
 */
export async function ensureCompanyChatThread(uid, companyId, consumerProfile = {}) {
    await assertCompanyDiscoverableAsync(companyId);
    const preferredName =
        consumerProfile.preferredName || consumerProfile.firstName || consumerProfile.displayName || null;
    const conv = await openUserConversation(uid, companyId, {
        consumerDisplayName: preferredName || "Guest",
    });
    await syncMessagesFromTenant(conv);
    let messages = getUserConversationMessages(conv.id);
    if (!messages.length) {
        let greeting = buildCompanySarahGreeting(preferredName, conv.companyName);
        if (await shouldRunEducareSchoolChat(companyId)) {
            greeting = buildEducareCompanySarahGreeting(preferredName, conv.companyName);
        } else if (await shouldRunSachAccountingChat(companyId)) {
            greeting = buildSachCompanySarahGreeting(preferredName, conv.companyName);
        }
        await appendUserConversationMessage(conv, { role: "assistant", content: greeting, source: "greeting" });
        messages = getUserConversationMessages(conv.id);
    }
    return { conversation: conv, messages };
}

const SARAH_APP_CHANNEL = "sarah_app";

async function prefetchShowroomVehicles(inventoryCompanyId, searchContext, limit = 4) {
    const bodyType = detectInventoryBodyTypeFilter(searchContext);
    const cap = Math.min(12, limit || 4);
    try {
        const rows = await searchInventory(inventoryCompanyId, searchContext || "vehicle", {
            bodyType,
            limit: cap,
            availabilityOnly: true,
        });
        if (rows.length) return rows;
    } catch (err) {
        console.warn("[companyReceptionChat] inventory prefetch:", err.message);
    }
    if (bodyType || /\beverest|ford|ranger|changan|bmw\b/i.test(String(searchContext || ""))) {
        return [];
    }
    try {
        return await searchInventory(inventoryCompanyId, "", { limit: cap, availabilityOnly: true });
    } catch {
        return [];
    }
}

function directReplyHasMedia(direct) {
    if (!direct) return false;
    if (Array.isArray(direct.attachments) && direct.attachments.length) return true;
    return /!\[[^\]]+\]\([^)]+\)/.test(String(direct.content || ""));
}

/**
 * @param {string} uid
 * @param {string} companyId
 * @param {string} message
 * @param {object} consumerProfile
 */
export async function sendCompanySarahMessage(uid, companyId, message, consumerProfile = {}, options = {}) {
    const enriched = await enrichMessageWithAttachments(message, options.attachments);
    const text = enriched.modelContext;
    if (!text) {
        throw Object.assign(new Error("message or attachment is required"), { status: 400, code: "MESSAGE_REQUIRED" });
    }

    try {
        const { evaluateAndRecordConsumerSafety } = await import("../../platformGovernance/consumerSafetyDetectionService.js");
        const safety = await evaluateAndRecordConsumerSafety({
            uid,
            companyId,
            channel: "company_sarah",
            message: enriched.text || text,
        });
        if (safety.blockReply) {
            const { conversation: conv } = await ensureCompanyChatThread(uid, companyId, consumerProfile);
            await appendUserConversationMessage(conv, {
                role: "user",
                content: enriched.text || text,
                attachments: enriched.attachments,
            });
            await appendUserConversationMessage(conv, {
                role: "assistant",
                content: safety.blockReply,
                source: "safety",
            });
            return {
                conversationId: conv.id,
                companyId,
                companyName: conv.companyName,
                reply: safety.blockReply,
                messages: getUserConversationMessages(conv.id),
                safety: { severity: safety.severity, category: safety.category },
            };
        }
    } catch (err) {
        console.warn("[companyReceptionChat] safety evaluation:", err?.message || err);
    }

    const { conversation: conv } = await ensureCompanyChatThread(uid, companyId, consumerProfile);
    await appendUserConversationMessage(conv, {
        role: "user",
        content: enriched.text || text,
        attachments: enriched.attachments,
    });

    if (detectHumanHandoverIntent(enriched.text || text)) {
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
        .slice(-6)
        .map((m) => ({
            role: m.role,
            content: m.role === "assistant" ? scrubInvalidMarkdownImages(m.content || "").text : m.content,
        }));
    if (history.length && history[history.length - 1].role === "user") {
        history[history.length - 1].content = text;
    }

    const customerText = enriched.text || text;
    const wantsMedia =
        customerWantsVehicleMedia(customerText, "", history) || wantsSarahAppVehicleGallery(customerText, history);
    const searchContext = resolveMediaSearchContext(customerText, history);
    const inventoryCompanyId = resolveSarahAppInventoryCompanyId(companyId);
    const recommendedVehicles = await getRecommendedVehicles(companyId, uid, SARAH_APP_CHANNEL).catch(() => []);
    const mediaPlan = planVehicleMediaSelection(searchContext, history, recommendedVehicles, []);

    let prefetchedVehicles = [];
    if (wantsMedia) {
        const prefetchQuery = mediaPlan.searchQuery || searchContext;
        prefetchedVehicles = await prefetchShowroomVehicles(
            inventoryCompanyId,
            prefetchQuery,
            mediaPlan.limit
        );
        const direct = await buildDirectShowroomMediaReply(companyId, searchContext, [
            ...(mediaPlan.vehicles || []),
            ...prefetchedVehicles,
        ], {
            recommendedVehicles,
            history,
            mediaPlan,
            toolVehicles: [...(mediaPlan.vehicles || []), ...prefetchedVehicles],
        });
        if (directReplyHasMedia(direct)) {
            await appendUserConversationMessage(conv, {
                role: "assistant",
                content: direct.content,
                source: "ai",
                ...(direct.attachments?.length ? { attachments: direct.attachments } : {}),
            });
            auditLog("company_sarah_chat", { uid, companyId, conversationId: conv.id, mode: "showroom_direct" });
            return {
                conversationId: conv.id,
                companyId,
                companyName: conv.companyName,
                reply: direct.content,
                messages: getUserConversationMessages(conv.id),
            };
        }
    }

    let reply;
    let mediaAttachments = [];
    let toolVehicles = [...prefetchedVehicles];
    let automotiveTurn = null;
    let dentalTurn = null;
    let educareTurn = null;
    let sachTurn = null;
    let uiHints = [];

    try {
        const useAutomotive = await shouldRunAutomotiveSalesChat(companyId);
        const useDental = !useAutomotive && (await shouldRunDentalReceptionChat(companyId));
        const useEducare = !useAutomotive && !useDental && (await shouldRunEducareReceptionChat(companyId));
        const useSachAccounting =
            !useAutomotive && !useDental && !useEducare && (await shouldRunSachAccountingReceptionChat(companyId));
        if (useAutomotive) {
            automotiveTurn = await runCompanySarahAutomotiveTurn({
                uid,
                companyId,
                companyName: conv.companyName,
                consumerDisplayName: conv.consumerDisplayName,
                text: customerText,
                history,
            });
            reply = stripDeferredDeliveryPhrases(automotiveTurn.reply || "");
            if (
                customerAsksVehiclePhoto(customerText, history) &&
                replyDefersDelivery(automotiveTurn.reply || "")
            ) {
                reply = "";
            }
            toolVehicles = [...extractSearchInventoryVehicles(automotiveTurn.toolResults || []), ...prefetchedVehicles];
        } else if (useDental) {
            const liveName =
                consumerProfile.preferredName ||
                consumerProfile.firstName ||
                consumerProfile.displayName ||
                conv.consumerDisplayName;
            dentalTurn = await runCompanySarahDentalTurn({
                uid,
                companyId,
                companyName: conv.companyName,
                consumerDisplayName: liveName,
                consumerProfile,
                text: customerText,
                history,
                attachments: enriched.attachments,
                conversationId: conv.id,
            });
            reply = dentalTurn.reply || "Thanks for your message.";
        } else if (useEducare) {
            const liveName =
                consumerProfile.preferredName ||
                consumerProfile.firstName ||
                consumerProfile.displayName ||
                conv.consumerDisplayName;
            educareTurn = await runCompanySarahEducareTurn({
                uid,
                companyId,
                companyName: conv.companyName,
                consumerDisplayName: liveName,
                consumerProfile,
                conversationId: conv.id,
                text: customerText,
                history,
                attachments: enriched.attachments,
            });
            reply = educareTurn.reply || "Thanks for your message.";
            uiHints = extractEducareUiHints(educareTurn.toolResults || []);
        } else if (useSachAccounting) {
            const liveName =
                consumerProfile.preferredName ||
                consumerProfile.firstName ||
                consumerProfile.displayName ||
                conv.consumerDisplayName;
            sachTurn = await runCompanySarahSachAccountingTurn({
                uid,
                companyId,
                companyName: conv.companyName,
                consumerDisplayName: liveName,
                consumerProfile,
                conversationId: conv.id,
                text: customerText,
                history,
                attachments: enriched.attachments,
            });
            reply = sachTurn.reply || "Thanks for your message.";
            uiHints = extractSachUiHints(sachTurn.toolResults || sachTurn.uiHints || []);
        } else {
            const liveName =
                consumerProfile.preferredName ||
                consumerProfile.firstName ||
                consumerProfile.displayName ||
                conv.consumerDisplayName;

            const [ctx, knowledgeBundle] = await Promise.all([
                buildCompanyReceptionContext(companyId, uid, {
                    consumerDisplayName: liveName || "Guest",
                }),
                retrieveAgentKnowledgeContext(companyId, customerText, null, { limit: 3 }).catch(() => ({
                    context: "",
                    sources: [],
                })),
            ]);

            const historyBlock = history
                .map((h) => `${h.role === "user" ? "Customer" : "Sarah"}: ${h.content}`)
                .join("\n");
            ctx.conversationHistoryBlock = historyBlock;
            ctx.companyChatHistory = history;
            ctx.companyChatFastMode = true;

            ctx.verifiedKnowledgeSnippet = knowledgeBundle.context || "";
            if (knowledgeBundle.knowledgeBaseId) {
                ctx.kbSummary = {
                    ...ctx.kbSummary,
                    knowledgeBaseId: knowledgeBundle.knowledgeBaseId,
                };
            }

            const result = await handleSarahChat(ctx, { message: customerText, sessionId: null });
            reply = result.reply || "Thanks for your message. We'll get back to you shortly.";
            toolVehicles = [...extractSearchInventoryVehicles(result.actions || []), ...prefetchedVehicles];
        }
        const needsMedia = customerWantsVehicleMedia(customerText, reply, history) || wantsMedia;
        if (needsMedia) {
            const media = await enrichCompanySarahReplyWithVehicleMedia(companyId, searchContext, reply, {
                toolVehicles,
                force: true,
                toolResults: automotiveTurn?.toolResults,
                history,
                recommendedVehicles,
                mediaPlan: planVehicleMediaSelection(searchContext, history, recommendedVehicles, toolVehicles),
            });
            reply = media.content;
            mediaAttachments = media.attachments || [];
        } else {
            reply = scrubInvalidMarkdownImages(reply).text;
        }
    } catch (err) {
        console.warn("[companyReceptionChat] orchestrator fallback:", err.message);
        reply = `Thanks for your message. ${conv.companyName} has received it and will follow up soon.`;
        reply = scrubInvalidMarkdownImages(reply).text;
        if (wantsMedia) {
            const media = await buildDirectShowroomMediaReply(companyId, searchContext, prefetchedVehicles);
            if (directReplyHasMedia(media)) {
                reply = media.content;
                mediaAttachments = media.attachments || [];
            }
        }
    }

    await appendUserConversationMessage(conv, {
        role: "assistant",
        content: reply,
        source: "ai",
        ...(mediaAttachments.length ? { attachments: mediaAttachments } : {}),
    });
    auditLog("company_sarah_chat", { uid, companyId, conversationId: conv.id });

    return {
        conversationId: conv.id,
        companyId,
        companyName: conv.companyName,
        reply,
        messages: getUserConversationMessages(conv.id),
        ...(uiHints.length ? { uiHints } : {}),
        ...(educareTurn?.parentMode ? { parentMode: educareTurn.parentMode } : {}),
    };
}

export function getCompanyConversationForUser(uid, companyId, consumerProfile = {}) {
    return ensureCompanyChatThread(uid, companyId, consumerProfile);
}
