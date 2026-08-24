/**
 * Customer identity helpers — explicit names vs WhatsApp contact vs company names.
 */

const EXPLICIT_NAME_PATTERNS = [
    /\b(?:my name is|i am|i'm|im|call me|this is|it's|its)\s+([a-zA-Z][a-zA-Z'\-]*(?:\s+[a-zA-Z][a-zA-Z'\-]*){0,2})/i,
    /\b(?:you can call me|please call me|name'?s)\s+([a-zA-Z][a-zA-Z'\-]*(?:\s+[a-zA-Z][a-zA-Z'\-]*){0,2})/i,
];

function capitalizeWords(value) {
    return String(value || "")
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
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
        const candidate = match?.[1]?.trim();
        if (!candidate || candidate.length < 2 || candidate.length > 48) continue;
        if (/^\d+$/.test(candidate)) continue;
        if (/^(here|there|good|fine|well|back|interested|looking|calling|messaging)$/i.test(candidate)) continue;
        return capitalizeWords(candidate);
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
    const explicit = customer?.displayName || customer?.firstName || null;
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

export { capitalizeWords as capitalizeCustomerName };
