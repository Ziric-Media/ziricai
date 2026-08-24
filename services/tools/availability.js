/**
 * Simple slot-based availability for test drives and similar appointments.
 */

const DEFAULT_BUSINESS_HOURS = {
    /** 0 = Sunday … 6 = Saturday */
    days: [1, 2, 3, 4, 5, 6],
    startHour: 9,
    endHour: 17,
};

const SLOT_MINUTES = parseInt(process.env.APPOINTMENT_SLOT_MINUTES || "30", 10);
const MAX_CONCURRENT = parseInt(process.env.APPOINTMENT_MAX_CONCURRENT || "2", 10);

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
 * Parse ISO or common human datetime strings (best-effort).
 * @param {string} value
 */
export function parseScheduledAt(value) {
    const raw = String(value || "").trim();
    if (!raw) throw new Error("scheduledAt is required");

    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(raw)) {
        return iso;
    }

    const now = new Date();
    const lower = raw.toLowerCase();

    let base = new Date(now);
    if (/\btomorrow\b/.test(lower)) {
        base.setDate(base.getDate() + 1);
    } else if (/\btoday\b/.test(lower)) {
        // keep today
    } else if (!Number.isNaN(iso.getTime())) {
        return iso;
    } else {
        throw new Error(`Could not parse scheduled time: "${raw}"`);
    }

    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const meridiem = timeMatch[3];
        if (meridiem === "pm" && hour < 12) hour += 12;
        if (meridiem === "am" && hour === 12) hour = 0;
        base.setHours(hour, minute, 0, 0);
        return base;
    }

    if (!Number.isNaN(iso.getTime())) return iso;
    throw new Error(`Could not parse scheduled time: "${raw}"`);
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
