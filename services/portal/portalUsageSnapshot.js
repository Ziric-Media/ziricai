/**
 * Production usage snapshot — recorded counts only, never plan-template seeds.
 */
import { getPlan } from "../platform/billingPlans.js";
import { getCurrentMetrics } from "../analytics/aggregatesStore.js";
import { getWorkspaceResourceCounts } from "./workspaceService.js";
import { getTenantBilling } from "../payments/billingService.js";
import { getDailyAggregates } from "../analytics/aggregatesStore.js";

/**
 * Build honest usage meters for provisioned production tenants.
 * Uses analytics aggregates + workspace counts where available.
 * Fields without an authoritative source remain at zero.
 * @param {string} companyId
 * @param {string} [planId]
 */
export async function buildProductionUsageSnapshot(companyId, planId = "starter") {
    const [metrics, resources, billingRecord] = await Promise.all([
        getCurrentMetrics(companyId).catch(() => null),
        getWorkspaceResourceCounts(companyId).catch(() => null),
        getTenantBilling(companyId).catch(() => null),
    ]);

    const resolvedPlanId = billingRecord?.planId || planId || "starter";
    const plan = getPlan(resolvedPlanId);
    const limits = plan.limits;

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
        renewalDate:
            billingRecord?.renewalDate ||
            billingRecord?.usage?.renewalDate ||
            new Date().toISOString().slice(0, 10),
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

/**
 * Daily message totals for the current calendar month (from analytics rollups).
 * @param {string} companyId
 */
export async function buildRecordedUsageChartSeries(companyId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const currentDay = now.getDate();

    const lookback = Math.max(currentDay, 7);
    const rows = await getDailyAggregates(companyId, lookback).catch(() => []);
    const byDate = new Map(rows.map((r) => [r.date, r]));

    const labels = [];
    const messages = [];
    const tokens = [];

    for (let day = 1; day <= currentDay; day += 1) {
        const dateKey = `${monthPrefix}-${String(day).padStart(2, "0")}`;
        const row = byDate.get(dateKey);
        const msg = (row?.messagesSent || 0) + (row?.messagesReceived || 0);
        labels.push(String(day));
        messages.push(msg);
        tokens.push(0);
    }

    return {
        labels,
        messages,
        tokens,
        month: month + 1,
        monthLabel: now.toLocaleString("en-US", { month: "long" }),
        year,
        currentDay,
        daysInMonth,
    };
}
