/**
 * SNET-05 — pure ranking for the Stage-A (in-process) network search (SNET-00 §6.2).
 * No I/O: callers pass listed Discover cards. Ranking is a transparent sum of named signals:
 *   name match · category match · tag/keyword match · industry · description · location · typo tolerance
 *   + small boosts for verification and profile completeness (applied only to results that already match).
 * Sponsored placement does not exist here (RS04 is separate and must merge after organic ranking, labelled).
 */
import { DISCOVER_CATEGORIES, SEARCH_SYNONYMS } from "./networkTaxonomy.js";

const STOP_WORDS = new Set([
    "a", "an", "the", "find", "me", "my", "for", "in", "near", "nearby", "around", "at", "of", "to", "i", "we",
    "want", "need", "looking", "look", "is", "are", "who", "that", "which", "with", "good", "best", "some", "any",
    "please", "can", "you", "show", "get", "company", "business", "service", "services", "available", "today",
]);

const WEIGHTS = Object.freeze({
    nameExact: 24,
    namePrefix: 14,
    nameToken: 10,
    category: 7,
    tag: 6,
    industry: 4,
    description: 2,
    location: 4,
    place: 20,
    placeMiss: 0.5,
    typo: 3,
    synonymFactor: 0.6,
    verified: 3,
    completenessMax: 2,
});

/** Naive plural stem so "dentists" matches "dentist" (no full stemmer in Stage A). */
export function stem(term) {
    if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
    if (term.length > 4 && term.endsWith("s") && !term.endsWith("ss")) return term.slice(0, -1);
    return term;
}

export function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

/** Meaningful query terms + the place named after "in/near/around" (soft location signal). */
export function parseQuery(raw) {
    const q = String(raw || "").toLowerCase().trim();
    const tokens = tokenize(q);
    const placeMatch = q.match(/\b(?:in|near|around|at)\s+([a-z0-9\s'-]{2,40})$/);
    const placeTokens = placeMatch ? tokenize(placeMatch[1]) : [];
    const place = placeTokens.filter((t) => !STOP_WORDS.has(t));
    // The place is scored separately (not also as a keyword) so it can't double count.
    const terms = tokens.filter((t) => !STOP_WORDS.has(t) && t.length >= 2 && !place.includes(t)).map(stem);
    return { raw: q, terms: [...new Set(terms)], placeTokens: place };
}

function withinOne(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            i++;
            j++;
            continue;
        }
        if (++edits > 1) return false;
        if (a.length > b.length) i++;
        else if (b.length > a.length) j++;
        else {
            i++;
            j++;
        }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
}

function completeness(card) {
    const fields = [card.industry, card.location, card.shortDescription, card.logoUrl, card.tags?.length, card.categories?.length];
    return fields.filter(Boolean).length / fields.length;
}

function categoryLabels(card) {
    return (card.categories || []).map((id) => DISCOVER_CATEGORIES.find((c) => c.id === id)?.label.toLowerCase()).filter(Boolean);
}

/**
 * @param {object} card Discover card
 * @param {{ raw: string, terms: string[], placeTokens: string[] }} parsed
 * @returns {{ score: number, matchedOn: string[] }}
 */
export function scoreCard(card, parsed) {
    if (!parsed.terms.length && !parsed.placeTokens.length) {
        // browse mode: trust + completeness only
        return { score: (card.verified ? WEIGHTS.verified : 0) + completeness(card) * WEIGHTS.completenessMax, matchedOn: [] };
    }
    const nameTokens = tokenize(card.displayName);
    const name = String(card.displayName || "").toLowerCase();
    const tagTokens = (card.tags || []).flatMap(tokenize);
    const industryTokens = tokenize(card.industry);
    const descTokens = tokenize(card.shortDescription);
    const locationTokens = tokenize(card.location);
    const catTokens = [...(card.categories || []), ...categoryLabels(card)].flatMap(tokenize);

    let score = 0;
    const matched = new Set();
    const add = (pts, field) => {
        score += pts;
        matched.add(field);
    };

    const hit = (tokens, term) => tokens.some((t) => t === term || (term.length >= 4 && t.startsWith(term)));

    for (const term of parsed.terms) {
        const scoreBefore = score;
        const variants = [{ t: term, f: 1 }, ...(SEARCH_SYNONYMS[term] || []).filter((s) => s !== term).map((s) => ({ t: s, f: WEIGHTS.synonymFactor }))];
        for (const { t, f } of variants) {
            const multiWord = t.includes(" ");
            const singles = multiWord ? tokenize(t) : [t];
            const test = (tokens) => singles.every((s) => hit(tokens, s));
            if (name === t) add(WEIGHTS.nameExact * f, "name");
            else if (name.startsWith(t)) add(WEIGHTS.namePrefix * f, "name");
            else if (test(nameTokens)) add(WEIGHTS.nameToken * f, "name");
            if (test(catTokens)) add(WEIGHTS.category * f, "category");
            if (test(tagTokens)) add(WEIGHTS.tag * f, "tags");
            if (test(industryTokens)) add(WEIGHTS.industry * f, "industry");
            if (test(descTokens)) add(WEIGHTS.description * f, "description");
            if (test(locationTokens)) add(WEIGHTS.location * f, "location");
        }
        // typo tolerance (edit distance 1) on name/tag tokens for longer terms, only when nothing else matched this term
        if (term.length >= 5 && score === scoreBefore) {
            if ([...nameTokens, ...tagTokens].some((tok) => tok.length >= 4 && withinOne(term, tok))) add(WEIGHTS.typo, "typo");
        }
    }
    if (parsed.terms.length && !matched.size) return { score: 0, matchedOn: [] };

    // A stated place ("… in Emalahleni") is a strong signal: local matches get a boost, others are halved.
    if (parsed.placeTokens.length) {
        const serviceAreas = (card.serviceAreas || []).flatMap(tokenize);
        const local = parsed.placeTokens.every((p) => hit(locationTokens, p) || hit(serviceAreas, p));
        if (local) add(WEIGHTS.place, "location");
        else if (!parsed.terms.length) return { score: 0, matchedOn: [] }; // place-only query: local entities only
        else score *= WEIGHTS.placeMiss;
    }
    if (card.verified) score += WEIGHTS.verified;
    score += completeness(card) * WEIGHTS.completenessMax;
    return { score: Math.round(score * 100) / 100, matchedOn: [...matched] };
}

/**
 * Rank cards for a query. Browse mode (no terms) returns all cards ordered by trust/completeness then name.
 * @param {object[]} cards
 * @param {string} rawQuery
 * @returns {Array<{ card: object, score: number, matchedOn: string[] }>}
 */
export function rankCards(cards, rawQuery) {
    const parsed = parseQuery(rawQuery);
    const browse = !parsed.terms.length && !parsed.placeTokens.length;
    const scored = cards.map((card) => ({ card, ...scoreCard(card, parsed) }));
    const kept = browse ? scored : scored.filter((s) => s.score > 0);
    return kept.sort(
        (a, b) => b.score - a.score || String(a.card.displayName).localeCompare(String(b.card.displayName))
    );
}

export const SEARCH_WEIGHTS = WEIGHTS;
