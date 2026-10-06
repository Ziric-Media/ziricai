/** @param {string} isoTimestamp */
export function utcDateKey(isoTimestamp) {
    const t = isoTimestamp ? new Date(isoTimestamp) : new Date();
    if (Number.isNaN(t.getTime())) return new Date().toISOString().slice(0, 10);
    return t.toISOString().slice(0, 10);
}

/** ISO week key e.g. 2026-W40 */
export function utcWeekKey(isoTimestamp) {
    const d = isoTimestamp ? new Date(isoTimestamp) : new Date();
    if (Number.isNaN(d.getTime())) return utcWeekKey(new Date().toISOString());
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** @param {string} isoTimestamp */
export function utcMonthKey(isoTimestamp) {
    const t = isoTimestamp ? new Date(isoTimestamp) : new Date();
    if (Number.isNaN(t.getTime())) return new Date().toISOString().slice(0, 7);
    return t.toISOString().slice(0, 7);
}

export const PERIOD_GRAINS = ["day", "week", "month"];

/**
 * @param {'day'|'week'|'month'} grain
 * @param {string} isoTimestamp
 */
export function periodKeyForGrain(grain, isoTimestamp) {
    if (grain === "week") return utcWeekKey(isoTimestamp);
    if (grain === "month") return utcMonthKey(isoTimestamp);
    return utcDateKey(isoTimestamp);
}

/**
 * @param {'day'|'week'|'month'} grain
 * @param {string} periodKey
 * @returns {string} ISO timestamp at period start (UTC)
 */
export function periodStartIso(grain, periodKey) {
    if (grain === "day") return `${periodKey}T00:00:00.000Z`;
    if (grain === "month") return `${periodKey}-01T00:00:00.000Z`;
    const m = /^(\d{4})-W(\d{2})$/.exec(periodKey);
    if (!m) return `${utcDateKey(new Date())}T00:00:00.000Z`;
    const year = Number(m[1]);
    const week = Number(m[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
    return monday.toISOString();
}

/**
 * Previous reporting period key (for growth comparisons).
 * @param {'day'|'week'|'month'} grain
 * @param {string} periodKey
 */
export function previousPeriodKey(grain, periodKey) {
    if (grain === "day") {
        const d = new Date(`${periodKey}T12:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return utcDateKey(d.toISOString());
    }
    if (grain === "month") {
        const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
        if (!m) return utcMonthKey(new Date().toISOString());
        let y = Number(m[1]);
        let mo = Number(m[2]) - 1;
        if (mo < 1) {
            mo = 12;
            y -= 1;
        }
        return `${y}-${String(mo).padStart(2, "0")}`;
    }
    const w = /^(\d{4})-W(\d{2})$/.exec(periodKey);
    if (!w) return utcWeekKey(new Date().toISOString());
    let year = Number(w[1]);
    let week = Number(w[2]) - 1;
    if (week < 1) {
        year -= 1;
        week = 52;
    }
    return `${year}-W${String(week).padStart(2, "0")}`;
}
