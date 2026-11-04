/**
 * Published SmileMore Dentists facts used by the booking diary.
 * Source: owner-approved knowledge documents on kb-smilemore-demo.
 * Do not add fees, clinician rotas, chair counts, or clinical rules here.
 */
import { isDentalPracticeCompany } from "./dentalIndustryPreset.js";

export const SMILEMORE_DEMO_COMPANY_ID = "smilemore-demo";

export const SMILEMORE_TIMEZONE = "Africa/Johannesburg";

export const SMILEMORE_SLOT_MINUTES = 30;

export const SMILEMORE_LOCATIONS = Object.freeze([
    {
        id: "family-city-square",
        label: "Family practice — Shop No. 04, City Square Mall, Rustenburg",
    },
    {
        id: "paediatric-senthadi",
        label: "Paediatric practice — Senthadi Centre, 147 Leyds Street, Rustenburg",
    },
]);

export const SMILEMORE_SERVICES = Object.freeze([
    { id: "cleaning-polish", label: "Cleaning and polish" },
    { id: "root-planing", label: "Root planing" },
    { id: "filling", label: "Filling" },
    { id: "paediatric", label: "Paediatric visit" },
    { id: "cosmetic", label: "Cosmetic dentistry" },
    { id: "dentures", label: "Dentures" },
    { id: "braces", label: "Braces" },
]);

/** Public names only. A preference is not a confirmed treating clinician. */
export const SMILEMORE_PUBLIC_TEAM = Object.freeze([
    "Dr. M.E. Ramorola",
    "Onkgopotse Pimpi",
    "Dr. V.B. Malema",
]);

export const SMILEMORE_CHANNELS = Object.freeze([
    { id: "whatsapp", label: "WhatsApp" },
    { id: "messenger", label: "Messenger" },
    { id: "instagram", label: "Instagram" },
    { id: "phone", label: "Phone" },
    { id: "walk-in", label: "Walk-in" },
    { id: "sarah-sales", label: "Sarah Sales" },
    { id: "portal", label: "Practice desk" },
    { id: "other", label: "Other" },
]);

export const SMILEMORE_BOOKING_STATUSES = Object.freeze([
    "requested",
    "confirmed",
    "checked_in",
    "completed",
    "cancelled",
    "no_show",
]);

export const SMILEMORE_BLOCKING_STATUSES = Object.freeze([
    "requested",
    "confirmed",
    "checked_in",
    "scheduled",
]);

/** Monday–Friday 09:00–17:00, Saturday 09:00–13:00. Sunday is not published as open. */
const OPEN_MINUTES = Object.freeze({
    Mon: [9 * 60, 17 * 60],
    Tue: [9 * 60, 17 * 60],
    Wed: [9 * 60, 17 * 60],
    Thu: [9 * 60, 17 * 60],
    Fri: [9 * 60, 17 * 60],
    Sat: [9 * 60, 13 * 60],
});

export const SMILEMORE_CONTACTS = Object.freeze({
    phone: "014 592 9220",
    email: "inquiries@smilemoredentists.co.za",
    emergency: "082 820 4613",
});

export const SMILEMORE_WHATSAPP_TOOL_NAMES = Object.freeze([
    "listDentalBookings",
    "checkDentalAvailability",
    "createDentalBooking",
    "updateDentalBooking",
    "getDentalPatient",
]);

/** @deprecated Prefer isDentalPracticeCompany(companyId, company) — kept for call-site compatibility. */
export function isSmilemoreCompany(companyId, company = null) {
    return isDentalPracticeCompany(companyId, company);
}

export function locationById(id) {
    return SMILEMORE_LOCATIONS.find((item) => item.id === id) || null;
}

export function serviceById(id) {
    return SMILEMORE_SERVICES.find((item) => item.id === id) || null;
}

export function channelById(id) {
    return SMILEMORE_CHANNELS.find((item) => item.id === id) || null;
}

/**
 * Interpret YYYY-MM-DDTHH:mm as Africa/Johannesburg wall time (SAST, UTC+2, no DST).
 * Other values must already be a parseable instant.
 * @param {string} value
 * @returns {Date}
 */
export function parsePracticeDateTime(value) {
    const raw = String(value || "").trim();
    if (!raw) {
        throw new Error("A date and time is required.");
    }
    const wall = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (wall && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
        const year = Number(wall[1]);
        const month = Number(wall[2]);
        const day = Number(wall[3]);
        const hour = Number(wall[4]);
        const minute = Number(wall[5]);
        return new Date(Date.UTC(year, month - 1, day, hour - 2, minute, 0));
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        throw new Error("That date and time could not be read. Use a time such as 2026-10-26T09:30.");
    }
    return date;
}

export function practiceParts(date) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", {
            timeZone: SMILEMORE_TIMEZONE,
            weekday: "short",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        })
            .formatToParts(date)
            .map((part) => [part.type, part.value])
    );
    return {
        weekday: parts.weekday,
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
        hour: parts.hour,
        minute: parts.minute,
    };
}

export function formatPracticeLabel(date) {
    return new Intl.DateTimeFormat("en-ZA", {
        timeZone: SMILEMORE_TIMEZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(date);
}

export function assertInsidePublishedHours(start) {
    const parts = practiceParts(start);
    const bounds = OPEN_MINUTES[parts.weekday];
    if (!bounds) {
        throw new Error("SmileMore is not open on Sunday. Published hours are Monday to Friday 09:00–17:00 and Saturday 09:00–13:00.");
    }
    const end = parts.minutes + SMILEMORE_SLOT_MINUTES;
    if (parts.minutes < bounds[0] || end > bounds[1] || parts.minutes % SMILEMORE_SLOT_MINUTES !== 0) {
        throw new Error(
            "That time is outside the published diary. Use a 30-minute start inside Monday–Friday 09:00–16:30 or Saturday 09:00–12:30."
        );
    }
    return parts;
}

/**
 * @param {string} dateStr YYYY-MM-DD in the practice calendar
 * @returns {{ closed: boolean, slots: { wall: string, label: string, start: Date }[] }}
 */
export function practiceSlotsForDate(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) {
        throw new Error("Use a date in YYYY-MM-DD form.");
    }
    const probe = parsePracticeDateTime(`${dateStr}T12:00`);
    const weekday = practiceParts(probe).weekday;
    const bounds = OPEN_MINUTES[weekday];
    if (!bounds) return { closed: true, weekday, slots: [] };
    const slots = [];
    for (let minutes = bounds[0]; minutes + SMILEMORE_SLOT_MINUTES <= bounds[1]; minutes += SMILEMORE_SLOT_MINUTES) {
        const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
        const minute = String(minutes % 60).padStart(2, "0");
        const wall = `${dateStr}T${hour}:${minute}`;
        slots.push({ wall, label: `${hour}:${minute}`, start: parsePracticeDateTime(wall) });
    }
    return { closed: false, weekday, slots };
}

export function bookingBlocksSlot(status) {
    return SMILEMORE_BLOCKING_STATUSES.includes(String(status || "").toLowerCase());
}

export function findSlotConflict(bookings, start, locationId, excludeId = null) {
    const startMs = start.getTime();
    const endMs = startMs + SMILEMORE_SLOT_MINUTES * 60 * 1000;
    return (bookings || []).find((booking) => {
        if (!booking || booking.id === excludeId) return false;
        if (String(booking.locationId || "") !== locationId) return false;
        if (!bookingBlocksSlot(booking.status)) return false;
        const other = new Date(booking.scheduledAt || 0).getTime();
        if (!Number.isFinite(other)) return false;
        const otherEnd = other + Number(booking.durationMinutes || SMILEMORE_SLOT_MINUTES) * 60 * 1000;
        return startMs < otherEnd && other < endMs;
    }) || null;
}

export function smilemorePracticePrompt() {
    const locations = SMILEMORE_LOCATIONS.map((item) => `${item.id}: ${item.label}`).join("; ");
    const services = SMILEMORE_SERVICES.map((item) => `${item.id}: ${item.label}`).join("; ");
    const team = SMILEMORE_PUBLIC_TEAM.join(", ");
    return `SmileMore Dentists — published practice facts (mandatory; do not add to this list):
- Family-centred dental practice in Rustenburg.
- Locations: ${locations}. A location listing does not prove a service is available at that site with a particular person.
- Hours: Monday–Friday 09:00–17:00, Saturday 09:00–13:00, Africa/Johannesburg. Sunday is not published as open. Published hours are not live availability.
- Phone ${SMILEMORE_CONTACTS.phone}. Email ${SMILEMORE_CONTACTS.email}. Emergency contact ${SMILEMORE_CONTACTS.emergency}.
- Advertised visit types only: ${services}. This is not a price list.
- Public team names only: ${team}. Do not invent qualifications, specialties, duty rotas, or promise that a named person will treat the patient.
- Do not quote fees, medical-aid cover, discounts, or payment terms.
- Do not diagnose, prescribe, assess clinical urgency, interpret treatment plans, recommend treatment, or promise outcomes. For urgent symptoms, give only the published phone and emergency contact and say they should seek urgent medical help.
- If a fact is not in this list or in a knowledge-base passage you just retrieved, say it is not in the practice knowledge and offer reception on ${SMILEMORE_CONTACTS.phone}.

Booking diary (the booking board is the only availability authority):
- One 30-minute booking is held per location. There is no chair count or dentist rota beyond that.
- Call checkDentalAvailability before talking about a time. Call listDentalBookings before describing someone's bookings.
- createDentalBooking stores a request. Say "requested", never "booked" or "confirmed", unless the saved status is confirmed.
- Call updateDentalBooking with status confirmed only after the person agrees to that exact location and time and the tool succeeds.
- Never say a slot is free, held, or confirmed from memory.
- The booking diary, client file, till, medical-aid worksheet, and CRM are one record matched by phone. Call getDentalPatient before describing a returning person. Diary visits, till treatment names, and worksheet status are only what that tool returns. If it is not listed, say it is not on file.
- Do not invent medical history, the next procedure, fees, or what a medical scheme will pay. Do not read out a rand amount from a receipt. If they ask what something cost or what was paid, say reception has the receipt and give ${SMILEMORE_CONTACTS.phone}.
- Medical-aid details are only what the client file already stores or what the person has just read from their card. Never guess a scheme, option, membership number, or dependant code. A claim worksheet is not a submitted or paid claim.`;
}

/** Portal Sarah role links for SmileMore. WhatsApp reception does not use this. */
export function smilemoreWorkforceHint(moduleKey) {
    if (moduleKey === "admin") {
        return "SmileMore Sarah Admin is connected to every practice module: Overview, Dental Command Center, CRM, Bookings, Client database, Medical aid, Point of Sale, Analytics, and Sarah Sales, Sarah Finance, Sarah Operations, and Sarah HR. Open a module with navigatePortal only when asked. A saved receipt or diary row is a fact. Do not quote the till price list or say what a medical scheme will pay.";
    }
    if (moduleKey === "finance") {
        return "SmileMore Sarah Finance is connected to Point of Sale and Medical aid. Use listDentalSales for recorded till receipts and listDentalClaims for claim worksheets. A worksheet is not a submitted or paid claim. Do not say what a scheme will pay. Open dentalPos or dentalMedicalAid only when asked.";
    }
    if (moduleKey === "operations") {
        return "SmileMore Sarah Operations is connected to the booking diary. The same phone opens the client file, till, and medical-aid worksheet. Use listDentalBookings, checkDentalAvailability, createDentalBooking, updateDentalBooking, and getDentalPatient. A request stays requested until the diary says confirmed. Do not quote fees, receipt amounts, or scheme benefits.";
    }
    if (moduleKey === "sales") {
        return "SmileMore Sarah Sales is connected to WhatsApp, the booking diary, CRM, the client database, the till, and medical aid. The same phone is one record. Use the dental booking tools and getDentalPatient. A request is not a confirmed booking. Do not quote fees, receipt amounts, discounts, or what a medical scheme will pay.";
    }
    return "";
}
