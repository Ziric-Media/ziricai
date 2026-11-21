/**
 * REC-02+ — feature flags (default safe for production).
 */

/** Company Portal offering catalogue + verification APIs (REC-02). */
export function isRecOfferingsApiEnabled() {
    return String(process.env.RECOMMENDATIONS_OFFERINGS_ENABLED || "true").toLowerCase() !== "false";
}

/** Recommendations query engine + Personal Sarah tool (REC-05+). */
export function isRecommendationsEngineEnabled() {
    return String(process.env.RECOMMENDATIONS_ENGINE_ENABLED || "false").toLowerCase() === "true";
}