/**
 * searchInventory — tenant-scoped vehicle search via canonical inventoryService.
 */
import { searchInventory as searchInventoryRecords, detectBrandHintsFromQuery } from "../inventory/inventoryService.js";
import { storeRecommendedVehicles } from "../conversation/recommendedVehicles.js";

export default {
    name: "searchInventory",
    description:
        "Search this company's vehicle inventory. Returns vehicleId and stockNumber for each match. Use vehicleId when booking test drives.",
    parameters: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Search terms — make, model, budget, features (e.g. Hilux diesel automatic)",
            },
            make: {
                type: "string",
                description: "Optional make filter",
            },
            brand: {
                type: "string",
                description: "Optional brand/make filter (alias for make)",
            },
            excludeMake: {
                type: "string",
                description: "Exclude vehicles from this make/brand (e.g. Toyota when customer wants other brands)",
            },
            model: {
                type: "string",
                description: "Optional model filter",
            },
            maxPrice: {
                type: "number",
                description: "Maximum price in local currency",
            },
            minPrice: {
                type: "number",
                description: "Minimum price in local currency",
            },
            limit: {
                type: "number",
                description: "Max results to return (default 10)",
            },
        },
    },

    async execute(ctx, args = {}) {
        const { companyId, customerPhone, channel } = ctx;
        if (!companyId) {
            return { ok: false, error: "companyId is required", code: "MISSING_COMPANY" };
        }

        const brandHints = detectBrandHintsFromQuery(args.query || "");
        const vehicles = await searchInventoryRecords(companyId, args.query || "", {
            make: args.make || args.brand || brandHints.make,
            makes: brandHints.makes,
            excludeMake: args.excludeMake || brandHints.excludeMake,
            model: args.model,
            maxPrice: args.maxPrice,
            minPrice: args.minPrice,
            limit: args.limit || 10,
            availabilityOnly: false,
        });

        if (customerPhone) {
            await storeRecommendedVehicles(companyId, customerPhone, channel || "whatsapp", vehicles);
        }

        return {
            ok: true,
            count: vehicles.length,
            vehicles,
            message:
                vehicles.length === 0
                    ? "No vehicles matched that search. Try broader terms or ask about alternatives."
                    : `Inventory search returned ${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}. Describe matches using vehicle details below.`,
        };
    },
};
