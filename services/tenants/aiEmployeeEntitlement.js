/**
 * AI Employee plan limits and workspace channel truth (server-side).
 */
import { listAiEmployees } from "./aiEmployeeService.js";
import { getTenantBilling } from "../payments/billingService.js";
import { checkPlanLimit, getPlan } from "../platform/billingPlans.js";
import { getWhatsAppIntegration } from "./integrationService.js";
import { assessRuntimeReadiness } from "./platformWhatsAppIntegrationService.js";

/**
 * @param {string} companyId
 * @param {string} [planIdFallback]
 */
export async function getAiEmployeeUsage(companyId, planIdFallback = "starter") {
    const agents = await listAiEmployees(companyId);
    const billing = await getTenantBilling(companyId).catch(() => null);
    const planId = billing?.planId || planIdFallback || "starter";
    const plan = getPlan(planId);
    const check = checkPlanLimit(planId, "aiEmployees", agents.length, 1);

    return {
        count: agents.length,
        planId,
        planLabel: plan.label,
        limit: check.limit,
        allowed: check.allowed,
        remaining: check.remaining,
        unlimited: check.unlimited,
        agentNames: agents.map((a) => a.name).filter(Boolean),
    };
}

/**
 * @param {string} companyId
 * @param {string} [planIdFallback]
 */
export async function assertAiEmployeeCreationAllowed(companyId, planIdFallback = "starter") {
    const usage = await getAiEmployeeUsage(companyId, planIdFallback);
    if (usage.allowed) {
        return { allowed: true, usage };
    }

    const names =
        usage.agentNames.length > 0
            ? ` You currently have: ${usage.agentNames.join(", ")}.`
            : "";

    const message =
        `You've reached your ${usage.planLabel} plan limit of ${usage.limit} AI Employee` +
        `${usage.limit === 1 ? "" : "s"} (${usage.count}/${usage.limit}).${names} ` +
        `To create another AI Employee, upgrade your plan in Billing.`;

    return {
        allowed: false,
        errorCode: "AI_EMPLOYEE_LIMIT_REACHED",
        message,
        userFacingTruth: message,
        usage,
    };
}

export async function getWorkspaceWhatsAppChannelState(companyId) {
    const raw = await getWhatsAppIntegration(companyId).catch(() => null);
    if (!raw) {
        return { connected: false, runtimeReady: false, status: "not_configured" };
    }
    const { runtimeReady, missing } = assessRuntimeReadiness(raw);
    return {
        connected: runtimeReady,
        runtimeReady,
        status: raw.status || "unknown",
        missing: missing || [],
    };
}

/**
 * Operational truth for Sarah / portal parity with AI Employees UI.
 */
export function describeEmployeeOperationalState(employee, whatsappState) {
    if (!employee) return null;

    const prefersWhatsApp = employee.channels?.whatsapp !== false;
    const receivingWhatsApp = Boolean(whatsappState?.connected && prefersWhatsApp);

    return {
        name: employee.name,
        role: employee.roleLabel || employee.role,
        status: employee.status || "active",
        knowledgeBaseId: employee.knowledgeBaseId || null,
        channels: {
            whatsapp: {
                workspaceConnected: Boolean(whatsappState?.connected),
                employeeConfiguredForWhatsApp: prefersWhatsApp,
                receivingWhatsAppConversations: receivingWhatsApp,
            },
        },
    };
}
