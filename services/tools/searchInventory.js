/**
 * searchInventory — tenant-scoped vehicle search via canonical inventoryService.
 */
import { searchInventory as searchInventoryRecords, detectBrandHintsFromQuery, detectBodyTypeFromQuery } from "../inventory/inventoryService.js";
import { storeRecommendedVehicles } from "../conversation/recommendedVehicles.js";
import {
    getActivePurchaseBudgetFilter,
    persistRecommendedToSalesContext,
    compareRecommendedVehicleLocations,
    formatLocationComparisonForPrompt,
} from "../conversation/salesContext.js";
import { evaluateSeatingFit, getVehicleSeatingCapacity, resolveMinSeatsFilter } from "../inventory/seatingCapacity.js";

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
            maxMileage: {
                type: "number",
                description: "Maximum mileage in km",
            },
            bodyType: {
                type: "string",
                description: "Body type filter (SUV, sedan, hatchback, bakkie)",
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
        const bodyHints = detectBodyTypeFromQuery(args.query || "");
        const familySize = salesContext?.familySize ?? null;
        const minSeats = resolveMinSeatsFilter(args.minSeats, familySize);
        const budgetFilter = getActivePurchaseBudgetFilter(salesContext);
        const activeBodyType = args.bodyType || salesContext?.bodyType || bodyHints.bodyType;
        const vehicles = await searchInventoryRecords(companyId, args.query || "", {
            make: args.make || args.brand || brandHints.make,
            makes: brandHints.makes,
            excludeMake: args.excludeMake || brandHints.excludeMake,
            model: args.model,
            bodyType: activeBodyType,
            maxPrice: budgetFilter.open ? undefined : budgetFilter.maxPrice,
            minPrice: budgetFilter.minPrice,
            maxMileage: args.maxMileage,
            minSeats,
            limit: args.limit || 10,
            availabilityOnly: false,
        });

        const passengerCount = familySize ?? minSeats ?? null;
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
            await persistRecommendedToSalesContext(companyId, customerPhone, vehiclesWithFit, {
                requirements: salesContext?.customerRequirements,
            });
        }

        const locationComparison = compareRecommendedVehicleLocations(vehiclesWithFit);
        const locationNote = formatLocationComparisonForPrompt(vehiclesWithFit);

        return {
            ok: true,
            count: vehiclesWithFit.length,
            vehicles: vehiclesWithFit,
            passengerCount,
            locationComparison: locationComparison.sameLocation
                ? { sameLocation: true }
                : {
                      sameLocation: false,
                      warning: locationComparison.warning,
                      details: locationComparison.details,
                  },
            activePurchaseBudget: budgetFilter.open
                ? "no limit"
                : budgetFilter.maxPrice ?? budgetFilter.minPrice ?? null,
            message:
                vehiclesWithFit.length === 0
                    ? "No vehicles matched that search. Try broader terms or ask about alternatives."
                    : `Inventory search returned ${vehiclesWithFit.length} vehicle${vehiclesWithFit.length === 1 ? "" : "s"}. ` +
                      "Only recommend vehicles from this result — each has a stable vehicleId. " +
                      "Pass vehicleId to checkTestDriveAvailability and bookTestDrive for follow-up. " +
                      "Always compare seatingCapacity to passenger count — warn if seatingFit is insufficient. " +
                      "Only claim 4x4/off-road when is4x4=true in results; use drive field for drive type." +
                      (locationNote ? ` ${locationNote}` : ""),
        };
    },
};
