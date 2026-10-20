/**
 * Finance Overview — calendar boundaries in Africa/Johannesburg (fixed UTC+2, no DST).
 * Host TZ-independent; safe in browser and Node verify scripts.
 */

export const FINANCE_OVERVIEW_CALENDAR_TZ = 'Africa/Johannesburg';

/** South Africa Standard Time — no daylight saving. */
const JHB_UTC_OFFSET = '+02:00';

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

/**
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} day
 * @param {number} hour
 * @param {number} minute
 * @param {number} second
 * @param {number} ms
 * @returns {number} UTC epoch ms
 */
export function instantFromJohannesburgLocal(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const iso =
    `${pad(year, 4)}-${pad(month)}-${pad(day)}T` +
    `${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(ms, 3)}${JHB_UTC_OFFSET}`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * @param {number} instantMs
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }|null}
 */
export function getJohannesburgParts(instantMs) {
  if (!Number.isFinite(instantMs)) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: FINANCE_OVERVIEW_CALENDAR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(instantMs)).map((p) => [p.type, p.value]));
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
 * @param {string} ymd YYYY-MM-DD
 * @returns {{ year: number, month: number, day: number }|null}
 */
export function parseCalendarDateString(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = instantFromJohannesburgLocal(year, month, day, 12);
  if (!Number.isFinite(probe)) return null;
  const roundTrip = getJohannesburgParts(probe);
  if (!roundTrip || roundTrip.year !== year || roundTrip.month !== month || roundTrip.day !== day) {
    return null;
  }
  return { year, month, day };
}

/** Inclusive start of a calendar day in Johannesburg (00:00:00.000). */
export function startOfJohannesburgCalendarDayMs(ymd) {
  const p = parseCalendarDateString(ymd);
  if (!p) return NaN;
  return instantFromJohannesburgLocal(p.year, p.month, p.day, 0, 0, 0, 0);
}

/** Inclusive end of a calendar day in Johannesburg (23:59:59.999). */
export function endOfJohannesburgCalendarDayMs(ymd) {
  const p = parseCalendarDateString(ymd);
  if (!p) return NaN;
  const noon = instantFromJohannesburgLocal(p.year, p.month, p.day, 12);
  const nextNoon = noon + 86400000;
  const nextParts = getJohannesburgParts(nextNoon);
  if (!nextParts) return NaN;
  const nextStart = instantFromJohannesburgLocal(nextParts.year, nextParts.month, nextParts.day, 0, 0, 0, 0);
  return nextStart - 1;
}

/**
 * Move calendar days in Johannesburg (uses noon anchor + Intl round-trip, not fixed 24h leaps).
 * @param {{ year: number, month: number, day: number }} start
 * @param {number} deltaDays negative allowed
 */
export function addJohannesburgCalendarDays(start, deltaDays) {
  const anchor = instantFromJohannesburgLocal(start.year, start.month, start.day, 12);
  const shifted = anchor + deltaDays * 86400000;
  const parts = getJohannesburgParts(shifted);
  if (!parts) return null;
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** Start of today's calendar day in Johannesburg. */
export function startOfTodayJohannesburgMs(nowMs = Date.now()) {
  const parts = getJohannesburgParts(nowMs);
  if (!parts) return NaN;
  return instantFromJohannesburgLocal(parts.year, parts.month, parts.day, 0, 0, 0, 0);
}

/**
 * Preset window: inclusive calendar days in JHB ending at `nowMs`.
 * @param {number} calendarDays e.g. 90 → today and prior 89 calendar days
 */
export function johannesburgPresetRangeMs(calendarDays, nowMs = Date.now()) {
  const todayParts = getJohannesburgParts(nowMs);
  if (!todayParts) return { startMs: NaN, endMs: nowMs };
  const startParts = addJohannesburgCalendarDays(todayParts, -(calendarDays - 1));
  if (!startParts) return { startMs: NaN, endMs: nowMs };
  return {
    startMs: instantFromJohannesburgLocal(startParts.year, startParts.month, startParts.day, 0, 0, 0, 0),
    endMs: nowMs,
  };
}
