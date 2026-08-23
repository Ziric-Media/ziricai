import { askAI } from "../../openai.js";

import { sendWhatsAppTypingIndicator } from "../../whatsapp.js";

import { sendMessage as integrationSend } from "../../integrations/integrationHub.js";

import { saveOutboundMessage, getConversation } from "../../conversationService.js";

import { getCustomer, addTimelineEvent } from "../../customerService.js";

import { recordEvent } from "../../analytics/analyticsService.js";

import { publish, EventTypes } from "../../events/index.js";

import { extractMemoryFacts } from "../../intelligence/conversationIntelligence.js";

import { storeMemory } from "../../memory/aiMemoryService.js";

import { processInboundCustomerPipeline } from "../../platform/provisioningService.js";

import { retrieveAgentKnowledgeContext } from "../../ai-core/aiCoreBridge.js";
import {
    buildWhatsAppSystemPrompt,
    isGreetingMessage,
} from "../../ai-core/whatsappConversationPrompt.js";
import { getCompany } from "../../tenants/companyService.js";
import { getDefaultAiEmployee } from "../../tenants/aiEmployeeService.js";

import { captureLeadFromMessage } from "../../tenants/crmService.js";

import { superviseReply } from "../../intelligence/aiSupervisor.js";

import { JOB_TYPES, registerJobHandler } from "../jobQueue.js";

const NON_TEXT_REPLY = "Please send a text message so I can help you.";

async function sendViaIntegration(channel, companyId, to, text) {
    return integrationSend(channel || "whatsapp", { companyId }, { to, text });
}

async function trySendOutbound(channel, companyId, to, text) {
    try {
        const result = await sendViaIntegration(channel, companyId, to, text);
        const metaMessageId = result?.messages?.[0]?.id || null;
        if (metaMessageId) {
            console.log("[whatsapp] Outbound sent", {
                companyId,
                to,
                metaMessageIdPrefix: String(metaMessageId).slice(0, 24),
            });
        }
        return metaMessageId;
    } catch (err) {
        console.warn("[whatsapp] Outbound send failed (inbound processing continues):", {
            companyId,
            to,
            code: err.metaCode ?? err.code ?? null,
            retryable: err.retryable !== false,
            message: err.message,
        });
    }
    return null;
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
        const metaMessageId = await trySendOutbound(outboundChannel, companyId, sender, NON_TEXT_REPLY);
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

    const customer = (await getCustomer(sender)) || { phone: sender, companyId: job.companyId || null };
    const resolvedCompanyId = customer.companyId || companyId || process.env.DEFAULT_COMPANY_ID || null;

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

    const history = await getConversation(sender, 20);
    const isNewConversation = history.length <= 1;

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
        companyName: companyRecord?.name || customer.companyName,
        customer,
        contactName,
    });

    const reply = await askAI(text, {
        history,
        systemPrompt,
        knowledgeContext: knowledgeBundle.context || "",
    });

    const metaMessageId = await trySendOutbound(outboundChannel, resolvedCompanyId, sender, reply);
    await saveOutboundMessage(sender, reply, {
        channel: outboundChannel,
        companyId: resolvedCompanyId,
        externalId: metaMessageId,
    });

    if (resolvedCompanyId) {
        await publish(resolvedCompanyId, EventTypes.MESSAGE_SENT, {
            phone: sender,
            text: reply,
            channel: outboundChannel,
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
        await storeMemory(sender, agent?.id || "default", fact);
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
