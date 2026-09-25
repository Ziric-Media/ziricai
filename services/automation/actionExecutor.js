/**
 * Execute automation actions — notification, message, assign, task, webhook.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { addTask, updateCustomer } from "../customerService.js";
import { saveOutboundMessage } from "../conversationService.js";
import { sendMessage as integrationSend } from "../integrations/integrationHub.js";
import { getConversationTakeoverState } from "../conversation/takeoverSafety.js";
import { sendNotification } from "../tenants/notificationService.js";
import { createTask } from "../tenants/taskService.js";
import { EventTypes } from "../events/eventTypes.js";

/** @internal CORPORATE-P0-3E verifier seam only — do not use in production paths */
const p0_3eTestSeam = { integrationSendOverride: null, preDeliverHook: null };

export function __setIntegrationSendOverride(fn) {
    p0_3eTestSeam.integrationSendOverride = fn;
}

export function __setPreDeliverHook(fn) {
    p0_3eTestSeam.preDeliverHook = fn;
}

async function deliverOutbound(channel, ctx, payload) {
    const send = p0_3eTestSeam.integrationSendOverride || integrationSend;
    return send(channel, ctx, payload);
}

/**
 * @param {object} action
 * @param {import('../events/eventTypes.js').ZiricEvent} event
 * @param {object} workflow
 */
export async function executeAction(action, event, workflow) {
    const { type, config = {} } = action;
    const companyId = event.companyId;
    const phone = event.payload?.phone || event.payload?.customerId;

    switch (type) {
        case "send_notification":
        case "notify": {
            await sendNotification(companyId, {
                type: "automation",
                icon: "fa-bolt",
                priority: config.priority,
                title: config.title || `Automation: ${workflow.name}`,
                message: config.message || `Triggered by ${event.type}`,
                channels: config.channels || ["in_app"],
                meta: { workflowId: workflow.id, eventId: event.id },
            });
            return { ok: true, action: "send_notification" };
        }

        case "send_message": {
            if (!phone) {
                return { ok: false, action: "send_message", error: "No recipient phone" };
            }
            const channel = event.payload?.channel || "whatsapp";
            // WhatsApp inbound is handled by Sarah/messageWorker. Automations must not
            // auto-reply unless explicitly forced (forceCustomerMessage) or non-inbound events.
            const skipForAiInbound =
                !config.forceCustomerMessage &&
                (event.payload?.aiReplyPending ||
                    event.payload?.skipAutoReply ||
                    (event.type === EventTypes.MESSAGE_RECEIVED && channel === "whatsapp"));
            if (skipForAiInbound) {
                console.log("[automation] Skipping send_message — AI reply handles inbound", {
                    companyId,
                    phone,
                    workflowId: workflow.id,
                    eventType: event.type,
                    channel,
                    responseSource: "automation_skipped",
                });
                return {
                    ok: true,
                    action: "send_message",
                    skipped: true,
                    reason: "ai_reply_pending",
                };
            }
            if (!companyId) {
                return { ok: false, action: "send_message", error: "companyId is required for outbound message" };
            }
            const resolvedText = config.text || messageFromTemplate(config.template, event);
            if (!resolvedText) {
                return {
                    ok: false,
                    action: "send_message",
                    error: config.template
                        ? `Unknown message template: ${config.template}`
                        : "send_message requires config.text or a known config.template",
                };
            }
            const text = resolvedText;
            const responseSource = config.template === "quotation_followup" ? "quotation_workflow" : "automation";

            const takeoverEarly = await getConversationTakeoverState(companyId, phone, channel);
            if (takeoverEarly.humanControlled) {
                console.log("[automation] Skipping send_message — human takeover active", {
                    companyId,
                    phone,
                    workflowId: workflow.id,
                    conversationId: takeoverEarly.conversationId,
                    responseSource: "automation_skipped",
                    guard: "early_pre_outbound",
                });
                return {
                    ok: true,
                    action: "send_message",
                    skipped: true,
                    reason: "human_takeover",
                };
            }

            if (typeof p0_3eTestSeam.preDeliverHook === "function") {
                await p0_3eTestSeam.preDeliverHook({ companyId, phone, channel, workflow });
            }

            const takeoverFinal = await getConversationTakeoverState(companyId, phone, channel);
            if (takeoverFinal.humanControlled) {
                console.log("[automation] Skipping send_message — human takeover active", {
                    companyId,
                    phone,
                    workflowId: workflow.id,
                    conversationId: takeoverFinal.conversationId,
                    responseSource: "automation_skipped",
                    guard: "final_pre_outbound",
                });
                return {
                    ok: true,
                    action: "send_message",
                    skipped: true,
                    reason: "human_takeover",
                };
            }

            try {
                const result = await deliverOutbound(channel, { companyId }, { to: phone, text });
                const metaMessageId = result?.messages?.[0]?.id || null;
                if (!metaMessageId) {
                    return {
                        ok: false,
                        action: "send_message",
                        error: "Integration send did not return a Meta message id",
                    };
                }

                await saveOutboundMessage(phone, text, {
                    companyId,
                    channel,
                    source: "automation",
                    externalId: metaMessageId,
                    senderName: config.senderName || workflow.name || "Automation",
                });

                console.log("[automation] Outbound sent", {
                    companyId,
                    phone,
                    workflowId: workflow.id,
                    responseSource,
                    template: config.template || null,
                    metaMessageIdPrefix: String(metaMessageId).slice(0, 24),
                });
                return {
                    ok: true,
                    action: "send_message",
                    text: text.slice(0, 80),
                    responseSource,
                    metaMessageId,
                };
            } catch (err) {
                return { ok: false, action: "send_message", error: err.message };
            }
        }

        case "assign_agent": {
            const store = await getStorageAdapter();
            const agents = (await store.listAgents?.({ companyId })) || [];
            const agent = agents.find((a) => a.isDefault) || agents[0];
            if (phone && agent && store.updateCustomer) {
                await store.updateCustomer(phone, {
                    assignedAiEmployee: agent.name,
                    assignedEmployee: agent.name,
                });
            }
            return { ok: true, action: "assign_agent", agentId: agent?.id || null };
        }

        case "create_task": {
            const title = config.title || `Automation follow-up (${workflow.name})`;
            if (phone) {
                await addTask(phone, {
                    title,
                    priority: config.priority || "medium",
                    assignedTo: config.assignedTo || "Team",
                });
            } else {
                await createTask(companyId, {
                    title,
                    priority: config.priority || "medium",
                    assignedTo: config.assignedTo || "Team",
                    source: "automation",
                    workflowId: workflow.id,
                });
            }
            return { ok: true, action: "create_task" };
        }

        case "update_crm": {
            if (!phone) {
                return { ok: false, action: "update_crm", error: "No customer phone" };
            }
            const patch = {};
            if (config.tags) patch.tags = config.tags;
            if (config.status) patch.status = config.status;
            if (config.leadScore != null) patch.leadScore = config.leadScore;
            if (Object.keys(patch).length) {
                await updateCustomer(phone, patch);
            }
            return { ok: true, action: "update_crm", patch };
        }

        case "webhook": {
            const url = config.url || process.env.AUTOMATION_WEBHOOK_URL;
            if (!url) return { ok: false, action: "webhook", error: "No webhook URL" };
            try {
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ event, workflow, companyId }),
                });
                return { ok: res.ok, action: "webhook", status: res.status };
            } catch (err) {
                return { ok: false, action: "webhook", error: err.message };
            }
        }

        default:
            return { ok: false, action: type, error: `Unknown action type: ${type}` };
    }
}

function messageFromTemplate(template, event) {
    const templates = {
        quotation_followup:
            "Thanks for your interest! We'll prepare a quotation and send it shortly.",
        payment_reminder:
            "We noticed an issue with your payment. Please retry or contact us for assistance.",
        lead_followup:
            "Hi! We noticed you haven't been in touch recently. Can we still help you?",
    };
    return templates[template] || null;
}

/**
 * Run all actions for a workflow.
 * @param {object} workflow
 * @param {import('../events/eventTypes.js').ZiricEvent} event
 */
export async function executeWorkflowActions(workflow, event) {
    const actions = workflow.actions || [];
    const results = [];
    let allOk = true;

    for (const action of actions) {
        const result = await executeAction(action, event, workflow);
        results.push(result);
        if (!result.ok) allOk = false;
    }

    return { success: allOk, results };
}
