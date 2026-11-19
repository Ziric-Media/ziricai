/**
 * REC-08 (partial) — qualified sponsored presentation events + allowance debit.
 */
import { createHash, randomUUID } from "node:crypto";
import { presentationsCol } from "./recommendationStore.js";
import { campaignsCol } from "./recommendationStore.js";
import { consumePresentationAllowance } from "./campaignUsageService.js";
import { CAMPAIGN_STATUS } from "./campaignConstants.js";
import { recordRecommendationEvent } from "./attributionService.js";

function strip(row) {
    if (!row) return null;
    const { __id, ...rest } = row;
    return rest;
}

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

export function buildPresentationIdempotencyKey({ campaignId, offeringId, conversationRef, messageRef }) {
    const material = [campaignId, offeringId, conversationRef, messageRef].join("|");
    return createHash("sha256").update(material).digest("hex");
}

/**
 * @param {object} input
 * @param {string} input.campaignId
 * @param {string} input.offeringId
 * @param {string} input.companyId
 * @param {string} input.conversationRef
 * @param {string} input.messageRef
 * @param {boolean} input.disclosureShown
 * @param {string} [input.requestId]
 * @param {string} [input.consumerUid]
 * @param {string} [input.surface]
 */
export async function recordSponsoredPresentation(input) {
    if (!input.disclosureShown) {
        throw err(422, "DISCLOSURE_REQUIRED", "disclosureShown must be true to record a qualified presentation.");
    }
    const idempotencyKey = buildPresentationIdempotencyKey(input);
    const existing = await presentationsCol.get(idempotencyKey);
    if (existing) {
        return {
            eventId: existing.eventId,
            idempotencyKey,
            allowanceDebited: false,
            remainingPresentations: existing.remainingPresentations ?? null,
            duplicate: true,
        };
    }

    const campaignRaw = await campaignsCol.get(input.campaignId);
    if (!campaignRaw || campaignRaw.companyId !== input.companyId) {
        throw err(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    }
    if (campaignRaw.status !== CAMPAIGN_STATUS.ACTIVE) {
        throw err(409, "CAMPAIGN_NOT_ACTIVE", "Campaign is not active.");
    }

    const debit = await consumePresentationAllowance(input.campaignId, idempotencyKey);
    const eventId = `rep_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    const now = new Date().toISOString();
    const row = {
        eventId,
        idempotencyKey,
        campaignId: input.campaignId,
        offeringId: input.offeringId,
        companyId: input.companyId,
        consumerUid: input.consumerUid || null,
        surface: input.surface || "personal_sarah",
        conversationRef: input.conversationRef,
        messageRef: input.messageRef,
        requestId: input.requestId || null,
        disclosureShown: true,
        recordedAt: now,
        allowanceDebited: debit.debited,
        remainingPresentations: debit.remainingPresentations ?? null,
    };
    await presentationsCol.put(idempotencyKey, row, { merge: false });

    if (debit.debited) {
        await recordRecommendationEvent("campaign_allowance_consumed", {
            eventId,
            campaignId: input.campaignId,
            offeringId: input.offeringId,
            remainingPresentations: debit.remainingPresentations,
        });
        if (debit.exhausted) {
            const camp = strip(campaignRaw);
            await campaignsCol.put(input.campaignId, { ...camp, status: CAMPAIGN_STATUS.EXHAUSTED, updatedAt: now }, { merge: false });
            await recordRecommendationEvent("campaign_allowance_exhausted", { campaignId: input.campaignId });
        }
    }
    await recordRecommendationEvent("sponsored_presentation_displayed", {
        eventId,
        campaignId: input.campaignId,
        offeringId: input.offeringId,
        requestId: input.requestId,
    });

    return {
        eventId,
        idempotencyKey,
        allowanceDebited: debit.debited,
        remainingPresentations: debit.remainingPresentations ?? null,
        duplicate: Boolean(debit.duplicate),
    };
}