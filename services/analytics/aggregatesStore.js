/**
 * Aggregates store — daily/hourly rollups + live counters per company.
 * Path: companies/{companyId}/analytics/daily/{date}
 *       companies/{companyId}/analytics/metrics/current
 */
import { TenantRepository } from "../database/tenantRepository.js";
import { ANALYTICS_SUBCOLLECTIONS } from "../database/schema.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";

const dailyRepo = new TenantRepository(ANALYTICS_SUBCOLLECTIONS.DAILY);
const metricsRepo = new TenantRepository(ANALYTICS_SUBCOLLECTIONS.METRICS);

/** @type {Map<string, object>} pending batch buffers */
const pendingByCompany = new Map();
let flushTimer = null;
let eventsSinceFlush = 0;

const BATCH_SIZE = parseInt(process.env.ANALYTICS_BATCH_SIZE || "25", 10);
const FLUSH_INTERVAL_MS = parseInt(process.env.ANALYTICS_FLUSH_MS || "30000", 10);

function dateKey(iso = new Date().toISOString()) {
    return iso.slice(0, 10);
}

function hourKey(iso = new Date().toISOString()) {
    return iso.slice(0, 13);
}

function emptyAggregate() {
    return {
        conversations: 0,
        leads: 0,
        appointments: 0,
        revenue: 0,
        sales: 0,
        messagesSent: 0,
        messagesReceived: 0,
        knowledgeUsage: 0,
        knowledgeUploads: 0,
        conversions: 0,
        missedOpportunities: 0,
        automationRuns: 0,
        automationSuccess: 0,
        quotations: 0,
        supportTickets: 0,
        responseTimeMs: 0,
        responseTimeCount: 0,
        aiAccuracySum: 0,
        aiAccuracyCount: 0,
        satisfactionSum: 0,
        satisfactionCount: 0,
        popularQuestions: {},
    };
}

function mergeDeltas(target, deltas) {
    for (const [key, val] of Object.entries(deltas)) {
        if (key === "question" && val) {
            const q = String(val).toLowerCase().trim();
            if (!target.popularQuestions) target.popularQuestions = {};
            target.popularQuestions[q] = (target.popularQuestions[q] || 0) + 1;
            continue;
        }
        if (typeof val === "number" && Number.isFinite(val)) {
            target[key] = (target[key] || 0) + val;
        }
    }
    return target;
}

function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushPendingAggregates().catch((err) => {
            console.error("[aggregatesStore] Flush error:", err.message);
        });
    }, FLUSH_INTERVAL_MS);
}

/**
 * Queue metric deltas for batched persistence.
 * @param {string} companyId
 * @param {object} deltas
 * @param {string} [timestamp]
 */
export function queueAggregateUpdate(companyId, deltas, timestamp) {
    if (!companyId || !deltas) return;

    const ts = timestamp || new Date().toISOString();
    const day = dateKey(ts);
    const hour = hourKey(ts);

    if (!pendingByCompany.has(companyId)) {
        pendingByCompany.set(companyId, { daily: {}, hourly: {}, current: emptyAggregate() });
    }
    const pending = pendingByCompany.get(companyId);

    if (!pending.daily[day]) pending.daily[day] = emptyAggregate();
    if (!pending.hourly[hour]) pending.hourly[hour] = emptyAggregate();

    mergeDeltas(pending.daily[day], deltas);
    mergeDeltas(pending.hourly[hour], deltas);
    mergeDeltas(pending.current, deltas);

    eventsSinceFlush += 1;
    if (eventsSinceFlush >= BATCH_SIZE) {
        flushPendingAggregates().catch((err) => console.error("[aggregatesStore]", err.message));
    } else {
        scheduleFlush();
    }
}

export async function flushPendingAggregates() {
    eventsSinceFlush = 0;
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    const adapter = await getStorageAdapter();
    const entries = [...pendingByCompany.entries()];
    pendingByCompany.clear();

    for (const [companyId, pending] of entries) {
        for (const [day, agg] of Object.entries(pending.daily)) {
            const existing = (await dailyRepo.get(companyId, day)) || emptyAggregate();
            await dailyRepo.set(companyId, day, mergeDeltas({ ...existing }, agg));
        }

        const current = (await metricsRepo.get(companyId, "current")) || emptyAggregate();
        await metricsRepo.set(companyId, "current", mergeDeltas({ ...current }, pending.current));

        if (adapter.saveAnalyticsRollup) {
            await adapter.saveAnalyticsRollup(companyId, { daily: pending.daily, current: pending.current });
        }
    }
}

export async function getDailyAggregates(companyId, days = 7) {
    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = dateKey(d.toISOString());
        const row = (await dailyRepo.get(companyId, key)) || emptyAggregate();
        result.push({ date: key, ...row });
    }
    return result;
}

export async function getCurrentMetrics(companyId) {
    await flushPendingAggregates().catch(() => {});
    const current = (await metricsRepo.get(companyId, "current")) || emptyAggregate();
    return computeDerivedMetrics(current);
}

export function computeDerivedMetrics(raw) {
    const avgResponseMs =
        raw.responseTimeCount > 0 ? raw.responseTimeMs / raw.responseTimeCount : null;
    const aiAccuracy =
        raw.aiAccuracyCount > 0 ? Math.round(raw.aiAccuracySum / raw.aiAccuracyCount) : null;
    const customerSatisfaction =
        raw.satisfactionCount > 0
            ? Math.round((raw.satisfactionSum / raw.satisfactionCount) * 10) / 10
            : null;
    const automationSuccessRate =
        raw.automationRuns > 0
            ? Math.round((raw.automationSuccess / raw.automationRuns) * 100)
            : null;

    const popularQuestions = Object.entries(raw.popularQuestions || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([question, count]) => ({ question, count }));

    return {
        ...raw,
        avgResponseMs,
        avgResponseSec: avgResponseMs != null ? Number((avgResponseMs / 1000).toFixed(2)) : null,
        aiAccuracy,
        customerSatisfaction,
        automationSuccessRate,
        popularQuestions,
    };
}

export async function getPopularQuestions(companyId, limit = 10) {
    const metrics = await getCurrentMetrics(companyId);
    return (metrics.popularQuestions || []).slice(0, limit);
}
