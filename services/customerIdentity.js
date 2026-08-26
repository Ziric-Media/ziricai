/**
 * Customer identity helpers — explicit names vs WhatsApp contact vs company names.
 */

const EXPLICIT_NAME_PATTERNS = [
    /\b(?:my name is|i am|i'm|im|call me|this is|it's|its)\s+([a-zA-Z][a-zA-Z'\-]*(?:\s+[a-zA-Z][a-zA-Z'\-]*){0,2})/i,
    /\b(?:you can call me|please call me|name'?s)\s+([a-zA-Z][a-zA-Z'\-]*(?:\s+[a-zA-Z][a-zA-Z'\-]*){0,2})/i,
];

/** Stop name capture at conjunctions before occupation clauses ("Spencer and I'm a …"). */
const NAME_STOP_PATTERN = /\s+\band\b(?:\s+(?:i'?m|i am|im|also|my)\b)?/i;

const NON_NAME_WORDS = new Set([
    "here",
    "there",
    "good",
    "fine",
    "well",
    "back",
    "interested",
    "looking",
    "calling",
    "messaging",
    "available",
    "free",
    "busy",
    "ready",
    "a",
    "an",
    "the",
]);

/** Reject availability/scheduling phrases misparsed as names ("I'm available on that day"). */
const AVAILABILITY_NAME_PATTERN =
    /\b(?:available|free|busy|ready)\b(?:\s+(?:on|at|for|from|until|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|that|this|the))?/i;

function capitalizeWords(value) {
    return String(value || "")
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

function cleanNameCandidate(candidate) {
    let name = String(candidate || "").trim();
    if (!name) return null;

    const stopMatch = name.match(NAME_STOP_PATTERN);
    if (stopMatch) name = name.slice(0, stopMatch.index).trim();
    if (!name || name.length < 2 || name.length > 48) return null;
    if (/^\d+$/.test(name)) return null;
    if (/^(a|an)\s+/i.test(name)) return null;

    const firstWord = name.split(/\s+/)[0]?.toLowerCase();
    if (NON_NAME_WORDS.has(firstWord)) return null;
    if (/^(here|there|good|fine|well|back|interested|looking|calling|messaging|available|free|busy|ready)$/i.test(name)) {
        return null;
    }
    if (AVAILABILITY_NAME_PATTERN.test(name)) return null;

    return capitalizeWords(name);
}

/**
 * Parse an explicit customer self-introduction from message text.
 * @param {string} text
 * @returns {string|null}
 */
export function parseExplicitCustomerName(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;

    for (const pattern of EXPLICIT_NAME_PATTERNS) {
        const match = raw.match(pattern);
        const candidate = cleanNameCandidate(match?.[1]);
        if (candidate) return candidate;
    }
    return null;
}

const OCCUPATION_PATTERNS = [
    /\b(?:i'?m|i am|im)\s+(?:a|an)\s+([a-z][a-z\s'-]{2,48})/i,
    /\b(?:work(?:ing)?\s+as|employed\s+as|job\s+is|occupation\s+is|profession\s+is)\s+(?:a|an\s+)?([a-z][a-z\s'-]{2,48})/i,
    /\band\s+(?:i'?m|i am|im)\s+(?:a|an)\s+([a-z][a-z\s'-]{2,48})/i,
];

/**
 * Parse occupation / job title from self-introduction (e.g. "I'm a civil servant").
 * @param {string} text
 * @returns {string|null}
 */
export function parseOccupation(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;

    for (const pattern of OCCUPATION_PATTERNS) {
        const match = raw.match(pattern);
        let occupation = match?.[1]?.trim();
        if (!occupation || occupation.length < 2) continue;
        occupation = occupation.replace(/\s+(?:and|but|looking|interested|i\s+).*/i, "").trim();
        if (occupation.length >= 2) return capitalizeWords(occupation);
    }
    return null;
}

const KNOWN_COMPANY_NAME_PATTERNS =
    /\b(ziric\s*media|ziricai|central\s*motors|econo\s*funerals)\b/i;

const BUSINESS_FIRST_WORDS = new Set([
    "ziric",
    "ziricai",
    "central",
    "econo",
    "media",
    "motors",
    "funerals",
    "automotive",
    "dealership",
]);

/**
 * True when a string looks like a business/tenant name rather than a person.
 * @param {string|null|undefined} name
 * @param {{ companyName?: string|null }} [options]
 */
export function isLikelyCompanyName(name, { companyName } = {}) {
    const normalized = String(name || "").trim().toLowerCase();
    if (!normalized) return false;

    const company = String(companyName || "").trim().toLowerCase();
    if (company && normalized === company) return true;

    if (KNOWN_COMPANY_NAME_PATTERNS.test(normalized)) return true;

    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && BUSINESS_FIRST_WORDS.has(parts[0])) {
        return true;
    }

    return false;
}

/**
 * Resolve the customer-facing display name.
 * Priority: explicit profile name > WhatsApp contact name > null (never company/tenant name).
 * @param {object|null|undefined} customer
 * @param {{ contactName?: string|null, companyName?: string|null }} [options]
 * @returns {string|null}
 */
export function getCustomerDisplayName(customer, { contactName = null, companyName = null } = {}) {
    const explicit = customer?.displayName || customer?.explicitName || customer?.firstName || null;
    if (explicit && !isLikelyCompanyName(explicit, { companyName })) {
        return explicit;
    }

    const whatsappName = customer?.whatsappContactName || contactName;
    if (whatsappName && !isLikelyCompanyName(whatsappName, { companyName })) {
        return whatsappName;
    }

    const legacy = customer?.name;
    if (legacy && legacy !== customer?.phone && !isLikelyCompanyName(legacy, { companyName })) {
        return legacy;
    }

    return null;
}

const SPOUSE_INTRO_PATTERNS = [
    /\b(?:her\s+name\s+is|his\s+name\s+is)\s+([a-zA-Z][a-zA-Z'\-]*(?:\s+[a-zA-Z][a-zA-Z'\-]*){0,2})/i,
    /\b(?:my\s+(?:wife|husband|spouse|partner)(?:'s)?\s+name\s+is)\s+([a-zA-Z][a-zA-Z'\-]*(?:\s+[a-zA-Z][a-zA-Z'\-]*){0,2})/i,
    /\b(?:my\s+(?:wife|husband|spouse|partner))\s+is\s+([a-zA-Z][a-zA-Z'\-]*(?:\s+[a-zA-Z][a-zA-Z'\-]*){0,2})/i,
    /\bmy\s+(?:wife|husband|spouse|partner)\s+([A-Z][a-zA-Z'\-]+)\b/,
];

const RELATIONSHIP_SPEAKER_PATTERNS = [
    { pattern: /\bmy\s+wife\b/i, speaker: "wife" },
    { pattern: /\bmy\s+husband\b/i, speaker: "husband" },
    { pattern: /\bmy\s+spouse\b/i, speaker: "spouse" },
    { pattern: /\bmy\s+partner\b/i, speaker: "partner" },
];

/**
 * Parse a third-party person introduced in conversation (spouse, co-decision-maker).
 * Does NOT treat spouse introductions as the primary customer's self-name.
 * @param {string} text
 * @returns {{ name: string, role: string, relationship: string }|null}
 */
export function parseIntroducedPerson(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;

    const lower = raw.toLowerCase();
    const isSpouseContext = /\b(wife|husband|spouse|partner)\b/.test(lower);

    for (const pattern of SPOUSE_INTRO_PATTERNS) {
        const match = raw.match(pattern);
        const candidate = match?.[1]?.trim();
        if (!candidate || candidate.length < 2 || candidate.length > 48) continue;
        if (/^(here|there|good|fine|well|talk|speak|wants|want)$/i.test(candidate)) continue;

        const relationship = /\bhusband\b/i.test(lower)
            ? "husband"
            : /\bwife\b/i.test(lower)
              ? "wife"
              : /\bpartner\b/i.test(lower)
                ? "partner"
                : "spouse";

        return {
            name: capitalizeWords(candidate),
            role: "co-decision-maker",
            relationship,
        };
    }

    if (isSpouseContext && /\b(wants to talk|will join|should be there|decide together)\b/i.test(lower)) {
        return { name: null, role: "co-decision-maker", relationship: "spouse" };
    }

    return null;
}

/**
 * Detect when the message may be from or about a different household member on the same phone.
 * @param {string} text
 * @returns {string|null} descriptive active speaker hint
 */
export function parseRelationshipSpeaker(text) {
    const raw = String(text || "");
    for (const { pattern, speaker } of RELATIONSHIP_SPEAKER_PATTERNS) {
        if (pattern.test(raw)) {
            const introduced = parseIntroducedPerson(raw);
            if (introduced?.name) return introduced.name;
            return speaker;
        }
    }
    if (/\bmy\s+husband\s+suggested\b/i.test(raw)) return "husband";
    return null;
}

/**
 * True when text introduces someone else — do not overwrite primary customer displayName.
 * @param {string} text
 */
export function isThirdPartyIntroduction(text) {
    return Boolean(parseIntroducedPerson(text)?.name || parseRelationshipSpeaker(text));
}

export { capitalizeWords as capitalizeCustomerName };
