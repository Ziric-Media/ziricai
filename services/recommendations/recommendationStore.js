/**
 * REC-02 — durable collections for Sarah Recommendations.
 */
import { RECOMMENDATION_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";

export const offeringsCol = createNetworkCollection(RECOMMENDATION_COLLECTIONS.OFFERINGS);
export const offeringVerificationCol = createNetworkCollection(RECOMMENDATION_COLLECTIONS.OFFERING_VERIFICATION_CASES);
export const campaignsCol = createNetworkCollection(RECOMMENDATION_COLLECTIONS.CAMPAIGNS);
export const campaignUsageCol = createNetworkCollection(RECOMMENDATION_COLLECTIONS.CAMPAIGN_USAGE_PERIODS);
export const attributionCol = createNetworkCollection(RECOMMENDATION_COLLECTIONS.ATTRIBUTION_EVENTS);
export const recommendationRequestsCol = createNetworkCollection(RECOMMENDATION_COLLECTIONS.RECOMMENDATION_REQUESTS);

export function clearRecommendationStoreForTests() {
    offeringsCol.clearMemory();
    offeringVerificationCol.clearMemory();
    campaignsCol.clearMemory();
    campaignUsageCol.clearMemory();
    attributionCol.clearMemory();
    recommendationRequestsCol.clearMemory();
}