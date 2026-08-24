/**
 * cancelTestDrive — tenant-scoped cancellation of a persisted test-drive booking.
 */
import { cancelAppointmentRecord } from "../database/appointmentRepository.js";
import { formatSlotLabel } from "./availability.js";
import { publish, EventTypes } from "../events/index.js";

export default {
    name: "cancelTestDrive",
    description:
        "Cancel a customer's test drive booking by bookingId. " +
        "Call getCustomerBookings first to find the bookingId when the customer asks to cancel.",
    parameters: {
        type: "object",
        properties: {
            bookingId: {
                type: "string",
                description: "The bookingId from getCustomerBookings or bookTestDrive",
            },
        },
        required: ["bookingId"],
    },

    async execute(ctx, args = {}) {
        const { companyId, customerId } = ctx;
        const bookingId = args.bookingId;

        if (!companyId) {
            return { ok: false, error: "companyId is required", code: "MISSING_COMPANY" };
        }
        if (!customerId) {
            return { ok: false, error: "Customer identity is required", code: "MISSING_CUSTOMER" };
        }
        if (!bookingId) {
            return { ok: false, error: "bookingId is required", code: "INVALID_INPUT" };
        }

        const result = await cancelAppointmentRecord({
            companyId,
            appointmentId: bookingId,
            customerId,
        });

        if (!result.ok) {
            return result;
        }

        const booking = result.booking || result.appointment;
        const slotLabel = booking?.scheduledAt
            ? formatSlotLabel(new Date(booking.scheduledAt))
            : "the scheduled time";

        if (!result.duplicate) {
            await publish(companyId, EventTypes.APPOINTMENT_BOOKED, {
                appointmentId: bookingId,
                customerId,
                status: "cancelled",
                scheduledAt: booking?.scheduledAt,
                source: "ai_tool_cancel",
            }).catch(() => {});
        }

        return {
            ok: true,
            duplicate: result.duplicate === true,
            cancelled: true,
            booking,
            message: result.duplicate
                ? `Test drive on ${slotLabel} was already cancelled.`
                : `Test drive cancelled for ${slotLabel}.`,
        };
    },
};
