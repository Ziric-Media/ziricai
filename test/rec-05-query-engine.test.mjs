/**
 * REC-05 — recommendations query engine.
 */
process.env.STORAGE_BACKEND = "memory";
process.env.RECOMMENDATIONS_ENGINE_ENABLED = "true";

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
import { queryRecommendations } from "../services/recommendations/queryService.js";

const PROD = { id: "acme-rec-05", name: "Acme Rec5", settings: { tenantClass: "production_customer" } };
const deps = { getCompany: async (id) => (id === PROD.id ? PROD : null) };

function reset() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    clearVerificationCasesForTests();
    clearRecommendationStoreForTests();
    process.env.RECOMMENDATIONS_PILOT_COMPANY_IDS = PROD.id;
    process.env.RECOMMENDATIONS_ENGINE_ENABLED = "true";
}

async function activeSponsoredOffering() {
    await saveListingDraft(
        PROD.id,
        {
            displayName: "Acme Educare Services",
            industry: "School",
            shortDescription: "School admissions support in Rustenburg.",
            location: "Rustenburg, South Africa",
            legalName: "Acme Rec5 (Pty) Ltd",
            registrationNumber: "2021/777777/07",
        },
        "owner-1",
        deps
    );
    await publishListing(PROD.id, "owner-1", deps);
    const orgCase = await submitVerification(PROD.id, "owner-1");
    await decideVerification(orgCase.caseId, { action: "verify", note: "ok", checks: ["legal_name_matches_registry"] }, "mc-1");
    const offering = await createOffering(PROD.id, {
        displayName: "Primary school admissions",
        description: "Help with Rustenburg primary school applications.",
        categoryIds: ["education"],
    });
    const oc = await submitOfferingVerification(PROD.id, offering.offeringId, "owner-1");
    await decideOfferingVerification(
        oc.caseId,
        { action: "verify", note: "ok", checks: ["supplier_authority_confirmed", "offering_description_accurate", "category_eligible"] },
        "mc-1"
    );
    const camp = await createCampaign(PROD.id, {
        name: "Education pilot",
        packageSkuId: "rs09.rec.starter.zar.monthly",
        offeringIds: [offering.offeringId],
        targetCategoryIds: ["education"],
        targetGeo: { city: "Rustenburg", country: "ZA" },
    });
    await submitCampaignForApproval(PROD.id, camp.campaignId, "owner-1");
    await decideCampaignApproval(camp.campaignId, { action: "approve", note: "pilot" }, "mc-2");
    await activateCampaign(PROD.id, camp.campaignId, "owner-1");
    return offering;
}

test("query returns organic and eligible sponsored with disclosure metadata", async () => {
    reset();
    await activeSponsoredOffering();
    const result = await queryRecommendations(
        {
            intent: { categoryId: "education", queryText: "school Rustenburg" },
            location: { city: "Rustenburg", country: "ZA" },
            surface: "personal_sarah",
            limit: 5,
        },
        { consumerUid: "consumer-1" }
    );
    assert.ok(result.requestId);
    assert.ok(result.organic.length >= 1);
    assert.ok(result.sponsored.length >= 1);
    assert.equal(result.sponsored[0].sponsored, true);
    assert.equal(result.sponsored[0].disclosureLabel, "Sponsored Recommendation");
    assert.ok(result.sponsored[0].campaignId);
    assert.ok(result.meta.sponsoredEligible >= 1);
});

test("query disabled when engine flag off", async () => {
    reset();
    process.env.RECOMMENDATIONS_ENGINE_ENABLED = "false";
    await assert.rejects(
        () =>
            queryRecommendations(
                { intent: { categoryId: "education" }, location: {} },
                { consumerUid: "c1" }
            ),
        { code: "RECOMMENDATIONS_ENGINE_DISABLED" }
    );
});