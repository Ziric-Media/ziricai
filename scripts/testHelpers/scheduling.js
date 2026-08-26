/**
 * Shared scheduling helpers for verify scripts — uses Africa/Johannesburg business TZ.
 */
import {
    addBusinessDays,
    getTodayStartInBusinessTz,
    getDayOfWeekInBusinessTz,
    dateFromBusinessLocal,
    getDatePartsInBusinessTz,
    toBusinessDateString,
} from "../../services/tools/availability.js";

/**
 * Next Mon–Fri slot as ISO instant (safe on UTC servers).
 * @param {number} [daysAhead]
 * @param {number} [hour] business-local hour 9–16
 * @param {number} [minute]
 */
export function futureSlotIso(daysAhead = 2, hour = 10, minute = 0) {
    for (let offset = daysAhead; offset < daysAhead + 21; offset++) {
        const d = addBusinessDays(getTodayStartInBusinessTz(), offset);
        const dow = getDayOfWeekInBusinessTz(d);
        if (dow >= 1 && dow <= 5) {
            const parts = getDatePartsInBusinessTz(d);
            return dateFromBusinessLocal(parts.year, parts.month, parts.day, hour, minute).toISOString();
        }
    }
    throw new Error("Could not find a weekday for futureSlotIso");
}

/**
 * Next Mon–Fri date as YYYY-MM-DD in business TZ.
 * @param {number} [daysAhead]
 */
export function futureDateOnly(daysAhead = 3) {
    for (let offset = daysAhead; offset < daysAhead + 21; offset++) {
        const d = addBusinessDays(getTodayStartInBusinessTz(), offset);
        const dow = getDayOfWeekInBusinessTz(d);
        if (dow >= 1 && dow <= 5) {
            return toBusinessDateString(d);
        }
    }
    throw new Error("Could not find a weekday for futureDateOnly");
}

/**
 * Weekday name for a future Mon–Fri.
 * @param {number} [daysAhead]
 */
export function nextWeekdayName(daysAhead = 3) {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (let offset = daysAhead; offset < daysAhead + 21; offset++) {
        const d = addBusinessDays(getTodayStartInBusinessTz(), offset);
        const dow = getDayOfWeekInBusinessTz(d);
        if (dow >= 1 && dow <= 5) {
            return names[dow];
        }
    }
    throw new Error("Could not find a weekday name");
}
