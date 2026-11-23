/**
 * MC-PO-04A — contextual safety classification (signals review, not guilt).
 */
export const SAFETY_CATEGORIES = Object.freeze([
    "violent_threat",
    "criminal_facilitation",
    "weapons_harm",
    "self_harm_imminent",
    "self_harm_concern",
    "fraud_scam",
    "harassment",
    "platform_abuse",
    "other_elevated",
]);

export const SAFETY_SEVERITIES = Object.freeze(["normal", "low", "elevated", "critical"]);

const CRITICAL_PATTERNS = [
    {
        category: "weapons_harm",
        re: /\b(mak(e|ing)\s+(a\s+)?bomb|build\s+(an?\s+)?(ied|explosive)|how\s+to\s+(make|build)\s+.*\b(bomb|explosive))/i,
    },
    { category: "criminal_facilitation", re: /\b(steps?\s+to\s+(rob|kidnap)|help\s+me\s+rob)\b/i },
    { category: "self_harm_imminent", re: /\b(going\s+to\s+kill\s+(myself|him|her|them)|kill\s+myself\s+tonight|suicide\s+tonight|end\s+my\s+life\s+now)\b/i },
];

const ELEVATED_PATTERNS = [
    { category: "weapons_harm", re: /\b(how\s+to\s+make|instructions\s+for)\s+.*(gun|weapon|poison)/i },
    { category: "criminal_facilitation", re: /\b(how\s+to\s+)?(steal|launder|hack\s+into|break\s+into)\b/i },
    { category: "fraud_scam", re: /\b(fake\s+(invoice|receipt)|scam\s+clients?|defraud)/i },
    { category: "self_harm_concern", re: /\b(suicidal|want\s+to\s+die|self[- ]harm|don't\s+want\s+to\s+live)\b/i },
    { category: "violent_threat", re: /\b(i\s+will\s+kill|going\s+to\s+hurt|threaten\s+to\s+kill)\b/i },
];

const LOW_PATTERNS = [{ category: "platform_abuse", re: /\b(bypass\s+safety|ignore\s+your\s+rules|jailbreak|dan\s+mode)\b/i }];

/**
 * @param {string} text
 * @returns {{ severity: string, category: string|null, summary: string|null, confidence: number, shouldBlock: boolean }}
 */
export function classifyConsumerMessageSafety(text) {
    const msg = String(text || "").trim();
    if (msg.length < 3) {
        return { severity: "normal", category: null, summary: null, confidence: 0, shouldBlock: false };
    }
    for (const row of CRITICAL_PATTERNS) {
        if (row.re.test(msg)) {
            return {
                severity: "critical",
                category: row.category,
                summary: "Critical safety pattern detected — requires urgent human review.",
                confidence: 0.85,
                shouldBlock: true,
            };
        }
    }
    for (const row of ELEVATED_PATTERNS) {
        if (row.re.test(msg)) {
            return {
                severity: "elevated",
                category: row.category,
                summary: `Elevated: possible ${row.category.replace(/_/g, " ")}.`,
                confidence: 0.65,
                shouldBlock: false,
            };
        }
    }
    for (const row of LOW_PATTERNS) {
        if (row.re.test(msg)) {
            return {
                severity: "low",
                category: row.category,
                summary: "Low: possible policy evasion attempt.",
                confidence: 0.55,
                shouldBlock: false,
            };
        }
    }
    return { severity: "normal", category: null, summary: null, confidence: 0, shouldBlock: false };
}

export function safetyBlockReply(category) {
    if (category === "self_harm_imminent" || category === "self_harm_concern") {
        return (
            "I hear that you're going through something very difficult. I can't help with actions that could harm you, " +
            "but you deserve support. If you're in immediate danger, please contact emergency services (South Africa: 10111) " +
            "or SADAG on 0800 567 567. Would you like me to help you find other support resources?"
        );
    }
    return (
        "I can't help with requests that could enable violence, crime, or serious harm. " +
        "If this is an emergency, contact local emergency services. Our team may review this conversation under our safety policy."
    );
}

export function redactedExcerpt(text, max = 160) {
    return String(text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}