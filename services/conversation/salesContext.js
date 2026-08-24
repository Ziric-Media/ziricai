/**
 * Sales funnel / household context — lightweight lead-stage tracking for WhatsApp sales.
 */
import { upsertTenantCustomer } from "../storage/tenantStorage.js";
import { upsertDurableCustomer } from "../database/customerRepository.js";
import { countPassengersFromText } from "../inventory/seatingCapacity.js";
import { parseIntroducedPerson, parseRelationshipSpeaker } from "../customerIdentity.js";

export const LEAD_STAGES = [
    "NEW_LEAD",
    "IDENTIFIED",
    "BUDGET_ESTABLISHED",
    "VEHICLE_SEARCH",
    "OPTIONS_PRESENTED",
    "PREFERRED_VEHICLE",
    "FAMILY_CONSULTED",
    "VEHICLE_CONFIRMED",
    "TEST_DRIVE_BOOKED",
];

function normalizeZarAmount(raw) {
    return String(raw || "")
        .replace(/\s+/g, "")
        .toUpperCase();
}

function parseBudget(text) {
    const raw = String(text || "");
    const match = raw.match(/\b(?:budget|afford(?:able)?|up\s*to|spending)\s*(?:of|is|:)?\s*(R\s?[\d][\d,]*(?:\.\d{2})?)/i);
    if (match?.[1]) {
        const display = normalizeZarAmount(match[1]);
        const amount = Number(display.replace(/[^\d]/g, ""));
        return { budget: amount, budgetDisplay: display };
    }
    const loose = raw.match(/\bR\s?[\d][\d,]*(?:\.\d{2})?\b/i);
    if (loose && /\b(budget|afford|spend|vehicle|car|fortuner|hilux|price|quotation|quote)\b/i.test(raw)) {
        const display = normalizeZarAmount(loose[0]);
        return { budget: Number(display.replace(/[^\d]/g, "")), budgetDisplay: display };
    }
    return null;
}

function parsePreferredVehicle(text) {
    const raw = String(text || "");
    const match = raw.match(/\b(?:prefer|interested in|looking at|keen on|like the|want the)\s+(?:the\s+)?([\w\s-]{3,40}?(?:hilux|fortuner|everest|x5|ranger|corolla|land cruiser))/i);
    if (match?.[1]) return match[1].trim();
    const model = raw.match(/\b(hilux|fortuner|everest|x5|land cruiser|ranger)\b/i);
    if (model && /\b(prefer|book|test drive|that one|this one|original)\b/i.test(raw)) {
        return model[0];
    }
    return null;
}

function parseObjection(text) {
    const raw = String(text || "").toLowerCase();
    if (/\b(too small|not enough seats|won't fit|doesn't fit|need something bigger|need more seats)\b/.test(raw)) {
        const vehicle = raw.match(/\b(fortuner|hilux|everest|x5)\b/i);
        return vehicle ? `${vehicle[0]} too small for family` : "Vehicle too small for family";
    }
    return null;
}

function inferStageAdvance(text, currentStage) {
    const lower = String(text || "").toLowerCase();
    if (/\b(my name is|i am|i'm|call me)\b/.test(lower) && currentStage === "NEW_LEAD") return "IDENTIFIED";
    if (/\b(budget|afford|up to r)\b/.test(lower)) return "BUDGET_ESTABLISHED";
    if (/\b(what do you have|show me|options|available|in stock|search)\b/.test(lower)) return "VEHICLE_SEARCH";
    if (/\b(recommend|suggest|which one|compare)\b/.test(lower)) return "OPTIONS_PRESENTED";
    if (/\b(prefer|keen on|like the|want the)\b/.test(lower)) return "PREFERRED_VEHICLE";
    if (/\b(wife|husband|spouse|partner|family|discuss with)\b/.test(lower)) return "FAMILY_CONSULTED";
    if (/\b(confirm|decided on|we'll take|go with)\b/.test(lower)) return "VEHICLE_CONFIRMED";
    if (/\b(book|test drive|schedule|appointment)\b/.test(lower)) return "TEST_DRIVE_BOOKED";
    return null;
}

function mergeHousehold(existing = [], incoming = []) {
    const byKey = new Map();
    for (const member of [...existing, ...incoming]) {
        if (!member?.name) continue;
        const key = member.name.toLowerCase();
        byKey.set(key, { ...byKey.get(key), ...member });
    }
    return [...byKey.values()];
}

/**
 * Extract sales signals from inbound message text.
 * @param {string} text
 * @param {{ customer?: object|null }} [options]
 */
export function extractSalesSignals(text, { customer = null } = {}) {
    const signals = {};
    const raw = String(text || "");
    if (!raw.trim()) return signals;

    const budget = parseBudget(raw);
    if (budget) Object.assign(signals, budget);

    const familySize = countPassengersFromText(raw);
    if (familySize != null) signals.familySize = familySize;

    const preferredVehicle = parsePreferredVehicle(raw);
    if (preferredVehicle) signals.preferredVehicle = preferredVehicle;

    const objection = parseObjection(raw);
    if (objection) signals.objections = [objection];

    const introduced = parseIntroducedPerson(raw);
    if (introduced) {
        signals.householdMembers = [introduced];
        if (introduced.role === "spouse" || introduced.role === "co-decision-maker") {
            signals.decisionMakers = [introduced.name];
        }
    }

    const speaker = parseRelationshipSpeaker(raw);
    if (speaker) signals.activeSpeaker = speaker;

    const currentStage = customer?.salesContext?.leadStage || "NEW_LEAD";
    const nextStage = inferStageAdvance(raw, currentStage);
    if (nextStage) signals.leadStage = nextStage;

    return signals;
}

/**
 * Merge partial signals into a full sales context object.
 * @param {object|null|undefined} existing
 * @param {object} signals
 */
export function mergeSalesContext(existing = {}, signals = {}) {
    const merged = { ...(existing || {}) };

    if (signals.budget != null) merged.budget = signals.budget;
    if (signals.budgetDisplay) merged.budgetDisplay = signals.budgetDisplay;
    if (signals.familySize != null) merged.familySize = signals.familySize;
    if (signals.preferredVehicle) merged.preferredVehicle = signals.preferredVehicle;
    if (signals.leadStage) merged.leadStage = signals.leadStage;
    if (signals.activeSpeaker) merged.activeSpeaker = signals.activeSpeaker;

    if (signals.householdMembers?.length) {
        merged.household = mergeHousehold(merged.household, signals.householdMembers);
    }

    const primaryName = merged.household?.find((m) => m.role === "primary")?.name;
    const decisionMakers = new Set(merged.decisionMakers || []);
    if (primaryName) decisionMakers.add(primaryName);
    for (const dm of signals.decisionMakers || []) decisionMakers.add(dm);
    if (decisionMakers.size) merged.decisionMakers = [...decisionMakers];

    if (signals.objections?.length) {
        merged.objections = [...new Set([...(merged.objections || []), ...signals.objections])];
    }

    merged.updatedAt = new Date().toISOString();
    return merged;
}

/**
 * Persist sales context on tenant customer + durable metadata.
 * @param {string} companyId
 * @param {string} phone
 * @param {object} signals
 */
export async function persistSalesContext(companyId, phone, signals = {}) {
    if (!companyId || !phone || !Object.keys(signals).length) return null;

    const { getTenantCustomer } = await import("../storage/tenantStorage.js");
    const existing = (await getTenantCustomer(companyId, phone)) || {};
    const salesContext = mergeSalesContext(existing.salesContext, signals);

    await upsertTenantCustomer(companyId, phone, { salesContext });
    await upsertDurableCustomer(companyId, phone, {
        metadata: { ...(existing.metadata || {}), salesContext },
    }).catch(() => {});

    return salesContext;
}

/**
 * Format sales context block for WhatsApp system prompt injection.
 * @param {object|null|undefined} customer
 */
export function formatSalesContextForPrompt(customer) {
    const ctx = customer?.salesContext;
    if (!ctx || !Object.keys(ctx).length) return "";

    const lines = ["SALES CONTEXT (from customer record — use for guidance, not as inventory/booking truth):"];
    if (ctx.leadStage) lines.push(`- Lead stage: ${ctx.leadStage}`);
    if (ctx.budgetDisplay || ctx.budget) lines.push(`- Budget: ${ctx.budgetDisplay || `R${ctx.budget}`}`);
    if (ctx.preferredVehicle) lines.push(`- Preferred vehicle: ${ctx.preferredVehicle}`);
    if (ctx.familySize) lines.push(`- Family / passenger count: ${ctx.familySize}`);
    if (ctx.household?.length) {
        lines.push(
            `- Household: ${ctx.household.map((m) => `${m.name} (${m.role || "member"})`).join(", ")}`
        );
    }
    if (ctx.decisionMakers?.length) {
        lines.push(`- Decision-makers: ${ctx.decisionMakers.join(", ")}`);
    }
    if (ctx.activeSpeaker) lines.push(`- Active speaker this turn: ${ctx.activeSpeaker}`);
    if (ctx.objections?.length) lines.push(`- Objections: ${ctx.objections.join("; ")}`);

    return lines.join("\n");
}
