/**
 * Mission Control Dashboard 2.0 — Platform Intelligence API client (PI-4E).
 * Same endpoints as Sarah; no client-side metric math beyond display formatting.
 */
import { apiRequest } from '../../shared/apiRequest.js';

const ORG_TYPE_LABELS = {
  company: 'Companies',
  government: 'Government',
  political_public_service: 'Political / Public Service',
};

export { ORG_TYPE_LABELS };

export const PI_PERIOD_PRESETS = [
  { id: 'today', label: 'Today', period: 'day' },
  { id: 'week', label: '7 Days', period: 'week' },
  { id: 'thisMonth', label: 'This Month', period: 'month' },
  { id: 'lastMonth', label: 'Last Month', period: 'month', lastMonth: true },
  { id: 'custom', label: 'Custom', period: 'day', custom: true },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toUtcDate(d = new Date()) {
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return new Date();
  return t;
}

function utcDateKey(d = new Date()) {
  return toUtcDate(d).toISOString().slice(0, 10);
}

function utcMonthKey(d = new Date()) {
  return toUtcDate(d).toISOString().slice(0, 7);
}

function utcWeekKey(d = new Date()) {
  const parsed = toUtcDate(d);
  const target = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${pad2(week)}`;
}

function previousMonthKey(monthKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return utcMonthKey();
  let y = Number(m[1]);
  let mo = Number(m[2]) - 1;
  if (mo < 1) {
    mo = 12;
    y -= 1;
  }
  return `${y}-${pad2(mo)}`;
}

/**
 * @param {string} presetId
 * @param {{ customDate?: string, customPeriod?: string }} custom
 */
export function resolvePlatformIntelligenceQuery(presetId, custom = {}) {
  const preset = PI_PERIOD_PRESETS.find((p) => p.id === presetId) || PI_PERIOD_PRESETS[2];
  const now = new Date();

  if (preset.custom) {
    const period = custom.customPeriod || 'day';
    const date = custom.customDate || utcDateKey(now);
    return {
      presetId: 'custom',
      period,
      periodKey: period === 'month' ? date.slice(0, 7) : period === 'week' ? utcWeekKey(`${date}T12:00:00.000Z`) : date.slice(0, 10),
      date,
      label: formatPeriodLabel(period, period === 'month' ? date.slice(0, 7) : date.slice(0, 10)),
    };
  }

  if (preset.lastMonth) {
    const periodKey = previousMonthKey(utcMonthKey(now));
    return {
      presetId: preset.id,
      period: 'month',
      periodKey,
      label: formatPeriodLabel('month', periodKey),
    };
  }

  const period = preset.period;
  let periodKey = utcDateKey(now);
  if (period === 'week') periodKey = utcWeekKey(now.toISOString());
  if (period === 'month') periodKey = utcMonthKey(now);

  return {
    presetId: preset.id,
    period,
    periodKey,
    label: formatPeriodLabel(period, periodKey),
  };
}

export function formatPeriodLabel(period, periodKey) {
  if (period === 'day') {
    const d = new Date(`${periodKey}T12:00:00.000Z`);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (period === 'month') {
    const [y, mo] = periodKey.split('-');
    const d = new Date(Date.UTC(Number(y), Number(mo) - 1, 1));
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return periodKey;
}

function queryString({ period, periodKey, date }) {
  const params = new URLSearchParams();
  params.set('period', period);
  if (periodKey) params.set('periodKey', periodKey);
  else if (date) params.set('date', date);
  return params.toString();
}

export async function fetchPlatformIntelligence(query) {
  const qs = queryString(query);
  const result = await apiRequest(`/api/operations/platform-intelligence?${qs}`, { silent: true });
  if (result.error) {
    return { error: result.error, status: result.status, data: null };
  }
  return { error: null, status: 200, data: result.data };
}

/** Day / week / month message snapshots for communications panel (calendar boundaries). */
export async function fetchCommunicationsSnapshots() {
  const now = new Date();
  const dayKey = utcDateKey(now);
  const weekKey = utcWeekKey(now.toISOString());
  const monthKey = utcMonthKey(now);
  const [day, week, month] = await Promise.all([
    fetchPlatformIntelligence({ period: 'day', periodKey: dayKey }),
    fetchPlatformIntelligence({ period: 'week', periodKey: weekKey }),
    fetchPlatformIntelligence({ period: 'month', periodKey: monthKey }),
  ]);
  return {
    day: day.data,
    week: week.data,
    month: month.data,
    errors: [day.error, week.error, month.error].filter(Boolean),
  };
}

export function formatGrowthPct(deltaObj) {
  if (!deltaObj) return '—';
  const prev = Number(deltaObj.previous ?? 0);
  const cur = Number(deltaObj.current ?? 0);
  if (prev === 0) return cur === 0 ? '0%' : '—';
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

export function buildDashboardAssessment({ intel, exec, integrations, support }) {
  const facts = [];
  const wa = integrations?.platforms?.find((p) => p.id === 'whatsapp') || exec?.integrations?.whatsapp;
  const notConnected = Number(wa?.notConnectedTenants ?? wa?.not_connected ?? 0);
  const waErrors = Number(wa?.errorTenants ?? wa?.error ?? 0);

  if (waErrors === 0) {
    facts.push({ level: 'healthy', text: 'WhatsApp integrations report no tenants in error status.' });
  } else {
    facts.push({ level: 'risk', text: `${waErrors} tenant WhatsApp integration(s) in error.` });
  }
  if (notConnected > 0) {
    facts.push({ level: 'attention', text: `${notConnected} organisations without WhatsApp connected.` });
  }

  const msgGrowth = intel?.growthVersusPreviousPeriod?.messages?.all;
  if (msgGrowth && msgGrowth.delta > 0) {
    facts.push({ level: 'growing', text: `Messages up ${msgGrowth.delta} vs previous period.` });
  } else if (msgGrowth && msgGrowth.delta < 0) {
    facts.push({ level: 'attention', text: `Messages down ${Math.abs(msgGrowth.delta)} vs previous period.` });
  }

  if (support?.meta?.unavailable) {
    facts.push({ level: 'healthy', text: 'Support inbox feed not connected (no synthetic cases).' });
  } else if (Number(support?.counts?.open || 0) > 0) {
    facts.push({ level: 'risk', text: `${support.counts.open} open support case(s).` });
  }

  return facts;
}
