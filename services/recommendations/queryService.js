/**
 * REC-05 — Recommendations query engine (organic + sponsored).
 */
import { randomUUID } from "node:crypto";
import { hydrateBusinessDirectory, getBusinessDirectoryEntry } from "../users/businessDirectoryService.js";
import { isRecommendationsEngineEnabled } from "./recommendationConfig.js";
import { offeringsCol, recommendationRequestsCol } from "./recommendationStore.js";
import { OFFERING_STATUS, OFFERING_VERIFICATION_STATUS } from "./offeringConstants.js";
import { listActiveCampaigns } from "./campaignService.js";
import { evaluateSponsoredEligibility } from "./eligibilityService.js";
import { scoreOfferingRelevance, mergeRankedShortlist, buildResultReason } from "./rankingService.js";
import { recordRecommendationEvent } from "./attributionService.js";

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function strip(row) {
    const { __id, ...rest } = row;
    return rest;
}

function clientResult(item, { sponsored = false, campaignId = null } = {}) {
    const entry = getBusinessDirectoryEntry(item.companyId);
    return {
        offeringId: item.offeringId,
        companyId: item.companyId,
        displayName: item.displayName,
        reason: item.reason,
        sponsored,
        disclosureLabel: sponsored ? "Sponsored Recommendation" : null,
        campaignId,
        discoverProfileUrl: entry?.snId ? `/discover/${entry.snId}` : null,
        relevanceScore: item.relevanceScore,
    };
}

async function loadActiveOfferings() {
    const rows = (await offeringsCol.list({ limit: 500 })).map(strip);
    return rows.filter(
        (o) => o.status === OFFERING_STATUS.ACTIVE && o.verificationStatus === OFFERING_VERIFICATION_STATUS.VERIFIED
    );
}

/**
 * @param {object} body
 * @param {{ consumerUid?: string|null, surface?: string }} ctx
 */
export async function queryRecommendations(body, ctx = {}) {
    if (!isRecommendationsEngineEnabled()) {
        throw err(503, "RECOMMENDATIONS_ENGINE_DISABLED", "Sarah Recommendations engine is not enabled.");
    }
    const intent = body?.intent || {};
    const location = body?.location || {};
    const limit = Math.min(10, Math.max(1, Number(body?.limit) || 5));
    const conversationRef = body?.conversationRef || null;
    const requestId = `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date().toISOString();

    await hydrateBusinessDirectory();
    await recordRecommendationEvent("recommendation_request_received", {
        requestId,
        categoryId: intent.categoryId || null,
        surface: body?.surface || ctx.surface || "unknown",
        conversationRef,
        consumerUid: ctx.consumerUid || null,
    });

    const request = { intent, location };
    const allOfferings = await loadActiveOfferings();
    const categoryId = String(intent.categoryId || "").toLowerCase();

    const organicCandidates = [];
    for (const off of allOfferings) {
        if (categoryId && !(off.categoryIds || []).map((c) => String(c).toLowerCase()).includes(categoryId)) {
            continue;
        }
        const entry = getBusinessDirectoryEntry(off.companyId);
        if (!entry || entry.discoverability !== "public" || entry.suspended) continue;
        const relevanceScore = scoreOfferingRelevance(off, request);
        organicCandidates.push({
            ...off,
            relevanceScore,
            reason: buildResultReason(off, request),
        });
    }

    const campaigns = await listActiveCampaigns();
    const sponsoredCandidates = [];
    let sponsoredConsidered = 0;
    let sponsoredEligible = 0;

    for (const campaign of campaigns) {
        for (const offeringId of campaign.offeringIds || []) {
            sponsoredConsidered += 1;
            const stored = await offeringsCol.get(offeringId);
            if (!stored || stored.companyId !== campaign.companyId) continue;
            const raw = strip(stored);
            const { eligible, reason } = await evaluateSponsoredEligibility({
                campaign,
                offering: raw,
                intent,
                location,
            });
            if (!eligible) {
                await recordRecommendationEvent("candidate_excluded", { requestId, offeringId, campaignId: campaign.campaignId, reason });
                continue;
            }
            sponsoredEligible += 1;
            await recordRecommendationEvent("candidate_eligible", { requestId, offeringId, campaignId: campaign.campaignId });
            const relevanceScore = scoreOfferingRelevance(raw, request);
            sponsoredCandidates.push({
                ...raw,
                relevanceScore,
                reason: buildResultReason(raw, request),
                campaignId: campaign.campaignId,
            });
        }
    }

    const merged = mergeRankedShortlist(organicCandidates, sponsoredCandidates, { limit });

    const organic = merged.organic.map((o) => clientResult(o, { sponsored: false }));
    const sponsored = merged.sponsored.map((o) => clientResult(o, { sponsored: true, campaignId: o.campaignId }));

    await recommendationRequestsCol.put(requestId, {
        requestId,
        intentSummary: {
            categoryId: intent.categoryId || null,
            queryText: String(intent.queryText || "").slice(0, 200),
            city: location.city || null,
        },
        organicCount: organic.length,
        sponsoredCount: sponsored.length,
        createdAt: now,
        conversationRef,
    });

    return {
        requestId,
        organic,
        sponsored,
        meta: {
            ...merged.meta,
            sponsoredConsidered,
            sponsoredEligible,
        },
    };
}