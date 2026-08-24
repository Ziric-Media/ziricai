/**
 * getCustomerBookings — retrieve persisted test-drive bookings for the current customer.
 * Tenant-scoped via companyId + customerId/phone. Reads Postgres (appointmentRepository), not memory.
 */
import {
    listAppointmentsByCustomer,
    listAppointmentsByCustomerPhone,
} from "../database/appointmentRepository.js";
import { formatSlotLabel } from "./availability.js";

function formatBookingDateTime(scheduledAt) {
    const date = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    return date.toLocaleString("en-ZA", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatBookingBlock(booking) {
    const vehicle = booking.vehicleDescription || "Vehicle TBC";
    const stock = booking.stockNumber ? `Stock: ${booking.stockNumber}` : "Stock: —";
    const when = formatBookingDateTime(booking.scheduledAt);
    const loc = booking.location || "";
    const status = booking.status === "cancelled" ? "\nStatus: cancelled" : "";
    return `🚙 ${vehicle}\n${stock}\n${when}${loc ? `\n${loc}` : ""}${status}`;
}

function buildSection(title, bookings) {
    if (!bookings.length) return `${title}\nNone.`;
    return `${title}\n${bookings.map(formatBookingBlock).join("\n\n")}`;
}

function buildCombinedMessage({ upcoming, past, statusFilter }) {
    if (statusFilter === "upcoming") {
        if (!upcoming.length) return "No upcoming test drive bookings found for this customer.";
        return buildSection("Your upcoming test drive(s):", upcoming);
    }
    if (statusFilter === "past") {
        if (!past.length) return "No previous test drive bookings found for this customer.";
        return buildSection("Previous bookings:", past);
    }

    const sections = [];
    sections.push(buildSection("Your upcoming test drive(s):", upcoming));
    sections.push(buildSection("Previous bookings:", past));
    return sections.join("\n\n");
}

async function listBookings(ctx, statusFilter, limit) {
    const { companyId, customerId, customerPhone } = ctx;
    const listOpts = {
        companyId,
        appointmentType: "test_drive",
        statusFilter,
        limit,
    };

    if (customerId) {
        return listAppointmentsByCustomer({ ...listOpts, customerId });
    }
    if (customerPhone) {
        return listAppointmentsByCustomerPhone({ ...listOpts, phone: customerPhone });
    }
    return null;
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
                description: "Filter: upcoming, past, or all (default all — returns upcoming and previous sections)",
            },
            limit: {
                type: "integer",
                description: "Max bookings per section (default 10, max 50)",
                minimum: 1,
                maximum: 50,
            },
        },
    },

    async execute(ctx, args = {}) {
        const { companyId } = ctx;

        if (!companyId) {
            return { ok: false, error: "companyId is required", code: "MISSING_COMPANY" };
        }

        if (!ctx.customerId && !ctx.customerPhone) {
            return {
                ok: false,
                error: "Customer identity is required to look up bookings.",
                code: "MISSING_CUSTOMER",
            };
        }

        const statusFilter = args.statusFilter || "all";
        const limit = Math.min(Math.max(parseInt(String(args.limit || 10), 10) || 10, 1), 50);

        if (statusFilter === "upcoming") {
            const upcoming = (await listBookings(ctx, "upcoming", limit)) ?? [];
            return {
                ok: true,
                count: upcoming.length,
                statusFilter,
                upcoming,
                past: [],
                bookings: upcoming,
                message: buildCombinedMessage({ upcoming, past: [], statusFilter }),
            };
        }

        if (statusFilter === "past") {
            const past = (await listBookings(ctx, "past", limit)) ?? [];
            return {
                ok: true,
                count: past.length,
                statusFilter,
                upcoming: [],
                past,
                bookings: past,
                message: buildCombinedMessage({ upcoming: [], past, statusFilter }),
            };
        }

        const [upcoming, past] = await Promise.all([
            listBookings(ctx, "upcoming", limit),
            listBookings(ctx, "past", limit),
        ]);

        const upcomingList = upcoming ?? [];
        const pastList = past ?? [];

        return {
            ok: true,
            count: upcomingList.length + pastList.length,
            statusFilter,
            upcoming: upcomingList,
            past: pastList,
            bookings: [...upcomingList, ...pastList],
            message: buildCombinedMessage({
                upcoming: upcomingList,
                past: pastList,
                statusFilter,
            }),
        };
    },
};
