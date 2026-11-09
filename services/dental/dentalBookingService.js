/**
 * SmileMore booking diary. Records live on the tenant appointment collection
 * so the portal board and Sarah read the same ledger.
 */
import {
    listAppointments,
    saveAppointmentRecord,
    getAppointment,
    patchAppointmentRecord,
} from "../tenants/appointmentService.js";
import { ensureDentalPatient, dentalPatientId } from "./dentalPatientService.js";
import { assertDentalPracticeTenant } from "./assertDentalPracticeTenant.js";

async function assertDentalBookingTenant(companyId) {
    await assertDentalPracticeTenant(companyId, "Dental bookings are only available for dental-clinic preset tenants.");
}
import {
    locationById,
    serviceById,
    channelById,
    SMILEMORE_PUBLIC_TEAM,
    SMILEMORE_BOOKING_STATUSES,
    SMILEMORE_SLOT_MINUTES,
    parsePracticeDateTime,
    assertInsidePublishedHours,
    practiceSlotsForDate,
    findSlotConflict,
    formatPracticeLabel,
    bookingBlocksSlot,
} from "./smilemorePractice.js";

function cleanText(value, max) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.slice(0, max);
}

function normalizeChannel(value, fallback = "portal") {
    const raw = String(value || fallback).trim().toLowerCase();
    return channelById(raw)?.id || "other";
}

export function normalizeSmilemoreBookingInput(data = {}, { partial = false } = {}) {
    const patch = {};

    if (!partial || data.customerName != null) {
        const customerName = cleanText(data.customerName, 120);
        if (customerName.length < 2) throw new Error("A patient name is required.");
        patch.customerName = customerName;
    }

    if (!partial || data.phone != null) {
        const phone = cleanText(data.phone, 40);
        if (!partial && phone.length < 7) throw new Error("A reachable phone number is required.");
        if (phone) patch.phone = phone;
    }

    if (!partial || data.locationId != null) {
        const location = locationById(String(data.locationId || "").trim());
        if (!location) throw new Error("Choose one of the two published SmileMore locations.");
        patch.locationId = location.id;
        patch.locationLabel = location.label;
    }

    if (!partial || data.serviceId != null || data.service != null) {
        const service = serviceById(String(data.serviceId || "").trim())
            || serviceById(serviceIdFromLabel(data.service));
        if (!service) throw new Error("Choose one of the advertised visit types. Do not invent a service or a fee.");
        patch.serviceId = service.id;
        patch.service = service.label;
    }

    if (!partial || data.scheduledAt != null) {
        const start = parsePracticeDateTime(data.scheduledAt);
        assertInsidePublishedHours(start);
        patch.scheduledAt = start.toISOString();
        patch.scheduledLabel = formatPracticeLabel(start);
        patch.durationMinutes = SMILEMORE_SLOT_MINUTES;
    }

    if (data.channel != null || data.source != null || !partial) {
        patch.channel = normalizeChannel(data.channel || data.source);
    }

    if (data.providerPreference != null) {
        const preference = cleanText(data.providerPreference, 80);
        if (preference && !SMILEMORE_PUBLIC_TEAM.includes(preference)) {
            throw new Error("That name is not on the published team list. Record a preference only for Dr. M.E. Ramorola, Onkgopotse Pimpi, or Dr. V.B. Malema, and do not promise they will treat the patient.");
        }
        patch.providerPreference = preference || null;
    }

    if (data.notes != null) patch.notes = cleanText(data.notes, 500);

    if (!partial) {
        const requestedStatus = String(data.status || "").toLowerCase();
        patch.status = data.confirmNow === true || requestedStatus === "confirmed" ? "confirmed" : "requested";
        patch.practiceId = "smilemore";
        patch.bookingKind = "dental";
    } else if (data.status != null) {
        const status = String(data.status).toLowerCase();
        if (!SMILEMORE_BOOKING_STATUSES.includes(status)) {
            throw new Error("Use requested, confirmed, checked_in, completed, cancelled, or no_show.");
        }
        patch.status = status;
    }

    return patch;
}

function serviceIdFromLabel(label) {
    const text = String(label || "").trim().toLowerCase();
    if (!text) return "";
    if (text.includes("clean") || text.includes("polish")) return "cleaning-polish";
    if (text.includes("root") || text.includes("plan")) return "root-planing";
    if (text.includes("fill")) return "filling";
    if (text.includes("paed") || text.includes("child")) return "paediatric";
    if (text.includes("cosmetic")) return "cosmetic";
    if (text.includes("denture")) return "dentures";
    if (text.includes("brace") || text.includes("ortho")) return "braces";
    return "";
}

async function loadBookings(companyId) {
    return listAppointments(companyId, { max: 300 });
}

function assertSlotFree(bookings, scheduledAt, locationId, excludeId) {
    const conflict = findSlotConflict(bookings, new Date(scheduledAt), locationId, excludeId);
    if (conflict) {
        throw new Error(
            `That time is already held at this location (${conflict.scheduledLabel || conflict.scheduledAt}, ${conflict.status}). Choose another open slot.`
        );
    }
}

export async function listSmilemoreBookings(companyId, { status = "" } = {}) {
    await assertDentalBookingTenant(companyId);
    const items = await loadBookings(companyId);
    const wanted = String(status || "").toLowerCase();
    return items
        .filter((item) => !wanted || String(item.status || "").toLowerCase() === wanted)
        .sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")));
}

export async function checkSmilemoreAvailability(companyId, { date, locationId, excludeBookingId = null } = {}) {
    await assertDentalBookingTenant(companyId);
    const location = locationById(locationId);
    if (!location) throw new Error("Choose one of the two published SmileMore locations.");
    const day = practiceSlotsForDate(date);
    if (day.closed) {
        return {
            closed: true,
            locationId: location.id,
            locationLabel: location.label,
            date,
            slots: [],
            message: "SmileMore is not open on that day. Published hours are Monday to Friday 09:00–17:00 and Saturday 09:00–13:00.",
        };
    }
    const bookings = await loadBookings(companyId);
    const slots = day.slots.map((slot) => {
        const conflict = findSlotConflict(bookings, slot.start, location.id, excludeBookingId);
        return {
            wall: slot.wall,
            label: slot.label,
            open: !conflict,
            status: conflict ? conflict.status : "open",
        };
    });
    return {
        closed: false,
        locationId: location.id,
        locationLabel: location.label,
        date,
        slots,
        message: "A slot is open only when open is true on this result. Do not describe any other time as available.",
    };
}

export async function createSmilemoreBooking(companyId, data = {}) {
    await assertDentalBookingTenant(companyId);
    const normalized = normalizeSmilemoreBookingInput(data);
    const bookings = await loadBookings(companyId);
    assertSlotFree(bookings, normalized.scheduledAt, normalized.locationId, null);
    const customerId = dentalPatientId(normalized.phone);
    const saved = await saveAppointmentRecord(companyId, {
        ...normalized,
        customerId: customerId || null,
        source: data.source || normalized.channel,
    });
    try {
        await ensureDentalPatient(companyId, {
            customerName: normalized.customerName,
            phone: normalized.phone,
        });
    } catch (err) {
        console.warn("[dental-booking] client file link failed:", err.message);
    }
    return saved;
}

export async function updateSmilemoreBooking(companyId, bookingId, patch = {}) {
    await assertDentalBookingTenant(companyId);
    const existing = await getAppointment(companyId, bookingId);
    if (!existing) throw new Error("That booking is not on the SmileMore diary.");
    const normalized = normalizeSmilemoreBookingInput(patch, { partial: true });
    const next = { ...existing, ...normalized };
    if (normalized.scheduledAt || normalized.locationId || normalized.serviceId) {
        const start = parsePracticeDateTime(next.scheduledAt);
        assertInsidePublishedHours(start);
        next.scheduledAt = start.toISOString();
        next.scheduledLabel = formatPracticeLabel(start);
        next.durationMinutes = SMILEMORE_SLOT_MINUTES;
        if (bookingBlocksSlot(next.status) || bookingBlocksSlot(normalized.status || existing.status)) {
            const bookings = await loadBookings(companyId);
            assertSlotFree(bookings, next.scheduledAt, next.locationId, existing.id);
        }
    }
    if (normalized.status) assertStatusTransition(existing.status, normalized.status);
    const stored = normalized.scheduledAt
        ? { ...normalized, scheduledAt: next.scheduledAt, scheduledLabel: next.scheduledLabel, durationMinutes: SMILEMORE_SLOT_MINUTES }
        : normalized;
    return patchAppointmentRecord(companyId, bookingId, stored);
}

const STATUS_TRANSITIONS = {
    requested: ["confirmed", "cancelled"],
    scheduled: ["confirmed", "checked_in", "cancelled", "no_show"],
    confirmed: ["checked_in", "completed", "cancelled", "no_show"],
    checked_in: ["completed", "cancelled", "no_show"],
    completed: [],
    cancelled: [],
    no_show: [],
};

function assertStatusTransition(fromStatus, toStatus) {
    const from = String(fromStatus || "requested").toLowerCase();
    if (from === toStatus) return;
    const allowed = STATUS_TRANSITIONS[from] || [];
    if (!allowed.includes(toStatus)) {
        throw new Error(`A ${from.replaceAll("_", " ")} booking cannot move to ${toStatus.replaceAll("_", " ")}.`);
    }
}
