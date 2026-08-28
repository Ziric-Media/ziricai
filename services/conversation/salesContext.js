/**
 * Sales funnel / household context — lightweight lead-stage tracking for WhatsApp sales.
 */
import { upsertTenantCustomer } from "../storage/tenantStorage.js";
import { upsertDurableCustomer } from "../database/customerRepository.js";
import { countPassengersFromText } from "../inventory/seatingCapacity.js";
import { parseIntroducedPerson, parseRelationshipSpeaker, parseOccupation } from "../customerIdentity.js";

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

/** Phase 2 — sales progression stages encoded in prompt + context. */
export const SALES_PROGRESSION_STAGES = [
    "DISCOVERY",
    "QUALIFICATION",
    "RECOMMENDATION",
    "PRESENTATION",
    "ENGAGEMENT",
    "OBJECTION_HANDLING",
    "BUILD_DESIRE",
    "CONVERSION",
    "PURCHASE_INTENT",
];

const LEAD_TO_SALES_PROGRESSION = {
    NEW_LEAD: "DISCOVERY",
    IDENTIFIED: "DISCOVERY",
    BUDGET_ESTABLISHED: "QUALIFICATION",
    VEHICLE_SEARCH: "QUALIFICATION",
    OPTIONS_PRESENTED: "RECOMMENDATION",
    PREFERRED_VEHICLE: "PRESENTATION",
    FAMILY_CONSULTED: "ENGAGEMENT",
    VEHICLE_CONFIRMED: "BUILD_DESIRE",
    TEST_DRIVE_BOOKED: "CONVERSION",
};

/** Model keywords → typical customer needs (general knowledge — not inventory facts). */
const MODEL_NEED_HINTS = {
    corolla: ["reliability", "fuel economy", "practicality"],
    "corolla cross": ["practicality", "SUV-style space", "reliability"],
    hilux: ["durability", "utility", "work and leisure"],
    fortuner: ["family space", "7 seats", "reliability"],
    everest: ["family space", "7 seats", "capability"],
    x5: ["luxury", "performance", "status"],
    x3: ["luxury", "compact SUV", "prestige"],
    ranger: ["utility", "towing", "adventure"],
    polo: ["affordability", "city driving", "efficiency"],
    rav4: ["reliability", "hybrid efficiency", "SUV practicality"],
};

function normalizeZarAmount(raw) {
    return String(raw || "")
        .replace(/\s+/g, "")
        .toUpperCase();
}

/** Matches R amounts with comma, space, or narrow-no-break-space thousands separators (en-ZA). */
const ZAR_AMOUNT = String.raw`R\s?[\d][\d,\s\u00A0\u202F]*(?:\.\d{2})?`;

function parseZarAmountToken(raw) {
    const display = normalizeZarAmount(raw);
    const compact = display.replace(/\s+/g, "");
    if (/k$/i.test(compact)) {
        const base = Number(compact.replace(/[^\d.]/gi, ""));
        const amount = Number.isFinite(base) ? Math.round(base * 1000) : NaN;
        return { display: compact, amount };
    }
    return { display, amount: Number(display.replace(/[^\d]/g, "")) };
}

function parseMonthlyBudget(text) {
    const raw = String(text || "");
    if (/\b(?:salary|income|earn|earning|paid)\b/i.test(raw)) return null;

    const perMonth = raw.match(
        /\b(?:R\s?[\d][\d,]*(?:\.\d{2})?)\s*(?:per\s*month|\/\s*pm|p\.?\s*m\.?|monthly)\b/i
    );
    if (perMonth?.[0]) {
        const amountMatch = perMonth[0].match(/R\s?[\d][\d,]*(?:\.\d{2})?/i);
        if (amountMatch) {
            const display = normalizeZarAmount(amountMatch[0]);
            return {
                targetMonthlyPayment: Number(display.replace(/[^\d]/g, "")),
                targetMonthlyPaymentDisplay: `${display}/pm`,
            };
        }
    }
    const monthlyLead = raw.match(
        /\b(?:monthly|per\s*month)\s*(?:budget|payment|installment|afford)?\s*(?:of|is|:)?\s*(R\s?[\d][\d,]*(?:\.\d{2})?)/i
    );
    if (monthlyLead?.[1]) {
        const display = normalizeZarAmount(monthlyLead[1]);
        return {
            targetMonthlyPayment: Number(display.replace(/[^\d]/g, "")),
            targetMonthlyPaymentDisplay: `${display}/pm`,
        };
    }
    const rangeMatch = raw.match(
        /\b(?:R\s?[\d][\d,]*(?:\.\d{2})?|R?\s?[\d]+k)\s*(?:-|to)\s*(?:R\s?[\d][\d,]*(?:\.\d{2})?|R?\s?[\d]+k)\s*(?:per\s*month|\/\s*pm|p\.?\s*m\.?|monthly)\b/i
    );
    if (rangeMatch?.[0]) {
        const display = normalizeZarAmount(rangeMatch[0].replace(/\s*(?:per\s*month|\/\s*pm|p\.?\s*m\.?|monthly)\b/i, ""));
        return {
            targetMonthlyPaymentDisplay: `${display}/pm`,
        };
    }
    return null;
}

function parseIncome(text) {
    const raw = String(text || "");
    if (!/\b(?:salary|income|earn|earning|paid|make|making)\b/i.test(raw)) return null;

    const direct = raw.match(
        /\b(?:salary|income|earn(?:ing)?s?|paid|make|making)\s*(?:is|of|:)?\s*(R\s?[\d][\d,]*(?:\.\d{2})?)/i
    );
    if (direct?.[1]) {
        const display = normalizeZarAmount(direct[1]);
        return {
            income: Number(display.replace(/[^\d]/g, "")),
            incomeDisplay: `${display}/month`,
        };
    }

    const trailing = raw.match(
        /\b(R\s?[\d][\d,]*(?:\.\d{2})?|R\s?[\d]+k)\s*(?:per\s*month|\/\s*pm|p\.?\s*m\.?|monthly)\b/i
    );
    if (trailing?.[1] && /\b(?:salary|income|earn|paid)\b/i.test(raw)) {
        const { display, amount } = parseZarAmountToken(trailing[1]);
        return {
            income: amount,
            incomeDisplay: `${display}/month`,
        };
    }

    const shorthand = raw.match(/\b(?:salary|income|earn(?:ing)?s?)\s*(?:is|of|:)?\s*(R\s?[\d]+k)\b/i);
    if (shorthand?.[1]) {
        const { display, amount } = parseZarAmountToken(shorthand[1]);
        return { income: amount, incomeDisplay: `${display}/month` };
    }
    return null;
}

function parsePurchaseBudget(text) {
    const raw = String(text || "");
    if (/\b(?:per\s*month|\/\s*pm|p\.?\s*m\.?|monthly|salary|income|earn)\b/i.test(raw)) return null;

    const match = raw.match(
        new RegExp(String.raw`\b(?:budget|afford(?:able)?|up\s*to|spending)\s*(?:of|is|:)?\s*(${ZAR_AMOUNT})`, "i")
    );
    if (match?.[1]) {
        const { display, amount } = parseZarAmountToken(match[1]);
        return { confirmedPurchaseBudget: amount, confirmedPurchaseBudgetDisplay: display };
    }
    const loose = raw.match(new RegExp(String.raw`\b(${ZAR_AMOUNT})\b`, "i"));
    if (loose && /\b(budget|afford|spend|vehicle|car|fortuner|hilux|price|quotation|quote)\b/i.test(raw)) {
        const { display, amount } = parseZarAmountToken(loose[1]);
        return {
            confirmedPurchaseBudget: amount,
            confirmedPurchaseBudgetDisplay: display,
        };
    }
    return null;
}

function parseForgetBudget(text) {
    const raw = String(text || "").toLowerCase();
    if (
        /\bforget\s+(?:my\s+)?budget\b/.test(raw) ||
        /\bignore\s+(?:my\s+)?budget\b/.test(raw) ||
        /\b(?:drop|clear|remove)\s+(?:my\s+)?budget\b/.test(raw) ||
        /\bbudget\s+(?:doesn'?t|does\s+not)\s+matter\b/.test(raw) ||
        /\bregardless\s+of\s+price\b/.test(raw)
    ) {
        return {
            confirmedPurchaseBudget: null,
            confirmedPurchaseBudgetDisplay: "no limit",
            budgetOpen: true,
        };
    }
    return null;
}

function isBudgetClearIntent(text) {
    return parseForgetBudget(text) != null || parseNoBudgetLimit(text)?.budgetOpen === true;
}

function parseNoBudgetLimit(text) {
    const forget = parseForgetBudget(text);
    if (forget) return forget;

    const raw = String(text || "").toLowerCase();
    if (
        /\b(no\s+limit|no\s+budget|unlimited|open\s+budget|budget\s+is\s+open|any\s+price|any\s+budget|price\s+doesn'?t\s+matter|doesn'?t\s+matter\s+(?:what\s+)?price|what(?:'s|\s+is)\s+in\s+stock\s+any\s+price)\b/.test(
            raw
        )
    ) {
        return {
            confirmedPurchaseBudget: null,
            confirmedPurchaseBudgetDisplay: "no limit",
            budgetOpen: true,
        };
    }
    if (/\b(?:over|above|more\s+than|at\s+least)\s+R\s?[\d]/i.test(text)) {
        const match = String(text).match(
            new RegExp(String.raw`\b(?:over|above|more\s+than|at\s+least)\s+(${ZAR_AMOUNT})`, "i")
        );
        if (match?.[1]) {
            const { display, amount } = parseZarAmountToken(match[1]);
            return {
                confirmedPurchaseBudget: amount,
                confirmedPurchaseBudgetDisplay: `${display}+`,
                budgetOpen: false,
                budgetMinOnly: true,
            };
        }
    }
    return null;
}

function parseActiveBodyType(text) {
    const raw = String(text || "").toLowerCase();
    if (/\b(?:show\s+me|looking\s+for|want|need|prefer|interested\s+in)\s+(?:an?\s+)?suvs?\b|\bsuvs?\s+only\b|\b(?:only|just)\s+suvs?\b/.test(raw)) {
        return "SUV";
    }
    if (/\b(?:show\s+me|looking\s+for|want|need|prefer)\s+(?:an?\s+)?sedans?\b|\bsedans?\s+only\b/.test(raw)) {
        return "sedan";
    }
    if (/\b(?:show\s+me|looking\s+for|want|need|prefer)\s+(?:an?\s+)?hatch(?:back)?s?\b/.test(raw)) {
        return "hatchback";
    }
    if (
        /\b(?:show\s+me|looking\s+for|want|need|prefer)\s+(?:an?\s+)?(?:bakkies?|pickups?|double\s+cabs?)\b|\bbakkies?\s+only\b/.test(
            raw
        )
    ) {
        return "bakkie";
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
    const match = raw.match(/\b(?:prefer|interested in|looking at|keen on|like the|want the|wanted the|really wanted)\s+(?:the\s+)?([\w\s-]{3,40}?(?:hilux|fortuner|everest|x5|ranger|corolla|land cruiser|bmw|rav4))/i);
    if (match?.[1]) return match[1].trim();
    const model = raw.match(/\b(hilux|fortuner|everest|x5|land cruiser|ranger|bmw|rav4)\b/i);
    if (model && /\b(prefer|book|test drive|that one|this one|original|wanted|really wanted|still want)\b/i.test(raw)) {
        return model[0];
    }
    return null;
}

function parsePreferredVehicleRecovery(text) {
    const raw = String(text || "").toLowerCase();
    if (/\b(really wanted|still want|was hoping for|had my heart set on|prefer.*over)\b/.test(raw)) {
        const vehicle = raw.match(/\b(fortuner|hilux|everest|x5|ranger|rav4|corolla|bmw)\b/i);
        return vehicle ? { preferredVehicle: vehicle[0], recoveryMode: true } : { recoveryMode: true };
    }
    return null;
}

function parseObjection(text) {
    const raw = String(text || "").toLowerCase();
    if (/\b(too small|not enough seats|won't fit|doesn't fit|need something bigger|need more seats)\b/.test(raw)) {
        const vehicle = raw.match(/\b(fortuner|hilux|everest|x5|bmw)\b/i);
        return vehicle ? `${vehicle[0]} too small for family` : "Vehicle too small for family";
    }
    if (/\b(too expensive|over budget|can't afford|price is high|out of my price range|too pricey)\b/.test(raw)) {
        return "price too high";
    }
    if (/\b(too many km|high mileage|too much mileage|lots of km|worried about mileage)\b/.test(raw)) {
        return "mileage concerns";
    }
    if (/\b(not a fan of|don't like|don't want|prefer not|only want|must be)\s+(?:a\s+)?([a-z][a-z\s-]{1,20})\b/.test(raw)) {
        const brandMatch = raw.match(/\b(not a fan of|don't like|only want|must be)\s+(?:a\s+)?(toyota|bmw|ford|mercedes|vw|volkswagen|nissan|isuzu)\b/i);
        if (brandMatch?.[2]) return `brand preference: ${brandMatch[2]}`;
    }
    return null;
}

/**
 * Detect "which is better X or Y" comparison intent from customer text.
 * @param {string} text
 * @returns {{ detected: boolean, terms?: string[] }}
 */
export function detectComparisonIntent(text) {
    const raw = String(text || "");
    if (!raw.trim()) return { detected: false };

    if (/\bwhich\s+(?:one\s+)?(?:is\s+)?(?:better|best|right|smarter)\b/i.test(raw)) {
        const terms = extractComparisonTerms(raw);
        return { detected: true, terms };
    }
    if (/\bcompare\b/i.test(raw) && /\b(?:or|vs|versus|between)\b/i.test(raw)) {
        return { detected: true, terms: extractComparisonTerms(raw) };
    }
    const orMatch = raw.match(
        /\b(?:between|choose between)\s+(.+?)\s+(?:and|or|vs\.?|versus)\s+(.+?)(?:\?|$)/i
    );
    if (orMatch) {
        return { detected: true, terms: [orMatch[1].trim(), orMatch[2].trim()] };
    }
    if (/\b(\w[\w\s-]{2,30}?)\s+(?:vs\.?|versus|or)\s+(\w[\w\s-]{2,30}?)\b/i.test(raw)) {
        const m = raw.match(/\b(\w[\w\s-]{2,30}?)\s+(?:vs\.?|versus|or)\s+(\w[\w\s-]{2,30}?)\b/i);
        if (m) return { detected: true, terms: [m[1].trim(), m[2].trim()] };
    }
    return { detected: false };
}

function extractComparisonTerms(text) {
    const raw = String(text || "");
    const models = [];
    for (const kw of [
        "fortuner",
        "hilux",
        "everest",
        "x5",
        "x3",
        "corolla",
        "ranger",
        "rav4",
        "polo",
        "bmw",
        "toyota",
        "ford",
    ]) {
        if (new RegExp(`\\b${kw}\\b`, "i").test(raw)) models.push(kw);
    }
    return models.length >= 2 ? models.slice(0, 4) : models;
}

/**
 * Distinguish explicit brand/model REQUEST from underlying NEED signals.
 * @param {string} text
 * @returns {{ request?: string|null, needs?: string[] }}
 */
export function detectNeedsVsRequest(text) {
    const raw = String(text || "").toLowerCase();
    const result = { request: null, needs: [] };

    const brandRequest = raw.match(
        /\b(?:want|looking for|interested in|need|prefer|show me)\s+(?:a\s+)?(?:an?\s+)?([a-z][a-z0-9\s-]{2,30}?)(?:\s+(?:please|only|specifically))?\b/i
    );
    if (brandRequest?.[1]) {
        const candidate = brandRequest[1].trim();
        if (/\b(bmw|toyota|ford|mercedes|volkswagen|vw|nissan|isuzu|mazda|hyundai|kia|mg|audi)\b/i.test(candidate)) {
            result.request = candidate;
        } else if (/\b(hilux|fortuner|everest|x5|corolla|ranger|rav4|polo|x3)\b/i.test(candidate)) {
            result.request = candidate;
        }
    }

    const directModel = raw.match(/\b(bmw|toyota|ford|mercedes|hilux|fortuner|everest|x5|corolla cross|corolla)\b/i);
    if (!result.request && directModel) result.request = directModel[0];

    for (const [model, needs] of Object.entries(MODEL_NEED_HINTS)) {
        if (raw.includes(model)) result.needs.push(...needs);
    }

    const qualification = parseQualificationSignals(text);
    if (qualification) result.needs.push(...qualification);

    if (/\b(status|prestige|luxury|premium)\b/.test(raw)) result.needs.push("luxury/status");
    if (/\b(family|kids|children|school run)\b/.test(raw)) result.needs.push("family practicality");
    if (/\b(commute|city|township|fuel)\b/.test(raw)) result.needs.push("efficiency");
    if (/\b(off.?road|4x4|farm| gravel)\b/.test(raw)) result.needs.push("capability");

    result.needs = [...new Set(result.needs.map((n) => n.toLowerCase()))];
    return result;
}

/**
 * Map lead stage to Phase 2 sales progression stage.
 * @param {string|null|undefined} leadStage
 */
export function getSalesProgressionStage(leadStage) {
    return LEAD_TO_SALES_PROGRESSION[leadStage] || "DISCOVERY";
}

/**
 * Build ordered fallback search strategies when primary inventory search returns empty.
 * @param {{ query?: string, filters?: object, salesContext?: object }} params
 */
export function buildAlternativeSearchStrategy({ query = "", filters = {}, salesContext = {} } = {}) {
    const strategies = [];
    const limit = filters.limit || 10;
    const familySize = salesContext?.familySize ?? null;
    const minSeats = filters.minSeats ?? (familySize != null ? familySize : undefined);

    const push = (nextFilters, reason) => {
        strategies.push({
            filters: { ...nextFilters, limit },
            reason,
        });
    };

    const without = (source, ...keys) => {
        const next = { ...source };
        for (const key of keys) next[key] = undefined;
        return next;
    };

    if (filters.make || filters.model || filters.makes?.length) {
        push(
            without(filters, "make", "model", "makes"),
            "removed brand/model filter — show similar in-stock alternatives"
        );
    }

    if (filters.bodyType) {
        const relaxed = without(filters, "make", "model", "makes", "bodyType");
        if (minSeats != null) relaxed.minSeats = minSeats;
        push(relaxed, "removed body type filter — show closest category alternatives");
    }

    if (filters.maxPrice != null) {
        const relaxedMax = Math.round(Number(filters.maxPrice) * 1.2 + 50000);
        const relaxed = without(filters, "make", "model", "makes", "bodyType");
        relaxed.maxPrice = relaxedMax;
        push(relaxed, `relaxed maxPrice to R${relaxedMax.toLocaleString("en-ZA")} — show closest options`);
    }

    if (filters.maxPrice != null) {
        const relaxed = without(filters, "make", "model", "makes", "bodyType", "maxPrice");
        if (minSeats != null) relaxed.minSeats = minSeats;
        push(relaxed, "removed price cap — show value options near stated budget");
    }

    push(
        minSeats != null ? { minSeats, limit } : { limit },
        "broad inventory browse — never return empty-handed"
    );

    const seen = new Set();
    return strategies.filter((s) => {
        const key = JSON.stringify(s.filters);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Ethical upsell band — one vehicle slightly above confirmed budget for optional mention.
 * @param {number} maxPrice
 */
export function getEthicalUpsellPriceBand(maxPrice) {
    const cap = Number(maxPrice);
    if (!Number.isFinite(cap) || cap <= 0) return null;
    return {
        minPrice: cap,
        maxPrice: Math.round(cap * 1.15 + 25000),
    };
}

/**
 * Closing guidance based on sales progression — every turn should move toward a sale.
 * @param {object|null|undefined} ctx
 */
export function formatClosingSuggestion(ctx) {
    if (!ctx) return "";

    const stage = getSalesProgressionStage(ctx.leadStage);
    const lines = ["SALES CLOSING GUIDANCE (end every reply with a meaningful next step — never a dead-end filler question):"];

    if (ctx.leadStage === "TEST_DRIVE_BOOKED") {
        lines.push(
            "- Post-test-drive follow-up: confirm the plan warmly; set expectation for follow-up after the drive."
        );
        lines.push(
            '- Example: "After you\'ve driven both, we can compare notes and work out which makes most sense for your family and budget."'
        );
        return lines.join("\n");
    }

    if (ctx.preferredVehicleRecovery || ctx.preferredVehicle) {
        lines.push(
            `- Proactive recovery: customer wants ${ctx.preferredVehicle || "their preferred vehicle"} — stay focused on that vehicle; offer next slot, photos, or finance — do NOT pivot to unrelated alternatives unless inventory confirms unavailability.`
        );
    }

    if (ctx.comparisonIntent?.detected) {
        lines.push(
            "- Comparison close: give a clear recommendation with reasoning tied to customer profile; end with test drive both or book the preferred one."
        );
        return lines.join("\n");
    }

    switch (stage) {
        case "DISCOVERY":
            lines.push("- Soft close: ask one qualifying question about lifestyle, family, or daily use before searching.");
            break;
        case "QUALIFICATION":
            lines.push("- Recommendation close: shortlist 2–3 in-stock options and ask which direction feels right.");
            break;
        case "RECOMMENDATION":
        case "PRESENTATION":
            lines.push("- Test-drive close: invite a test drive on the strongest match or offer to compare top 2.");
            break;
        case "ENGAGEMENT":
            lines.push("- Comparison close: address co-decision-maker concerns; offer joint test drive.");
            break;
        case "OBJECTION_HANDLING":
            lines.push("- Redirect close: acknowledge objection, show alternative from inventory, ask to revisit top pick.");
            break;
        case "BUILD_DESIRE":
            lines.push("- Purchase-intent close: confirm chosen vehicle; offer finance discussion or deposit next step.");
            break;
        case "CONVERSION":
            lines.push("- Confirm booking warmly; mention follow-up after test drive.");
            break;
        default:
            lines.push("- Always propose a concrete next step: shortlist, compare, test drive, or finance chat.");
    }

    return lines.join("\n");
}

function inferStageAdvance(text, currentStage) {
    const lower = String(text || "").toLowerCase();
    if (/\b(my name is|i am|i'm|call me)\b/.test(lower) && currentStage === "NEW_LEAD") return "IDENTIFIED";
    if (!isBudgetClearIntent(text) && /\b(budget|afford|up to r|per month|\/pm)\b/.test(lower)) {
        return "BUDGET_ESTABLISHED";
    }
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

/** Budget states for prompt injection — never conflate income with purchase budget. */
export const BUDGET_STATES = {
    UNSPECIFIED: "unspecified",
    INCOME_ONLY: "income-only",
    CONFIRMED_PURCHASE: "confirmed-purchase",
    BUDGET_OPEN: "budget-open",
};

/**
 * Resolve budget state from sales context.
 * @param {object|null|undefined} ctx
 * @returns {string}
 */
export function getBudgetState(ctx) {
    if (!ctx || !Object.keys(ctx).length) return BUDGET_STATES.UNSPECIFIED;
    if (ctx.budgetOpen === true) return BUDGET_STATES.BUDGET_OPEN;
    const purchaseAmount =
        ctx.confirmedPurchaseBudget ?? ctx.purchaseBudget ?? ctx.budget ?? null;
    if (purchaseAmount != null || ctx.confirmedPurchaseBudgetDisplay?.endsWith("+")) {
        return BUDGET_STATES.CONFIRMED_PURCHASE;
    }
    if (
        ctx.income != null ||
        ctx.targetMonthlyPayment != null ||
        ctx.monthlyBudget != null ||
        ctx.incomeDisplay ||
        ctx.targetMonthlyPaymentDisplay ||
        ctx.monthlyBudgetDisplay
    ) {
        return BUDGET_STATES.INCOME_ONLY;
    }
    return BUDGET_STATES.UNSPECIFIED;
}

/**
 * Build recommendation records from searchInventory results.
 * @param {object} vehicle
 * @param {{ familySize?: number|null }} [options]
 */
export function buildInventoryRecommendationReason(vehicle, { familySize = null } = {}) {
    if (!vehicle) return null;
    const parts = [];
    const benefits = [];
    const label = vehicle.year || vehicle.title || vehicle.label || "This vehicle";
    const seating =
        vehicle.seatingCapacity ??
        vehicle.metadata?.seatingCapacity ??
        null;
    const bodyType = vehicle.bodyType ?? vehicle.metadata?.bodyType ?? null;

    if (familySize != null && seating != null) {
        parts.push(
            seating >= familySize
                ? `${seating}-seat capacity fits your family of ${familySize}`
                : `${seating}-seat capacity — may not fit all ${familySize} passengers`
        );
        if (seating >= familySize) {
            benefits.push("room for everyone on school runs and family trips");
        }
    } else if (seating != null) {
        parts.push(`${seating} seats`);
        if (seating >= 7) benefits.push("generous space for passengers and luggage");
    }
    if (bodyType) parts.push(String(bodyType));
    if (vehicle.year) parts.push(`${vehicle.year} model`);
    if (vehicle.mileage != null) {
        parts.push(`${Number(vehicle.mileage).toLocaleString("en-ZA")} km`);
        if (Number(vehicle.mileage) < 60000) benefits.push("lower km often means less wear for years ahead");
        else if (Number(vehicle.mileage) > 100000) benefits.push("mature km can mean stronger value for your budget");
    }
    if (vehicle.price != null) parts.push(`R${Number(vehicle.price).toLocaleString("en-ZA")}`);
    if (vehicle.fuel && /diesel/i.test(String(vehicle.fuel))) {
        benefits.push("diesel efficiency suits longer commutes and highway trips");
    }
    if (vehicle.location) parts.push(`at ${vehicle.location}`);
    if (!parts.length) return null;

    const specLine = `${label}: ${parts.join(", ")}`;
    if (!benefits.length) return specLine;
    return `${specLine} — ${benefits.slice(0, 2).join("; ")}`;
}

/**
 * Compare 2+ vehicles using verified inventory fields only.
 * @param {object[]} vehicles
 * @returns {string}
 */
export function formatVehicleComparison(vehicles = []) {
    const list = (vehicles || []).filter((v) => v?.vehicleId || v?.title || v?.make);
    if (list.length < 2) return "";

    const lines = ["VEHICLE COMPARISON (from inventory — cite these trade-offs when presenting 2+ options):"];
    for (const v of list.slice(0, 5)) {
        const label = v.title || [v.year, v.make, v.model].filter(Boolean).join(" ") || v.vehicleId;
        const specs = [];
        if (v.price != null) specs.push(`R${Number(v.price).toLocaleString("en-ZA")}`);
        if (v.mileage != null) specs.push(`${Number(v.mileage).toLocaleString("en-ZA")} km`);
        const seats = v.seatingCapacity ?? v.metadata?.seatingCapacity;
        if (seats != null) specs.push(`${seats} seats`);
        if (v.fuel) specs.push(v.fuel);
        if (v.transmission) specs.push(v.transmission);
        if (v.bodyType ?? v.metadata?.bodyType) specs.push(v.bodyType ?? v.metadata?.bodyType);
        lines.push(`- ${label}: ${specs.join(" · ") || "see inventory record"}`);
    }

    const priced = list.filter((v) => v.price != null);
    if (priced.length >= 2) {
        const sorted = [...priced].sort((a, b) => Number(a.price) - Number(b.price));
        const cheapest = sorted[0];
        const priciest = sorted[sorted.length - 1];
        const cheapLabel = cheapest.title || cheapest.make || "Option A";
        const priceyLabel = priciest.title || priciest.make || "Option B";
        if (cheapest.vehicleId !== priciest.vehicleId) {
            lines.push(
                `- Price trade-off: ${cheapLabel} is lower at R${Number(cheapest.price).toLocaleString("en-ZA")}; ${priceyLabel} is R${Number(priciest.price).toLocaleString("en-ZA")}`
            );
        }
    }

    const withKm = list.filter((v) => v.mileage != null);
    if (withKm.length >= 2) {
        const sorted = [...withKm].sort((a, b) => Number(a.mileage) - Number(b.mileage));
        const lowest = sorted[0];
        const highest = sorted[sorted.length - 1];
        if (lowest.vehicleId !== highest.vehicleId) {
            lines.push(
                `- Mileage trade-off: ${lowest.title || lowest.make} has lower km (${Number(lowest.mileage).toLocaleString("en-ZA")}); ${highest.title || highest.make} has ${Number(highest.mileage).toLocaleString("en-ZA")} km`
            );
        }
    }

    return lines.join("\n");
}

/**
 * Compare locations across recommended/booked vehicles — warn when they differ.
 * @param {object[]} vehicles
 */
export function compareRecommendedVehicleLocations(vehicles = []) {
    const located = (vehicles || [])
        .filter((v) => v?.location)
        .map((v) => ({
            vehicleId: v.vehicleId,
            title: v.title || v.label || [v.year, v.make, v.model].filter(Boolean).join(" "),
            year: v.year,
            location: String(v.location).trim(),
        }));

    if (located.length < 2) {
        return { sameLocation: true, locations: [...new Set(located.map((v) => v.location))], warning: null };
    }

    const unique = [...new Set(located.map((v) => v.location.toLowerCase()))];
    if (unique.length <= 1) {
        return { sameLocation: true, locations: unique, warning: null };
    }

    const detail = located.map((v) => `${v.year || v.title} is ${v.location}`).join("; ");
    return {
        sameLocation: false,
        locations: unique,
        warning: `These vehicles are at different locations — verify before agreeing they are at the same place: ${detail}.`,
        details: located,
    };
}

/**
 * Format location mismatch guidance for prompt injection.
 * @param {object[]} vehicles
 */
export function formatLocationComparisonForPrompt(vehicles = []) {
    const cmp = compareRecommendedVehicleLocations(vehicles);
    if (cmp.sameLocation || !cmp.warning) return "";
    return `LOCATION VERIFICATION (from inventory): ${cmp.warning}`;
}

export function buildRecommendedVehicleRecords(vehicles = [], { reason, requirements, familySize } = {}) {
    const now = new Date().toISOString();
    return vehicles
        .filter((v) => v?.vehicleId)
        .map((v, index) => ({
            vehicleId: v.vehicleId,
            stockNumber: v.stockNumber,
            title: v.title || v.label || [v.year, v.make, v.model].filter(Boolean).join(" "),
            make: v.make,
            model: v.model,
            year: v.year,
            price: v.price,
            mileage: v.mileage,
            fuel: v.fuel,
            transmission: v.transmission,
            bodyType: v.bodyType ?? v.metadata?.bodyType ?? null,
            seatingCapacity: v.seatingCapacity ?? v.metadata?.seatingCapacity ?? null,
            location: v.location || null,
            primaryImageUrl: Array.isArray(v.images) ? v.images[0] || null : null,
            reason: reason || buildInventoryRecommendationReason(v, { familySize }),
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

    const income = parseIncome(raw);
    if (income) Object.assign(signals, income);

    const monthly = parseMonthlyBudget(raw);
    if (monthly) Object.assign(signals, monthly);

    const noLimit = parseNoBudgetLimit(raw);
    if (noLimit) Object.assign(signals, noLimit);
    else {
        const purchase = parsePurchaseBudget(raw);
        if (purchase) Object.assign(signals, purchase);
    }

    const occupation = parseOccupation(raw);
    if (occupation) signals.occupation = occupation;

    const familySize = countPassengersFromText(raw);
    if (familySize != null) signals.familySize = familySize;

    const bodyType = parseActiveBodyType(raw);
    if (bodyType) signals.bodyType = bodyType;

    const prefs = parseVehiclePreferences(raw);
    if (prefs) signals.vehiclePreferences = prefs;

    const qualification = parseQualificationSignals(raw);
    if (qualification) signals.customerRequirements = qualification;

    const preferredVehicle = parsePreferredVehicle(raw);
    if (preferredVehicle) signals.preferredVehicle = preferredVehicle;

    const recovery = parsePreferredVehicleRecovery(raw);
    if (recovery?.preferredVehicle) signals.preferredVehicle = recovery.preferredVehicle;
    if (recovery?.recoveryMode) signals.preferredVehicleRecovery = true;

    const objection = parseObjection(raw);
    if (objection) signals.objections = [objection];

    const comparison = detectComparisonIntent(raw);
    if (comparison.detected) signals.comparisonIntent = comparison;

    const needsVsRequest = detectNeedsVsRequest(raw);
    if (needsVsRequest.request) signals.requestedVehicle = needsVsRequest.request;
    if (needsVsRequest.needs?.length) {
        signals.customerRequirements = [
            ...new Set([...(signals.customerRequirements || []), ...needsVsRequest.needs]),
        ];
    }

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

    if (signals.income != null) {
        merged.income = signals.income;
        merged.incomeDisplay = signals.incomeDisplay;
    }

    if (signals.targetMonthlyPayment != null) {
        merged.targetMonthlyPayment = signals.targetMonthlyPayment;
        merged.targetMonthlyPaymentDisplay = signals.targetMonthlyPaymentDisplay;
        merged.monthlyBudget = signals.targetMonthlyPayment;
        merged.monthlyBudgetDisplay = signals.targetMonthlyPaymentDisplay;
    } else if (signals.targetMonthlyPaymentDisplay) {
        merged.targetMonthlyPaymentDisplay = signals.targetMonthlyPaymentDisplay;
        merged.monthlyBudgetDisplay = signals.targetMonthlyPaymentDisplay;
    }

    if (signals.occupation) merged.occupation = signals.occupation;

    if (signals.budgetOpen === true) {
        merged.confirmedPurchaseBudget = null;
        merged.confirmedPurchaseBudgetDisplay = "no limit";
        merged.purchaseBudget = null;
        merged.purchaseBudgetDisplay = "no limit";
        merged.budgetOpen = true;
        merged.budget = null;
        merged.budgetDisplay = "no limit";
        merged.estimatedPurchaseBudget = null;
        merged.estimatedPurchaseBudgetDisplay = null;
        merged.estimatedPurchaseBudgetIsEstimate = false;
        merged.previousPurchaseBudget = null;
        merged.previousPurchaseBudgetDisplay = null;
    } else if (signals.confirmedPurchaseBudget != null || signals.budgetMinOnly) {
        const nextBudget = signals.confirmedPurchaseBudget;
        const nextDisplay = signals.confirmedPurchaseBudgetDisplay;
        const prior = merged.confirmedPurchaseBudget ?? merged.purchaseBudget;
        if (prior != null && prior !== nextBudget) {
            merged.previousPurchaseBudget = prior;
            merged.previousPurchaseBudgetDisplay =
                merged.confirmedPurchaseBudgetDisplay ?? merged.purchaseBudgetDisplay;
        }
        merged.confirmedPurchaseBudget = nextBudget;
        merged.confirmedPurchaseBudgetDisplay = nextDisplay;
        merged.purchaseBudget = nextBudget;
        merged.purchaseBudgetDisplay = nextDisplay;
        merged.budgetOpen = false;
        merged.budget = nextBudget;
        merged.budgetDisplay = nextDisplay;
    }

    if (signals.estimatedPurchaseBudget != null) {
        merged.estimatedPurchaseBudget = signals.estimatedPurchaseBudget;
        merged.estimatedPurchaseBudgetDisplay = signals.estimatedPurchaseBudgetDisplay;
        merged.estimatedPurchaseBudgetIsEstimate = true;
    }

    if (signals.budget != null && signals.confirmedPurchaseBudget == null && !signals.budgetOpen) {
        if (merged.confirmedPurchaseBudget != null && merged.confirmedPurchaseBudget !== signals.budget) {
            merged.previousPurchaseBudget = merged.confirmedPurchaseBudget ?? merged.purchaseBudget;
            merged.previousPurchaseBudgetDisplay =
                merged.confirmedPurchaseBudgetDisplay ?? merged.purchaseBudgetDisplay;
        }
        merged.confirmedPurchaseBudget = signals.budget;
        merged.confirmedPurchaseBudgetDisplay = signals.budgetDisplay;
        merged.purchaseBudget = signals.budget;
        merged.purchaseBudgetDisplay = signals.budgetDisplay;
        merged.budget = signals.budget;
        merged.budgetDisplay = signals.budgetDisplay;
    }

    if (signals.familySize != null) merged.familySize = signals.familySize;
    if (signals.preferredVehicle) merged.preferredVehicle = signals.preferredVehicle;
    if (signals.preferredVehicleId) merged.preferredVehicleId = signals.preferredVehicleId;
    if (signals.preferredVehicleRecovery === true) merged.preferredVehicleRecovery = true;
    if (signals.leadStage) merged.leadStage = signals.leadStage;
    if (signals.activeSpeaker) merged.activeSpeaker = signals.activeSpeaker;
    if (signals.comparisonIntent?.detected) merged.comparisonIntent = signals.comparisonIntent;
    if (signals.requestedVehicle) merged.requestedVehicle = signals.requestedVehicle;

    if (signals.bodyType) {
        merged.bodyType = signals.bodyType;
        merged.vehiclePreferences = [
            signals.bodyType,
            ...(merged.vehiclePreferences || []).filter((p) => p !== signals.bodyType),
        ];
    } else if (signals.vehiclePreferences?.length) {
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
    const records = buildRecommendedVehicleRecords(vehicles, {
        ...meta,
        familySize: meta.familySize ?? null,
    });
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
    const display =
        salesContext.confirmedPurchaseBudgetDisplay ??
        salesContext.purchaseBudgetDisplay ??
        salesContext.budgetDisplay;
    const amount =
        salesContext.confirmedPurchaseBudget ?? salesContext.purchaseBudget ?? salesContext.budget;
    if (display?.endsWith("+")) {
        return { minPrice: amount };
    }
    if (amount != null) return { maxPrice: amount };
    return {};
}

/**
 * True when sales context has a customer-confirmed purchase budget (not salary/income alone).
 * @param {object|null|undefined} salesContext
 */
export function hasConfirmedPurchaseBudget(salesContext) {
    const filter = getActivePurchaseBudgetFilter(salesContext);
    return filter.maxPrice != null || filter.minPrice != null;
}

/**
 * Format sales context block for WhatsApp system prompt injection.
 * @param {object|null|undefined} customer
 */
export function formatSalesContextForPrompt(customer) {
    const ctx = customer?.salesContext;
    if (!ctx || !Object.keys(ctx).length) return "";

    const budgetState = getBudgetState(ctx);
    const progressionStage = getSalesProgressionStage(ctx.leadStage);
    const lines = ["SALES CONTEXT (from customer record — use for guidance, not as inventory/booking truth):"];
    if (ctx.leadStage) lines.push(`- Lead stage: ${ctx.leadStage}`);
    lines.push(`- Sales progression: ${progressionStage}`);
    if (ctx.occupation) lines.push(`- Occupation: ${ctx.occupation}`);

    lines.push(`- Budget state: ${budgetState}`);

    if (ctx.incomeDisplay || ctx.income != null) {
        lines.push(`- Income: ${ctx.incomeDisplay || `R${ctx.income}/month`} — salary/income, NOT a vehicle purchase budget`);
    }
    if (
        ctx.targetMonthlyPaymentDisplay ||
        ctx.targetMonthlyPayment != null ||
        ctx.monthlyBudgetDisplay ||
        ctx.monthlyBudget != null
    ) {
        lines.push(
            `- Monthly affordability: ${
                ctx.targetMonthlyPaymentDisplay ||
                ctx.monthlyBudgetDisplay ||
                `R${ctx.targetMonthlyPayment ?? ctx.monthlyBudget}/pm`
            } — NOT the same as purchase price; ask about deposit/finance terms before converting to a purchase budget`
        );
    }

    if (budgetState === BUDGET_STATES.BUDGET_OPEN) {
        lines.push("- Purchase budget: open (customer explicitly cleared price limit)");
    } else if (budgetState === BUDGET_STATES.CONFIRMED_PURCHASE) {
        const display =
            ctx.confirmedPurchaseBudgetDisplay ??
            ctx.purchaseBudgetDisplay ??
            ctx.budgetDisplay ??
            (ctx.confirmedPurchaseBudget != null ? `R${ctx.confirmedPurchaseBudget}` : null);
        lines.push(`- Confirmed purchase budget: ${display}`);
    } else if (budgetState === BUDGET_STATES.INCOME_ONLY) {
        lines.push(
            "- Budget not specified yet — focus on family needs first; do NOT say purchase budget is confirmed or unlimited"
        );
    } else {
        lines.push("- Purchase budget: not specified yet");
    }
    if (ctx.estimatedPurchaseBudgetDisplay || ctx.estimatedPurchaseBudget != null) {
        lines.push(
            `- Estimated purchase budget (estimate only): ${ctx.estimatedPurchaseBudgetDisplay || `R${ctx.estimatedPurchaseBudget}`} — confirm with customer before filtering inventory`
        );
    }
    if (ctx.previousPurchaseBudgetDisplay || ctx.previousPurchaseBudget != null) {
        lines.push(`- Previous purchase budget (superseded): ${ctx.previousPurchaseBudgetDisplay || `R${ctx.previousPurchaseBudget}`}`);
    }
    if (ctx.bodyType) lines.push(`- Active body type filter: ${ctx.bodyType}`);
    if (ctx.vehiclePreferences?.length) lines.push(`- Vehicle preferences: ${ctx.vehiclePreferences.join(", ")}`);
    if (ctx.customerRequirements?.length) {
        lines.push(`- Customer requirements / underlying needs: ${ctx.customerRequirements.join(", ")}`);
    }
    if (ctx.requestedVehicle) {
        lines.push(
            `- Requested vehicle/brand: ${ctx.requestedVehicle} — explore WHY (luxury, space, reliability) before searching blindly`
        );
    }
    if (ctx.comparisonIntent?.detected) {
        const terms = ctx.comparisonIntent.terms?.length
            ? ctx.comparisonIntent.terms.join(" vs ")
            : "options discussed";
        lines.push(
            `- Comparison intent detected (${terms}) — recommend one with evidence from inventory; end with test drive both or book preferred`
        );
    }
    if (ctx.preferredVehicle) lines.push(`- Preferred vehicle: ${ctx.preferredVehicle}`);
    if (ctx.preferredVehicleId) lines.push(`- Preferred vehicleId: ${ctx.preferredVehicleId}`);
    if (ctx.preferredVehicleRecovery) {
        lines.push(
            `- Customer strongly prefers ${ctx.preferredVehicle || "their chosen vehicle"} — do NOT switch to alternatives unless inventory tool confirms VEHICLE_NOT_IN_INVENTORY; recover with booking slots or gallery for THAT vehicle`
        );
    }
    if (ctx.lastRecommendedVehicles?.length) {
        lines.push("- Recently recommended (use these vehicleIds for follow-up — do NOT re-search by make/model):");
        for (const v of ctx.lastRecommendedVehicles.slice(0, 5)) {
            lines.push(
                `  • ${v.position || "?"}. ${v.title || v.make || "vehicle"} — vehicleId: ${v.vehicleId}, stock: ${v.stockNumber}${v.location ? `, location: ${v.location}` : ""}${v.reason ? ` (${v.reason})` : ""}`
            );
        }
        const locationBlock = formatLocationComparisonForPrompt(ctx.lastRecommendedVehicles);
        if (locationBlock) lines.push(`- ${locationBlock.replace(/^LOCATION VERIFICATION \(from inventory\): /, "")}`);
        const comparisonBlock = formatVehicleComparison(ctx.lastRecommendedVehicles);
        if (comparisonBlock) lines.push(comparisonBlock);
    }
    if (ctx.familySize) {
        lines.push(`- Family / passenger count: ${ctx.familySize}`);
        lines.push(
            `- Family guidance: explain rear space and seating using seatingCapacity from searchInventory only — never invent specs; for family of ${ctx.familySize}, compare each vehicle's verified seatingCapacity and body type`
        );
    }
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

    const closingBlock = formatClosingSuggestion(ctx);
    if (closingBlock) lines.push(closingBlock);

    return lines.join("\n");
}
