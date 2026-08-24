/**
 * checkTestDriveAvailability — verify test-drive slot availability before booking.
 * Separates inventory status from appointment slot capacity.
 */
import { evaluateTestDriveAvailability } from "./testDriveAvailability.js";

export default {
    name: "checkTestDriveAvailability",
    description:
        "Check whether a test drive can be booked for a vehicle on a date/time. Use BEFORE bookTestDrive. " +
        "For 'any Hilux on Friday', pass query/make/model + date (no time) to list vehicles with open slots. " +
        "If the customer gave a date but no time, this returns NEED_TIME — ask for their preferred time; do not book yet.",
    parameters: {
        type: "object",
        properties: {
            vehicleId: {
                type: "string",
                description: "Canonical vehicle ID from searchInventory (preferred when a specific vehicle is chosen)",
            },
            vehicleStockNumber: {
                type: "string",
                description: "Stock number fallback when vehicleId is unknown",
            },
            date: {
                type: "string",
                description: "Preferred date — ISO (2026-08-29) or natural language (Friday, tomorrow)",
            },
            time: {
                type: "string",
                description: "Preferred time — e.g. 14:00, 2pm (optional; omit if customer has not chosen a time)",
            },
            scheduledAt: {
                type: "string",
                description: "Combined date/time if already known (alternative to separate date + time)",
            },
            query: {
                type: "string",
                description: "Search terms when customer wants any matching vehicle (e.g. Hilux)",
            },
            make: {
                type: "string",
                description: "Make filter for finding any available vehicle",
            },
            model: {
                type: "string",
                description: "Model filter for finding any available vehicle",
            },
        },
    },

    async execute(ctx, args = {}) {
        const { companyId } = ctx;
        if (!companyId) {
            return { ok: false, error: "companyId is required", code: "MISSING_COMPANY" };
        }

        const result = await evaluateTestDriveAvailability(companyId, {
            vehicleId: args.vehicleId,
            stockNumber: args.vehicleStockNumber,
            date: args.date,
            time: args.time,
            scheduledAt: args.scheduledAt,
            query: args.query,
            make: args.make,
            model: args.model,
        });

        return {
            ok: result.available || result.code === "NEED_TIME",
            available: result.available,
            code: result.code,
            reason: result.reason,
            needsTime: result.needsTime === true,
            vehicle: result.vehicle,
            vehicles: result.vehicles,
            slotStart: result.slotStart,
            slotLabel: result.slotLabel,
            date: result.date,
            suggestedSlots: result.suggestedSlots,
            alternatives: result.alternatives,
        };
    },
};
