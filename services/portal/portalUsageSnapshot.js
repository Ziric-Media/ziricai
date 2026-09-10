/**
 * Production usage snapshot — recorded counts only, never plan-template seeds.
 */
import { getPlan } from "../platform/billingPlans.js";
import { getCurrentMetrics } from "../analytics/aggregatesStore.js";
import { getWorkspaceResourceCounts } from "./workspaceService.js";
import { getTenantBilling } from "../payments/billingService.js";

/**
 * Build honest usage meters for provisioned production tenants.
 * Uses analytics aggregates + workspace counts where available.
 * Fields without an authoritative source remain at zero.
 * @param {string} companyId
 * @param {string} [planId]
 */
export async function buildProductionUsageSnapshot(companyId, planId = "starter") {
    const plan = getPlan(planId);
    const limits = plan.limits;

    const [metrics, resources, billingRecord] = await Promise.all([
        getCurrentMetrics(companyId).catch(() => null),
        getWorkspaceResourceCounts(companyId).catch(() => null),
        getTenantBilling(companyId).catch(() => null),
    ]);

    const messagesUsed = (metrics?.messagesSent || 0) + (metrics?.messagesReceived || 0);

    return {
        companyId,
        plan: plan.id,
        planLabel: plan.label,
        amount: plan.price,
        currency: plan.currency,
        billingCycle: plan.billingCycle,
        trialDays: plan.trialDays || null,
        trialEndsAt: billingRecord?.trialEndsAt || null,
        renewalDate: billingRecord?.renewalDate || new Date().toISOString().slice(0, 10),
        messagesUsed,
        messagesLimit: limits.messages,
        tokensUsed: 0,
        tokensLimit: limits.tokens,
        storageUsedMb: 0,
        storageLimitMb: limits.storageMb,
        conversationsUsed: metrics?.conversations || 0,
        conversationsLimit: limits.conversations,
        aiEmployeesUsed: resources?.aiEmployees || 0,
        aiEmployeesLimit: limits.aiEmployees,
        usersUsed: resources?.team || 0,
        usersLimit: limits.users,
        knowledgeDocsUsed: resources?.knowledge || 0,
        knowledgeDocsLimit: limits.knowledgeDocs,
        knowledgeSizeMbUsed: 0,
        knowledgeSizeMbLimit: limits.knowledgeSizeMb,
        workflowRunsUsed: metrics?.automationRuns || 0,
        workflowRunsLimit: limits.workflowRuns,
        apiCallsUsed: 0,
        apiCallsLimit: limits.apiCalls,
        usageSource: "recorded",
    };
}
