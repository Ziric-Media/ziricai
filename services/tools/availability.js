/**
 * Slot-based scheduling helpers — business hours, slot windows, and capacity checks.
 * Inventory availability (sold/reserved) lives in inventoryService, not here.
 */
import { countAppointmentsInSlot } from "../database/appointmentRepository.js";

const DEFAULT_BUSINESS_HOURS = {
    /** 0 = Sunday … 6 = Saturday */
    days: [1, 2, 3, 4, 5, 6],
    startHour: 9,
    endHour: 17,
};

const DAY_NAMES = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];

const MONTH_NAMES = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];

const MONTH_ALIASES = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
};

const SLOT_MINUTES = parseInt(process.env.APPOINTMENT_SLOT_MINUTES || "30", 10);
const MAX_CONCURRENT = parseInt(process.env.APPOINTMENT_MAX_CONCURRENT || "2", 10);

export function getBusinessHours() {
    return DEFAULT_BUSINESS_HOURS;
}

export function getSlotDurationMs() {
    return SLOT_MINUTES * 60 * 1000;
}

export function getMaxConcurrentPerSlot() {
    return MAX_CONCURRENT;
}

/**
 * Normalize a datetime to the start of its slot window.
 * @param {Date|string} date
 */
export function normalizeToSlotStart(date) {
    const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    if (Number.isNaN(d.getTime())) {
        throw new Error("Invalid scheduled date/time");
    }
    const minutes = d.getMinutes();
    const rounded = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
    d.setMinutes(rounded, 0, 0);
    return d;
}

export function slotEnd(slotStart) {
    return new Date(slotStart.getTime() + getSlotDurationMs());
}

/**
 * Whether a string includes an explicit clock time (not date-only).
 * @param {string} value
 */
export function hasExplicitTimeInString(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;

    if (/\d{1,2}:\d{2}/.test(raw)) return true;
    if (/\d{1,2}\s*(am|pm)\b/i.test(raw)) return true;

    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
        return iso.getHours() !== 0 || iso.getMinutes() !== 0 || iso.getSeconds() !== 0;
    }

    return false;
}

/**
 * Resolve the next calendar date matching a weekday name in text.
 * @param {string} lower
 * @param {Date} base
 */
function parseDayFromText(lower, base) {
    for (const [index, name] of DAY_NAMES.entries()) {
        const re = new RegExp(`\\b${name}\\b|\\b${name.slice(0, 3)}\\b`);
        if (!re.test(lower)) continue;

        const candidate = new Date(base);
        const currentDay = candidate.getDay();
        let delta = index - currentDay;
        if (delta <= 0) delta += 7;
        candidate.setDate(candidate.getDate() + delta);
        candidate.setHours(0, 0, 0, 0);
        return candidate;
    }
    return null;
}

/**
 * Parse "28 August", "August 28", or "28 Aug" into a calendar date (year inferred).
 * @param {string} lower
 * @param {Date} now
 */
function parseMonthDayFromText(lower, now = new Date()) {
    const patterns = [
        /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)\b(?:\s+(\d{4}))?/i,
        /\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:\s+(\d{4}))?/i,
    ];

    for (const pattern of patterns) {
        const match = lower.match(pattern);
        if (!match) continue;

        let day;
        let monthToken;
        let yearToken;

        if (/^\d/.test(match[1])) {
            day = parseInt(match[1], 10);
            monthToken = match[2]?.toLowerCase();
            yearToken = match[3];
        } else {
            monthToken = match[1]?.toLowerCase();
            day = parseInt(match[2], 10);
            yearToken = match[3];
        }

        const month = MONTH_ALIASES[monthToken];
        if (month == null || day < 1 || day > 31) continue;

        let year = yearToken ? parseInt(yearToken, 10) : now.getFullYear();
        let candidate = new Date(year, month, day, 0, 0, 0, 0);
        if (Number.isNaN(candidate.getTime())) continue;

        if (!yearToken && candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
            candidate = new Date(year + 1, month, day, 0, 0, 0, 0);
        }

        return candidate;
    }

    return null;
}

/**
 * Ensure parsed datetimes are not accidentally in the past (wrong year inference).
 * @param {Date} dateTime
 */
function ensureFutureDateTime(dateTime) {
    const now = new Date();
    if (dateTime.getTime() >= now.getTime() - 5 * 60 * 1000) return dateTime;
    const bumped = new Date(dateTime);
    bumped.setFullYear(bumped.getFullYear() + 1);
    return bumped;
}

/**
 * Parse a clock time from natural language and apply to base date.
 * @param {string} lower
 * @param {Date} base
 */
function applyTimeFromText(lower, base) {
    const ampmMatch = lower.match(/(?:\bat\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (ampmMatch) {
        const result = new Date(base);
        let hour = parseInt(ampmMatch[1], 10);
        const minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
        const meridiem = ampmMatch[3]?.toLowerCase();
        if (meridiem === "pm" && hour < 12) hour += 12;
        if (meridiem === "am" && hour === 12) hour = 0;
        result.setHours(hour, minute, 0, 0);
        return result;
    }

    const colonMatch = lower.match(/\b(\d{1,2}):(\d{2})\b/);
    if (colonMatch) {
        const result = new Date(base);
        result.setHours(parseInt(colonMatch[1], 10), parseInt(colonMatch[2], 10), 0, 0);
        return result;
    }

    return null;
}

/**
 * Parse scheduling input into date and optional time components.
 * @param {{ date?: string, time?: string, scheduledAt?: string }} input
 */
export function parseScheduledInput(input = {}) {
    const combined = [input.scheduledAt, input.date, input.time].filter(Boolean).join(" ").trim();
    const raw = combined || String(input.date || "").trim();
    if (!raw) {
        return { ok: false, error: "A date is required (date, time, or scheduledAt)." };
    }

    const lower = raw.toLowerCase();
    const now = new Date();
    let base = new Date(now);
    base.setHours(0, 0, 0, 0);

    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(raw)) {
        const hasTime =
            hasExplicitTimeInString(raw) ||
            (input.time && String(input.time).trim().length > 0);
        if (hasTime) {
            return { ok: true, dateTime: iso, hasExplicitTime: true };
        }
        const dateOnly = new Date(iso);
        dateOnly.setHours(0, 0, 0, 0);
        return { ok: true, dateOnly, hasExplicitTime: false };
    }

    if (/\btomorrow\b/.test(lower)) {
        base.setDate(base.getDate() + 1);
    } else if (/\btoday\b/.test(lower)) {
        // keep today
    } else {
        const weekday = parseDayFromText(lower, now);
        if (weekday) {
            base = weekday;
        } else {
            const monthDay = parseMonthDayFromText(lower, now);
            if (monthDay) {
                base = monthDay;
            } else if (!Number.isNaN(iso.getTime())) {
                const hasTime = hasExplicitTimeInString(raw);
                return hasTime
                    ? { ok: true, dateTime: iso, hasExplicitTime: true }
                    : { ok: true, dateOnly: iso, hasExplicitTime: false };
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
                const dateOnly = new Date(`${raw.trim()}T00:00:00`);
                if (Number.isNaN(dateOnly.getTime())) {
                    return { ok: false, error: `Could not parse date: "${raw}"` };
                }
                return { ok: true, dateOnly, hasExplicitTime: false };
            } else {
                return { ok: false, error: `Could not parse date/time: "${raw}"` };
            }
        }
    }

    const withTime = applyTimeFromText(lower, base);
    if (withTime) {
        const fromMonthDay = parseMonthDayFromText(lower, now) != null;
        const dateTime = fromMonthDay ? ensureFutureDateTime(withTime) : withTime;
        return { ok: true, dateTime, hasExplicitTime: true };
    }

    if (input.time) {
        const timeApplied = applyTimeFromText(String(input.time).toLowerCase(), base);
        if (timeApplied) {
            const fromMonthDay =
                parseMonthDayFromText(lower, now) != null ||
                (input.date && parseMonthDayFromText(String(input.date).toLowerCase(), now) != null);
            const dateTime = fromMonthDay ? ensureFutureDateTime(timeApplied) : timeApplied;
            return { ok: true, dateTime, hasExplicitTime: true };
        }
    }

    return { ok: true, dateOnly: base, hasExplicitTime: false };
}

/**
 * Parse ISO or common human datetime strings — requires an explicit time.
 * @param {string} value
 */
export function parseScheduledAt(value) {
    const parsed = parseScheduledInput({ scheduledAt: value });
    if (!parsed.ok) throw new Error(parsed.error);
    if (!parsed.hasExplicitTime || !parsed.dateTime) {
        throw new Error(
            "A specific time is required to book a test drive. Ask the customer for their preferred time."
        );
    }
    return parsed.dateTime;
}

/**
 * Find the next open slot on the same day, staggered by slot duration.
 * @param {string} companyId
 * @param {Date} fromSlot
 * @param {number} [maxAttempts]
 */
export async function findNextStaggeredSlot(companyId, fromSlot, maxAttempts = 8) {
    let candidate = normalizeToSlotStart(fromSlot);
    for (let i = 0; i < maxAttempts; i++) {
        candidate = new Date(candidate.getTime() + getSlotDurationMs());
        if (!isWithinBusinessHours(candidate)) break;
        const capacity = await checkSlotCapacity(companyId, candidate);
        if (capacity.available) {
            return { slotStart: capacity.slotStart, label: formatSlotLabel(capacity.slotStart) };
        }
    }
    return null;
}

/**
 * @param {Date} scheduledAt
 * @param {{ days?: number[], startHour?: number, endHour?: number }} [hours]
 */
export function isWithinBusinessHours(scheduledAt, hours = DEFAULT_BUSINESS_HOURS) {
    const day = scheduledAt.getDay();
    if (!hours.days.includes(day)) return false;

    const hour = scheduledAt.getHours();
    const minute = scheduledAt.getMinutes();
    const start = hours.startHour;
    const end = hours.endHour;

    if (hour < start) return false;
    if (hour > end) return false;
    if (hour === end && minute > 0) return false;
    return true;
}

export function formatSlotLabel(scheduledAt) {
    return scheduledAt.toLocaleString("en-ZA", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
}

/**
 * Check whether a slot window has capacity (appointment/slot availability).
 * @param {string} companyId
 * @param {Date} slotStart
 */
export async function checkSlotCapacity(companyId, slotStart) {
    const normalized = normalizeToSlotStart(slotStart);
    const end = slotEnd(normalized);
    const concurrent = await countAppointmentsInSlot(companyId, normalized, end);
    const max = getMaxConcurrentPerSlot();
    return {
        slotStart: normalized,
        slotEnd: end,
        concurrent,
        max,
        available: concurrent < max,
    };
}

/**
 * List open slot starts on a calendar date within business hours.
 * @param {string} companyId
 * @param {Date} date
 */
export async function findOpenSlotsForDate(companyId, date) {
    const hours = getBusinessHours();
    const dayStart = new Date(date);
    dayStart.setHours(hours.startHour, 0, 0, 0);

    const slots = [];
    for (let hour = hours.startHour; hour < hours.endHour; hour++) {
        for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
            const slot = new Date(dayStart);
            slot.setHours(hour, minute, 0, 0);
            if (!isWithinBusinessHours(slot, hours)) continue;
            const capacity = await checkSlotCapacity(companyId, slot);
            if (capacity.available) {
                slots.push({
                    slotStart: capacity.slotStart.toISOString(),
                    label: formatSlotLabel(capacity.slotStart),
                });
            }
        }
    }
    return slots;
}
