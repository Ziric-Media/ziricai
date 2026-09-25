/**
 * Deterministic inventory browse intent — preloads searchInventory before LLM tool choice.
 */
import { detectBodyTypeFromQuery, detectBrandHintsFromQuery } from "../inventory/inventoryService.js";
import { getActivePurchaseBudgetFilter } from "./salesContext.js";
import { isBookingRecapIntent } from "./bookingRecapIntent.js";
import { isGalleryImageIntent } from "./vehicleReference.js";
import {
    isTestDriveAvailabilityQuery,
    isSchedulingDelegationIntent,
} from "./schedulingContext.js";
import { isVehicleReferenceIntent } from "./vehicleReference.js";
import { isPlanConfirmationIntent } from "./testDrivePlan.js";

const INVENTORY_BROWSE_PATTERNS = [
    /\bwhat\s+(?:cars|vehicles|suvs|trucks|bakkies|options|models)\s+(?:do you|have you got|are there|you have|in stock|available)/i,
    /\bwhat\s+do\s+you\s+have\b/i,
    /\bwhat(?:'s|\s+is)\s+(?:in\s+)?(?:stock|available)\b/i,
    /\bshow\s+me\s+(?:your\s+)?(?:cars|vehicles|inventory|stock|options|suvs|trucks|bakkies)/i,
    /\b(?:browse|see|view)\s+(?:your\s+)?(?:inventory|stock|cars|vehicles|options)/i,
    /\b(?:any|got)\s+(?:suvs|cars|vehicles|trucks|bakkies|options)\b/i,
    /\blooking\s+for\s+(?:a|an|some)\s+(?:suv|car|vehicle|bakkie|truck|sedan|hatchback)/i,
    /\bdo\s+you\s+have\s+(?:any\s+)?(?:suvs|cars|vehicles|trucks|bakkies|options)/i,
    /\bwhat\s+(?:suvs|cars|vehicles|trucks|bakkies)\s+(?:are\s+)?(?:available|in\s+stock)/i,
    /\b(?:cars|vehicles|suvs|inventory|stock)\s+(?:do you|you)\s+have\b/i,
    /\bwhat\s+(?:is|are)\s+(?:in\s+)?(?:your\s+)?(?:inventory|stock)\b/i,
];

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isInventoryBrowseIntent(text) {
    const raw = String(text || "").trim();
    if (!raw) return false;
    return INVENTORY_BROWSE_PATTERNS.some((pattern) => pattern.test(raw));
}

/**
 * @param {string} text
 * @param {{ isGreeting?: boolean }} [options]
 * @returns {boolean}
 */
export function shouldPreloadInventorySearch(text, options = {}) {
    if (options.isGreeting) return false;
    if (!isInventoryBrowseIntent(text)) return false;
    if (isBookingRecapIntent(text)) return false;
    if (isGalleryImageIntent(text)) return false;
    if (isTestDriveAvailabilityQuery(text)) return false;
    if (isSchedulingDelegationIntent(text)) return false;
    if (isVehicleReferenceIntent(text)) return false;
    if (isPlanConfirmationIntent(text)) return false;
    return true;
}

/**
 * Build searchInventory args from customer message + sales context.
 * @param {string} text
 * @param {object} [salesContext]
 */
export function buildInventorySearchArgs(text, salesContext = {}) {
    const query = String(text || "").trim();
    const bodyHints = detectBodyTypeFromQuery(query);
    const brandHints = detectBrandHintsFromQuery(query);
    const budgetFilter = getActivePurchaseBudgetFilter(salesContext);

    const args = {
        query,
        limit: 10,
    };

    if (bodyHints.bodyType) args.bodyType = bodyHints.bodyType;
    if (brandHints.make) args.make = brandHints.make;
    if (salesContext?.bodyType && !args.bodyType) args.bodyType = salesContext.bodyType;
    if (budgetFilter?.maxPrice != null && !budgetFilter.open) args.maxPrice = budgetFilter.maxPrice;
    if (salesContext?.familySize) args.minSeats = salesContext.familySize;

    return args;
}

/**
 * @param {object} inventoryResult
 * @returns {string}
 */
export function formatAuthoritativeInventoryBlock(inventoryResult) {
    if (!inventoryResult || (inventoryResult.ok === false && inventoryResult.success === false)) {
        return "AUTHORITATIVE INVENTORY: searchInventory failed — do not invent stock listings.";
    }

    const vehicles = Array.isArray(inventoryResult.vehicles) ? inventoryResult.vehicles : [];
    const lines = [
        "AUTHORITATIVE INVENTORY (searchInventory — ONLY source for in-stock listings this turn):",
        inventoryResult.message || `Found ${vehicles.length} vehicle(s).`,
        "Platform sends vehicle cards automatically — your text is intro + follow-up only.",
    ];

    if (vehicles.length) {
        lines.push("", "Matches (internal reference — do NOT paste specs in your reply):");
        for (const vehicle of vehicles.slice(0, 5)) {
            lines.push(
                `- ${vehicle.title || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"} | vehicleId: ${vehicle.vehicleId || "—"}`
            );
        }
    }

    return lines.join("\n");
}
