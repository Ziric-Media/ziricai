/**
 * Finance Overview — pure reporting helpers (Node-safe for verify scripts).
 * Movement: posted ledger txs by transaction date (occurredAt), grouped by ISO currency.
 * Receivables/payables: current invoice balances, not mixed with movement totals.
 */
import { isFinanceQuotation } from './financeQuotation.js';
import {
  FINANCE_OVERVIEW_CALENDAR_TZ,
  endOfJohannesburgCalendarDayMs,
  johannesburgPresetRangeMs,
  parseCalendarDateString,
  startOfJohannesburgCalendarDayMs,
} from './financeOverviewCalendar.js';

export { FINANCE_OVERVIEW_CALENDAR_TZ };

export const OVERVIEW_PRESET_LABELS = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last 12 months',
  all: 'All time',
  custom: 'Custom range',
};

export const OVERVIEW_PERIOD_DEFAULTS = {
  preset: '90d',
  customStart: '',
  customEnd: '',
};

/** @returns {{ valid: boolean, error?: string, preset: string, label: string, startMs: number|null, endMs: number|null, basis: string, calendarTimezone: string }} */
export function resolveOverviewPeriod(period, nowMs = Date.now()) {
  const preset = period?.preset || OVERVIEW_PERIOD_DEFAULTS.preset;
  const calendarTimezone = FINANCE_OVERVIEW_CALENDAR_TZ;

  if (preset === 'custom') {
    const startStr = String(period?.customStart || '').trim();
    const endStr = String(period?.customEnd || '').trim();
    if (!startStr || !endStr) {
      return {
        valid: false,
        error: 'Choose a start and end date for the custom range.',
        preset,
        label: OVERVIEW_PRESET_LABELS.custom,
        startMs: null,
        endMs: null,
        basis: 'transaction-date',
        calendarTimezone,
      };
    }
    if (!parseCalendarDateString(startStr) || !parseCalendarDateString(endStr)) {
      return {
        valid: false,
        error: 'Invalid custom dates.',
        preset,
        label: OVERVIEW_PRESET_LABELS.custom,
        startMs: null,
        endMs: null,
        basis: 'transaction-date',
        calendarTimezone,
      };
    }
    const startMs = startOfJohannesburgCalendarDayMs(startStr);
    const endMs = endOfJohannesburgCalendarDayMs(endStr);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return {
        valid: false,
        error: 'Invalid custom dates.',
        preset,
        label: OVERVIEW_PRESET_LABELS.custom,
        startMs: null,
        endMs: null,
        basis: 'transaction-date',
        calendarTimezone,
      };
    }
    if (startMs > endMs) {
      return {
        valid: false,
        error: 'Start date must be on or before the end date.',
        preset,
        label: OVERVIEW_PRESET_LABELS.custom,
        startMs,
        endMs,
        basis: 'transaction-date',
        calendarTimezone,
      };
    }
    return {
      valid: true,
      preset,
      label: `${startStr} to ${endStr}`,
      startMs,
      endMs,
      basis: 'transaction-date',
      calendarTimezone,
    };
  }

  if (preset === 'all') {
    return {
      valid: true,
      preset,
      label: OVERVIEW_PRESET_LABELS.all,
      startMs: null,
      endMs: null,
      basis: 'transaction-date',
      calendarTimezone,
    };
  }

  const days = preset === '30d' ? 30 : preset === '365d' ? 365 : 90;
  const { startMs, endMs } = johannesburgPresetRangeMs(days, nowMs);
  return {
    valid: true,
    preset,
    label: OVERVIEW_PRESET_LABELS[preset] || OVERVIEW_PRESET_LABELS['90d'],
    startMs,
    endMs,
    basis: 'transaction-date',
    calendarTimezone,
  };
}

/** Posted, non-void transactions within resolved period (occurredAt, else createdAt). */
export function filterPostedTransactionsForOverview(txs, periodResolved) {
  if (!periodResolved?.valid) return [];
  let rows = (txs || []).filter((t) => {
    if (String(t.status || 'posted') === 'void') return false;
    return String(t.status || 'posted') === 'posted';
  });
  if (periodResolved.startMs != null) {
    rows = rows.filter((t) => {
      const at = Date.parse(String(t.occurredAt || t.createdAt || ''));
      if (!Number.isFinite(at)) return false;
      if (at < periodResolved.startMs) return false;
      if (periodResolved.endMs != null && at > periodResolved.endMs) return false;
      return true;
    });
  }
  return rows;
}

/** @returns {Array<{ currency: string, incomeMinor: number, expenseMinor: number, netMinor: number }>} */
export function groupMovementByCurrency(txs) {
  const map = new Map();
  for (const t of txs || []) {
    const code = String(t.currency || 'ZAR')
      .trim()
      .toUpperCase();
    if (!code) continue;
    if (!map.has(code)) {
      map.set(code, { currency: code, incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
    }
    const bucket = map.get(code);
    const m = Number(t.amountMinor) || 0;
    if (t.direction === 'in' || t.recordType === 'income') bucket.incomeMinor += m;
    else bucket.expenseMinor += m;
  }
  for (const bucket of map.values()) {
    bucket.netMinor = bucket.incomeMinor - bucket.expenseMinor;
  }
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Current outstanding invoice balances by currency (not period-scoped). */
export function groupOutstandingByCurrency(invoices, kind) {
  const map = new Map();
  for (const inv of invoices || []) {
    if (inv.status === 'void' || inv.invoiceKind !== kind) continue;
    if (isFinanceQuotation(inv)) continue;
    const total = Number(inv.totalMinor) || 0;
    const paid = Number(inv.amountPaidMinor) || 0;
    const bal = Math.max(0, total - paid);
    if (bal <= 0) continue;
    const code = String(inv.currency || 'ZAR')
      .trim()
      .toUpperCase();
    if (!map.has(code)) {
      map.set(code, { currency: code, totalMinor: 0, count: 0 });
    }
    const bucket = map.get(code);
    bucket.totalMinor += bal;
    bucket.count += 1;
  }
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function pickPrimaryCurrency(movement, txs) {
  if (movement?.length) {
    const sorted = [...movement].sort(
      (a, b) => b.incomeMinor + b.expenseMinor - (a.incomeMinor + a.expenseMinor)
    );
    return sorted[0].currency;
  }
  const t = txs?.[0]?.currency;
  return t ? String(t).toUpperCase() : 'ZAR';
}

export function outstandingMinorForCurrency(groups, currency) {
  const code = String(currency || '').toUpperCase();
  const row = (groups || []).find((g) => g.currency === code);
  return row?.totalMinor ?? 0;
}

/** Counts and movement rows for dashboard KPIs (amounts stay per-currency). */
export function buildOverviewDashboardStats(scopedTxs, receivables, payables, quotationCount = 0) {
  const movement = groupMovementByCurrency(scopedTxs);
  let incomeTxCount = 0;
  let expenseTxCount = 0;
  for (const t of scopedTxs || []) {
    if (String(t.recordType || '').toLowerCase() === 'income') incomeTxCount += 1;
    else if (String(t.recordType || '').toLowerCase() === 'expense') expenseTxCount += 1;
  }
  const recvCount = receivables.reduce((s, r) => s + r.count, 0);
  const payCount = payables.reduce((s, r) => s + r.count, 0);
  return {
    movement,
    primaryCurrency: pickPrimaryCurrency(movement, scopedTxs),
    incomeTxCount,
    expenseTxCount,
    postedCount: scopedTxs.length,
    quotationCount,
    recvCount,
    payCount,
  };
}

/** Time buckets for one currency (day buckets, or weekly when range > ~120 days). */
export function movementTimeSeriesForCurrency(txs, currency, periodResolved) {
  const code = String(currency || 'ZAR').toUpperCase();
  const filtered = (txs || []).filter(
    (t) => String(t.currency || 'ZAR').trim().toUpperCase() === code
  );
  const end = periodResolved.endMs ?? Date.now();
  const defaultSpan = 90 * 86400000;
  const start =
    periodResolved.startMs != null ? periodResolved.startMs : end - defaultSpan;
  const spanMs = Math.max(end - start, 86400000);
  const bucketMs = spanMs > 120 * 86400000 ? 7 * 86400000 : 86400000;

  const buckets = new Map();
  for (const t of filtered) {
    const at = Date.parse(String(t.occurredAt || t.createdAt || ''));
    if (!Number.isFinite(at) || at < start || at > end) continue;
    const idx = Math.floor((at - start) / bucketMs);
    const key = start + idx * bucketMs;
    if (!buckets.has(key)) buckets.set(key, { income: 0, expense: 0 });
    const b = buckets.get(key);
    const m = Number(t.amountMinor) || 0;
    if (t.direction === 'in' || t.recordType === 'income') b.income += m;
    else b.expense += m;
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  if (!sorted.length) {
    return { currency: code, labels: [], incomeMinor: [], expenseMinor: [], netMinor: [] };
  }
  return {
    currency: code,
    labels: sorted.map(([k]) =>
      new Date(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    ),
    incomeMinor: sorted.map(([, v]) => v.income),
    expenseMinor: sorted.map(([, v]) => v.expense),
    netMinor: sorted.map(([, v]) => v.income - v.expense),
  };
}

/** Posted expense transactions in period, newest first. */
export function listExpenseTransactionsForOverview(txs, periodResolved, limit = 12) {
  const scoped = filterPostedTransactionsForOverview(txs, periodResolved);
  return scoped
    .filter((t) => String(t.recordType || '').toLowerCase() === 'expense')
    .sort((a, b) => Date.parse(b.occurredAt || b.createdAt || 0) - Date.parse(a.occurredAt || a.createdAt || 0))
    .slice(0, limit);
}
