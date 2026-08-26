/**
 * Slot-based scheduling helpers — business hours, slot windows, and capacity checks.
 * All wall-clock times use Africa/Johannesburg (BUSINESS_TIMEZONE) regardless of server TZ.
 * Inventory availability (sold/reserved) lives in inventoryService, not here.
 */
import { countAppointmentsInSlot } from "../database/appointmentRepository.js";

/** @type {string} */
export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Johannesburg";

/** South Africa — fixed UTC+2, no DST */
const BUSINESS_TZ_OFFSET = "+02:00";

const DEFAULT_BUSINESS_HOURS = {
    /** 0 = Sunday … 6 = Saturday — Mon–Fri for Central Motors pilot */
    days: [1, 2, 3, 4, 5],
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

export function getBusinessTimezone() {
    return BUSINESS_TIMEZONE;
}

export function getBusinessHours() {
    return DEFAULT_BUSINESS_HOURS;
}

export function getSlotDurationMs() {
    return SLOT_MINUTES * 60 * 1000;
}

export function getMaxConcurrentPerSlot() {
    return MAX_CONCURRENT;
}

function pad(n, width = 2) {
    return String(n).padStart(width, "0");
}

/**
 * Build a Date (UTC instant) from business-timezone wall-clock components.
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} day
 * @param {number} [hour]
 * @param {number} [minute]
 * @param {number} [second]
 */
export function dateFromBusinessLocal(year, month, day, hour = 0, minute = 0, second = 0) {
    return new Date(
        `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${BUSINESS_TZ_OFFSET}`
    );
}

/**
 * @param {Date|string} date
 */
export function getDatePartsInBusinessTz(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;

    const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: BUSINESS_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
    return {
        year: parseInt(parts.year, 10),
        month: parseInt(parts.month, 10),
        day: parseInt(parts.day, 10),
        hour: parseInt(parts.hour, 10),
        minute: parseInt(parts.minute, 10),
        second: parseInt(parts.second, 10),
    };
}

/**
 * @param {Date|string} date
 * @returns {number} 0 = Sunday … 6 = Saturday
 */
export function getDayOfWeekInBusinessTz(date) {
    const d = date instanceof Date ? date : new Date(date);
    const dayStr = new Intl.DateTimeFormat("en-US", {
        timeZone: BUSINESS_TIMEZONE,
        weekday: "long",
    })
        .format(d)
        .toLowerCase();
    return DAY_NAMES.indexOf(dayStr);
}

export function getTodayStartInBusinessTz() {
    const parts = getDatePartsInBusinessTz(new Date());
    return dateFromBusinessLocal(parts.year, parts.month, parts.day, 0, 0);
}

/**
 * Add calendar days in business timezone (handles month boundaries).
 * @param {Date} baseDate
 * @param {number} days
 */
export function addBusinessDays(baseDate, days) {
    const parts = getDatePartsInBusinessTz(baseDate);
    const anchor = dateFromBusinessLocal(parts.year, parts.month, parts.day, 12, 0);
    const shifted = new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000);
    const newParts = getDatePartsInBusinessTz(shifted);
    return dateFromBusinessLocal(newParts.year, newParts.month, newParts.day, 0, 0);
}

/**
 * Normalize a datetime to the start of its slot window (business TZ wall clock).
 * @param {Date|string} date
 */
export function normalizeToSlotStart(date) {
    const parts = getDatePartsInBusinessTz(date);
    if (!parts) {
        throw new Error("Invalid scheduled date/time");
    }
    const roundedMinute = Math.floor(parts.minute / SLOT_MINUTES) * SLOT_MINUTES;
    return dateFromBusinessLocal(parts.year, parts.month, parts.day, parts.hour, roundedMinute);
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

    const isoTimeMatch = raw.match(/\d{4}-\d{2}-\d{2}[T\s](\d{2}):(\d{2})/);
    if (isoTimeMatch) {
        const h = parseInt(isoTimeMatch[1], 10);
        const m = parseInt(isoTimeMatch[2], 10);
        return h !== 0 || m !== 0;
    }

    return false;
}

/**
 * Resolve the next calendar date matching a weekday name in text.
 * @param {string} lower
 * @param {Date} baseToday business-TZ midnight for today
 */
function parseDayFromText(lower, baseToday) {
    const currentDay = getDayOfWeekInBusinessTz(baseToday);
    const wantsThisWeek = /\bthis\s+(?:week(?:'s|s)?\s+)?(?:coming\s+)?/i.test(lower);

    for (const [index, name] of DAY_NAMES.entries()) {
        const re = new RegExp(`\\b(?:this\\s+(?:week(?:'s|s)?\\s+)?(?:coming\\s+)?)?${name}\\b|\\b${name.slice(0, 3)}\\b`);
        if (!re.test(lower)) continue;

        let delta = index - currentDay;
        if (wantsThisWeek) {
            if (delta < 0) delta += 7;
        } else if (delta <= 0) {
            delta += 7;
        }
        return addBusinessDays(baseToday, delta);
    }
    return null;
}

/**
 * Whether input is time-only (no date component).
 * @param {string} raw
 */
export function isTimeOnlyInput(raw) {
    const value = String(raw || "").trim();
    if (!value) return false;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
    if (/^\d{4}-\d{2}-\d{2}\s+\d/.test(value)) return false;
    if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return false;
    if (/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(value)) return true;
    if (/^\d{1,2}:\d{2}$/.test(value)) return true;
    return (
        hasExplicitTimeInString(value) &&
        !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|\d{4}-\d{2}-\d{2})\b/i.test(
            value
        )
    );
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

    const nowParts = getDatePartsInBusinessTz(now);

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

        const monthIndex = MONTH_ALIASES[monthToken];
        if (monthIndex == null || day < 1 || day > 31) continue;

        let year = yearToken ? parseInt(yearToken, 10) : nowParts.year;
        let candidate = dateFromBusinessLocal(year, monthIndex + 1, day, 0, 0);
        if (Number.isNaN(candidate.getTime())) continue;

        if (!yearToken && candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
            candidate = dateFromBusinessLocal(year + 1, monthIndex + 1, day, 0, 0);
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
    const parts = getDatePartsInBusinessTz(dateTime);
    return dateFromBusinessLocal(parts.year + 1, parts.month, parts.day, parts.hour, parts.minute);
}

/**
 * Parse ISO date/time without timezone as business-local wall clock.
 * @param {string} raw
 */
function parseIsoAsBusinessLocal(raw) {
    const trimmed = String(raw || "").trim();

    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        return {
            dateOnly: dateFromBusinessLocal(
                parseInt(dateOnlyMatch[1], 10),
                parseInt(dateOnlyMatch[2], 10),
                parseInt(dateOnlyMatch[3], 10),
                0,
                0
            ),
            hasExplicitTime: false,
        };
    }

    const isoMatch = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*(am|pm))?$/i
    );
    if (!isoMatch) return null;

    const hasTz = /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed);
    if (hasTz) return null;

    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    let hour = isoMatch[4] != null ? parseInt(isoMatch[4], 10) : 0;
    const minute = isoMatch[5] != null ? parseInt(isoMatch[5], 10) : 0;
    const meridiem = isoMatch[7]?.toLowerCase();

    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    const hasExplicitTime = isoMatch[4] != null || meridiem != null;
    if (hasExplicitTime) {
        return {
            dateTime: dateFromBusinessLocal(year, month, day, hour, minute),
            hasExplicitTime: true,
        };
    }

    return {
        dateOnly: dateFromBusinessLocal(year, month, day, 0, 0),
        hasExplicitTime: false,
    };
}

/**
 * Parse a clock time from natural language and apply to base date (business TZ).
 * @param {string} lower
 * @param {Date} baseDate
 */
function applyTimeFromText(lower, baseDate) {
    const baseParts = getDatePartsInBusinessTz(baseDate);
    if (!baseParts) return null;

    const ampmMatch = lower.match(/(?:\bat\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (ampmMatch) {
        let hour = parseInt(ampmMatch[1], 10);
        const minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
        const meridiem = ampmMatch[3]?.toLowerCase();
        if (meridiem === "pm" && hour < 12) hour += 12;
        if (meridiem === "am" && hour === 12) hour = 0;
        return dateFromBusinessLocal(baseParts.year, baseParts.month, baseParts.day, hour, minute);
    }

    const colonMatch = lower.match(/\b(\d{1,2}):(\d{2})(?:\s*(am|pm))?\b/i);
    if (colonMatch) {
        let hour = parseInt(colonMatch[1], 10);
        const minute = parseInt(colonMatch[2], 10);
        const meridiem = colonMatch[3]?.toLowerCase();
        if (meridiem === "pm" && hour < 12) hour += 12;
        if (meridiem === "am" && hour === 12) hour = 0;
        return dateFromBusinessLocal(baseParts.year, baseParts.month, baseParts.day, hour, minute);
    }

    return null;
}

/**
 * Parse scheduling input into date and optional time components.
 * @param {{ date?: string, time?: string, scheduledAt?: string, contextDate?: string }} input
 */
export function parseScheduledInput(input = {}) {
    const contextDate =
        input.contextDate && /^\d{4}-\d{2}-\d{2}$/.test(String(input.contextDate).trim())
            ? String(input.contextDate).trim()
            : null;

    if (contextDate && input.scheduledAt && isTimeOnlyInput(input.scheduledAt)) {
        const timeApplied = applyTimeFromText(
            String(input.scheduledAt).toLowerCase(),
            dateFromBusinessLocal(
                parseInt(contextDate.slice(0, 4), 10),
                parseInt(contextDate.slice(5, 7), 10),
                parseInt(contextDate.slice(8, 10), 10),
                0,
                0
            )
        );
        if (timeApplied) {
            return { ok: true, dateTime: timeApplied, hasExplicitTime: true };
        }
    }

    const scheduledOnly = input.scheduledAt ? String(input.scheduledAt).trim() : "";
    if (scheduledOnly && /^\d{4}-\d{2}-\d{2}T/.test(scheduledOnly) && /(?:Z|[+-]\d{2}:\d{2})$/i.test(scheduledOnly)) {
        const instant = new Date(scheduledOnly);
        if (!Number.isNaN(instant.getTime())) {
            return { ok: true, dateTime: instant, hasExplicitTime: true };
        }
    }

    const combined = [input.scheduledAt, input.date, input.time].filter(Boolean).join(" ").trim();
    const raw =
        input.date && input.time && !input.scheduledAt
            ? `${input.date} ${input.time}`.trim()
            : combined || String(input.date || "").trim();
    if (!raw) {
        return { ok: false, error: "A date is required (date, time, or scheduledAt)." };
    }

    const lower = raw.toLowerCase();
    const now = new Date();
    let base = contextDate
        ? dateFromBusinessLocal(
              parseInt(contextDate.slice(0, 4), 10),
              parseInt(contextDate.slice(5, 7), 10),
              parseInt(contextDate.slice(8, 10), 10),
              0,
              0
          )
        : getTodayStartInBusinessTz();

    if (isTimeOnlyInput(raw) && contextDate) {
        const timeApplied = applyTimeFromText(lower, base);
        if (timeApplied) {
            return { ok: true, dateTime: timeApplied, hasExplicitTime: true };
        }
    }

    const trimmedRaw = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmedRaw) && /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmedRaw)) {
        const instant = new Date(trimmedRaw);
        if (!Number.isNaN(instant.getTime())) {
            return { ok: true, dateTime: instant, hasExplicitTime: true };
        }
    }

    const businessIso = parseIsoAsBusinessLocal(raw);
    if (businessIso) {
        if (businessIso.hasExplicitTime && businessIso.dateTime) {
            return { ok: true, dateTime: businessIso.dateTime, hasExplicitTime: true };
        }
        if (businessIso.dateOnly) {
            return { ok: true, dateOnly: businessIso.dateOnly, hasExplicitTime: false };
        }
    }

    if (/\btomorrow\b/.test(lower)) {
        base = addBusinessDays(base, 1);
    } else if (/\btoday\b/.test(lower)) {
        // keep today
    } else {
        const weekday = parseDayFromText(lower, base);
        if (weekday) {
            base = weekday;
        } else {
            const monthDay = parseMonthDayFromText(lower, now);
            if (monthDay) {
                base = monthDay;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
                const parsed = parseIsoAsBusinessLocal(raw.trim());
                if (parsed?.dateOnly) {
                    return { ok: true, dateOnly: parsed.dateOnly, hasExplicitTime: false };
                }
                return { ok: false, error: `Could not parse date: "${raw}"` };
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
    const parts = getDatePartsInBusinessTz(scheduledAt);
    if (!parts) return false;

    const day = getDayOfWeekInBusinessTz(scheduledAt);
    if (!hours.days.includes(day)) return false;

    const { hour, minute } = parts;
    const start = hours.startHour;
    const end = hours.endHour;

    if (hour < start) return false;
    if (hour > end) return false;
    if (hour === end && minute > 0) return false;
    return true;
}

export function formatSlotLabel(scheduledAt) {
    const d = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    return d.toLocaleString("en-ZA", {
        timeZone: BUSINESS_TIMEZONE,
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
 * Format YYYY-MM-DD for a date in business timezone.
 * @param {Date|string} date
 */
export function toBusinessDateString(date) {
    const parts = getDatePartsInBusinessTz(date);
    if (!parts) return "";
    return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
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
 * Only returns slots that pass business-hours and capacity checks.
 * @param {string} companyId
 * @param {Date} date
 */
export async function findOpenSlotsForDate(companyId, date) {
    const hours = getBusinessHours();
    const parts = getDatePartsInBusinessTz(date);
    if (!parts) return [];

    const { year, month, day } = parts;
    const slots = [];

    for (let hour = hours.startHour; hour < hours.endHour; hour++) {
        for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
            const slot = dateFromBusinessLocal(year, month, day, hour, minute);
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

/**
 * Find the first bookable slot for a vehicle within the next N calendar days.
 * @param {string} companyId
 * @param {string} vehicleId
 * @param {{ daysAhead?: number, customerId?: string, evaluate?: Function }} [options]
 */
export async function findFirstAvailableSlotForVehicle(companyId, vehicleId, options = {}) {
    const daysAhead = options.daysAhead ?? 7;
    const evaluate = options.evaluate;
    if (typeof evaluate !== "function") return null;

    for (let offset = 0; offset < daysAhead; offset++) {
        const dateBase = addBusinessDays(getTodayStartInBusinessTz(), offset);
        const dayOfWeek = getDayOfWeekInBusinessTz(dateBase);
        if (!getBusinessHours().days.includes(dayOfWeek)) continue;

        const openSlots = await findOpenSlotsForDate(companyId, dateBase);
        for (const slot of openSlots) {
            const check = await evaluate(companyId, {
                vehicleId,
                scheduledAt: slot.slotStart,
                includeAlternatives: false,
                customerId: options.customerId,
            });
            if (check.available) {
                return {
                    slotStart: check.slotStart,
                    slotLabel: check.slotLabel,
                    date: toBusinessDateString(dateBase),
                };
            }
        }
    }

    return null;
}
