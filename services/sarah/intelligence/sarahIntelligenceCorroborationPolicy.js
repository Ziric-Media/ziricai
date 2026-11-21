/**
 * SWI-M2 — when a topic cluster counts as a corroborated trend (not single-publisher noise).
 */

const DEFAULT_MIN_ALLOWLIST_PUBLISHERS = 2;
const DEFAULT_MIN_DISTINCT_PUBLISHERS = 3;

export function corroborationConfig() {
    return {
        minAllowListPublishers: Math.max(
            1,
            Number(process.env.SARAH_INTELLIGENCE_TREND_MIN_ALLOWLIST) || DEFAULT_MIN_ALLOWLIST_PUBLISHERS
        ),
        minDistinctPublishers: Math.max(
            2,
            Number(process.env.SARAH_INTELLIGENCE_TREND_MIN_PUBLISHERS) || DEFAULT_MIN_DISTINCT_PUBLISHERS
        ),
    };
}

/**
 * @param {{ publishers?: string[], allowListPublishers?: string[] }} input
 */
export function evaluateTrendCorroboration(input = {}) {
    const cfg = corroborationConfig();
    const publishers = [...new Set((input.publishers || []).map((p) => String(p || "").trim()).filter(Boolean))];
    const allowListPublishers = [
        ...new Set((input.allowListPublishers || publishers).map((p) => String(p || "").trim()).filter(Boolean)),
    ];

    const reasons = [];
    let corroborated = false;

    if (allowListPublishers.length >= cfg.minAllowListPublishers) {
        corroborated = true;
        reasons.push("allow_list_publishers_met");
    } else if (publishers.length >= cfg.minDistinctPublishers) {
        corroborated = true;
        reasons.push("distinct_publishers_met");
    } else {
        reasons.push("insufficient_corroboration");
    }

    const tier = corroborated
        ? allowListPublishers.length >= cfg.minAllowListPublishers
            ? "corroborated"
            : "emerging"
        : "emerging";

    let strength = "low";
    if (corroborated && publishers.length >= cfg.minDistinctPublishers + 1) strength = "high";
    else if (corroborated) strength = "medium";

    return {
        corroborated,
        tier,
        strength,
        publisherCount: publishers.length,
        allowListCount: allowListPublishers.length,
        reasons,
        config: cfg,
    };
}