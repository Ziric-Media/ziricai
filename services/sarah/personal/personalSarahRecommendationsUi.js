/**
 * REC-07 — structured disclosure payload for Sarah App (PWA) from tool actions.
 */

const DISCLOSURE_HEADLINE = "Sponsored visibility";
const DISCLOSURE_BODY =
    "Some options below are paid placements. Payment does not mean Sarah endorses a business — we only show relevant options we are allowed to present.";

function mapItem(item, { sponsored }) {
    if (!item || typeof item !== "object") return null;
    return {
        offeringId: item.offeringId || null,
        companyId: item.companyId || null,
        displayName: String(item.displayName || "Offering").trim(),
        reason: String(item.reason || "").trim() || null,
        sponsored: Boolean(sponsored),
        disclosureLabel: sponsored ? item.disclosureLabel || "Sponsored Recommendation" : null,
        campaignId: sponsored ? item.campaignId || null : null,
        discoverProfileUrl: item.discoverProfileUrl || null,
    };
}

/**
 * @param {unknown[]} actions — orchestrator tool results
 */
export function buildRecommendationsUiFromActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return null;
    const hits = actions.filter(
        (a) => a && a.success && a.tool === "querySarahRecommendations" && a.data && typeof a.data === "object"
    );
    if (!hits.length) return null;
    const data = hits[hits.length - 1].data;
    const organic = (Array.isArray(data.organic) ? data.organic : [])
        .map((o) => mapItem(o, { sponsored: false }))
        .filter(Boolean);
    const sponsored = (Array.isArray(data.sponsored) ? data.sponsored : [])
        .map((o) => mapItem(o, { sponsored: true }))
        .filter(Boolean);
    if (!organic.length && !sponsored.length) return null;
    return {
        requestId: data.requestId || null,
        disclosure: {
            headline: DISCLOSURE_HEADLINE,
            body: DISCLOSURE_BODY,
        },
        organic,
        sponsored,
    };
}