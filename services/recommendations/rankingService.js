/**
 * REC-05 — relevance-first ranking (REC-01b §8).
 */

const MIN_SPONSORED_SCORE = Number(process.env.REC_MIN_SPONSORED_SCORE || 60);
const SPONSORED_CAP = Number(process.env.REC_SPONSORED_CAP || 1);
const ORGANIC_SPONSORED_GAP = Number(process.env.REC_ORGANIC_SPONSORED_GAP || 15);

/**
 * @param {{ displayName?: string, description?: string, categoryIds?: string[] }} offering
 * @param {{ intent?: { categoryId?: string, queryText?: string }, location?: { city?: string } }} request
 */
export function scoreOfferingRelevance(offering, request) {
    let score = 35;
    const q = String(request?.intent?.queryText || "").toLowerCase();
    const name = String(offering?.displayName || "").toLowerCase();
    const desc = String(offering?.description || "").toLowerCase();
    const cat = String(request?.intent?.categoryId || "").toLowerCase();
    const city = String(request?.location?.city || "").toLowerCase();

    if (cat && (offering.categoryIds || []).map((c) => String(c).toLowerCase()).includes(cat)) score += 28;
    if (q) {
        for (const token of q.split(/\s+/).filter((t) => t.length > 2)) {
            if (name.includes(token)) score += 12;
            else if (desc.includes(token)) score += 6;
        }
    }
    if (city && (desc.includes(city) || name.includes(city))) score += 10;
    return Math.min(100, score);
}

/**
 * @param {{ offering: object, relevanceScore: number, sponsored: boolean, campaignId?: string, companyId: string, displayName: string, reason: string }[]} organic
 * @param {typeof organic} sponsored
 * @param {{ limit: number }} opts
 */
export function mergeRankedShortlist(organic, sponsored, { limit = 5 } = {}) {
    const o = [...organic].sort((a, b) => b.relevanceScore - a.relevanceScore);
    const s = [...sponsored]
        .filter((c) => c.relevanceScore >= MIN_SPONSORED_SCORE)
        .sort((a, b) => b.relevanceScore - a.relevanceScore);

    const outOrganic = o.slice(0, limit);
    const sponsoredPicked = [];
    for (const cand of s) {
        if (sponsoredPicked.length >= SPONSORED_CAP) break;
        const bestOrganic = outOrganic[0]?.relevanceScore ?? 0;
        if (cand.relevanceScore + ORGANIC_SPONSORED_GAP < bestOrganic) continue;
        sponsoredPicked.push(cand);
    }

    return {
        organic: outOrganic,
        sponsored: sponsoredPicked,
        meta: {
            rankingPolicy: "relevance_first_v1",
            minSponsoredScore: MIN_SPONSORED_SCORE,
            sponsoredCap: SPONSORED_CAP,
        },
    };
}

export function buildResultReason(offering, request) {
    const cat = request?.intent?.categoryId;
    const city = request?.location?.city;
    const bits = ["Matches your request"];
    if (cat) bits.push(`for ${cat}`);
    if (city) bits.push(`near ${city}`);
    if (offering?.displayName) bits.push(`— ${offering.displayName}`);
    return bits.join(" ");
}