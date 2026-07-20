/**
 * Execute automation actions — notification, message, assign, task, webhook.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { addTask, updateCustomer } from "../customerService.js";
import { sendMessage as integrationSend } from "../integrations/integrationHub.js";
import { sendNotification } from "../tenants/notificationService.js";
import { createTask } from "../tenants/taskService.js";

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
            const text =
                config.text ||
                messageFromTemplate(config.template, event) ||
                "Thank you for contacting us. A team member will follow up shortly.";
            try {
                await integrationSend(channel, { companyId }, { to: phone, text });
                return { ok: true, action: "send_message", text: text.slice(0, 80) };
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
