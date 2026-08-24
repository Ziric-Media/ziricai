/**
 * getCustomerBookings — retrieve persisted test-drive bookings for the current customer.
 * Tenant-scoped via companyId + customerId/phone. Reads Postgres (appointmentRepository), not memory.
 */
import {
    listAppointmentsByCustomer,
    listAppointmentsByCustomerPhone,
} from "../database/appointmentRepository.js";
import { formatSlotLabel } from "./availability.js";

function buildSummaryMessage(bookings, statusFilter) {
    if (!bookings.length) {
        const scope =
            statusFilter === "past"
                ? "past test drive bookings"
                : statusFilter === "all"
                  ? "test drive bookings"
                  : "upcoming test drive bookings";
        return `No ${scope} found for this customer.`;
    }

    const lines = bookings.map((b) => {
        const when = formatSlotLabel(new Date(b.scheduledAt));
        const vehicle = b.vehicleDescription || b.stockNumber || "vehicle TBC";
        const loc = b.location ? ` at ${b.location}` : "";
        const status = b.status === "cancelled" ? " (cancelled)" : "";
        return `- ${vehicle} (${b.stockNumber || "no stock"}) on ${when}${loc}${status} [bookingId: ${b.bookingId}]`;
    });

    return `Found ${bookings.length} booking(s):\n${lines.join("\n")}`;
}

export default {
    name: "getCustomerBookings",
    description:
        "Retrieve this customer's persisted test-drive bookings from the database. " +
        "Call BEFORE telling the customer they have or do not have a booking, or when they ask about appointment date/time, vehicle, or location. " +
        "Do not rely on conversation memory alone.",
    parameters: {
        type: "object",
        properties: {
            statusFilter: {
                type: "string",
                enum: ["upcoming", "past", "all"],
                description: "Filter: upcoming (default), past, or all bookings",
            },
            limit: {
                type: "integer",
                description: "Max bookings to return (default 10, max 50)",
                minimum: 1,
                maximum: 50,
            },
        },
    },

    async execute(ctx, args = {}) {
        const { companyId, customerId, customerPhone } = ctx;

        if (!companyId) {
            return { ok: false, error: "companyId is required", code: "MISSING_COMPANY" };
        }

        const statusFilter = args.statusFilter || "upcoming";
        const limit = Math.min(Math.max(parseInt(String(args.limit || 10), 10) || 10, 1), 50);

        const listOpts = {
            companyId,
            appointmentType: "test_drive",
            statusFilter,
            limit,
        };

        let bookings = [];
        if (customerId) {
            bookings = await listAppointmentsByCustomer({ ...listOpts, customerId });
        } else if (customerPhone) {
            bookings = await listAppointmentsByCustomerPhone({ ...listOpts, phone: customerPhone });
        } else {
            return {
                ok: false,
                error: "Customer identity is required to look up bookings.",
                code: "MISSING_CUSTOMER",
            };
        }

        const message = buildSummaryMessage(bookings, statusFilter);

        return {
            ok: true,
            count: bookings.length,
            statusFilter,
            bookings,
            message,
        };
    },
};
