/**
 * REC-05 — sponsored candidate eligibility gates (REC-01 §8.1).
 */
import { VERIFICATION_STATES } from "../network/verificationService.js";
import { getOrgEntityByCompanyId } from "../network/networkIdentityService.js";
import { OFFERING_STATUS, OFFERING_VERIFICATION_STATUS } from "./offeringConstants.js";
import { getCampaignUsage } from "./campaignUsageService.js";
import { CAMPAIGN_STATUS } from "./campaignConstants.js";

/**
 * @param {{ campaign: object, offering: object, intent: object, location: object }} ctx
 * @returns {{ eligible: boolean, reason?: string }}
 */
export async function evaluateSponsoredEligibility(ctx) {
    const { campaign, offering, intent, location } = ctx;
    if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
        return { eligible: false, reason: "campaign_not_active" };
    }
    if (!campaign.offeringIds?.includes(offering.offeringId)) {
        return { eligible: false, reason: "offering_not_in_campaign" };
    }
    if (offering.status !== OFFERING_STATUS.ACTIVE || offering.verificationStatus !== OFFERING_VERIFICATION_STATUS.VERIFIED) {
        return { eligible: false, reason: "offering_not_verified" };
    }
    const entity = await getOrgEntityByCompanyId(campaign.companyId);
    if ((entity?.verification?.state || "unverified") !== VERIFICATION_STATES.VERIFIED) {
        return { eligible: false, reason: "org_not_verified" };
    }
    const usage = await getCampaignUsage(campaign.campaignId);
    if (!usage || usage.remainingPresentations <= 0) {
        return { eligible: false, reason: "allowance_exhausted" };
    }
    const categoryId = String(intent?.categoryId || "").toLowerCase();
    const targetCats = (campaign.targetCategoryIds || []).map((c) => String(c).toLowerCase());
    const offeringCats = (offering.categoryIds || []).map((c) => String(c).toLowerCase());
    const categoryOk =
        !categoryId ||
        targetCats.includes(categoryId) ||
        offeringCats.includes(categoryId) ||
        (targetCats.length === 0 && offeringCats.includes(categoryId));
    if (!categoryOk) {
        return { eligible: false, reason: "category_mismatch" };
    }
    const targetCity = String(campaign.targetGeo?.city || "").toLowerCase().trim();
    const reqCity = String(location?.city || "").toLowerCase().trim();
    if (targetCity && reqCity && targetCity !== reqCity) {
        return { eligible: false, reason: "geo_mismatch" };
    }
    return { eligible: true };
}