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

function parseMonthlyBudget(text) {
    const raw = String(text || "");
    const perMonth = raw.match(
        /\b(?:R\s?[\d][\d,]*(?:\.\d{2})?)\s*(?:per\s*month|\/\s*pm|p\.?\s*m\.?|monthly)\b/i
    );
    if (perMonth?.[0]) {
        const amountMatch = perMonth[0].match(/R\s?[\d][\d,]*(?:\.\d{2})?/i);
        if (amountMatch) {
            const display = normalizeZarAmount(amountMatch[0]);
            return {
                monthlyBudget: Number(display.replace(/[^\d]/g, "")),
                monthlyBudgetDisplay: `${display}/pm`,
            };
        }
    }
    const monthlyLead = raw.match(
        /\b(?:monthly|per\s*month)\s*(?:budget|payment|installment|afford)?\s*(?:of|is|:)?\s*(R\s?[\d][\d,]*(?:\.\d{2})?)/i
    );
    if (monthlyLead?.[1]) {
        const display = normalizeZarAmount(monthlyLead[1]);
        return {
            monthlyBudget: Number(display.replace(/[^\d]/g, "")),
            monthlyBudgetDisplay: `${display}/pm`,
        };
    }
    return null;
}

function parsePurchaseBudget(text) {
    const raw = String(text || "");
    if (/\b(?:per\s*month|\/\s*pm|p\.?\s*m\.?|monthly)\b/i.test(raw)) return null;

    const match = raw.match(/\b(?:budget|afford(?:able)?|up\s*to|spending)\s*(?:of|is|:)?\s*(R\s?[\d][\d,]*(?:\.\d{2})?)/i);
    if (match?.[1]) {
        const display = normalizeZarAmount(match[1]);
        const amount = Number(display.replace(/[^\d]/g, ""));
        return { purchaseBudget: amount, purchaseBudgetDisplay: display };
    }
    const loose = raw.match(/\bR\s?[\d][\d,]*(?:\.\d{2})?\b/i);
    if (loose && /\b(budget|afford|spend|vehicle|car|fortuner|hilux|price|quotation|quote)\b/i.test(raw)) {
        const display = normalizeZarAmount(loose[0]);
        return {
            purchaseBudget: Number(display.replace(/[^\d]/g, "")),
            purchaseBudgetDisplay: display,
        };
    }
    return null;
}

function parseNoBudgetLimit(text) {
    const raw = String(text || "").toLowerCase();
    if (/\b(no\s+limit|no\s+budget|unlimited|open\s+budget|budget\s+is\s+open|any\s+price)\b/.test(raw)) {
        return { purchaseBudget: null, purchaseBudgetDisplay: "no limit", budgetOpen: true };
    }
    if (/\b(?:over|above|more\s+than|at\s+least)\s+R\s?[\d]/i.test(text)) {
        const match = String(text).match(/\b(?:over|above|more\s+than|at\s+least)\s+(R\s?[\d][\d,]*(?:\.\d{2})?)/i);
        if (match?.[1]) {
            const display = normalizeZarAmount(match[1]);
            return {
                purchaseBudget: Number(display.replace(/[^\d]/g, "")),
                purchaseBudgetDisplay: `${display}+`,
                budgetOpen: false,
                budgetMinOnly: true,
            };
        }
    }
    return null;
}

function parseVehiclePreferences(text) {
    const raw = String(text || "").toLowerCase();
    const prefs = [];
    if (/\bsuv\b|\bsport\s+utility\b/.test(raw)) prefs.push("SUV");
    if (/\b(?:double\s+cab|bakkie|pickup|truck)\b/.test(raw)) prefs.push("bakkie");
    if (/\bsedan\b/.test(raw)) prefs.push("sedan");
    if (/\bhatch(?:back)?\b/.test(raw)) prefs.push("hatchback");
    if (/\b(?:7\s*seater|seven\s*seater)\b/.test(raw)) prefs.push("7-seater");
    return prefs.length ? prefs : null;
}

function parseQualificationSignals(text) {
    const raw = String(text || "").toLowerCase();
    const notes = [];
    if (/\b(reliab|dependab|low\s+maintenance)\b/.test(raw)) notes.push("reliability");
    if (/\b(perform|power|speed|fast)\b/.test(raw)) notes.push("performance");
    if (/\b(fuel\s+econom|efficien|low\s+consumption)\b/.test(raw)) notes.push("fuel economy");
    if (/\b(luxur|premium|comfort|leather)\b/.test(raw)) notes.push("luxury");
    if (/\b(practic|family|spacious|space|boot)\b/.test(raw)) notes.push("practicality");
    return notes.length ? notes : null;
}

function parsePreferredVehicle(text) {
    const raw = String(text || "");
    const match = raw.match(/\b(?:prefer|interested in|looking at|keen on|like the|want the)\s+(?:the\s+)?([\w\s-]{3,40}?(?:hilux|fortuner|everest|x5|ranger|corolla|land cruiser|bmw))/i);
    if (match?.[1]) return match[1].trim();
    const model = raw.match(/\b(hilux|fortuner|everest|x5|land cruiser|ranger|bmw)\b/i);
    if (model && /\b(prefer|book|test drive|that one|this one|original)\b/i.test(raw)) {
        return model[0];
    }
    return null;
}

function parseObjection(text) {
    const raw = String(text || "").toLowerCase();
    if (/\b(too small|not enough seats|won't fit|doesn't fit|need something bigger|need more seats)\b/.test(raw)) {
        const vehicle = raw.match(/\b(fortuner|hilux|everest|x5|bmw)\b/i);
        return vehicle ? `${vehicle[0]} too small for family` : "Vehicle too small for family";
    }
    return null;
}

function inferStageAdvance(text, currentStage) {
    const lower = String(text || "").toLowerCase();
    if (/\b(my name is|i am|i'm|call me)\b/.test(lower) && currentStage === "NEW_LEAD") return "IDENTIFIED";
    if (/\b(budget|afford|up to r|per month|\/pm)\b/.test(lower)) return "BUDGET_ESTABLISHED";
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
 * Build recommendation records from searchInventory results.
 * @param {object[]} vehicles
 * @param {{ reason?: string, requirements?: string[] }} [meta]
 */
export function buildRecommendedVehicleRecords(vehicles = [], { reason, requirements } = {}) {
    const now = new Date().toISOString();
    return vehicles
        .filter((v) => v?.vehicleId)
        .map((v, index) => ({
            vehicleId: v.vehicleId,
            stockNumber: v.stockNumber,
            title: v.title || v.label || [v.year, v.make, v.model].filter(Boolean).join(" "),
            make: v.make,
            model: v.model,
            price: v.price,
            reason: reason || null,
            requirements: requirements?.length ? [...requirements] : undefined,
            recommendedAt: now,
            position: index + 1,
        }));
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

    const monthly = parseMonthlyBudget(raw);
    if (monthly) Object.assign(signals, monthly);

    const noLimit = parseNoBudgetLimit(raw);
    if (noLimit) Object.assign(signals, noLimit);
    else {
        const purchase = parsePurchaseBudget(raw);
        if (purchase) Object.assign(signals, purchase);
    }

    const familySize = countPassengersFromText(raw);
    if (familySize != null) signals.familySize = familySize;

    const prefs = parseVehiclePreferences(raw);
    if (prefs) signals.vehiclePreferences = prefs;

    const qualification = parseQualificationSignals(raw);
    if (qualification) signals.customerRequirements = qualification;

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

    if (signals.monthlyBudget != null) {
        merged.monthlyBudget = signals.monthlyBudget;
        merged.monthlyBudgetDisplay = signals.monthlyBudgetDisplay;
    }

    if (signals.budgetOpen === true) {
        if (merged.purchaseBudget != null) {
            merged.previousPurchaseBudget = merged.purchaseBudget;
            merged.previousPurchaseBudgetDisplay = merged.purchaseBudgetDisplay;
        }
        merged.purchaseBudget = null;
        merged.purchaseBudgetDisplay = "no limit";
        merged.budgetOpen = true;
        merged.budget = null;
        merged.budgetDisplay = "no limit";
    } else if (signals.purchaseBudget != null || signals.budgetMinOnly) {
        if (merged.purchaseBudget != null && merged.purchaseBudget !== signals.purchaseBudget) {
            merged.previousPurchaseBudget = merged.purchaseBudget;
            merged.previousPurchaseBudgetDisplay = merged.purchaseBudgetDisplay;
        }
        merged.purchaseBudget = signals.purchaseBudget;
        merged.purchaseBudgetDisplay = signals.purchaseBudgetDisplay;
        merged.budgetOpen = false;
        merged.budget = signals.purchaseBudget;
        merged.budgetDisplay = signals.purchaseBudgetDisplay;
    }

    if (signals.budget != null && signals.purchaseBudget == null && !signals.budgetOpen) {
        if (merged.purchaseBudget != null && merged.purchaseBudget !== signals.budget) {
            merged.previousPurchaseBudget = merged.purchaseBudget;
            merged.previousPurchaseBudgetDisplay = merged.purchaseBudgetDisplay;
        }
        merged.purchaseBudget = signals.budget;
        merged.purchaseBudgetDisplay = signals.budgetDisplay;
        merged.budget = signals.budget;
        merged.budgetDisplay = signals.budgetDisplay;
    }

    if (signals.familySize != null) merged.familySize = signals.familySize;
    if (signals.preferredVehicle) merged.preferredVehicle = signals.preferredVehicle;
    if (signals.preferredVehicleId) merged.preferredVehicleId = signals.preferredVehicleId;
    if (signals.leadStage) merged.leadStage = signals.leadStage;
    if (signals.activeSpeaker) merged.activeSpeaker = signals.activeSpeaker;

    if (signals.vehiclePreferences?.length) {
        merged.vehiclePreferences = [...new Set([...(merged.vehiclePreferences || []), ...signals.vehiclePreferences])];
    }

    if (signals.customerRequirements?.length) {
        merged.customerRequirements = [
            ...new Set([...(merged.customerRequirements || []), ...signals.customerRequirements]),
        ];
    }

    if (signals.lastRecommendedVehicles?.length) {
        const byId = new Map((merged.lastRecommendedVehicles || []).map((v) => [v.vehicleId, v]));
        for (const v of signals.lastRecommendedVehicles) {
            byId.set(v.vehicleId, { ...byId.get(v.vehicleId), ...v });
        }
        merged.lastRecommendedVehicles = [...byId.values()].slice(0, 20);
    }

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
 * Persist search results as recommended vehicles in sales context.
 * @param {string} companyId
 * @param {string} phone
 * @param {object[]} vehicles
 * @param {{ reason?: string, requirements?: string[] }} [meta]
 */
export async function persistRecommendedToSalesContext(companyId, phone, vehicles = [], meta = {}) {
    if (!companyId || !phone || !vehicles?.length) return null;
    const records = buildRecommendedVehicleRecords(vehicles, meta);
    const requirements = meta.requirements || [];
    return persistSalesContext(companyId, phone, {
        lastRecommendedVehicles: records,
        leadStage: "OPTIONS_PRESENTED",
        customerRequirements: requirements.length ? requirements : undefined,
    });
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
 * Active purchase budget for inventory filtering — respects budget transitions.
 * @param {object|null|undefined} salesContext
 * @returns {{ maxPrice?: number, minPrice?: number, open?: boolean }}
 */
export function getActivePurchaseBudgetFilter(salesContext) {
    if (!salesContext) return {};
    if (salesContext.budgetOpen) return { open: true };
    if (salesContext.purchaseBudgetDisplay?.endsWith("+")) {
        return { minPrice: salesContext.purchaseBudget };
    }
    if (salesContext.purchaseBudget != null) return { maxPrice: salesContext.purchaseBudget };
    if (salesContext.budget != null) return { maxPrice: salesContext.budget };
    return {};
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
    if (ctx.purchaseBudgetDisplay || ctx.purchaseBudget != null) {
        lines.push(`- Purchase budget: ${ctx.purchaseBudgetDisplay || `R${ctx.purchaseBudget}`}`);
    } else if (ctx.budgetOpen) {
        lines.push("- Purchase budget: no limit");
    }
    if (ctx.previousPurchaseBudgetDisplay || ctx.previousPurchaseBudget != null) {
        lines.push(`- Previous purchase budget (superseded): ${ctx.previousPurchaseBudgetDisplay || `R${ctx.previousPurchaseBudget}`}`);
    }
    if (ctx.monthlyBudgetDisplay || ctx.monthlyBudget != null) {
        lines.push(
            `- Monthly affordability: ${ctx.monthlyBudgetDisplay || `R${ctx.monthlyBudget}/pm`} — NOT the same as purchase price; ask about deposit/finance terms before converting to a purchase budget`
        );
    }
    if (ctx.vehiclePreferences?.length) lines.push(`- Vehicle preferences: ${ctx.vehiclePreferences.join(", ")}`);
    if (ctx.customerRequirements?.length) {
        lines.push(`- Customer requirements: ${ctx.customerRequirements.join(", ")}`);
    }
    if (ctx.preferredVehicle) lines.push(`- Preferred vehicle: ${ctx.preferredVehicle}`);
    if (ctx.preferredVehicleId) lines.push(`- Preferred vehicleId: ${ctx.preferredVehicleId}`);
    if (ctx.lastRecommendedVehicles?.length) {
        lines.push("- Recently recommended (use these vehicleIds for follow-up — do NOT re-search by make/model):");
        for (const v of ctx.lastRecommendedVehicles.slice(0, 5)) {
            lines.push(
                `  • ${v.position || "?"}. ${v.title || v.make || "vehicle"} — vehicleId: ${v.vehicleId}, stock: ${v.stockNumber}${v.reason ? ` (${v.reason})` : ""}`
            );
        }
    }
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
