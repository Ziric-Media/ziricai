/**
 * REC-04 — campaign packages (pilot planning tariffs) and statuses.
 */

export const CAMPAIGN_STATUS = Object.freeze({
    DRAFT: "draft",
    SUBMITTED: "submitted",
    PENDING_APPROVAL: "pending_approval",
    APPROVED: "approved",
    SCHEDULED: "scheduled",
    ACTIVE: "active",
    PAUSED: "paused",
    EXHAUSTED: "exhausted",
    EXPIRED: "expired",
    REJECTED: "rejected",
    SUSPENDED: "suspended",
    CANCELLED: "cancelled",
});

export const CAMPAIGN_APPROVAL_STATUS = Object.freeze({
    DRAFT: "draft",
    PENDING: "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
});

export const CAMPAIGN_PAYMENT_STATUS = Object.freeze({
    UNPAID: "unpaid",
    PENDING: "pending",
    PAID: "paid",
    FAILED: "failed",
});

/** @type {Record<string, { name: string, monthlyAllowance: number, maxOfferings: number, amountCents: number }>} */
export const REC_CAMPAIGN_PACKAGES = Object.freeze({
    "rs09.rec.starter.zar.monthly": {
        name: "Starter",
        monthlyAllowance: 30,
        maxOfferings: 1,
        amountCents: 75000,
    },
    "rs09.rec.growth.zar.monthly": {
        name: "Growth",
        monthlyAllowance: 75,
        maxOfferings: 5,
        amountCents: 150000,
    },
    "rs09.rec.professional.zar.monthly": {
        name: "Professional",
        monthlyAllowance: 180,
        maxOfferings: 50,
        amountCents: 300000,
    },
});

export function getRecCampaignPackage(skuId) {
    const key = String(skuId || "").trim();
    return REC_CAMPAIGN_PACKAGES[key] || null;
}

export function billingPeriodKey(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}