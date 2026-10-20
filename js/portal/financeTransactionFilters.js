/** Pure transaction filter helpers (safe for Node verify scripts). */

export const TX_FILTER_DEFAULTS = {
  dateRange: 'all',
  recordType: '',
  category: '',
  status: 'all',
};

export function rangeStartIso(range) {
  const now = Date.now();
  const day = 86400000;
  if (range === '30d') return new Date(now - 30 * day).toISOString();
  if (range === '90d') return new Date(now - 90 * day).toISOString();
  if (range === '365d') return new Date(now - 365 * day).toISOString();
  return null;
}

export function applyTransactionFilters(txs, filters) {
  const f = filters || TX_FILTER_DEFAULTS;
  let rows = Array.isArray(txs) ? [...txs] : [];
  const start = rangeStartIso(f.dateRange);
  if (start) {
    const t0 = Date.parse(start);
    rows = rows.filter((t) => {
      const at = Date.parse(String(t.occurredAt || t.createdAt || ''));
      return Number.isFinite(at) && at >= t0;
    });
  }
  if (f.recordType) {
    const rt = String(f.recordType).toLowerCase();
    rows = rows.filter((t) => String(t.recordType || '').toLowerCase() === rt);
  }
  if (f.category) {
    rows = rows.filter((t) => String(t.category || '') === f.category);
  }
  if (f.status && f.status !== 'all') {
    rows = rows.filter((t) => String(t.status || 'posted') === f.status);
  }
  return rows;
}

export function transactionFiltersActive(filters) {
  const f = filters || {};
  return (
    (f.dateRange && f.dateRange !== 'all') ||
    Boolean(f.recordType) ||
    Boolean(f.category) ||
    (f.status && f.status !== 'all')
  );
}

export function sumFilteredPostedTotals(txs) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (String(t.status || 'posted') !== 'posted') continue;
    const m = Number(t.amountMinor) || 0;
    if (t.direction === 'in' || t.recordType === 'income') income += m;
    else expense += m;
  }
  return { income, expense, net: income - expense };
}
