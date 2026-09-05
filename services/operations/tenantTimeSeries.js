/**
 * B-MC-4b-1 — Read-only tenant analytics time-series for Mission Control.
 * Aggregates message documents, conversations (createdAt), and Postgres appointments.
 * Does NOT use analyticsDaily, event pipeline, or CRM message counters for daily buckets.
 */
import { TenantRepository } from "../database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getPostgresPool } from "../database/postgresClient.js";
import { listAppointmentsForCompany } from "../database/appointmentRepository.js";
import { getTenantMissionMetrics } from "./tenantMissionMetrics.js";

export const TIME_SERIES_NAMES = Object.freeze([
    "messages",
    "conversationsCreated",
    "testDrivesBooked",
]);

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86400000;
const DEFAULT_RANGE_DAYS = 14;
const MAX_RANGE_DAYS = 90;

export class TimeSeriesValidationError extends Error {
    constructor(message, code = "INVALID_REQUEST") {
        super(message);
        this.name = "TimeSeriesValidationError";
        this.statusCode = 400;
        this.code = code;
    }
}

/** @param {Date} [now] */
export function utcTodayKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

/** @param {Date} [now] */
export function defaultDateRange(now = new Date()) {
    const endDate = utcTodayKey(now);
    const endMs = Date.parse(`${endDate}T00:00:00.000Z`);
    const startDate = new Date(endMs - (DEFAULT_RANGE_DAYS - 1) * MS_PER_DAY).toISOString().slice(0, 10);
    return { startDate, endDate };
}

/**
 * @param {string} value
 * @param {string} fieldName
 * @returns {string}
 */
export function parseUtcDateKey(value, fieldName) {
    if (typeof value !== "string" || !DATE_KEY_RE.test(value)) {
        throw new TimeSeriesValidationError(`${fieldName} must be YYYY-MM-DD`);
    }
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        throw new TimeSeriesValidationError(`${fieldName} is not a valid calendar date`);
    }
    return value;
}

/** @param {string} startDate @param {string} endDate */
export function daySpanInclusive(startDate, endDate) {
    const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
    const endMs = Date.parse(`${endDate}T00:00:00.000Z`);
    return Math.floor((endMs - startMs) / MS_PER_DAY) + 1;
}

/**
 * @param {string} [seriesParam]
 * @returns {string[]}
 */
export function parseSeriesParam(seriesParam) {
    if (seriesParam == null || String(seriesParam).trim() === "") {
        return [...TIME_SERIES_NAMES];
    }
    const parts = String(seriesParam)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    const unknown = parts.filter((name) => !TIME_SERIES_NAMES.includes(name));
    if (unknown.length) {
        throw new TimeSeriesValidationError(`Unknown series: ${unknown.join(", ")}`);
    }
    return parts;
}

/**
 * @param {Record<string, string|undefined>} query
 */
export function parseTimeSeriesQuery(query = {}) {
    const rawStart = query.startDate;
    const rawEnd = query.endDate;

    let startDate;
    let endDate;

    if (!rawStart && !rawEnd) {
        ({ startDate, endDate } = defaultDateRange());
    } else {
        if (!rawStart || !rawEnd) {
            throw new TimeSeriesValidationError("startDate and endDate must both be provided");
        }
        startDate = parseUtcDateKey(String(rawStart), "startDate");
        endDate = parseUtcDateKey(String(rawEnd), "endDate");
    }

    if (startDate > endDate) {
        throw new TimeSeriesValidationError("startDate must be on or before endDate");
    }

    const span = daySpanInclusive(startDate, endDate);
    if (span > MAX_RANGE_DAYS) {
        throw new TimeSeriesValidationError("Date range must not exceed 90 calendar days");
    }

    const series = parseSeriesParam(query.series);
    return { startDate, endDate, series };
}

/**
 * @param {unknown} ts
 * @returns {string|null}
 */
export function utcDayFromTimestamp(ts) {
    if (ts == null) return null;

    let date;
    if (typeof ts === "string") {
        date = new Date(ts);
    } else if (typeof ts === "object" && ts !== null && typeof ts.toDate === "function") {
        date = ts.toDate();
    } else if (ts instanceof Date) {
        date = ts;
    } else if (typeof ts === "object" && ts !== null && ts._seconds != null) {
        date = new Date(ts._seconds * 1000);
    } else {
        date = new Date(String(ts));
    }

    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

/** @param {string} startDate @param {string} endDate */
export function buildZeroFilledBuckets(startDate, endDate) {
    const buckets = [];
    let cursorMs = Date.parse(`${startDate}T00:00:00.000Z`);
    const endMs = Date.parse(`${endDate}T00:00:00.000Z`);

    while (cursorMs <= endMs) {
        buckets.push({ date: new Date(cursorMs).toISOString().slice(0, 10), value: 0 });
        cursorMs += MS_PER_DAY;
    }

    return buckets;
}

/** @param {string} startDate @param {string} endDate */
function rangeBoundsExclusiveEnd(startDate, endDate) {
    return {
        rangeStart: `${startDate}T00:00:00.000Z`,
        rangeEndExclusive: new Date(Date.parse(`${endDate}T00:00:00.000Z`) + MS_PER_DAY).toISOString(),
    };
}

function isDayInRange(day, startDate, endDate) {
    return day >= startDate && day <= endDate;
}

/**
 * Paginate all tenant documents and bucket by timestamp field.
 * @param {TenantRepository} repo
 * @param {string} companyId
 * @param {string} timestampField
 * @param {string} startDate
 * @param {string} endDate
 */
async function aggregateFirestoreByDay(repo, companyId, timestampField, startDate, endDate) {
    const bucketMap = Object.fromEntries(
        buildZeroFilledBuckets(startDate, endDate).map((row) => [row.date, 0])
    );
    let invalidTimestampCount = 0;
    let totalInRange = 0;
    let documentsScanned = 0;
    let cursor = null;

    do {
        const page = await repo.listPage(companyId, {
            max: 200,
            orderByField: timestampField,
            orderDirection: "asc",
            startAfterId: cursor,
        });

        for (const item of page.items) {
            documentsScanned += 1;
            const day = utcDayFromTimestamp(item[timestampField]);
            if (!day) {
                invalidTimestampCount += 1;
                continue;
            }
            if (isDayInRange(day, startDate, endDate)) {
                bucketMap[day] = (bucketMap[day] || 0) + 1;
                totalInRange += 1;
            }
        }

        cursor = page.hasMore ? page.nextCursor : null;
    } while (cursor);

    return {
        points: buildZeroFilledBuckets(startDate, endDate).map(({ date }) => ({
            date,
            value: bucketMap[date] || 0,
        })),
        invalidTimestampCount,
        totalInRange,
        documentsScanned,
    };
}

/**
 * @param {string} companyId
 * @param {string} startDate
 * @param {string} endDate
 */
async function aggregateMessageDocuments(companyId, startDate, endDate) {
    const repo = new TenantRepository(TENANT_COLLECTIONS.MESSAGES);
    const result = await aggregateFirestoreByDay(repo, companyId, "createdAt", startDate, endDate);

    return {
        points: result.points,
        meta: {
            source: `firestore:companies/${companyId}/messages`,
            metric: "messageDocuments",
            totalInRange: result.totalInRange,
            invalidTimestampCount: result.invalidTimestampCount,
            documentsScanned: result.documentsScanned,
            complete: result.invalidTimestampCount === 0,
        },
    };
}

/**
 * @param {string} companyId
 * @param {string} startDate
 * @param {string} endDate
 */
async function aggregateConversationsCreated(companyId, startDate, endDate) {
    const repo = new TenantRepository(TENANT_COLLECTIONS.CONVERSATIONS);
    const result = await aggregateFirestoreByDay(repo, companyId, "createdAt", startDate, endDate);

    return {
        points: result.points,
        meta: {
            source: `firestore:companies/${companyId}/conversations`,
            metric: "conversationsCreated",
            totalInRange: result.totalInRange,
            invalidTimestampCount: result.invalidTimestampCount,
            documentsScanned: result.documentsScanned,
            complete: result.invalidTimestampCount === 0,
        },
    };
}

/**
 * @param {string} companyId
 * @param {string} startDate
 * @param {string} endDate
 */
async function aggregateTestDrivesFromAppointmentList(companyId, startDate, endDate) {
    const appointments = await listAppointmentsForCompany(companyId, { limit: 1000, statusFilter: "all" });
    const bucketMap = Object.fromEntries(
        buildZeroFilledBuckets(startDate, endDate).map((row) => [row.date, 0])
    );
    let totalInRange = 0;
    let excludedCancelled = 0;

    for (const appointment of appointments) {
        if (appointment.status === "cancelled") {
            excludedCancelled += 1;
            continue;
        }
        const day = utcDayFromTimestamp(appointment.createdAt);
        if (!day || !isDayInRange(day, startDate, endDate)) continue;
        bucketMap[day] = (bucketMap[day] || 0) + 1;
        totalInRange += 1;
    }

    return {
        points: buildZeroFilledBuckets(startDate, endDate).map(({ date }) => ({
            date,
            value: bucketMap[date] || 0,
        })),
        meta: {
            source: "postgres:ziricai_appointments.created_at",
            metric: "testDrivesBooked",
            totalInRange,
            excludedCancelled,
            complete: true,
        },
    };
}

/**
 * @param {string} companyId
 * @param {string} startDate
 * @param {string} endDate
 */
async function aggregateTestDrivesBooked(companyId, startDate, endDate) {
    const pool = await getPostgresPool();
    if (!pool) {
        return aggregateTestDrivesFromAppointmentList(companyId, startDate, endDate);
    }

    const { rangeStart, rangeEndExclusive } = rangeBoundsExclusiveEnd(startDate, endDate);

    const [grouped, cancelledRows] = await Promise.all([
        pool.query(
            `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
             FROM ziricai_appointments
             WHERE company_id = $1
               AND status != 'cancelled'
               AND created_at >= $2::timestamptz
               AND created_at < $3::timestamptz
             GROUP BY 1
             ORDER BY 1`,
            [companyId, rangeStart, rangeEndExclusive]
        ),
        pool.query(
            `SELECT COUNT(*)::int AS count
             FROM ziricai_appointments
             WHERE company_id = $1 AND status = 'cancelled'`,
            [companyId]
        ),
    ]);

    const bucketMap = Object.fromEntries(
        buildZeroFilledBuckets(startDate, endDate).map((row) => [row.date, 0])
    );
    let totalInRange = 0;

    for (const row of grouped.rows) {
        if (!isDayInRange(row.day, startDate, endDate)) continue;
        bucketMap[row.day] = row.count;
        totalInRange += row.count;
    }

    return {
        points: buildZeroFilledBuckets(startDate, endDate).map(({ date }) => ({
            date,
            value: bucketMap[date] || 0,
        })),
        meta: {
            source: "postgres:ziricai_appointments.created_at",
            metric: "testDrivesBooked",
            totalInRange,
            excludedCancelled: cancelledRows.rows[0]?.count || 0,
            complete: true,
        },
    };
}

/**
 * Read-only tenant time-series aggregation.
 * @param {string} companyId
 * @param {{ startDate: string, endDate: string, series: string[] }} options
 */
export async function getTenantAnalyticsTimeSeries(companyId, options) {
    if (!companyId || typeof companyId !== "string") {
        throw new TimeSeriesValidationError("companyId is required");
    }

    const { startDate, endDate, series } = options;
    const response = {
        companyId,
        startDate,
        endDate,
        timezone: "UTC",
        bucketKey: "YYYY-MM-DD",
        series: {},
        meta: {},
    };

    const tasks = series.map(async (name) => {
        if (name === "messages") {
            const result = await aggregateMessageDocuments(companyId, startDate, endDate);
            response.series.messages = result.points;
            response.meta.messages = result.meta;
            return;
        }
        if (name === "conversationsCreated") {
            const result = await aggregateConversationsCreated(companyId, startDate, endDate);
            response.series.conversationsCreated = result.points;
            response.meta.conversationsCreated = result.meta;
            return;
        }
        if (name === "testDrivesBooked") {
            const result = await aggregateTestDrivesBooked(companyId, startDate, endDate);
            response.series.testDrivesBooked = result.points;
            response.meta.testDrivesBooked = result.meta;
        }
    });

    await Promise.all(tasks);

    if (series.includes("messages")) {
        try {
            const metrics = await getTenantMissionMetrics(companyId);
            response.kpis = {
                messagesTotal: {
                    value: metrics.counts?.messagesTotal ?? null,
                    source: "crm:customer.totalMessages",
                    note: "CRM counter; not equivalent to message document count",
                },
            };
        } catch {
            /* KPI reference is optional when CRM read fails */
        }
    }

    return response;
}
