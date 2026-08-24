/**
 * bookTestDrive — real test drive booking with availability, idempotency, and Postgres persistence.
 * Resolves vehicles via canonical inventoryService (vehicleId primary, stockNumber fallback).
 */
import { createAppointmentRecord, countAppointmentsInSlot } from "../database/appointmentRepository.js";
import {
    resolveVehicle,
    isVehicleAvailable,
    listAlternatives,
    normalizeStockNumber,
    vehicleToPublic,
} from "../inventory/inventoryService.js";
import { getRecommendedVehicles, pickFromRecommended } from "../conversation/recommendedVehicles.js";
import { publish, EventTypes } from "../events/index.js";
import { addTimelineEvent } from "../customerService.js";
import { buildIdempotencyKey } from "./toolRunner.js";
import {
    parseScheduledAt,
    normalizeToSlotStart,
    slotEnd,
    isWithinBusinessHours,
    formatSlotLabel,
    getMaxConcurrentPerSlot,
} from "./availability.js";

async function resolveBookingVehicle(ctx, args) {
    const { companyId, customerPhone, channel } = ctx;

    let vehicle = await resolveVehicle(companyId, {
        vehicleId: args.vehicleId,
        stockNumber: args.vehicleStockNumber,
    });

    if (!vehicle && (args.vehicleHint || (!args.vehicleId && !args.vehicleStockNumber))) {
        const recommended = ctx.lastRecommendedVehicles?.length
            ? ctx.lastRecommendedVehicles
            : customerPhone
              ? await getRecommendedVehicles(companyId, customerPhone, channel || "whatsapp")
              : [];

        const picked = pickFromRecommended(recommended, args.vehicleHint || args.vehicleStockNumber);
        if (picked?.vehicleId) {
            vehicle = await resolveVehicle(companyId, { vehicleId: picked.vehicleId });
        } else if (picked?.stockNumber) {
            vehicle = await resolveVehicle(companyId, { stockNumber: picked.stockNumber });
        }
    }

    if (!vehicle) {
        return {
            valid: false,
            code: "INVALID_VEHICLE",
            error: args.vehicleId || args.vehicleStockNumber
                ? `Vehicle was not found in this company's inventory.`
                : "No vehicle specified and no recent recommendation in this conversation. Search inventory first or provide vehicleId/stock number.",
        };
    }

    if (!isVehicleAvailable(vehicle)) {
        const alternatives = await listAlternatives(companyId, {
            make: vehicle.make,
            model: vehicle.model,
            excludeVehicleId: vehicle.vehicleId,
        });
        return {
            valid: false,
            code: "UNAVAILABLE",
            error: `Vehicle ${vehicle.title || vehicle.stockNumber} is no longer available for test drive.`,
            vehicle: vehicleToPublic(vehicle),
            alternatives,
        };
    }

    return {
        valid: true,
        vehicle,
        stockNumber: normalizeStockNumber(vehicle.stockNumber),
        vehicleId: vehicle.vehicleId,
        vehicleLabel: vehicle.title || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
    };
}

export default {
    name: "bookTestDrive",
    description:
        "Book a test drive for a customer. Prefer vehicleId from searchInventory results; stockNumber is a fallback. Only confirm booking after this tool returns success.",
    parameters: {
        type: "object",
        properties: {
            vehicleId: {
                type: "string",
                description: "Canonical vehicle ID from searchInventory (preferred)",
            },
            vehicleStockNumber: {
                type: "string",
                description: "Vehicle stock number (fallback if vehicleId unknown)",
            },
            vehicleHint: {
                type: "string",
                description: "Make/model hint to match a recently recommended vehicle from conversation context",
            },
            scheduledAt: {
                type: "string",
                description: "Preferred date and time — ISO 8601 (2026-08-25T14:00:00) or natural language (tomorrow 2pm)",
            },
            customerName: {
                type: "string",
                description: "Customer full name if known",
            },
            notes: {
                type: "string",
                description: "Optional notes for the sales team",
            },
            idempotencyKey: {
                type: "string",
                description: "Optional client idempotency key to prevent duplicate bookings",
            },
        },
        required: ["scheduledAt"],
    },

    async execute(ctx, args) {
        const { companyId, customerId, customerPhone, agentId, customerName: ctxCustomerName } = ctx;

        if (!customerId) {
            return { ok: false, error: "Customer identity is required to book a test drive." };
        }

        const vehicleCheck = await resolveBookingVehicle(ctx, args);
        if (!vehicleCheck.valid) {
            return {
                ok: false,
                error: vehicleCheck.error,
                code: vehicleCheck.code,
                alternatives: vehicleCheck.alternatives,
                vehicle: vehicleCheck.vehicle,
            };
        }

        let scheduledAt;
        try {
            scheduledAt = parseScheduledAt(args.scheduledAt);
        } catch (err) {
            return { ok: false, error: err.message, code: "INVALID_DATETIME" };
        }

        if (scheduledAt.getTime() < Date.now() - 5 * 60 * 1000) {
            return { ok: false, error: "Cannot book a test drive in the past.", code: "PAST_SLOT" };
        }

        if (!isWithinBusinessHours(scheduledAt)) {
            return {
                ok: false,
                error: "That time is outside business hours (Mon–Sat, 9:00–17:00). Please choose another slot.",
                code: "OUTSIDE_HOURS",
            };
        }

        const slotStart = normalizeToSlotStart(scheduledAt);
        const slotEndTime = slotEnd(slotStart);
        const concurrent = await countAppointmentsInSlot(companyId, slotStart, slotEndTime);

        if (concurrent >= getMaxConcurrentPerSlot()) {
            return {
                ok: false,
                error: `That time slot is fully booked. Please suggest another time around ${formatSlotLabel(slotStart)}.`,
                code: "SLOT_FULL",
            };
        }

        const idempotencyKey = buildIdempotencyKey({
            companyId,
            customerId,
            vehicleId: vehicleCheck.vehicleId,
            vehicleStockNumber: vehicleCheck.stockNumber,
            scheduledAt: slotStart,
            clientKey: args.idempotencyKey,
        });

        const customerName = args.customerName || ctxCustomerName || null;
        const metadata = {
            vehicleId: vehicleCheck.vehicleId,
            vehicleLabel: vehicleCheck.vehicleLabel,
            customerName,
            notes: args.notes || "",
            channel: ctx.channel || "whatsapp",
        };

        const { appointment, duplicate } = await createAppointmentRecord({
            companyId,
            customerId,
            vehicleStockNumber: vehicleCheck.stockNumber,
            appointmentType: "test_drive",
            scheduledAt: slotStart,
            idempotencyKey,
            createdByAgentId: agentId || null,
            metadata,
        });

        if (duplicate) {
            return {
                ok: true,
                duplicate: true,
                message: `Test drive already booked for ${formatSlotLabel(new Date(appointment.scheduledAt))} (stock ${appointment.vehicleStockNumber}).`,
                appointment,
            };
        }

        await publish(companyId, EventTypes.APPOINTMENT_BOOKED, {
            appointmentId: appointment.id,
            customerId,
            customerName,
            vehicleId: vehicleCheck.vehicleId,
            vehicleStockNumber: appointment.vehicleStockNumber,
            scheduledAt: appointment.scheduledAt,
            appointmentType: "test_drive",
            source: "ai_tool",
        });

        if (customerPhone) {
            await addTimelineEvent(customerPhone, {
                type: "appointment",
                title: "Test drive booked",
                description: `${vehicleCheck.vehicleLabel} — ${formatSlotLabel(new Date(appointment.scheduledAt))}`,
                meta: {
                    appointmentId: appointment.id,
                    vehicleId: vehicleCheck.vehicleId,
                    stockNumber: appointment.vehicleStockNumber,
                },
            }).catch(() => {});
        }

        const slotLabel = formatSlotLabel(new Date(appointment.scheduledAt));
        return {
            ok: true,
            duplicate: false,
            message: `Test drive confirmed for ${customerName || "customer"} — ${vehicleCheck.vehicleLabel} (${vehicleCheck.stockNumber}) on ${slotLabel}.`,
            appointment,
            vehicleId: vehicleCheck.vehicleId,
        };
    },
};
