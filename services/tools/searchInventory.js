/**
 * searchInventory — tenant-scoped vehicle search via canonical inventoryService.
 */
import { searchInventory as searchInventoryRecords, detectBrandHintsFromQuery } from "../inventory/inventoryService.js";
import { storeRecommendedVehicles } from "../conversation/recommendedVehicles.js";
import { evaluateSeatingFit, getVehicleSeatingCapacity } from "../inventory/seatingCapacity.js";

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
            minSeats: {
                type: "number",
                description: "Minimum seating capacity required (e.g. 8 for a family of 8)",
            },
        },
    },

    async execute(ctx, args = {}) {
        const { companyId, customerPhone, channel, salesContext } = ctx;
        if (!companyId) {
            return { ok: false, error: "companyId is required", code: "MISSING_COMPANY" };
        }

        const brandHints = detectBrandHintsFromQuery(args.query || "");
        const minSeats = args.minSeats ?? null;
        const vehicles = await searchInventoryRecords(companyId, args.query || "", {
            make: args.make || args.brand || brandHints.make,
            makes: brandHints.makes,
            excludeMake: args.excludeMake || brandHints.excludeMake,
            model: args.model,
            maxPrice: args.maxPrice,
            minPrice: args.minPrice,
            minSeats,
            limit: args.limit || 10,
            availabilityOnly: false,
        });

        const passengerCount = salesContext?.familySize ?? minSeats ?? null;
        const vehiclesWithFit = vehicles.map((vehicle) => {
            if (passengerCount == null) return vehicle;
            const fit = evaluateSeatingFit(passengerCount, vehicle);
            return {
                ...vehicle,
                seatingCapacity: vehicle.seatingCapacity ?? getVehicleSeatingCapacity(vehicle),
                seatingFit: fit.fits ? "ok" : "insufficient",
                seatingWarning: fit.warning,
            };
        });

        if (customerPhone) {
            await storeRecommendedVehicles(companyId, customerPhone, channel || "whatsapp", vehiclesWithFit);
        }

        return {
            ok: true,
            count: vehiclesWithFit.length,
            vehicles: vehiclesWithFit,
            passengerCount,
            message:
                vehiclesWithFit.length === 0
                    ? "No vehicles matched that search. Try broader terms or ask about alternatives."
                    : `Inventory search returned ${vehiclesWithFit.length} vehicle${vehiclesWithFit.length === 1 ? "" : "s"}. Describe matches using vehicle details below. Always compare seatingCapacity to passenger count — warn if seatingFit is insufficient.`,
        };
    },
};
