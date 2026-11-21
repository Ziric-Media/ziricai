/**
 * REC-04 — recommendation campaigns.
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import test from "node:test";
import { clearBusinessDirectoryForTests, setBusinessDirectoryStoreForTests } from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests } from "../services/network/networkIdentityService.js";
import { clearRecommendationStoreForTests } from "../services/recommendations/recommendationStore.js";
import { publishListing, saveListingDraft } from "../services/network/networkProfileService.js";
import { submitVerification, decideVerification, clearVerificationCasesForTests } from "../services/network/verificationService.js";
import { createOffering } from "../services/recommendations/offeringService.js";
import { submitOfferingVerification, decideOfferingVerification } from "../services/recommendations/offeringVerificationService.js";
import {
    createCampaign,
    submitCampaignForApproval,
    decideCampaignApproval,
    activateCampaign,
} from "../services/recommendations/campaignService.js";

const PROD = { id: "acme-rec-04", name: "Acme Rec4", settings: { tenantClass: "production_customer" } };
const deps = { getCompany: async (id) => (id === PROD.id ? PROD : null) };

function reset() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    clearVerificationCasesForTests();
    clearRecommendationStoreForTests();
    delete process.env.RECOMMENDATIONS_PILOT_COMPANY_IDS;
    delete process.env.RECOMMENDATIONS_ENGINE_ENABLED;
}

async function verifiedOffering() {
    await saveListingDraft(
        PROD.id,
        {
            displayName: "Acme Rec4",
            industry: "Education",
            shortDescription: "School services.",
            location: "Rustenburg",
            legalName: "Acme Rec4 (Pty) Ltd",
            registrationNumber: "2021/888888/07",
        },
        "owner-1",
        deps
    );
    await publishListing(PROD.id, "owner-1", deps);
    const orgCase = await submitVerification(PROD.id, "owner-1");
    await decideVerification(orgCase.caseId, { action: "verify", note: "ok", checks: ["legal_name_matches_registry"] }, "mc-1");
    const offering = await createOffering(PROD.id, {
        displayName: "Admissions",
        description: "Enrolment help",
        categoryIds: ["education"],
    });
    const oc = await submitOfferingVerification(PROD.id, offering.offeringId, "owner-1");
    await decideOfferingVerification(
        oc.caseId,
        { action: "verify", note: "ok", checks: ["supplier_authority_confirmed", "offering_description_accurate", "category_eligible"] },
        "mc-1"
    );
    return offering.offeringId;
}

test("campaign draft → approval → pilot activate with usage period", async () => {
    reset();
    process.env.RECOMMENDATIONS_PILOT_COMPANY_IDS = PROD.id;
    const offeringId = await verifiedOffering();
    const campaign = await createCampaign(PROD.id, {
        name: "Rustenburg schools",
        packageSkuId: "rs09.rec.starter.zar.monthly",
        offeringIds: [offeringId],
        targetCategoryIds: ["education"],
        targetGeo: { city: "Rustenburg", country: "ZA" },
    });
    assert.equal(campaign.monthlyAllowance, 30);
    assert.equal(campaign.status, "draft");

    const submitted = await submitCampaignForApproval(PROD.id, campaign.campaignId, "owner-1");
    assert.equal(submitted.status, "pending_approval");

    const approved = await decideCampaignApproval(
        campaign.campaignId,
        { action: "approve", note: "Pilot campaign ok" },
        "mc-2"
    );
    assert.equal(approved.status, "approved");

    const active = await activateCampaign(PROD.id, campaign.campaignId, "owner-1");
    assert.equal(active.campaign.status, "active");
    assert.equal(active.usage.remainingPresentations, 30);
});