/**
 * bookTestDrive — real test drive booking with availability, idempotency, and Postgres persistence.
 */
import { createAppointmentRecord, countAppointmentsInSlot } from "../database/appointmentRepository.js";
import { listKnowledgeDocuments } from "../tenants/knowledgeService.js";
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

async function verifyVehicleStock(companyId, stockNumber) {
    const normalized = String(stockNumber || "").trim().toUpperCase();
    if (!normalized) {
        return { valid: false, error: "vehicleStockNumber is required" };
    }

    const docs = await listKnowledgeDocuments(companyId, { limit: 200 });
    const inventoryDocs = docs.filter((d) => d.type === "inventory" || /stock number/i.test(d.content || ""));

    for (const doc of inventoryDocs) {
        const content = String(doc.content || "");
        const stockMatch = content.match(/stock number:\s*(\S+)/i);
        const docStock = stockMatch ? stockMatch[1].toUpperCase() : null;
        if (docStock === normalized || content.toUpperCase().includes(normalized)) {
            const title = doc.title || docStock || normalized;
            return { valid: true, stockNumber: normalized, vehicleLabel: title };
        }
    }

    return {
        valid: false,
        error: `Stock number "${normalized}" was not found in this company's inventory knowledge.`,
    };
}

export default {
    name: "bookTestDrive",
    description:
        "Book a test drive for a customer. Requires vehicle stock number and preferred date/time. Only confirm booking to the customer after this tool returns success.",
    parameters: {
        type: "object",
        properties: {
            vehicleStockNumber: {
                type: "string",
                description: "Vehicle stock number from inventory (e.g. CM-HLX-001)",
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
        required: ["vehicleStockNumber", "scheduledAt"],
    },

    async execute(ctx, args) {
        const { companyId, customerId, customerPhone, agentId, customerName: ctxCustomerName } = ctx;

        if (!customerId) {
            return { ok: false, error: "Customer identity is required to book a test drive." };
        }

        const vehicleCheck = await verifyVehicleStock(companyId, args.vehicleStockNumber);
        if (!vehicleCheck.valid) {
            return { ok: false, error: vehicleCheck.error, code: "INVALID_STOCK" };
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
            vehicleStockNumber: vehicleCheck.stockNumber,
            scheduledAt: slotStart,
            clientKey: args.idempotencyKey,
        });

        const customerName = args.customerName || ctxCustomerName || null;
        const metadata = {
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
                meta: { appointmentId: appointment.id, stockNumber: appointment.vehicleStockNumber },
            }).catch(() => {});
        }

        const slotLabel = formatSlotLabel(new Date(appointment.scheduledAt));
        return {
            ok: true,
            duplicate: false,
            message: `Test drive confirmed for ${customerName || "customer"} — ${vehicleCheck.vehicleLabel} (${vehicleCheck.stockNumber}) on ${slotLabel}.`,
            appointment,
        };
    },
};
