/**
 * bookTestDrive — real test drive booking with availability, idempotency, and Postgres persistence.
 * Resolves vehicles via canonical inventoryService (vehicleId primary, stockNumber fallback).
 */
import { createAppointmentRecord, enrichAppointmentRecord } from "../database/appointmentRepository.js";
import {
    resolveVehicle,
    normalizeStockNumber,
    vehicleToPublic,
} from "../inventory/inventoryService.js";
import { getRecommendedVehicles, pickFromRecommended } from "../conversation/recommendedVehicles.js";
import { publish, EventTypes } from "../events/index.js";
import { addTimelineEvent, persistExplicitCustomerName } from "../customerService.js";
import { buildIdempotencyKey } from "./toolRunner.js";
import { formatSlotLabel, parseScheduledAt } from "./availability.js";
import { evaluateTestDriveAvailability } from "./testDriveAvailability.js";

async function resolveBookingVehicle(ctx, args) {
    const { companyId, customerPhone, channel } = ctx;

    let vehicleId = args.vehicleId;
    let stockNumber = args.vehicleStockNumber;

    if (!vehicleId && !stockNumber) {
        const resolved = ctx.resolvedVehicleReference ||
            (ctx.inboundMessage
                ? (await import("../conversation/vehicleReference.js")).resolveVehicleReference(
                      ctx.inboundMessage,
                      ctx.salesContext,
                      ctx.lastRecommendedVehicles
                  )
                : null);
        if (resolved?.vehicleId) vehicleId = resolved.vehicleId;
        else if (resolved?.stockNumber) stockNumber = resolved.stockNumber;
    }

    let vehicle = await resolveVehicle(companyId, {
        vehicleId,
        stockNumber,
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
        "Book a test drive for a customer. Call checkTestDriveAvailability first. Prefer vehicleId from searchInventory. " +
        "Only confirm booking after this tool returns ok/success with a persisted appointment.",
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
                description: "Preferred date AND time — ISO 8601 (2026-08-25T14:00:00) or natural language (Friday 2pm). Time is required.",
            },
            customerName: {
                type: "string",
                description: "Customer full name if known",
            },
            notes: {
                type: "string",
                description: "Optional notes for the sales team",
            },
            attendees: {
                type: "array",
                items: { type: "string" },
                description:
                    "Names of people who will physically attend the test drive — only include if the customer explicitly confirmed they are coming",
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
                vehicle: vehicleCheck.vehicle,
            };
        }

        let scheduledAt;
        try {
            scheduledAt = parseScheduledAt(args.scheduledAt);
        } catch (err) {
            return { ok: false, error: err.message, code: "INVALID_DATETIME" };
        }

        const availability = await evaluateTestDriveAvailability(companyId, {
            vehicleId: vehicleCheck.vehicleId,
            stockNumber: vehicleCheck.stockNumber,
            scheduledAt: args.scheduledAt,
            customerId,
        });

        if (!availability.available) {
            return {
                ok: false,
                error: availability.reason,
                code: availability.code,
                needsTime: availability.needsTime === true,
                vehicle: availability.vehicle || vehicleToPublic(vehicleCheck.vehicle),
                alternatives: availability.alternatives,
                suggestedSlots: availability.suggestedSlots,
            };
        }

        const slotStart = new Date(availability.slotStart);
        const idempotencyKey = buildIdempotencyKey({
            companyId,
            customerId,
            vehicleId: vehicleCheck.vehicleId,
            vehicleStockNumber: vehicleCheck.stockNumber,
            scheduledAt: slotStart,
            clientKey: args.idempotencyKey,
        });

        const customerName = args.customerName || ctxCustomerName || null;
        if (customerName && customerPhone && companyId) {
            await persistExplicitCustomerName(customerPhone, customerName, { companyId }).catch(() => {});
        }

        const attendees = Array.isArray(args.attendees)
            ? args.attendees.map((a) => String(a).trim()).filter(Boolean)
            : [];
        const decisionMakers = ctx.salesContext?.decisionMakers || [];

        const vehicle = vehicleCheck.vehicle;
        const metadata = {
            vehicleId: vehicleCheck.vehicleId,
            vehicleMake: vehicle?.make || null,
            vehicleModel: vehicle?.model || null,
            vehicleDescription: vehicleCheck.vehicleLabel,
            location: vehicle?.location || null,
            vehicleLabel: vehicleCheck.vehicleLabel,
            customerName,
            bookedCustomer: customerName,
            attendees,
            decisionMakers,
            notes: args.notes || "",
            channel: ctx.channel || "whatsapp",
        };

        const { appointment, duplicate } = await createAppointmentRecord({
            companyId,
            customerId,
            vehicleStockNumber: vehicleCheck.stockNumber,
            appointmentType: "test_drive",
            scheduledAt: slotStart,
            status: "confirmed",
            idempotencyKey,
            createdByAgentId: agentId || null,
            metadata,
        });

        const enrichedAppointment = await enrichAppointmentRecord(companyId, appointment);

        if (duplicate) {
            return {
                ok: true,
                duplicate: true,
                message: `Test drive already booked for ${formatSlotLabel(new Date(enrichedAppointment.scheduledAt))} — ${enrichedAppointment.vehicleDescription || vehicleCheck.vehicleLabel} (stock ${enrichedAppointment.stockNumber || appointment.vehicleStockNumber}).`,
                appointment: enrichedAppointment,
                booking: enrichedAppointment,
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

        const slotLabel = formatSlotLabel(new Date(enrichedAppointment.scheduledAt));
        return {
            ok: true,
            duplicate: false,
            message: `Test drive confirmed for ${customerName || "customer"} — ${enrichedAppointment.vehicleDescription || vehicleCheck.vehicleLabel} (${vehicleCheck.stockNumber}) on ${slotLabel}${enrichedAppointment.location ? ` at ${enrichedAppointment.location}` : ""}.`,
            appointment: enrichedAppointment,
            booking: enrichedAppointment,
            vehicleId: vehicleCheck.vehicleId,
        };
    },
};
