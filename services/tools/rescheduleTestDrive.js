/**
 * rescheduleTestDrive — book new slot first, cancel old booking only after success.
 */
import { rescheduleTestDriveBooking } from "../conversation/appointmentScheduleAuthority.js";

export default {
    name: "rescheduleTestDrive",
    description:
        "Move an existing test drive to a new date/time. Books the new slot first; cancels the old bookingId only after the new booking succeeds. " +
        "Call getCustomerBookings first to obtain cancelBookingId. Do NOT cancel before booking. " +
        "Only confirm success when this tool returns RESCHEDULE_SUCCESS or ALREADY_SCHEDULED.",
    parameters: {
        type: "object",
        properties: {
            vehicleId: {
                type: "string",
                description: "Canonical vehicle ID from inventory",
            },
            scheduledAt: {
                type: "string",
                description: "New date AND time — ISO 8601 or natural language with time",
            },
            cancelBookingId: {
                type: "string",
                description: "bookingId of the existing appointment to cancel after the new slot is booked",
            },
            customerName: {
                type: "string",
                description: "Customer name if known",
            },
        },
        required: ["vehicleId", "scheduledAt", "cancelBookingId"],
    },

    async execute(ctx, args) {
        return rescheduleTestDriveBooking(ctx, {
            vehicleId: args.vehicleId,
            scheduledAt: args.scheduledAt,
            cancelBookingId: args.cancelBookingId,
        });
    },
};
