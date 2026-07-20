/**
 * Built-in workflow templates + tenant workflow registry.
 */
import { EventTypes } from "../events/eventTypes.js";
import { TenantRepository } from "../database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

const workflowsRepo = new TenantRepository(TENANT_COLLECTIONS.AUTOMATIONS);

/** Built-in templates seeded per tenant on first access */
export const BUILTIN_TEMPLATES = [
    {
        id: "tpl-pricing-quotation",
        name: "Pricing enquiry → Send quotation",
        builtin: true,
        status: "active",
        trigger: { eventType: EventTypes.MESSAGE_RECEIVED, match: { keywords: ["price", "pricing", "quote", "cost", "how much"] } },
        actions: [{ type: "send_message", config: { template: "quotation_followup" } }, { type: "send_notification", config: { title: "Quotation requested" } }],
    },
    {
        id: "tpl-appointment-notify",
        name: "Appointment booked → Notify staff",
        builtin: true,
        status: "active",
        trigger: { eventType: EventTypes.APPOINTMENT_BOOKED },
        actions: [{ type: "send_notification", config: { title: "New appointment booked", priority: "high" } }, { type: "assign_agent", config: { pool: "scheduling" } }],
    },
    {
        id: "tpl-payment-failed-reminder",
        name: "Payment failed → Send reminder",
        builtin: true,
        status: "active",
        trigger: { eventType: EventTypes.PAYMENT_FAILED },
        actions: [{ type: "send_message", config: { template: "payment_reminder" } }, { type: "create_task", config: { title: "Follow up failed payment", priority: "high" } }],
    },
    {
        id: "tpl-lead-inactive-followup",
        name: "Lead inactive 48h → Follow up",
        builtin: true,
        status: "active",
        trigger: { eventType: EventTypes.LEAD_INACTIVE, match: { inactiveHours: 48 } },
        actions: [{ type: "send_message", config: { template: "lead_followup" } }, { type: "create_task", config: { title: "Re-engage inactive lead" } }],
    },
    {
        id: "tpl-support-assign",
        name: "Support ticket → Assign agent",
        builtin: true,
        status: "active",
        trigger: { eventType: EventTypes.SUPPORT_TICKET_CREATED },
        actions: [{ type: "assign_agent", config: { pool: "support" } }, { type: "send_notification", config: { title: "New support ticket" } }],
    },
];

let seededCompanies = new Set();

async function ensureBuiltinWorkflows(companyId) {
    if (seededCompanies.has(companyId)) return;
    for (const tpl of BUILTIN_TEMPLATES) {
        const existing = await workflowsRepo.get(companyId, tpl.id);
        if (!existing) {
            await workflowsRepo.set(companyId, tpl.id, {
                ...tpl,
                companyId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                runs: 0,
                successCount: 0,
            });
        }
    }
    seededCompanies.add(companyId);
}

export async function listWorkflows(companyId) {
    await ensureBuiltinWorkflows(companyId);
    const items = await workflowsRepo.list(companyId, { max: 100 });
    return items.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function getWorkflow(companyId, workflowId) {
    await ensureBuiltinWorkflows(companyId);
    return workflowsRepo.get(companyId, workflowId);
}

export async function upsertWorkflow(companyId, workflowId, data) {
    const existing = workflowId ? await workflowsRepo.get(companyId, workflowId) : null;
    const id = workflowId || `wf-${Date.now()}`;
    const record = {
        ...(existing || {}),
        ...data,
        id,
        companyId,
        status: data.status || existing?.status || "active",
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
    };
    return workflowsRepo.set(companyId, id, record);
}

export async function incrementWorkflowStats(companyId, workflowId, success) {
    const wf = await getWorkflow(companyId, workflowId);
    if (!wf) return null;
    return workflowsRepo.set(companyId, workflowId, {
        runs: (wf.runs || 0) + 1,
        successCount: (wf.successCount || 0) + (success ? 1 : 0),
        lastRunAt: new Date().toISOString(),
    });
}

export { workflowsRepo };
