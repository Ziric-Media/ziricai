import { askAI, askAIWithTools } from "../../openai.js";

import { sendWhatsAppTypingIndicator } from "../../whatsapp.js";

import { sendMessage as integrationSend } from "../../integrations/integrationHub.js";

import { saveOutboundMessage, getConversation } from "../../conversationService.js";

import { getCustomer, addTimelineEvent, parseExplicitCustomerName, persistExplicitCustomerName, getCustomerDisplayName } from "../../customerService.js";

import { recordEvent } from "../../analytics/analyticsService.js";

import { publish, EventTypes } from "../../events/index.js";

import { extractMemoryFacts } from "../../intelligence/conversationIntelligence.js";

import { storeMemory, getMemoryContext, getMemories } from "../../memory/aiMemoryService.js";

import { processInboundCustomerPipeline } from "../../platform/provisioningService.js";

import { retrieveAgentKnowledgeContext } from "../../ai-core/aiCoreBridge.js";
import {
    buildWhatsAppSystemPrompt,
    isGreetingMessage,
} from "../../ai-core/whatsappConversationPrompt.js";
import { getCompany } from "../../tenants/companyService.js";
import { getDefaultAiEmployee } from "../../tenants/aiEmployeeService.js";
import { customerDocId, conversationDocId } from "../../storage/tenantStorage.js";
import { initAiTools, getOpenAIToolDefinitions, runTool } from "../../tools/index.js";
import {
    extractSchedulingFromText,
    formatSchedulingContextForPrompt,
    getSchedulingContext,
    saveSchedulingContext,
} from "../../conversation/schedulingContext.js";
import {
    isBookingRecapIntent,
    formatAuthoritativeBookingBlock,
} from "../../conversation/bookingRecapIntent.js";
import {
    extractSalesSignals,
    persistSalesContext,
    mergeSalesContext,
} from "../../conversation/salesContext.js";
import {
    isVehicleReferenceIntent,
    resolveVehicleReference,
    formatResolvedVehicleBlock,
} from "../../conversation/vehicleReference.js";
import { getRecommendedVehicles } from "../../conversation/recommendedVehicles.js";
import { buildVehicleOutboundPlan } from "../../conversation/vehicleOutboundPlan.js";

import { captureLeadFromMessage } from "../../tenants/crmService.js";

import { superviseReply } from "../../intelligence/aiSupervisor.js";

import { JOB_TYPES, registerJobHandler, markJobOutboundSent } from "../jobQueue.js";

const NON_TEXT_REPLY = "Please send a text message so I can help you.";

initAiTools();

async function sendViaIntegration(channel, companyId, to, payload) {
    return integrationSend(channel || "whatsapp", { companyId }, { to, ...payload });
}

async function trySendOutbound(job, channel, companyId, to, text, responseSource = "ai") {
    if (job.outboundPlanSent || (job.outboundSent && job.outboundMetaMessageId)) {
        console.log("[whatsapp] Outbound already sent (idempotent skip)", {
            jobId: job.id,
            companyId,
            to,
            responseSource,
            outboundPlanSent: Boolean(job.outboundPlanSent),
            metaMessageIdPrefix: job.outboundMetaMessageId
                ? String(job.outboundMetaMessageId).slice(0, 24)
                : null,
        });
        return job.outboundMetaMessageId;
    }

    try {
        const result = await sendViaIntegration(channel, companyId, to, { text });
        const metaMessageId = result?.messages?.[0]?.id || null;
        if (metaMessageId) {
            await markJobOutboundSent(job.id, metaMessageId);
            job.outboundSent = true;
            job.outboundMetaMessageId = metaMessageId;
            console.log("[whatsapp] Outbound sent", {
                jobId: job.id,
                companyId,
                to,
                responseSource,
                metaMessageIdPrefix: String(metaMessageId).slice(0, 24),
            });
        }
        return metaMessageId;
    } catch (err) {
        console.warn("[whatsapp] Outbound send failed (inbound processing continues):", {
            jobId: job.id,
            companyId,
            to,
            responseSource,
            code: err.metaCode ?? err.code ?? null,
            retryable: err.retryable !== false,
            message: err.message,
        });
    }
    return null;
}

async function trySendOutboundPlan(job, channel, companyId, to, plan, responseSource = "ai") {
    if (job.outboundPlanSent || (job.outboundSent && job.outboundMetaMessageIds?.length)) {
        console.log("[whatsapp] Outbound plan already sent (idempotent skip)", {
            jobId: job.id,
            companyId,
            to,
            responseSource,
            parts: job.outboundMetaMessageIds?.length || 0,
        });
        return job.outboundMetaMessageIds || [];
    }

    try {
        const results = await sendViaIntegration(channel, companyId, to, { messages: plan.messages });
        const wamids = (Array.isArray(results) ? results : [results])
            .map((r) => r?.messages?.[0]?.id)
            .filter(Boolean);

        if (wamids.length) {
            await markJobOutboundSent(job.id, wamids[0], {
                outboundPlanSent: true,
                outboundMetaMessageIds: wamids,
            });
            job.outboundSent = true;
            job.outboundPlanSent = true;
            job.outboundMetaMessageId = wamids[0];
            job.outboundMetaMessageIds = wamids;
            console.log("[whatsapp] Outbound plan sent", {
                jobId: job.id,
                companyId,
                to,
                responseSource,
                parts: wamids.length,
                metaMessageIdPrefix: String(wamids[0]).slice(0, 24),
            });
        }
        return wamids;
    } catch (err) {
        console.warn("[whatsapp] Outbound plan send failed (inbound processing continues):", {
            jobId: job.id,
            companyId,
            to,
            responseSource,
            code: err.metaCode ?? err.code ?? null,
            retryable: err.retryable !== false,
            message: err.message,
        });
    }
    return [];
}

async function processInboundMessage(job) {
    const { phone, text, from, contactName, messageType, companyId, timestamp, channel, externalId } = job;

    const sender = from || phone;
    const outboundChannel = channel || "whatsapp";

    console.log("[whatsapp] Worker processing inbound", {
        companyId,
        from: sender,
        messageType,
        externalIdPrefix: externalId ? String(externalId).slice(0, 24) : null,
    });

    if (messageType !== "text" || !String(text || "").trim()) {
        const metaMessageId = await trySendOutbound(job, outboundChannel, companyId, sender, NON_TEXT_REPLY, "fallback");
        await saveOutboundMessage(sender, NON_TEXT_REPLY, {
            channel: outboundChannel,
            companyId,
            externalId: metaMessageId,
        });
        return;
    }

    if (outboundChannel === "whatsapp" && externalId) {
        await sendWhatsAppTypingIndicator(externalId);
    }

    const resolvedCompanyId = companyId || job.companyId || null;
    const customer =
        (resolvedCompanyId
            ? await getCustomer(sender, { companyId: resolvedCompanyId })
            : await getCustomer(sender)) || { phone: sender, companyId: resolvedCompanyId };

    const knowledgeBundle =
        resolvedCompanyId && !isGreetingMessage(text)
            ? await retrieveAgentKnowledgeContext(resolvedCompanyId, text)
            : { agent: null, context: "", sources: [] };

    let agent = knowledgeBundle.agent;
    if (resolvedCompanyId && !agent) {
        agent = await getDefaultAiEmployee(resolvedCompanyId);
    }

    console.log("[whatsapp] Resolved AI employee", {
        companyId: resolvedCompanyId,
        agentId: agent?.id || null,
        agentName: agent?.name || null,
    });

    const companyRecord = resolvedCompanyId ? await getCompany(resolvedCompanyId).catch(() => null) : null;
    const companyName = companyRecord?.name || customer.companyName || null;

    const explicitName = parseExplicitCustomerName(text);
    if (explicitName && resolvedCompanyId) {
        await persistExplicitCustomerName(sender, explicitName, {
            companyId: resolvedCompanyId,
            companyName,
        });
    }

    let salesContextForTurn = customer?.salesContext || null;
    if (resolvedCompanyId) {
        const salesSignals = extractSalesSignals(text, { customer });
        if (Object.keys(salesSignals).length) {
            if (salesSignals.leadStage === "IDENTIFIED" && explicitName) {
                salesSignals.householdMembers = [
                    ...(salesSignals.householdMembers || []),
                    { name: explicitName, role: "primary", relationship: "customer" },
                ];
            }
            salesContextForTurn = mergeSalesContext(customer?.salesContext, salesSignals);
            await persistSalesContext(resolvedCompanyId, sender, salesSignals);
        }
    }

    let refreshedCustomer =
        resolvedCompanyId
            ? (await getCustomer(sender, { companyId: resolvedCompanyId })) || customer
            : explicitName
              ? { ...customer, displayName: explicitName, name: explicitName }
              : customer;

    if (salesContextForTurn) {
        refreshedCustomer = { ...refreshedCustomer, salesContext: salesContextForTurn };
    }

    const customerDisplayName = getCustomerDisplayName(refreshedCustomer, {
        contactName,
        companyName,
    });

    const history = resolvedCompanyId
        ? await getConversation(sender, 20, { companyId: resolvedCompanyId, channel: outboundChannel })
        : await getConversation(sender, 20);
    const isNewConversation = history.length <= 1;

    const customerId = customerDocId(sender);
    const conversationId = resolvedCompanyId
        ? conversationDocId(customerId, outboundChannel)
        : null;

    const memoryEnabled = agent?.memory !== false;
    const memoryRecords =
        resolvedCompanyId && memoryEnabled
            ? await getMemories(sender, agent?.id || "default", { companyId: resolvedCompanyId })
            : memoryEnabled
              ? await getMemories(sender, agent?.id || "default")
              : [];
    const memoryContext = memoryEnabled
        ? resolvedCompanyId
            ? await getMemoryContext(sender, agent?.id || "default", { companyId: resolvedCompanyId })
            : await getMemoryContext(sender, agent?.id || "default")
        : "";

    console.log("[whatsapp] Context resolved", {
        companyId: resolvedCompanyId,
        customerId,
        conversationId,
        agentId: agent?.id || null,
        memoriesRetrieved: memoryRecords.length,
        recentMessagesRetrieved: history.length,
        knowledgeSkipped: isGreetingMessage(text),
        hasAiSummary: Boolean(refreshedCustomer?.aiSummary),
        customerDisplayName: customerDisplayName || null,
    });

    if (resolvedCompanyId && isNewConversation) {
        await publish(resolvedCompanyId, EventTypes.CONVERSATION_STARTED, {
            phone: sender,
            channel: outboundChannel,
            contactName,
        });
    }

    const systemPrompt = buildWhatsAppSystemPrompt({
        agent,
        companyId: resolvedCompanyId,
        companyName,
        customer: refreshedCustomer,
        contactName,
    });

    let schedulingContext =
        resolvedCompanyId && sender
            ? await getSchedulingContext(resolvedCompanyId, sender, outboundChannel)
            : {};
    const extractedScheduling = extractSchedulingFromText(text);
    if (resolvedCompanyId && sender && Object.keys(extractedScheduling).length) {
        schedulingContext = await saveSchedulingContext(
            resolvedCompanyId,
            sender,
            outboundChannel,
            extractedScheduling
        );
    }

    const schedulingPrompt = formatSchedulingContextForPrompt(schedulingContext);

    let authoritativeBookingContext = "";
    let preloadedBookingResult = null;
    if (resolvedCompanyId && isBookingRecapIntent(text)) {
        preloadedBookingResult = await runTool("getCustomerBookings", {
            companyId: resolvedCompanyId,
            customerId,
            customerPhone: sender,
            customerName: customerDisplayName,
            agentId: agent?.id || null,
            channel: outboundChannel,
            inboundMessage: text,
            schedulingContext,
        }, { statusFilter: "upcoming" });
        authoritativeBookingContext = formatAuthoritativeBookingBlock(preloadedBookingResult);
        console.log("[whatsapp] Booking recap intent — pre-loaded getCustomerBookings", {
            companyId: resolvedCompanyId,
            customerId,
            count: preloadedBookingResult?.count ?? 0,
        });
    }

    let resolvedVehicleReference = null;
    let authoritativeVehicleContext = "";
    if (resolvedCompanyId && isVehicleReferenceIntent(text)) {
        const conversationRecommended = await getRecommendedVehicles(resolvedCompanyId, sender, outboundChannel);
        resolvedVehicleReference = resolveVehicleReference(
            text,
            salesContextForTurn,
            conversationRecommended
        );
        if (resolvedVehicleReference?.vehicleId) {
            authoritativeVehicleContext = formatResolvedVehicleBlock(resolvedVehicleReference);
            console.log("[whatsapp] Vehicle reference resolved", {
                companyId: resolvedCompanyId,
                customerId,
                vehicleId: resolvedVehicleReference.vehicleId,
                stockNumber: resolvedVehicleReference.stockNumber,
            });
        }
    }

    const knowledgeParts = [
        knowledgeBundle.context || "",
        memoryContext || "",
        schedulingPrompt,
        authoritativeBookingContext,
        authoritativeVehicleContext,
    ].filter(Boolean);

    const toolCtx = {
        companyId: resolvedCompanyId,
        customerId,
        customerPhone: sender,
        customerName: customerDisplayName,
        agentId: agent?.id || null,
        channel: outboundChannel,
        inboundMessage: text,
        schedulingContext,
        salesContext: salesContextForTurn,
        resolvedVehicleReference,
    };

    const aiTools = resolvedCompanyId ? getOpenAIToolDefinitions() : [];
    let reply;
    let toolResults = [];

    if (aiTools.length && resolvedCompanyId) {
        const aiResult = await askAIWithTools(text, {
            history,
            systemPrompt,
            knowledgeContext: knowledgeParts.join("\n\n"),
            tools: aiTools,
            executeTool: (name, args) => runTool(name, toolCtx, args),
            authoritativeBookingData: Boolean(authoritativeBookingContext),
            preloadedBookingResult,
        });
        reply = aiResult.reply;
        toolResults = aiResult.toolResults || [];
    } else {
        reply = await askAI(text, {
            history,
            systemPrompt,
            knowledgeContext: knowledgeParts.join("\n\n"),
        });
    }

    if (toolResults.length) {
        console.log("[whatsapp] AI tool results", {
            companyId: resolvedCompanyId,
            customerId,
            tools: toolResults.map((r) => ({
                tool: r.tool,
                ok: r.ok ?? r.success,
                code: r.code || null,
            })),
        });
    }

    const outboundPlan =
        outboundChannel === "whatsapp"
            ? buildVehicleOutboundPlan({
                  toolResults,
                  llmReply: reply,
                  channel: outboundChannel,
              })
            : null;

    let savedReply = reply;
    if (outboundPlan?.messages?.length) {
        const wamids = await trySendOutboundPlan(
            job,
            outboundChannel,
            resolvedCompanyId,
            sender,
            outboundPlan,
            "ai_vehicle_media"
        );

        let wamidIndex = 0;
        for (const part of outboundPlan.messages) {
            const metaMessageId = wamids[wamidIndex] || null;
            if (part.type === "image") {
                await saveOutboundMessage(sender, part.caption || "[image]", {
                    channel: outboundChannel,
                    companyId: resolvedCompanyId,
                    externalId: metaMessageId,
                    mediaUrl: part.link,
                });
            } else {
                await saveOutboundMessage(sender, part.text, {
                    channel: outboundChannel,
                    companyId: resolvedCompanyId,
                    externalId: metaMessageId,
                });
            }
            if (metaMessageId) wamidIndex++;
        }
        savedReply = outboundPlan.strippedReply || reply;
    } else {
        const metaMessageId = await trySendOutbound(job, outboundChannel, resolvedCompanyId, sender, reply, "ai");
        await saveOutboundMessage(sender, reply, {
            channel: outboundChannel,
            companyId: resolvedCompanyId,
            externalId: metaMessageId,
        });
    }

    if (resolvedCompanyId) {
        await publish(resolvedCompanyId, EventTypes.MESSAGE_SENT, {
            phone: sender,
            text: savedReply,
            channel: outboundChannel,
            vehicleMediaParts: outboundPlan?.messages?.length || 0,
        });
    }

    const pipeline = await processInboundCustomerPipeline(sender, {
        text,
        contactName,
        companyId: resolvedCompanyId,
        reply,
        agentId: agent?.id || null,
    });

    if (resolvedCompanyId) {
        const supervision = await superviseReply({
            phone: sender,
            companyId: resolvedCompanyId,
            agentId: agent?.id || pipeline.agentId || null,
            customerMessage: text,
            agentReply: reply,
            analysis: pipeline.analysis,
        });
        await recordEvent("supervisor_review", {
            phone: sender,
            companyId: resolvedCompanyId,
            agentId: agent?.id || null,
            qualityScore: supervision.qualityScore,
            grade: supervision.grade,
        });
    }

    if (knowledgeBundle.sources?.length) {
        await addTimelineEvent(sender, {
            type: "knowledge",
            title: "Knowledge Used",
            description: knowledgeBundle.sources.slice(0, 3).join(", "),
            meta: { sources: knowledgeBundle.sources, knowledgeBaseId: knowledgeBundle.knowledgeBaseId },
        });
        if (resolvedCompanyId) {
            await publish(resolvedCompanyId, EventTypes.KNOWLEDGE_QUERY, {
                phone: sender,
                question: text,
                sources: knowledgeBundle.sources,
            });
        }
    }

    const facts = extractMemoryFacts(text);
    for (const fact of facts) {
        await storeMemory(sender, agent?.id || "default", fact, { companyId: resolvedCompanyId });
    }

    await recordEvent("message_processed", {
        phone: sender,
        companyId: pipeline.companyId,
        agentId: pipeline.agentId,
        sentiment: pipeline.analysis?.sentiment,
        topic: pipeline.analysis?.topic,
        intent: pipeline.analysis?.intent,
        notifiedStaff: pipeline.notifiedStaff,
        timestamp: timestamp || new Date().toISOString(),
    });

    if (resolvedCompanyId && (pipeline.analysis?.leadQuality ?? 0) >= 60) {
        await captureLeadFromMessage(resolvedCompanyId, {
            phone: sender,
            contactName,
            leadScore: pipeline.analysis.leadQuality,
            topic: pipeline.analysis.topic,
            channel: outboundChannel,
        });
    }

    console.log("[whatsapp] Processed inbound message", {
        from: sender,
        companyId: resolvedCompanyId,
        agentId: agent?.id || pipeline.agentId || null,
        sentiment: pipeline.analysis?.sentiment || null,
    });
}

export function startMessageWorker() {
    registerJobHandler(JOB_TYPES.PROCESS_INBOUND_MESSAGE, processInboundMessage);
    console.log("[whatsapp] Message worker registered for", JOB_TYPES.PROCESS_INBOUND_MESSAGE);
}
