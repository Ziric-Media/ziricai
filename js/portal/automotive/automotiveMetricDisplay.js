/**
 * Map Phase 1 API metric objects to UI display (ok | empty | unavailable).
 * @param {{ status?: string, value?: unknown, notRealisedRevenue?: boolean, definition?: string, reason?: string }} metric
 * @param {{ zeroLabel?: string, unavailableLabel?: string, formatNumber?: (n: number) => string }} [opts]
 */
export function formatAutomotiveMetric(metric, opts = {}) {
  const unavailableLabel = opts.unavailableLabel ?? 'Unavailable';
  const formatNumber = opts.formatNumber ?? ((n) => String(n));

  if (!metric || typeof metric !== 'object') {
    return {
      kind: 'unavailable',
      display: unavailableLabel,
      ariaLabel: 'Metric unavailable',
      rawValue: null,
    };
  }

  const status = String(metric.status || '').toLowerCase();

  if (status === 'unavailable') {
    return {
      kind: 'unavailable',
      display: unavailableLabel,
      ariaLabel: `Unavailable: ${metric.reason || 'source not available'}`,
      rawValue: null,
    };
  }

  if (status === 'empty') {
    const n = Number(metric.value);
    const display = Number.isFinite(n) ? formatNumber(n) : '0';
    return {
      kind: 'empty',
      display,
      ariaLabel: 'No records in period — zero',
      rawValue: 0,
    };
  }

  if (status === 'ok') {
    if (typeof metric.value === 'object' && metric.value !== null && !Array.isArray(metric.value)) {
      return {
        kind: 'ok',
        display: null,
        ariaLabel: 'Breakdown available',
        rawValue: metric.value,
        breakdown: true,
      };
    }
    const n = Number(metric.value);
    const display = Number.isFinite(n) ? formatNumber(n) : String(metric.value ?? '—');
    return {
      kind: 'ok',
      display,
      ariaLabel: `Value ${display}`,
      rawValue: metric.value,
    };
  }

  return {
    kind: 'unavailable',
    display: unavailableLabel,
    ariaLabel: 'Unknown metric status',
    rawValue: null,
  };
}

/**
 * @param {{ status?: string, notRealisedRevenue?: boolean }} metric
 */
export function salesMetricCardTitle(baseTitle, metric) {
  if (metric?.notRealisedRevenue) {
    return `${baseTitle} (listing price — not realised revenue)`;
  }
  if (baseTitle.toLowerCase().includes('realised')) return baseTitle;
  return baseTitle;
}

/**
 * Build chart rows from breakdown metric; returns null when unavailable/empty object.
 * @param {{ status?: string, value?: Record<string, number> }} metric
 */
export function breakdownToChartRows(metric) {
  const formatted = formatAutomotiveMetric(metric);
  if (formatted.kind === 'unavailable' || !formatted.breakdown) return null;
  const entries = Object.entries(formatted.rawValue || {});
  if (!entries.length) return [];
  return entries
    .map(([label, count]) => ({ label, value: Number(count) || 0 }))
    .sort((a, b) => b.value - a.value);
}

/**
 * @param {string} from
 * @param {string} to
 */
export function formatReportingPeriodLabel(from, to) {
  if (!from || !to) return 'Reporting period';
  if (from === to) return `Reporting period: ${from} (UTC)`;
  return `Reporting period: ${from} → ${to} (UTC)`;
}

/**
 * Prevent stale tenant data from being applied after context switch.
 * @param {number} expectedGeneration
 * @param {number} responseGeneration
 */
export function shouldApplyAutomotiveDashboardResponse(expectedGeneration, responseGeneration) {
  return expectedGeneration === responseGeneration;
}
