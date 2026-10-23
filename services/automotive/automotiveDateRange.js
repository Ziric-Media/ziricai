/** UTC date-range parsing for automotive dashboard queries. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {{ from?: string, to?: string, periodDays?: string }} query
 * @param {number} [nowMs]
 */
export function parseAutomotiveDashboardDateRange(query = {}, nowMs = Date.now()) {
    const fromRaw = query.from != null ? String(query.from).trim() : "";
    const toRaw = query.to != null ? String(query.to).trim() : "";

    if (fromRaw && !ISO_DATE.test(fromRaw)) {
        throw Object.assign(new Error("Invalid from date — use YYYY-MM-DD"), {
            status: 400,
            code: "INVALID_DATE_RANGE",
        });
    }
    if (toRaw && !ISO_DATE.test(toRaw)) {
        throw Object.assign(new Error("Invalid to date — use YYYY-MM-DD"), {
            status: 400,
            code: "INVALID_DATE_RANGE",
        });
    }

    let from = fromRaw;
    let to = toRaw;

    if (!from && !to) {
        const days = Math.min(90, Math.max(1, Number.parseInt(String(query.periodDays || "30"), 10) || 30));
        const end = new Date(nowMs);
        end.setUTCHours(0, 0, 0, 0);
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - (days - 1));
        from = start.toISOString().slice(0, 10);
        to = end.toISOString().slice(0, 10);
    } else if (from && !to) {
        to = from;
    } else if (!from && to) {
        from = to;
    }

    if (from > to) {
        throw Object.assign(new Error("from must be on or before to"), {
            status: 400,
            code: "INVALID_DATE_RANGE",
        });
    }

    return {
        from,
        to,
        timezonePolicy: "UTC",
        inclusiveEnd: true,
    };
}

export function parseInstantToUtcDay(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

export function isDayInRange(day, from, to) {
    if (!day) return false;
    return day >= from && day <= to;
}
