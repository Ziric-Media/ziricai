/**
 * REC-09 — campaign checkout + mark paid (pilot-safe until Paystack company checkout).
 */
import { randomUUID } from "node:crypto";
import { getCatalogueSku } from "../revenue/catalogueService.js";
import { campaignsCol } from "./recommendationStore.js";
import { CAMPAIGN_APPROVAL_STATUS, CAMPAIGN_PAYMENT_STATUS, getRecCampaignPackage } from "./campaignConstants.js";
import { clientCampaign, getCampaign } from "./campaignService.js";

function strip(row) {
    const { __id, ...rest } = row;
    return rest;
}

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

export function isRecCampaignCheckoutEnabled() {
    const flag = String(process.env.RECOMMENDATIONS_CHECKOUT_ENABLED || "").toLowerCase();
    if (["1", "true", "yes"].includes(flag)) return true;
    const mode = String(process.env.RS09_REC_CHECKOUT || "").toLowerCase();
    return mode === "pilot" || mode === "enabled";
}

export function recCampaignCheckoutMode() {
    const mode = String(process.env.RS09_REC_CHECKOUT || "disabled").toLowerCase();
    if (mode === "pilot") return "pilot";
    if (isRecCampaignCheckoutEnabled()) return "standard";
    return "disabled";
}

/**
 * @param {string} companyId
 * @param {string} campaignId
 */
export async function startRecCampaignCheckout(companyId, campaignId) {
    const mode = recCampaignCheckoutMode();
    if (mode === "disabled") {
        throw err(503, "CHECKOUT_DISABLED", "Sarah Recommendations checkout is not enabled (REC-09 / PAY-02).");
    }
    const raw = await campaignsCol.get(campaignId);
    if (!raw || raw.companyId !== companyId) throw err(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    const cur = strip(raw);
    if (cur.approvalStatus !== CAMPAIGN_APPROVAL_STATUS.APPROVED) {
        throw err(409, "CAMPAIGN_NOT_APPROVED", "Campaign must be approved before payment.");
    }
    if (cur.paymentStatus === CAMPAIGN_PAYMENT_STATUS.PAID) {
        throw err(409, "ALREADY_PAID", "This campaign is already paid for the current period.");
    }
    const pkg = getRecCampaignPackage(cur.packageSkuId);
    const sku = getCatalogueSku(cur.packageSkuId);
    if (!pkg || !sku) throw err(422, "PACKAGE_INVALID", "Unknown campaign package SKU.");
    const reference = `rs09_${campaignId}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const now = new Date().toISOString();
    const next = {
        ...cur,
        paymentStatus: CAMPAIGN_PAYMENT_STATUS.PENDING,
        paymentReference: reference,
        paymentCheckoutStartedAt: now,
        updatedAt: now,
    };
    await campaignsCol.put(campaignId, next, { merge: false });
    return {
        mode,
        reference,
        skuId: cur.packageSkuId,
        packageName: cur.packageName || pkg.name,
        amountCents: sku.amountCents,
        currency: sku.currency || "ZAR",
        billingPeriod: sku.billingPeriod || "monthly",
        monthlyAllowance: cur.monthlyAllowance,
        instructions:
            mode === "pilot"
                ? "Pilot billing: complete payment with Ziricai, then confirm in the Company Portal."
                : "Complete payment when company checkout is wired (Paystack). Use pilot mode until PAY-02.",
        campaign: clientCampaign(next),
    };
}

/**
 * @param {string} companyId
 * @param {string} campaignId
 * @param {{ reference?: string, pilotAcknowledged?: boolean, actorUid?: string|null }} body
 */
export async function confirmRecCampaignCheckout(companyId, campaignId, body = {}) {
    const mode = recCampaignCheckoutMode();
    if (mode !== "pilot") {
        throw err(503, "PILOT_CONFIRM_ONLY", "Payment confirmation is only available in RS09 pilot checkout mode.");
    }
    if (!body.pilotAcknowledged) {
        throw err(422, "ACK_REQUIRED", "pilotAcknowledged must be true to record pilot payment.");
    }
    const raw = await campaignsCol.get(campaignId);
    if (!raw || raw.companyId !== companyId) throw err(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    const cur = strip(raw);
    const ref = String(body.reference || cur.paymentReference || "").trim();
    if (!ref) throw err(422, "REFERENCE_REQUIRED", "Checkout reference is required.");
    if (cur.paymentReference && cur.paymentReference !== ref) {
        throw err(409, "REFERENCE_MISMATCH", "Payment reference does not match this checkout session.");
    }
    return markCampaignPaid(companyId, campaignId, {
        reference: ref,
        method: "pilot_acknowledgement",
        actorUid: body.actorUid || null,
    });
}

/**
 * @param {string} companyId
 * @param {string} campaignId
 * @param {{ reference: string, method?: string, actorUid?: string|null }} meta
 */
export async function markCampaignPaid(companyId, campaignId, meta) {
    const raw = await campaignsCol.get(campaignId);
    if (!raw || raw.companyId !== companyId) throw err(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    const cur = strip(raw);
    if (cur.approvalStatus !== CAMPAIGN_APPROVAL_STATUS.APPROVED) {
        throw err(409, "CAMPAIGN_NOT_APPROVED", "Campaign must be approved before marking paid.");
    }
    const now = new Date().toISOString();
    const next = {
        ...cur,
        paymentStatus: CAMPAIGN_PAYMENT_STATUS.PAID,
        paymentReference: String(meta.reference || cur.paymentReference || "").trim() || null,
        paymentMethod: String(meta.method || "manual").trim(),
        paidAt: now,
        paidBy: meta.actorUid || null,
        updatedAt: now,
    };
    await campaignsCol.put(campaignId, next, { merge: false });
    return { campaign: clientCampaign(next) };
}

/** @param {string} companyId @param {string} campaignId */
export async function getRecCampaignCheckoutStatus(companyId, campaignId) {
    const campaign = await getCampaign(companyId, campaignId);
    if (!campaign) throw err(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    const sku = getCatalogueSku(campaign.packageSkuId);
    return {
        checkoutEnabled: isRecCampaignCheckoutEnabled(),
        checkoutMode: recCampaignCheckoutMode(),
        campaign,
        sku: sku
            ? {
                  skuId: sku.skuId,
                  amountCents: sku.amountCents,
                  currency: sku.currency,
                  name: sku.name,
              }
            : null,
    };
}