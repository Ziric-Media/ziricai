import {
    listSmilemoreBookings,
    checkSmilemoreAvailability,
    createSmilemoreBooking,
    updateSmilemoreBooking,
} from "./dentalBookingService.js";
import { getDentalPatient } from "./dentalPatientService.js";
import { listDentalClaims } from "./dentalClaimService.js";
import { listDentalSales } from "./dentalSaleService.js";
import { moduleKeyFromPortalSurface } from "../sarah/portalSarahSurfaces.js";
import { publish, EventTypes } from "../events/index.js";
import {
    SMILEMORE_LOCATIONS,
    SMILEMORE_SERVICES,
    SMILEMORE_CHANNELS,
    SMILEMORE_PUBLIC_TEAM,
    SMILEMORE_BOOKING_STATUSES,
} from "./smilemorePractice.js";

const locationEnum = SMILEMORE_LOCATIONS.map((item) => item.id);
const serviceEnum = SMILEMORE_SERVICES.map((item) => item.id);
const channelEnum = SMILEMORE_CHANNELS.map((item) => item.id);

function publicBooking(booking) {
    if (!booking) return null;
    return {
        id: booking.id,
        patient: booking.customerName || null,
        phone: booking.phone || null,
        locationId: booking.locationId || null,
        location: booking.locationLabel || null,
        serviceId: booking.serviceId || null,
        service: booking.service || null,
        scheduledAt: booking.scheduledAt || null,
        scheduledLabel: booking.scheduledLabel || null,
        status: booking.status || null,
        channel: booking.channel || booking.source || null,
        providerPreference: booking.providerPreference || null,
        notes: booking.notes || "",
    };
}

export const listDentalBookingsTool = {
    name: "listDentalBookings",
    description:
        "List SmileMore booking-diary records. Call this before describing a patient's bookings. Status requested is not a confirmed booking.",
    parameters: {
        type: "object",
        properties: {
            status: {
                type: "string",
                enum: ["", ...SMILEMORE_BOOKING_STATUSES],
                description: "Optional status filter. Leave empty for the whole diary.",
            },
        },
    },
    requiredPermissions: ["canViewInbox"],
    async execute(ctx, args = {}) {
        const items = await listSmilemoreBookings(ctx.companyId, { status: args.status || "" });
        return {
            ok: true,
            success: true,
            message: items.length
                ? `${items.length} booking record(s) on the SmileMore diary.`
                : "The SmileMore diary has no booking records.",
            data: { bookings: items.map(publicBooking) },
            bookings: items.map(publicBooking),
            uiHints: [{ navigate: "appointments" }],
        };
    },
};

export const checkDentalAvailabilityTool = {
    name: "checkDentalAvailability",
    description:
        "Check open 30-minute SmileMore slots for one published location and one date. A slot is free only when open is true. Published hours are not themselves availability.",
    parameters: {
        type: "object",
        properties: {
            locationId: { type: "string", enum: locationEnum },
            date: { type: "string", description: "Practice date YYYY-MM-DD" },
        },
        required: ["locationId", "date"],
    },
    requiredPermissions: ["canViewInbox"],
    async execute(ctx, args = {}) {
        const result = await checkSmilemoreAvailability(ctx.companyId, args);
        return {
            ok: true,
            success: true,
            message: result.message,
            data: result,
            ...result,
        };
    },
};

export const createDentalBookingTool = {
    name: "createDentalBooking",
    description:
        "Record a SmileMore booking request for Sarah Sales. Default status is requested. Set confirmNow true only after the patient agrees to that exact location and time. Never invent a fee or a treating dentist.",
    parameters: {
        type: "object",
        properties: {
            customerName: { type: "string", description: "Patient name" },
            phone: { type: "string", description: "Patient phone" },
            locationId: { type: "string", enum: locationEnum },
            serviceId: { type: "string", enum: serviceEnum },
            scheduledAt: { type: "string", description: "Practice wall time YYYY-MM-DDTHH:mm, or an ISO instant" },
            channel: { type: "string", enum: channelEnum },
            providerPreference: {
                type: "string",
                enum: SMILEMORE_PUBLIC_TEAM,
                description: "Optional preference only. Not a confirmed clinician.",
            },
            notes: { type: "string" },
            confirmNow: { type: "boolean", description: "True only after the patient accepts this exact slot." },
        },
        required: ["customerName", "phone", "locationId", "serviceId", "scheduledAt"],
    },
    requiredPermissions: ["canReply"],
    async execute(ctx, args = {}) {
        const booking = await createSmilemoreBooking(ctx.companyId, {
            ...args,
            channel: args.channel || ctx.channel || "sarah-sales",
            source: ctx.channel || "sarah-sales",
        });
        await publish(ctx.companyId, EventTypes.APPOINTMENT_BOOKED, {
            appointmentId: booking.id,
            customerName: booking.customerName,
            scheduledAt: booking.scheduledAt,
            service: booking.service,
            status: booking.status,
        });
        const recorded = publicBooking(booking);
        const verb = recorded.status === "confirmed" ? "Confirmed" : "Requested";
        return {
            ok: true,
            success: true,
            message: `${verb} ${recorded.service} for ${recorded.patient} at ${recorded.location} on ${recorded.scheduledLabel}. Status: ${recorded.status}.`,
            data: { booking: recorded },
            booking: recorded,
            uiHints: [{ navigate: "appointments" }],
        };
    },
};

export const updateDentalBookingTool = {
    name: "updateDentalBooking",
    description:
        "Update a SmileMore diary booking by id: confirm, arrive, complete, cancel, no-show, or move it to another open published slot. Confirm only after the patient agrees.",
    parameters: {
        type: "object",
        properties: {
            bookingId: { type: "string" },
            status: { type: "string", enum: SMILEMORE_BOOKING_STATUSES },
            scheduledAt: { type: "string" },
            locationId: { type: "string", enum: locationEnum },
            serviceId: { type: "string", enum: serviceEnum },
            notes: { type: "string" },
            providerPreference: { type: "string", enum: SMILEMORE_PUBLIC_TEAM },
        },
        required: ["bookingId"],
    },
    requiredPermissions: ["canReply"],
    async execute(ctx, args = {}) {
        const booking = await updateSmilemoreBooking(ctx.companyId, args.bookingId, args);
        const recorded = publicBooking(booking);
        return {
            ok: true,
            success: true,
            message: `Updated booking ${recorded.id} for ${recorded.patient}. Status: ${recorded.status}. ${recorded.scheduledLabel || ""}`.trim(),
            data: { booking: recorded },
            booking: recorded,
            uiHints: [{ navigate: "appointments" }],
        };
    },
};

export const getDentalPatientTool = {
    name: "getDentalPatient",
    description:
        "Read one SmileMore record by phone: client file, diary visits, till treatment names, and medical-aid worksheets. Do not invent history, the next treatment, fees, or scheme benefits. Do not read out rand amounts.",
    parameters: {
        type: "object",
        properties: {
            phone: { type: "string", description: "Patient phone number" },
        },
        required: ["phone"],
    },
    requiredPermissions: ["canViewInbox"],
    async execute(ctx, args = {}) {
        const patient = await getDentalPatient(ctx.companyId, args.phone);
        const bookings = (await listSmilemoreBookings(ctx.companyId)).filter((item) => {
            const phone = String(item.phone || item.customerId || "").replace(/\D/g, "");
            return phone && phone === String(args.phone || "").replace(/\D/g, "");
        }).map(publicBooking);
        const phoneId = String(args.phone || "").replace(/\D/g, "");
        const claims = (await listDentalClaims(ctx.companyId))
            .filter((item) => String(item.patientId || item.phone || "").replace(/\D/g, "") === phoneId)
            .map((item) => ({
                id: item.id,
                status: item.status,
                procedure: item.procedure,
                visitLabel: item.visitLabel,
                scheme: item.scheme,
                switchConnected: false,
            }));
        const till = (await listDentalSales(ctx.companyId))
            .filter((sale) => String(sale.phone || "").replace(/\D/g, "") === phoneId)
            .map((sale) => ({
                receiptNo: sale.receiptNo,
                method: sale.method,
                treatments: (sale.items || []).map((item) => item.name),
            }));
        if (!patient && !bookings.length && !till.length && !claims.length) {
            return {
                ok: true,
                success: true,
                message: "No SmileMore client file, diary visit, till receipt, or claim worksheet for that phone.",
                data: { patient: null, visits: [], till: [], claims: [] },
            };
        }
        return {
            ok: true,
            success: true,
            message: patient
                ? `Client file for ${patient.fullName}. ${bookings.length} diary visit(s), ${till.length} till receipt(s), ${claims.length} worksheet(s). Medical aid on file: ${patient.medicalAid?.scheme || "none"}. Do not quote amounts.`
                : `${bookings.length} diary visit(s), ${till.length} till receipt(s), and no client file yet.`,
            data: {
                till,
                patient: patient
                    ? {
                        name: patient.fullName,
                        phone: patient.phone,
                        nextStep: patient.nextStep || "",
                        notes: patient.notes || "",
                        address: patient.address || "",
                        gender: patient.gender || "",
                        paymentPreference: patient.paymentPreference || "",
                        medicalAid: patient.medicalAid || null,
                    }
                    : null,
                visits: bookings,
                claims,
            },
            uiHints: [{ navigate: "dentalPatients" }],
        };
    },
};

function smilemoreModule(ctx) {
    if (ctx.pageContext?.module) return ctx.pageContext.module;
    const surface = String(ctx.surface || "").toLowerCase();
    if (!surface.startsWith("portal")) return "";
    return moduleKeyFromPortalSurface(surface);
}

export const listDentalSalesTool = {
    name: "listDentalSales",
    description:
        "Read recorded SmileMore till receipts. These are payments already taken. They are not a price list and they do not say what a medical scheme will pay. Sarah Finance and Sarah Admin only.",
    parameters: { type: "object", properties: {} },
    requiredPermissions: ["canViewInbox"],
    async execute(ctx) {
        const moduleKey = smilemoreModule(ctx);
        if (!["finance", "admin"].includes(moduleKey)) {
            return {
                ok: false,
                success: false,
                message: "Till receipts belong to Sarah Finance. Sarah Admin can also read them.",
            };
        }
        const items = await listDentalSales(ctx.companyId);
        return {
            ok: true,
            success: true,
            message: items.length ? `${items.length} recorded till receipt(s).` : "The till has no receipts yet.",
            data: {
                receipts: items.slice(0, 40).map((sale) => ({
                    receiptNo: sale.receiptNo,
                    patient: sale.patientName,
                    phone: sale.phone,
                    total: sale.total,
                    method: sale.method,
                    createdAt: sale.createdAt || null,
                    items: (sale.items || []).map((item) => `${item.name} × ${item.qty}`),
                })),
            },
            uiHints: [{ navigate: "dentalPos" }],
        };
    },
};

export const listDentalClaimsTool = {
    name: "listDentalClaims",
    description:
        "Read SmileMore medical-aid worksheets. A worksheet is not a submitted or paid claim, and it does not say what the scheme will pay. Sarah Finance and Sarah Admin only.",
    parameters: { type: "object", properties: {} },
    requiredPermissions: ["canViewInbox"],
    async execute(ctx) {
        const moduleKey = smilemoreModule(ctx);
        if (!["finance", "admin"].includes(moduleKey)) {
            return {
                ok: false,
                success: false,
                message: "Medical-aid worksheets belong to Sarah Finance. Sarah Admin can also read them.",
            };
        }
        const items = await listDentalClaims(ctx.companyId);
        return {
            ok: true,
            success: true,
            message: items.length ? `${items.length} medical-aid worksheet(s).` : "There are no medical-aid worksheets yet.",
            data: {
                claims: items.slice(0, 40).map((item) => ({
                    id: item.id,
                    status: item.status,
                    patient: item.patientName || item.patientId,
                    procedure: item.procedure || "",
                    scheme: item.scheme || "",
                    switchConnected: false,
                })),
            },
            uiHints: [{ navigate: "dentalMedicalAid" }],
        };
    },
};

export const SMILEMORE_DENTAL_TOOLS = [
    listDentalBookingsTool,
    checkDentalAvailabilityTool,
    createDentalBookingTool,
    updateDentalBookingTool,
    getDentalPatientTool,
    listDentalSalesTool,
    listDentalClaimsTool,
];
