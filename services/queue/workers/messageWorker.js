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
    isSchedulingDelegationIntent,
    isSchedulingTimeSelectionIntent,
    isSchedulingDateIntent,
    isTestDriveAvailabilityQuery,
    enrichToolArgsWithScheduling,
    formatAuthoritativeAvailabilityBlock,
} from "../../conversation/schedulingContext.js";
import {
    getTestDrivePlan,
    formatTestDrivePlanForPrompt,
    isPlanConfirmationIntent,
    finalizePendingPlanEntries,
    saveTestDrivePlan,
} from "../../conversation/testDrivePlan.js";
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
    isGalleryImageIntent,
    resolveVehicleReference,
    resolveGalleryVehicleTargets,
    resolveSchedulingVehicleReference,
    formatResolvedVehicleBlock,
} from "../../conversation/vehicleReference.js";
import { getRecommendedVehicles } from "../../conversation/recommendedVehicles.js";
import {
    buildVehicleOutboundPlan,
    buildGalleryOutboundPlan,
    enrichRecommendedVehiclesForOutbound,
    formatGalleryDeliveryReply,
} from "../../conversation/vehicleOutboundPlan.js";

import { syncFromSalesTurn } from "../../integrations/crmSyncService.js";

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
            if (salesSignals.leadStage === "DISCOVERY" && explicitName) {
                salesSignals.householdMembers = [
                    ...(salesSignals.householdMembers || []),
                    { name: explicitName, role: "primary", relationship: "customer" },
                ];
            }
            salesContextForTurn = mergeSalesContext(customer?.salesContext, salesSignals);
            await persistSalesContext(resolvedCompanyId, sender, salesSignals);
            await syncFromSalesTurn(resolvedCompanyId, sender, {
                contactName,
                channel: outboundChannel,
                salesContext: salesContextForTurn,
                aiEmployeeId: agent?.id || null,
                aiEmployeeName: agent?.name || "Sarah",
            }).catch((err) => {
                console.warn("[crm-sync] persistSalesContext sync failed:", err.message);
            });
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
    const extractedScheduling = extractSchedulingFromText(text, schedulingContext);
    if (resolvedCompanyId && sender && Object.keys(extractedScheduling).length) {
        schedulingContext = await saveSchedulingContext(
            resolvedCompanyId,
            sender,
            outboundChannel,
            extractedScheduling
        );
    }

    let testDrivePlan =
        resolvedCompanyId && sender
            ? await getTestDrivePlan(resolvedCompanyId, sender, outboundChannel)
            : [];

    const schedulingPrompt = formatSchedulingContextForPrompt(schedulingContext);
    const testDrivePlanPrompt = formatTestDrivePlanForPrompt(testDrivePlan);

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
    let galleryOutboundContext = "";
    let galleryVehicleTargets = [];

    if (resolvedCompanyId && isGalleryImageIntent(text)) {
        const conversationRecommended = await getRecommendedVehicles(resolvedCompanyId, sender, outboundChannel);
        galleryVehicleTargets = resolveGalleryVehicleTargets(
            text,
            salesContextForTurn,
            conversationRecommended
        );
        if (galleryVehicleTargets.length) {
            const labels = galleryVehicleTargets
                .map((v) => v.title || v.make || v.vehicleId)
                .filter(Boolean)
                .join(", ");
            galleryOutboundContext = [
                "GALLERY OUTBOUND (platform will send native WhatsApp images automatically):",
                `- Resolved ${galleryVehicleTargets.length} vehicle(s) from prior recommendations: ${labels}`,
                "- Give a brief acknowledgment only — do NOT promise 'you'll see them shortly' or claim photos were sent.",
                "- Platform sends images after your reply; if delivery fails, customer will be told honestly.",
            ].join("\n");
            console.log("[whatsapp] Gallery image intent — resolved vehicles", {
                companyId: resolvedCompanyId,
                customerId,
                count: galleryVehicleTargets.length,
                vehicleIds: galleryVehicleTargets.map((v) => v.vehicleId),
            });
        }
    }

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

    let authoritativeAvailabilityContext = "";
    let preloadedAvailabilityResult = null;

    const schedulingVehicleRecommended =
        resolvedCompanyId && sender
            ? await getRecommendedVehicles(resolvedCompanyId, sender, outboundChannel)
            : [];
    const schedulingVehicleRef = resolveSchedulingVehicleReference(
        salesContextForTurn,
        schedulingVehicleRecommended,
        resolvedVehicleReference
    );
    if (schedulingVehicleRef?.vehicleId && !authoritativeVehicleContext) {
        authoritativeVehicleContext = formatResolvedVehicleBlock(schedulingVehicleRef);
    }

    const shouldPreloadAvailability =
        resolvedCompanyId &&
        schedulingVehicleRef?.vehicleId &&
        (isSchedulingDelegationIntent(text) ||
            isSchedulingTimeSelectionIntent(text, schedulingContext) ||
            isSchedulingDateIntent(text) ||
            (isTestDriveAvailabilityQuery(text) &&
                (schedulingContext.pendingDate ||
                    schedulingContext.lastMentionedDate ||
                    schedulingVehicleRef?.vehicleId)));

    if (shouldPreloadAvailability) {
        const preloadArgs = enrichToolArgsWithScheduling(
            "checkTestDriveAvailability",
            { vehicleId: schedulingVehicleRef.vehicleId },
            schedulingContext
        );
        const delegation = isSchedulingDelegationIntent(text);
        const proactiveSlotSearch =
            delegation || (/\bwhen\s+can\b/i.test(text) && /test[\s-]?drive/i.test(text));

        preloadedAvailabilityResult = await runTool(
            "checkTestDriveAvailability",
            {
                companyId: resolvedCompanyId,
                customerId,
                customerPhone: sender,
                customerName: customerDisplayName,
                agentId: agent?.id || null,
                channel: outboundChannel,
                inboundMessage: text,
                schedulingContext,
                salesContext: salesContextForTurn,
                resolvedVehicleReference: schedulingVehicleRef,
                autoSelectNext: delegation || proactiveSlotSearch,
            },
            preloadArgs
        );
        authoritativeAvailabilityContext = formatAuthoritativeAvailabilityBlock(preloadedAvailabilityResult);

        if (
            delegation &&
            preloadedAvailabilityResult?.autoSelected &&
            preloadedAvailabilityResult?.available &&
            preloadedAvailabilityResult?.slotStart
        ) {
            preloadedBookingResult = await runTool(
                "bookTestDrive",
                {
                    companyId: resolvedCompanyId,
                    customerId,
                    customerPhone: sender,
                    customerName: customerDisplayName,
                    agentId: agent?.id || null,
                    channel: outboundChannel,
                    inboundMessage: text,
                    schedulingContext,
                    salesContext: salesContextForTurn,
                    resolvedVehicleReference: schedulingVehicleRef,
                },
                {
                    vehicleId: schedulingVehicleRef.vehicleId,
                    scheduledAt: preloadedAvailabilityResult.slotStart,
                }
            );
            authoritativeBookingContext = [
                "AUTHORITATIVE BOOKING (bookTestDrive — cite ONLY if ok/success):",
                preloadedBookingResult?.ok
                    ? `- BOOKING_SUCCESS: ${schedulingVehicleRef.title || schedulingVehicleRef.make || "vehicle"} at ${preloadedAvailabilityResult.slotLabel || preloadedAvailabilityResult.slotStart}`
                    : `- BOOKING_FAILED: ${preloadedBookingResult?.code || preloadedBookingResult?.error || "unknown"} — vehicle may still be in inventory; offer nextAlternative.`,
            ].join("\n");
            console.log("[whatsapp] Delegation auto-book", {
                companyId: resolvedCompanyId,
                customerId,
                ok: preloadedBookingResult?.ok,
                code: preloadedBookingResult?.code,
            });
        }

        console.log("[whatsapp] Pre-loaded checkTestDriveAvailability", {
            companyId: resolvedCompanyId,
            customerId,
            code: preloadedAvailabilityResult?.code,
            slotLabel: preloadedAvailabilityResult?.slotLabel || null,
            available: preloadedAvailabilityResult?.available,
        });
    }

    let authoritativePlanFinalizeContext = "";
    let preloadedFinalizeResults = null;
    if (resolvedCompanyId && sender && isPlanConfirmationIntent(text) && testDrivePlan.some((e) => e.status === "PENDING")) {
        const finalize = await finalizePendingPlanEntries(
            {
                companyId: resolvedCompanyId,
                customerId,
                customerPhone: sender,
                customerName: customerDisplayName,
                agentId: agent?.id || null,
                channel: outboundChannel,
                schedulingContext,
                testDrivePlan,
            },
            testDrivePlan
        );
        testDrivePlan = finalize.plan;
        preloadedFinalizeResults = finalize.results;
        await saveTestDrivePlan(resolvedCompanyId, sender, outboundChannel, testDrivePlan);

        const lines = [
            "AUTHORITATIVE PLAN FINALIZATION (bookTestDrive results — cite ONLY these):",
        ];
        for (const r of finalize.results) {
            const entry = testDrivePlan.find((e) => e.vehicleId === r.vehicleId);
            const label = entry?.title || entry?.stockNumber || r.vehicleId;
            if (r.ok) {
                lines.push(`- CONFIRMED: ${label} — ${entry?.slotLabel || "booked"}`);
            } else {
                lines.push(`- FAILED (slot issue): ${label} — ${r.error || r.reason || r.code}`);
                lines.push("  • Vehicle may still be in inventory — offer nextAlternative/suggestedSlots, do NOT claim sold.");
            }
        }
        const stillConfirmed = testDrivePlan.filter((e) => e.status === "CONFIRMED");
        if (stillConfirmed.length) {
            lines.push(`- ${stillConfirmed.length} appointment(s) already CONFIRMED in plan — preserve these; never undo.`);
        }
        authoritativePlanFinalizeContext = lines.join("\n");
        console.log("[whatsapp] Plan confirmation — finalized pending entries", {
            companyId: resolvedCompanyId,
            customerId,
            results: finalize.results.map((r) => ({ vehicleId: r.vehicleId, ok: r.ok, code: r.code })),
        });
    }

    const knowledgeParts = [
        knowledgeBundle.context || "",
        memoryContext || "",
        schedulingPrompt,
        testDrivePlanPrompt,
        authoritativeAvailabilityContext,
        authoritativePlanFinalizeContext,
        authoritativeBookingContext,
        authoritativeVehicleContext,
        galleryOutboundContext,
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
        testDrivePlan,
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

    let outboundPlan = null;
    if (outboundChannel === "whatsapp") {
        if (galleryVehicleTargets.length) {
            const enrichedVehicles = await enrichRecommendedVehiclesForOutbound(
                resolvedCompanyId,
                galleryVehicleTargets
            );
            outboundPlan = buildGalleryOutboundPlan({
                vehicles: enrichedVehicles,
                llmReply: reply,
                channel: outboundChannel,
                fullGallery: /\b(?:all|every)\s+(?:pictures?|photos?|images?)\b/i.test(text),
            });
        } else {
            outboundPlan = buildVehicleOutboundPlan({
                toolResults,
                llmReply: reply,
                channel: outboundChannel,
            });
        }
    }

    let savedReply = reply;
    if (outboundPlan?.messages?.length) {
        const wamids = await trySendOutboundPlan(
            job,
            outboundChannel,
            resolvedCompanyId,
            sender,
            outboundPlan,
            outboundPlan.planType === "gallery" ? "ai_gallery_media" : "ai_vehicle_media"
        );

        const imageParts = outboundPlan.messages.filter((m) => m.type === "image");
        const textParts = outboundPlan.messages.filter((m) => m.type === "text");
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

        if (outboundPlan.planType === "gallery") {
            const sentImages = Math.max(0, wamids.length - textParts.length);
            if (sentImages < imageParts.length) {
                const failureReply = formatGalleryDeliveryReply("", {
                    expectedImages: imageParts.length,
                    sentImages,
                });
                savedReply = outboundPlan.strippedReply
                    ? `${outboundPlan.strippedReply}\n\n${failureReply}`
                    : failureReply;
                const failureMetaId = await trySendOutbound(
                    job,
                    outboundChannel,
                    resolvedCompanyId,
                    sender,
                    failureReply,
                    "ai_gallery_failure"
                );
                await saveOutboundMessage(sender, failureReply, {
                    channel: outboundChannel,
                    companyId: resolvedCompanyId,
                    externalId: failureMetaId,
                });
            }
        }
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
        externalId,
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
        await addTimelineEvent(
            sender,
            {
                id: externalId ? `knowledge-${externalId}` : undefined,
                type: "knowledge",
                title: "Knowledge Used",
                description: knowledgeBundle.sources.slice(0, 3).join(", "),
                meta: { sources: knowledgeBundle.sources, knowledgeBaseId: knowledgeBundle.knowledgeBaseId },
            },
            { companyId: resolvedCompanyId, idempotent: Boolean(externalId) }
        );
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

    if (resolvedCompanyId) {
        const latestCustomer = (await getCustomer(sender, { companyId: resolvedCompanyId })) || refreshedCustomer;
        await syncFromSalesTurn(resolvedCompanyId, sender, {
            contactName,
            channel: outboundChannel,
            leadScore: pipeline.analysis?.leadQuality,
            topic: pipeline.analysis?.topic,
            salesContext: latestCustomer?.salesContext || salesContextForTurn,
            aiEmployeeId: agent?.id || pipeline.agentId || null,
            aiEmployeeName: agent?.name || "Sarah",
        }).catch((err) => {
            console.warn("[crm-sync] end-of-turn sync failed:", err.message);
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
