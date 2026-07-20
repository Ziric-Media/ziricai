/**
 * Billing and subscription facade — wraps billingPlans scaffold.
 */
import {
    getAllPlans,
    getPlan,
    checkPlanLimit,
    buildUsageFromPlan,
    BILLING_PLANS,
} from "../platform/billingPlans.js";
import { hashSeed } from "../platform/platformRegistry.js";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

class BillingService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.BILLING);
    }

    async getTenantBilling(companyId) {
        const records = await this.list(companyId, { max: 1 });
        return records[0] || null;
    }

    async upsertTenantBilling(companyId, data) {
        const existing = await this.getTenantBilling(companyId);
        if (existing?.id) {
            return this.update(companyId, existing.id, data);
        }
        return this.create(companyId, data, companyId);
    }
}

const billingRepo = new BillingService();

export { getAllPlans, getPlan, checkPlanLimit, BILLING_PLANS };

export async function getTenantBilling(companyId) {
    return billingRepo.getTenantBilling(companyId);
}

export async function getCompanyPlan(companyId) {
    const record = await billingRepo.getTenantBilling(companyId);
    return record?.planId ? getPlan(record.planId) : getPlan("starter");
}

export async function checkCompanyLimit(companyId, resource, usage, increment = 1) {
    const record = await billingRepo.getTenantBilling(companyId);
    const planId = record?.planId || "starter";
    return checkPlanLimit(planId, resource, Number(usage) || 0, Number(increment) || 1);
}

export async function saveBillingRecord(companyId, data) {
    const planId = data.planId || data.plan || "starter";
    const usage = data.usage || buildUsageFromPlan(planId, hashSeed(companyId));
    const payload = {
        planId,
        status: data.status || (planId === "trial" ? "trialing" : "active"),
        trialEndsAt: data.trialEndsAt || usage.trialEndsAt || null,
        renewalDate: data.renewalDate || usage.renewalDate || null,
        usage,
        provisionedAt: data.provisionedAt || new Date().toISOString(),
        ...data,
    };
    return billingRepo.upsertTenantBilling(companyId, payload);
}

export async function createTrialSubscription(companyId, options = {}) {
    const planId = options.planId || "trial";
    const usage = buildUsageFromPlan(planId, hashSeed(companyId));
    return saveBillingRecord(companyId, {
        planId,
        status: planId === "trial" ? "trialing" : "active",
        trialEndsAt: usage.trialEndsAt,
        renewalDate: usage.renewalDate,
        usage,
    });
}
