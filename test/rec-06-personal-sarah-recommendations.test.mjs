/**
 * REC-06 — Personal Sarah recommendation tools.
 */
process.env.STORAGE_BACKEND = "memory";
process.env.RECOMMENDATIONS_ENGINE_ENABLED = "true";

import assert from "node:assert/strict";
import test from "node:test";
import { PERSONAL_SARAH_TOOL_DEFINITIONS } from "../services/sarah/personal/personalSarahTools.js";
import {
    executePersonalSarahRecommendationTool,
} from "../services/sarah/personal/personalSarahRecommendationTools.js";
import { clearRecommendationStoreForTests } from "../services/recommendations/recommendationStore.js";
import { clearBusinessDirectoryForTests, setBusinessDirectoryStoreForTests } from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests } from "../services/network/networkIdentityService.js";
import { clearVerificationCasesForTests } from "../services/network/verificationService.js";
import { publishListing, saveListingDraft } from "../services/network/networkProfileService.js";
import { submitVerification, decideVerification } from "../services/network/verificationService.js";
import { createOffering } from "../services/recommendations/offeringService.js";
import { submitOfferingVerification, decideOfferingVerification } from "../services/recommendations/offeringVerificationService.js";
import {
    createCampaign,
    submitCampaignForApproval,
    decideCampaignApproval,
    activateCampaign,
} from "../services/recommendations/campaignService.js";
import { getCampaignUsage } from "../services/recommendations/campaignUsageService.js";

const PROD = { id: "acme-rec-06", name: "Acme Rec6", settings: { tenantClass: "production_customer" } };
const deps = { getCompany: async (id) => (id === PROD.id ? PROD : null) };
const ctx = { uid: "u-rec-06", city: "Rustenburg", country: "ZA", consumerProfile: { city: "Rustenburg" } };

function reset() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    clearVerificationCasesForTests();
    clearRecommendationStoreForTests();
    process.env.RECOMMENDATIONS_PILOT_COMPANY_IDS = PROD.id;
    process.env.RECOMMENDATIONS_ENGINE_ENABLED = "true";
}

async function seedActiveCampaign() {
    await saveListingDraft(
        PROD.id,
        {
            displayName: "Acme Edu",
            industry: "School",
            shortDescription: "Rustenburg education services",
            location: "Rustenburg",
            legalName: "Acme Rec6 (Pty) Ltd",
            registrationNumber: "2021/666666/07",
        },
        "o",
        deps
    );
    await publishListing(PROD.id, "o", deps);
    const orgCase = await submitVerification(PROD.id, "o");
    await decideVerification(orgCase.caseId, { action: "verify", note: "ok", checks: ["legal_name_matches_registry"] }, "mc");
    const offering = await createOffering(PROD.id, {
        displayName: "School placement",
        description: "Rustenburg schools guidance",
        categoryIds: ["education"],
    });
    const oc = await submitOfferingVerification(PROD.id, offering.offeringId, "o");
    await decideOfferingVerification(
        oc.caseId,
        { action: "verify", note: "ok", checks: ["supplier_authority_confirmed", "offering_description_accurate", "category_eligible"] },
        "mc"
    );
    const camp = await createCampaign(PROD.id, {
        name: "Edu",
        packageSkuId: "rs09.rec.starter.zar.monthly",
        offeringIds: [offering.offeringId],
        targetCategoryIds: ["education"],
        targetGeo: { city: "Rustenburg" },
    });
    await submitCampaignForApproval(PROD.id, camp.campaignId, "o");
    await decideCampaignApproval(camp.campaignId, { action: "approve", note: "ok" }, "mc");
    await activateCampaign(PROD.id, camp.campaignId, "o");
    return { offering, camp };
}

test("tools registered", () => {
    assert.ok(PERSONAL_SARAH_TOOL_DEFINITIONS.some((t) => t.function.name === "querySarahRecommendations"));
    assert.ok(PERSONAL_SARAH_TOOL_DEFINITIONS.some((t) => t.function.name === "recordSponsoredRecommendationPresented"));
});

test("query + record debits allowance once", async () => {
    reset();
    const { offering, camp } = await seedActiveCampaign();
    const q = await executePersonalSarahRecommendationTool(
        "querySarahRecommendations",
        ctx,
        { categoryId: "education", queryText: "school Rustenburg" },
        { sessionId: "sess-1" }
    );
    assert.equal(q.success, true);
    assert.ok(q.data?.sponsored?.length >= 1);
    const s = q.data.sponsored[0];
    const usageBefore = await getCampaignUsage(camp.campaignId);
    assert.equal(usageBefore.remainingPresentations, 30);

    const rec = await executePersonalSarahRecommendationTool(
        "recordSponsoredRecommendationPresented",
        ctx,
        {
            requestId: q.data.requestId,
            campaignId: s.campaignId,
            offeringId: s.offeringId,
            companyId: s.companyId,
            messageRef: "msg-1",
        },
        { sessionId: "sess-1" }
    );
    assert.equal(rec.success, true);
    assert.equal(rec.data.allowanceDebited, true);
    const usageAfter = await getCampaignUsage(camp.campaignId);
    assert.equal(usageAfter.remainingPresentations, 29);

    const dup = await executePersonalSarahRecommendationTool(
        "recordSponsoredRecommendationPresented",
        ctx,
        {
            campaignId: s.campaignId,
            offeringId: offering.offeringId,
            companyId: PROD.id,
            messageRef: "msg-1",
        },
        { sessionId: "sess-1" }
    );
    assert.equal(dup.data.allowanceDebited, false);
});