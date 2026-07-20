import { askAI } from "../../openai.js";

import { sendMessage as integrationSend } from "../../integrations/integrationHub.js";

import { saveOutboundMessage, getConversation } from "../../conversationService.js";

import { getCustomer, addTimelineEvent } from "../../customerService.js";

import { recordEvent } from "../../analytics/analyticsService.js";

import { publish, EventTypes } from "../../events/index.js";

import { extractMemoryFacts } from "../../intelligence/conversationIntelligence.js";

import { storeMemory } from "../../memory/aiMemoryService.js";

import { processInboundCustomerPipeline } from "../../platform/provisioningService.js";

import { retrieveAgentKnowledgeContext } from "../../ai-core/aiCoreBridge.js";

import { captureLeadFromMessage } from "../../tenants/crmService.js";

import { superviseReply } from "../../intelligence/aiSupervisor.js";

import { JOB_TYPES, registerJobHandler } from "../jobQueue.js";



const NON_TEXT_REPLY = "Please send a text message so I can help you.";



async function sendViaIntegration(channel, companyId, to, text) {

    return integrationSend(channel || "whatsapp", { companyId }, { to, text });

}



async function processInboundMessage(job) {

    const { phone, text, from, contactName, messageType, companyId, timestamp, channel } = job;

    const sender = from || phone;

    const outboundChannel = channel || "whatsapp";



    if (messageType !== "text" || !String(text || "").trim()) {

        await saveOutboundMessage(sender, NON_TEXT_REPLY);

        await sendViaIntegration(outboundChannel, companyId, sender, NON_TEXT_REPLY);

        return;

    }



    const customer = (await getCustomer(sender)) || { phone: sender, companyId: job.companyId || null };

    const resolvedCompanyId = customer.companyId || companyId || process.env.DEFAULT_COMPANY_ID || null;



    const knowledgeBundle = resolvedCompanyId

        ? await retrieveAgentKnowledgeContext(resolvedCompanyId, text)

        : { agent: null, context: "", sources: [] };



    const agent = knowledgeBundle.agent;

    const history = await getConversation(sender, 20);

    const isNewConversation = history.length <= 1;



    if (resolvedCompanyId && isNewConversation) {

        await publish(resolvedCompanyId, EventTypes.CONVERSATION_STARTED, {

            phone: sender,

            channel: outboundChannel,

            contactName,

        });

    }



    const knowledgeContext = knowledgeBundle.context || "";

    const systemContext = agent?.systemPrompt

        ? `${agent.systemPrompt}\n\n${knowledgeContext}`

        : knowledgeContext;

    const reply = await askAI(text, { history, context: systemContext });



    await saveOutboundMessage(sender, reply);

    await sendViaIntegration(outboundChannel, resolvedCompanyId, sender, reply);



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



    console.log("[worker] Processed inbound message for", sender, pipeline.analysis);

}



export function startMessageWorker() {

    registerJobHandler(JOB_TYPES.PROCESS_INBOUND_MESSAGE, processInboundMessage);

    console.log("[worker] Message worker registered for", JOB_TYPES.PROCESS_INBOUND_MESSAGE);

}


