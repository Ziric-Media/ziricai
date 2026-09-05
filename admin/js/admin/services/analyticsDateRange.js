/**
 * B-MC-4d — Analytics chart date range helpers (mirrors tenantTimeSeries validation).
 * Pure functions — safe for Node verify scripts.
 */

export const ANALYTICS_DEFAULT_RANGE_DAYS = 14;
export const ANALYTICS_MAX_RANGE_DAYS = 90;
const MS_PER_DAY = 86400000;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {Date} [now] */
export function utcTodayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** @param {Date} [now] */
export function defaultAnalyticsDateRange(now = new Date()) {
  const endDate = utcTodayKey(now);
  const endMs = Date.parse(`${endDate}T00:00:00.000Z`);
  const startDate = new Date(endMs - (ANALYTICS_DEFAULT_RANGE_DAYS - 1) * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  return { startDate, endDate };
}

/** @param {number} days @param {Date} [now] */
export function analyticsRangeForLastDays(days, now = new Date()) {
  const span = Math.max(1, Math.min(days, ANALYTICS_MAX_RANGE_DAYS));
  const endDate = utcTodayKey(now);
  const endMs = Date.parse(`${endDate}T00:00:00.000Z`);
  const startDate = new Date(endMs - (span - 1) * MS_PER_DAY).toISOString().slice(0, 10);
  return { startDate, endDate };
}

/** @param {string} startDate @param {string} endDate */
export function daySpanInclusive(startDate, endDate) {
  const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
  const endMs = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.floor((endMs - startMs) / MS_PER_DAY) + 1;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 */
function parseUtcDateKey(value, fieldName) {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) {
    return { ok: false, error: `${fieldName} must be YYYY-MM-DD` };
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { ok: false, error: `${fieldName} is not a valid calendar date` };
  }
  return { ok: true, value };
}

/**
 * @param {unknown} startDate
 * @param {unknown} endDate
 */
export function validateAnalyticsDateRange(startDate, endDate) {
  const start = parseUtcDateKey(startDate, 'Start date');
  if (!start.ok) return { ok: false, error: start.error };
  const end = parseUtcDateKey(endDate, 'End date');
  if (!end.ok) return { ok: false, error: end.error };

  if (start.value > end.value) {
    return { ok: false, error: 'Start date must be on or before end date' };
  }

  const span = daySpanInclusive(start.value, end.value);
  if (span > ANALYTICS_MAX_RANGE_DAYS) {
    return {
      ok: false,
      error: `Date range must not exceed ${ANALYTICS_MAX_RANGE_DAYS} calendar days`,
    };
  }

  return { ok: true, startDate: start.value, endDate: end.value, daySpan: span };
}

export const ANALYTICS_RANGE_PRESETS = Object.freeze([
  { id: '7d', label: '7d', days: 7 },
  { id: '14d', label: '14d', days: 14 },
  { id: '30d', label: '30d', days: 30 },
  { id: '90d', label: '90d', days: 90 },
]);
