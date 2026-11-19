/**
 * REC-04 — recommendation campaigns (tenant + platform approval).
 */
import { randomUUID } from "node:crypto";
import { recordNetworkAdminAction } from "../network/networkAdminAudit.js";
import { normalizeOfferingCategories } from "./offeringConstants.js";
import { OFFERING_STATUS, OFFERING_VERIFICATION_STATUS } from "./offeringConstants.js";
import { getOffering, listOfferingsForCompany } from "./offeringService.js";
import { campaignsCol } from "./recommendationStore.js";
import {
    CAMPAIGN_STATUS,
    CAMPAIGN_APPROVAL_STATUS,
    CAMPAIGN_PAYMENT_STATUS,
    getRecCampaignPackage,
} from "./campaignConstants.js";
import { ensureCampaignUsagePeriod, getCampaignUsage } from "./campaignUsageService.js";
import { isRecommendationsEngineEnabled } from "./recommendationConfig.js";

function strip(row) {
    const { __id, ...rest } = row;
    return rest;
}

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function pilotCompanyIds() {
    const raw = String(process.env.RECOMMENDATIONS_PILOT_COMPANY_IDS || "").trim();
    if (!raw) return new Set();
    return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function clientCampaign(row) {
    if (!row) return null;
    const c = strip(row);
    return {
        campaignId: c.campaignId,
        companyId: c.companyId,
        name: c.name,
        packageSkuId: c.packageSkuId,
        packageName: c.packageName,
        offeringIds: c.offeringIds || [],
        targetCategoryIds: c.targetCategoryIds || [],
        targetGeo: c.targetGeo || {},
        status: c.status,
        approvalStatus: c.approvalStatus,
        paymentStatus: c.paymentStatus,
        monthlyAllowance: c.monthlyAllowance,
        periodStart: c.periodStart || null,
        periodEnd: c.periodEnd || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
    };
}

export async function listCampaignsForCompany(companyId, { limit = 50 } = {}) {
    const rows = (await campaignsCol.list({ where: [["companyId", "==", companyId]], limit: 200 })).map(strip);
    return rows
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, limit)
        .map(clientCampaign);
}

export async function getCampaign(companyId, campaignId) {
    const raw = await campaignsCol.get(campaignId);
    if (!raw || raw.companyId !== companyId) return null;
    return clientCampaign(raw);
}

async function assertVerifiedOfferings(companyId, offeringIds, maxOfferings) {
    if (!offeringIds.length) throw err(422, "OFFERINGS_REQUIRED", "Select at least one verified offering.");
    if (offeringIds.length > maxOfferings) {
        throw err(422, "OFFERING_LIMIT", `This package allows at most ${maxOfferings} offering(s).`);
    }
    for (const oid of offeringIds) {
        const o = await getOffering(companyId, oid);
        if (!o) throw err(404, "OFFERING_NOT_FOUND", `Offering ${oid} not found.`);
        if (o.verificationStatus !== OFFERING_VERIFICATION_STATUS.VERIFIED || o.status !== OFFERING_STATUS.ACTIVE) {
            throw err(422, "OFFERING_NOT_ELIGIBLE", `Offering ${o.displayName} must be verified and active.`);
        }
    }
}

/**
 * @param {string} companyId
 * @param {object} patch
 */
export async function createCampaign(companyId, patch, actorUid = null) {
    const name = String(patch.name || "").trim();
    if (!name || name.length > 120) throw err(422, "CAMPAIGN_INVALID", "Campaign name is required (max 120).");
    const packageSkuId = String(patch.packageSkuId || "").trim();
    const pkg = getRecCampaignPackage(packageSkuId);
    if (!pkg) throw err(422, "PACKAGE_INVALID", "Unknown recommendations package.");
    const offeringIds = [...new Set((Array.isArray(patch.offeringIds) ? patch.offeringIds : []).map(String))];
    await assertVerifiedOfferings(companyId, offeringIds, pkg.maxOfferings);
    const targetCategoryIds = normalizeOfferingCategories(patch.targetCategoryIds || []);
    const targetGeo =
        patch.targetGeo && typeof patch.targetGeo === "object" && !Array.isArray(patch.targetGeo) ? patch.targetGeo : {};
    const now = new Date().toISOString();
    const campaignId = `rec_camp_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    const row = {
        campaignId,
        companyId,
        name,
        packageSkuId,
        packageName: pkg.name,
        offeringIds,
        targetCategoryIds,
        targetGeo,
        status: CAMPAIGN_STATUS.DRAFT,
        approvalStatus: CAMPAIGN_APPROVAL_STATUS.DRAFT,
        paymentStatus: CAMPAIGN_PAYMENT_STATUS.UNPAID,
        monthlyAllowance: pkg.monthlyAllowance,
        periodStart: null,
        periodEnd: null,
        createdBy: actorUid,
        createdAt: now,
        updatedAt: now,
    };
    await campaignsCol.put(campaignId, row, { merge: false });
    return clientCampaign(row);
}

export async function updateCampaign(companyId, campaignId, patch, actorUid = null) {
    const raw = await campaignsCol.get(campaignId);
    if (!raw || raw.companyId !== companyId) throw err(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    const cur = strip(raw);
    if (cur.status !== CAMPAIGN_STATUS.DRAFT) {
        throw err(409, "CAMPAIGN_NOT_EDITABLE", "Only draft campaigns can be edited.");
    }
    const pkg = getRecCampaignPackage(cur.packageSkuId);
    const now = new Date().toISOString();
    const next = { ...cur, updatedAt: now, updatedBy: actorUid };
    if (patch.name != null) {
        const name = String(patch.name).trim();
        if (!name) throw err(422, "CAMPAIGN_INVALID", "Name required.");
        next.name = name;
    }
    if (patch.offeringIds != null) {
        const offeringIds = [...new Set(patch.offeringIds.map(String))];
        await assertVerifiedOfferings(companyId, offeringIds, pkg.maxOfferings);
        next.offeringIds = offeringIds;
    }
    if (patch.targetCategoryIds != null) next.targetCategoryIds = normalizeOfferingCategories(patch.targetCategoryIds);
    if (patch.targetGeo != null) {
        if (typeof patch.targetGeo !== "object" || Array.isArray(patch.targetGeo)) {
            throw err(422, "CAMPAIGN_INVALID", "targetGeo must be an object.");
        }
        next.targetGeo = patch.targetGeo;
    }
    await campaignsCol.put(campaignId, next, { merge: false });
    return clientCampaign(next);
}

export async function submitCampaignForApproval(companyId, campaignId, actorUid = null) {
    const raw = await campaignsCol.get(campaignId);
    if (!raw || raw.companyId !== companyId) throw err(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    const cur = strip(raw);
    if (cur.status !== CAMPAIGN_STATUS.DRAFT) throw err(409, "CAMPAIGN_STATE_INVALID", "Only draft campaigns can be submitted.");
    const now = new Date().toISOString();
    const next = {
        ...cur,
        status: CAMPAIGN_STATUS.PENDING_APPROVAL,
        approvalStatus: CAMPAIGN_APPROVAL_STATUS.PENDING,
        submittedAt: now,
        submittedBy: actorUid,
        updatedAt: now,
    };
    await campaignsCol.put(campaignId, next, { merge: false });
    return clientCampaign(next);
}

/** @param {{ status?: string, limit?: number }} [opts] */
export async function listCampaignApprovalQueue({ status, limit = 100 } = {}) {
    const st = status || CAMPAIGN_STATUS.PENDING_APPROVAL;
    const rows = (await campaignsCol.list({ where: [["status", "==", st]], limit: 300 })).map(strip);
    return rows.sort((a, b) => String(a.submittedAt || a.createdAt).localeCompare(String(b.submittedAt || b.createdAt))).slice(0, limit);
}

export async function getCampaignById(campaignId) {
    const raw = await campaignsCol.get(campaignId);
    return raw ? strip(raw) : null;
}

export async function decideCampaignApproval(campaignId, decision, actor) {
    const action = String(decision?.action || "").trim();
    const raw = await campaignsCol.get(campaignId);
    if (!raw) throw err(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    const cur = strip(raw);
    if (cur.status !== CAMPAIGN_STATUS.PENDING_APPROVAL) {
        throw err(409, "CAMPAIGN_STATE_INVALID", "Campaign is not pending approval.");
    }
    const note = String(decision?.note || "").trim();
    const now = new Date().toISOString();
    let next;
    if (action === "approve") {
        if (!note) throw err(422, "NOTE_REQUIRED", "Approval note is required.");
        next = {
            ...cur,
            status: CAMPAIGN_STATUS.APPROVED,
            approvalStatus: CAMPAIGN_APPROVAL_STATUS.APPROVED,
            approvedAt: now,
            approvedBy: actor,
            decisionNote: note,
            updatedAt: now,
        };
    } else if (action === "reject") {
        if (!note) throw err(422, "NOTE_REQUIRED", "Rejection note is required.");
        next = {
            ...cur,
            status: CAMPAIGN_STATUS.REJECTED,
            approvalStatus: CAMPAIGN_APPROVAL_STATUS.REJECTED,
            decisionNote: note,
            updatedAt: now,
        };
    } else {
        throw err(400, "CAMPAIGN_ACTION_INVALID", "Use action approve or reject.");
    }
    await campaignsCol.put(campaignId, next, { merge: false });
    await recordNetworkAdminAction({
        actor,
        action: `recommendation.campaign.${action}`,
        companyId: cur.companyId,
        detail: { campaignId, note },
    });
    return clientCampaign(next);
}

/**
 * Activate approved campaign (pilot: unpaid allowed for RECOMMENDATIONS_PILOT_COMPANY_IDS).
 */
export async function activateCampaign(companyId, campaignId, actorUid = null) {
    const raw = await campaignsCol.get(campaignId);
    if (!raw || raw.companyId !== companyId) throw err(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    const cur = strip(raw);
    if (cur.status !== CAMPAIGN_STATUS.APPROVED && cur.status !== CAMPAIGN_STATUS.PAUSED) {
        throw err(409, "CAMPAIGN_STATE_INVALID", "Campaign must be approved or paused to activate.");
    }
    const pilot = pilotCompanyIds();
    const paid = cur.paymentStatus === CAMPAIGN_PAYMENT_STATUS.PAID;
    if (!paid && !pilot.has(companyId)) {
        throw err(402, "PAYMENT_REQUIRED", "Campaign payment is required before activation (REC-09).");
    }
    if (!isRecommendationsEngineEnabled() && !pilot.has(companyId)) {
        throw err(503, "ENGINE_DISABLED", "Recommendations engine is not enabled for this tenant.");
    }
    const now = new Date().toISOString();
    const next = {
        ...cur,
        status: CAMPAIGN_STATUS.ACTIVE,
        periodStart: cur.periodStart || now,
        periodEnd: cur.periodEnd || null,
        activatedAt: now,
        activatedBy: actorUid,
        updatedAt: now,
    };
    await campaignsCol.put(campaignId, next, { merge: false });
    await ensureCampaignUsagePeriod(campaignId, cur.monthlyAllowance);
    return { campaign: clientCampaign(next), usage: await getCampaignUsage(campaignId) };
}

export async function getCampaignWithUsage(companyId, campaignId) {
    const campaign = await getCampaign(companyId, campaignId);
    if (!campaign) return null;
    const usage = await getCampaignUsage(campaignId);
    return { campaign, usage };
}

export function listRecCampaignPackages() {
    return Object.entries(REC_CAMPAIGN_PACKAGES).map(([skuId, p]) => ({ skuId, ...p }));
}