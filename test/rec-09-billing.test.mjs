/**
 * REC-09 — campaign billing (pilot checkout).
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import test from "node:test";
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
import {
    startRecCampaignCheckout,
    confirmRecCampaignCheckout,
    markCampaignPaid,
} from "../services/recommendations/billingService.js";
import { getCatalogueSku } from "../services/revenue/catalogueService.js";

const PROD = { id: "acme-rec-09", name: "Acme Rec9", settings: { tenantClass: "production_customer" } };
const deps = { getCompany: async (id) => (id === PROD.id ? PROD : null) };

function reset() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    clearVerificationCasesForTests();
    clearRecommendationStoreForTests();
    delete process.env.RECOMMENDATIONS_PILOT_COMPANY_IDS;
    delete process.env.RECOMMENDATIONS_ENGINE_ENABLED;
    delete process.env.RS09_REC_CHECKOUT;
}

async function approvedCampaign() {
    await saveListingDraft(
        PROD.id,
        {
            displayName: "Acme Rec9",
            industry: "Education",
            shortDescription: "School.",
            location: "Rustenburg",
            legalName: "Acme Rec9 (Pty) Ltd",
            registrationNumber: "2021/777777/07",
        },
        "owner-1",
        deps
    );
    await publishListing(PROD.id, "owner-1", deps);
    const orgCase = await submitVerification(PROD.id, "owner-1");
    await decideVerification(orgCase.caseId, { action: "verify", note: "ok", checks: ["legal_name_matches_registry"] }, "mc-1");
    const offering = await createOffering(PROD.id, {
        displayName: "Admissions",
        description: "Enrolment assistance",
        categoryIds: ["education"],
    });
    const oc = await submitOfferingVerification(PROD.id, offering.offeringId, "owner-1");
    await decideOfferingVerification(
        oc.caseId,
        { action: "verify", note: "ok", checks: ["supplier_authority_confirmed", "offering_description_accurate", "category_eligible"] },
        "mc-1"
    );
    const campaign = await createCampaign(PROD.id, {
        name: "Pay test",
        packageSkuId: "rs09.rec.starter.zar.monthly",
        offeringIds: [offering.offeringId],
        targetCategoryIds: ["education"],
    });
    await submitCampaignForApproval(PROD.id, campaign.campaignId, "owner-1");
    await decideCampaignApproval(campaign.campaignId, { action: "approve", note: "ok" }, "mc-1");
    return campaign.campaignId;
}

test("RS09 SKUs registered in catalogue", () => {
    const sku = getCatalogueSku("rs09.rec.starter.zar.monthly");
    assert.ok(sku);
    assert.equal(sku.revenueStreamId, "RS09");
    assert.equal(sku.amountCents, 75000);
});

test("pilot checkout → paid → activate (non-pilot company)", async () => {
    reset();
    process.env.RS09_REC_CHECKOUT = "pilot";
    process.env.RECOMMENDATIONS_ENGINE_ENABLED = "true";
    const campaignId = await approvedCampaign();
    const checkout = await startRecCampaignCheckout(PROD.id, campaignId);
    assert.equal(checkout.mode, "pilot");
    assert.ok(checkout.reference);
    const paid = await confirmRecCampaignCheckout(PROD.id, campaignId, {
        reference: checkout.reference,
        pilotAcknowledged: true,
        actorUid: "owner-1",
    });
    assert.equal(paid.campaign.paymentStatus, "paid");
    const activated = await activateCampaign(PROD.id, campaignId, "owner-1");
    assert.equal(activated.campaign.status, "active");
});

test("activate without payment fails outside pilot list", async () => {
    reset();
    const campaignId = await approvedCampaign();
    await assert.rejects(() => activateCampaign(PROD.id, campaignId, "owner-1"), (e) => e.code === "PAYMENT_REQUIRED");
    await markCampaignPaid(PROD.id, campaignId, { reference: "manual_ref", method: "test", actorUid: "mc" });
    process.env.RECOMMENDATIONS_ENGINE_ENABLED = "true";
    const out = await activateCampaign(PROD.id, campaignId, "owner-1");
    assert.equal(out.campaign.status, "active");
});