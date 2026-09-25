/**
 * Turn-level sales funnel guidance — explicit "do this now" instructions per conversation stage.
 */
import { isInventoryBrowseIntent } from "./inventoryIntent.js";
import {
    normalizeLeadStage,
    getLeadStageObjective,
    getBudgetState,
    BUDGET_STATES,
    hasConfirmedPurchaseBudget,
} from "./salesContext.js";

function isGreetingOnlyMessage(text) {
    return /^(hi|hello|hey|good morning|good afternoon|good evening|howzit|howzit\?)\b/i.test(
        String(text || "").trim()
    );
}

/** Ordered Central Motors sales funnel (matches consultant workflow). */
export const SALES_FUNNEL_STEPS = [
    "GREETING",
    "UNDERSTAND_NEED",
    "QUALIFY_BUDGET_TYPE",
    "SEARCH_INVENTORY",
    "RECOMMEND_VEHICLES",
    "GAUGE_INTEREST",
    "VEHICLE_DETAILS",
    "TEST_DRIVE",
    "FINANCE",
    "HUMAN_HANDOFF",
];

const LEAD_STAGE_TO_FUNNEL = {
    NEW: "GREETING",
    DISCOVERY: "UNDERSTAND_NEED",
    VEHICLES_RECOMMENDED: "RECOMMEND_VEHICLES",
    VEHICLE_INTEREST: "GAUGE_INTEREST",
    VEHICLE_SELECTED: "TEST_DRIVE",
    TEST_DRIVE_REQUESTED: "TEST_DRIVE",
    TEST_DRIVE_BOOKED: "TEST_DRIVE",
    TEST_DRIVE_COMPLETED: "FINANCE",
    FINANCE_INTEREST: "FINANCE",
    FINANCE_QUOTE: "FINANCE",
    PURCHASE_INTENT: "FINANCE",
    HUMAN_HANDOFF: "HUMAN_HANDOFF",
};

/**
 * @param {object|null|undefined} salesContext
 * @returns {boolean}
 */
export function hasNeedSignals(salesContext) {
    if (!salesContext) return false;
    return Boolean(
        salesContext.familySize ||
            salesContext.bodyType ||
            salesContext.vehiclePreferences?.length ||
            salesContext.customerRequirements?.length ||
            salesContext.requestedVehicle ||
            salesContext.occupation
    );
}

/**
 * @param {object|null|undefined} salesContext
 * @returns {boolean}
 */
export function isReadyForInventorySearch(salesContext, { inventoryBrowseIntent = false } = {}) {
    if (inventoryBrowseIntent) return true;
    if (!salesContext) return false;
    return (
        hasNeedSignals(salesContext) ||
        hasConfirmedPurchaseBudget(salesContext) ||
        salesContext.bodyType ||
        getBudgetState(salesContext) === BUDGET_STATES.BUDGET_OPEN
    );
}

/**
 * Map stored lead stage (+ turn signals) to funnel step label.
 * @param {{
 *   salesContext?: object|null,
 *   isNewConversation?: boolean,
 *   inboundMessage?: string,
 *   inventoryBrowseIntent?: boolean,
 * }} params
 */
export function deriveFunnelStep({
    salesContext = null,
    isNewConversation = false,
    inboundMessage = "",
    inventoryBrowseIntent = false,
} = {}) {
    const leadStage = normalizeLeadStage(salesContext?.leadStage);
    const raw = String(inboundMessage || "").trim();

    if (inventoryBrowseIntent) {
        return "SEARCH_INVENTORY";
    }

    if (isNewConversation && isGreetingOnlyMessage(raw) && leadStage === "NEW") {
        return "GREETING";
    }

    if (leadStage === "DISCOVERY") {
        const budgetState = getBudgetState(salesContext);
        const hasBudget =
            hasConfirmedPurchaseBudget(salesContext) || budgetState === BUDGET_STATES.BUDGET_OPEN;
        if (!hasNeedSignals(salesContext) && !hasBudget && !salesContext?.bodyType) {
            return "UNDERSTAND_NEED";
        }
        if (!hasBudget && !salesContext?.bodyType && !inventoryBrowseIntent) {
            return "QUALIFY_BUDGET_TYPE";
        }
        return "SEARCH_INVENTORY";
    }

    return LEAD_STAGE_TO_FUNNEL[leadStage] || "UNDERSTAND_NEED";
}

/**
 * Build explicit per-turn sales funnel block for system prompt injection.
 * @param {{
 *   salesContext?: object|null,
 *   isNewConversation?: boolean,
 *   inboundMessage?: string,
 *   inventoryBrowseIntent?: boolean,
 *   inventoryPreloaded?: boolean,
 *   historyLength?: number,
 * }} params
 */
export function buildSalesFunnelTurnGuidance({
    salesContext = null,
    isNewConversation = false,
    inboundMessage = "",
    inventoryBrowseIntent = false,
    inventoryPreloaded = false,
    historyLength = 0,
} = {}) {
    const leadStage = normalizeLeadStage(salesContext?.leadStage);
    const funnelStep = deriveFunnelStep({
        salesContext,
        isNewConversation,
        inboundMessage,
        inventoryBrowseIntent,
    });
    const stageObjective = getLeadStageObjective(leadStage);
    const readyForSearch = isReadyForInventorySearch(salesContext, { inventoryBrowseIntent });

    const lines = [
        "THIS TURN — SALES FUNNEL (Central Motors consultant flow — follow in order):",
        `Greeting → Understand need → Budget/vehicle type → Search real inventory → Recommend → Gauge interest → Vehicle details → Test drive → Finance → Human handoff`,
        `- Funnel step this turn: ${funnelStep}`,
        `- Lead stage: ${leadStage}`,
        `- Stage objective: ${stageObjective}`,
    ];

    switch (funnelStep) {
        case "GREETING":
            lines.push(
                "- Warm welcome only — one brief intro if appropriate, then ONE open question about what they are looking for (family car, work bakkie, budget range, etc.).",
                "- Do NOT search inventory or recommend specific vehicles on a greeting-only first message."
            );
            break;

        case "UNDERSTAND_NEED":
            lines.push(
                "- Focus on understanding the WHY: family size, daily use, lifestyle, must-haves (space, fuel, luxury, capability).",
                "- Ask ONE qualifying question — do not interrogate with a long checklist.",
                "- Do NOT call searchInventory until you know body type, family size, or purchase budget — unless the customer explicitly asked what you have in stock."
            );
            break;

        case "QUALIFY_BUDGET_TYPE":
            lines.push(
                "- You have some need context — confirm vehicle type (SUV, sedan, bakkie) and/or purchase budget before searching.",
                "- Distinguish monthly affordability from purchase price — never treat salary as a purchase budget.",
                "- Once type or budget is clear, proceed to searchInventory with matching filters."
            );
            break;

        case "SEARCH_INVENTORY":
            if (inventoryPreloaded || inventoryBrowseIntent) {
                lines.push(
                    "- Customer asked what is in stock — AUTHORITATIVE INVENTORY is pre-loaded; present results via platform cards (intro + follow-up text only).",
                    "- After showing options, ask which vehicle interests them most — move toward gauge interest / test drive."
                );
            } else if (readyForSearch) {
                lines.push(
                    "- Qualification is sufficient — call searchInventory with filters from SALES CONTEXT (bodyType, budget, minSeats).",
                    "- Present 2–3 best matches with reasons tied to their stated needs."
                );
            } else {
                lines.push(
                    "- Need more context before searching — ask about family size, body type, or budget first."
                );
            }
            break;

        case "RECOMMEND_VEHICLES":
            lines.push(
                "- Sell the top 2–3 in-stock picks with evidence from inventory (price, km, seating) — platform sends cards automatically.",
                "- End with: which of these interests you most, or would you like to compare two?"
            );
            if (salesContext?.lastRecommendedVehicles?.length) {
                lines.push(
                    "- Vehicles were already recommended — use vehicleIds from SALES CONTEXT; do NOT re-search unless customer asks for different criteria."
                );
            }
            break;

        case "GAUGE_INTEREST":
            lines.push(
                "- Customer is leaning toward a specific vehicle — answer detail questions from inventory data only.",
                "- Offer more photos, side-by-side comparison, or book a test drive on their preferred vehicle."
            );
            if (salesContext?.preferredVehicle || salesContext?.preferredVehicleRecovery) {
                lines.push(
                    `- Stay focused on ${salesContext.preferredVehicle || "their preferred vehicle"} — do not pivot to unrelated alternatives.`
                );
            }
            break;

        case "VEHICLE_DETAILS":
            lines.push(
                "- Provide specs, price, location, and seating from searchInventory for the vehicle in question.",
                "- Transition toward test drive: offer the earliest available slot proactively."
            );
            break;

        case "TEST_DRIVE":
            lines.push(
                "- Test-drive stage: checkTestDriveAvailability → bookTestDrive with stable vehicleId.",
                "- Proactively offer the earliest slot — do NOT ask open-ended 'what time works?' when tool slots exist.",
                "- Confirm booking only after bookTestDrive succeeds."
            );
            break;

        case "FINANCE":
            lines.push(
                "- Finance stage: discuss monthly payment framing, deposit, and next steps.",
                "- Do not hard-filter inventory on income alone — use confirmed purchase budget when searching.",
                "- Move toward purchase intent or consultant handoff for approval/complex cases."
            );
            break;

        case "HUMAN_HANDOFF":
            lines.push(
                "- Connect with a sales consultant — summarize what the customer wants and what has been discussed."
            );
            break;

        default:
            lines.push("- Move the conversation one step forward in the funnel with a concrete next step.");
    }

    if (!isNewConversation && historyLength > 1) {
        lines.push("- Continuing thread — no re-introduction; answer the current message directly.");
    }

    lines.push(
        "- Never dead-end the sale — always end with a meaningful next step (shortlist, compare, test drive, finance, or consultant).",
        "- Never say 'anything else?' or terminate because exact stock is unavailable — show alternatives from inventory."
    );

    return lines.join("\n");
}
