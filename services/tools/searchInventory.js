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
    buildAlternativeSearchStrategy,
    getEthicalUpsellPriceBand,
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
        const prefFromContext =
            salesContext?.bodyType ||
            (Array.isArray(salesContext?.vehiclePreferences)
                ? salesContext.vehiclePreferences.find((p) =>
                      /^(suv|sedan|hatchback|bakkie)$/i.test(String(p))
                  )
                : null);
        const activeBodyType = args.bodyType || prefFromContext || bodyHints.bodyType;
        const searchFilters = {
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
        };

        let vehicles = await searchInventoryRecords(companyId, args.query || "", searchFilters);
        let fallbackApplied = null;

        if (vehicles.length === 0) {
            const strategies = buildAlternativeSearchStrategy({
                query: args.query,
                filters: {
                    ...searchFilters,
                    maxPrice: budgetFilter.open ? undefined : searchFilters.maxPrice,
                },
                salesContext,
            });
            for (const strategy of strategies) {
                const attemptFilters = {
                    ...searchFilters,
                    ...strategy.filters,
                    maxPrice:
                        budgetFilter.open && strategy.filters.maxPrice == null
                            ? undefined
                            : strategy.filters.maxPrice ?? searchFilters.maxPrice,
                };
                const attempt = await searchInventoryRecords(companyId, "", attemptFilters);
                if (attempt.length > 0) {
                    vehicles = attempt;
                    fallbackApplied = { reason: strategy.reason, relaxedFilters: attemptFilters };
                    break;
                }
            }
        }

        let upsellOptions = [];
        const effectiveMaxPrice = budgetFilter.open ? null : budgetFilter.maxPrice ?? args.maxPrice;
        if (effectiveMaxPrice != null && effectiveMaxPrice <= 350000) {
            const upsellBand = getEthicalUpsellPriceBand(effectiveMaxPrice);
            if (upsellBand) {
                upsellOptions = await searchInventoryRecords(companyId, args.query || "", {
                    ...searchFilters,
                    make: undefined,
                    model: undefined,
                    makes: undefined,
                    bodyType: activeBodyType || undefined,
                    maxPrice: upsellBand.maxPrice,
                    minPrice: upsellBand.minPrice,
                    limit: 1,
                });
                upsellOptions = upsellOptions.filter(
                    (v) => !vehicles.some((existing) => existing.vehicleId === v.vehicleId)
                );
            }
        }

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
                familySize,
            });
        }

        const locationComparison = compareRecommendedVehicleLocations(vehiclesWithFit);
        const locationNote = formatLocationComparisonForPrompt(vehiclesWithFit);

        const normalizeBody = (v) =>
            String(v?.bodyType ?? v?.metadata?.bodyType ?? "").toLowerCase();
        const requestedBody = activeBodyType ? String(activeBodyType).toLowerCase() : null;
        const bodyTypeMismatch =
            requestedBody &&
            vehiclesWithFit.length > 0 &&
            vehiclesWithFit.some((v) => {
                const bt = normalizeBody(v);
                return bt && bt !== requestedBody && !bt.includes(requestedBody);
            });

        let message =
            vehiclesWithFit.length === 0
                ? "No vehicles matched even after broadening the search. NEVER tell the customer you have nothing — acknowledge briefly, call searchInventory again with fewer filters, or browse general stock. Do NOT say 'we don't have any' or 'unfortunately'."
                : `Inventory search returned ${vehiclesWithFit.length} vehicle${vehiclesWithFit.length === 1 ? "" : "s"}. ` +
                  "Only recommend vehicles from this result — each has a stable vehicleId. " +
                  "Pass vehicleId to checkTestDriveAvailability and bookTestDrive for follow-up. " +
                  "Always compare seatingCapacity to passenger count — warn if seatingFit is insufficient. " +
                  "Only claim 4x4/off-road when is4x4=true in results; use drive field for drive type." +
                  (locationNote ? ` ${locationNote}` : "");

        if (fallbackApplied) {
            message +=
                ` FALLBACK SEARCH APPLIED (${fallbackApplied.reason}): present these as in-stock alternatives — ` +
                "briefly acknowledge the exact request if unmatched, then redirect to these vehicles. Never dead-end.";
        }

        if (upsellOptions.length > 0) {
            message +=
                " ETHICAL UPSELL: one option slightly above budget is available in upsellOptions — mention separately for comparison only, no pressure.";
        }

        if (bodyTypeMismatch) {
            message +=
                ` WARNING: Results include vehicles that may not match requested body type (${activeBodyType}). ` +
                "If you recommend a different body type, say explicitly e.g. 'These aren't SUVs but could work as alternatives…' " +
                "or re-search with the correct bodyType filter.";
        }

        return {
            ok: true,
            count: vehiclesWithFit.length,
            vehicles: vehiclesWithFit,
            passengerCount,
            bodyTypeFilter: activeBodyType || null,
            bodyTypeMismatch: Boolean(bodyTypeMismatch),
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
            fallbackSearch: fallbackApplied,
            upsellOptions: upsellOptions.length ? upsellOptions : undefined,
            message,
        };
    },
};
