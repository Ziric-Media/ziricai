/**
 * Medical-aid worksheet fields used by South African dental practices
 * (GoodX / Healthbridge pattern): scheme, option, membership number,
 * dependant code, and the visit. This service does not switch a claim,
 * look up a benefit, or calculate a tariff.
 */

export const SA_MEDICAL_SCHEMES = Object.freeze([
    "Discovery Health",
    "GEMS",
    "Bonitas",
    "Momentum Medical Scheme",
    "Medihelp",
    "Bestmed",
    "Fedhealth",
    "Bankmed",
    "Polmed",
    "Profmed",
    "Medshield",
    "Sizwe Hosmed",
    "KeyHealth",
    "CompCare",
    "Thebemed",
    "Makoti",
    "Selfmed",
    "Medipos",
    "CAMAF",
    "Private / cash",
    "Other",
]);

export const CLAIM_STATUSES = Object.freeze(["draft", "ready", "submitted", "rejected", "paid"]);

const CLAIM_TRANSITIONS = {
    draft: ["ready"],
    ready: ["submitted", "draft"],
    submitted: ["rejected", "paid"],
    rejected: ["draft"],
    paid: [],
};

export function emptyMedicalAid() {
    return {
        scheme: "",
        option: "",
        membershipNumber: "",
        dependantCode: "",
        principalMemberName: "",
        relationship: "",
    };
}

export function normalizeMedicalAid(input = {}) {
    const scheme = clean(input.scheme, 80);
    if (scheme && !SA_MEDICAL_SCHEMES.includes(scheme)) {
        throw new Error("Choose a scheme from the list, or Other. Do not invent a benefit amount.");
    }
    const relationship = clean(input.relationship, 20).toLowerCase();
    if (relationship && !["principal", "dependant"].includes(relationship)) {
        throw new Error("Relationship must be principal or dependant.");
    }
    return {
        scheme,
        option: clean(input.option, 80),
        membershipNumber: clean(input.membershipNumber, 40),
        dependantCode: clean(input.dependantCode, 8),
        principalMemberName: clean(input.principalMemberName, 120),
        relationship,
    };
}

export function medicalAidReady(aid) {
    if (!aid || aid.scheme === "Private / cash" || !aid.scheme) return false;
    return Boolean(aid.scheme && aid.membershipNumber && aid.dependantCode);
}

export function assertClaimTransition(fromStatus, toStatus) {
    const from = String(fromStatus || "draft");
    if (from === toStatus) return;
    if (!(CLAIM_TRANSITIONS[from] || []).includes(toStatus)) {
        throw new Error(`A ${from} claim worksheet cannot move to ${toStatus}.`);
    }
}

function clean(value, max) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
