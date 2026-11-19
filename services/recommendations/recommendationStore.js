/**
 * REC-02 — durable collections for Sarah Recommendations.
 */
import { RECOMMENDATION_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";

export const offeringsCol = createNetworkCollection(RECOMMENDATION_COLLECTIONS.OFFERINGS);
export const offeringVerificationCol = createNetworkCollection(RECOMMENDATION_COLLECTIONS.OFFERING_VERIFICATION_CASES);

export function clearRecommendationStoreForTests() {
    offeringsCol.clearMemory();
    offeringVerificationCol.clearMemory();
}