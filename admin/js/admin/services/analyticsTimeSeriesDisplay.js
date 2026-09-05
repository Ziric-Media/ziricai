/**
 * Pure time-series view helpers — safe for Node verify scripts (no API imports).
 */

/** @param {{ date: string, value: number }[]} points */
export function chartLabelsFromSeries(points = []) {
  return points.map((row) => row.date.slice(5));
}

/** @param {{ date: string, value: number }[]} points */
export function chartValuesFromSeries(points = []) {
  return points.map((row) => row.value ?? 0);
}

/**
 * @param {{ totalInRange?: number, complete?: boolean }} meta
 * @param {{ date: string, value: number }[]} points
 */
export function seriesIsUnavailable(meta, points) {
  if (!Array.isArray(points)) return true;
  if (!meta) return true;
  return false;
}

/**
 * @param {{ totalInRange?: number, complete?: boolean, invalidTimestampCount?: number, metric?: string, source?: string }} meta
 */
export function formatSeriesMetaNote(meta) {
  if (!meta) return null;
  const parts = [];
  if (meta.metric === 'messageDocuments') {
    parts.push('Message documents — not the CRM Messages KPI');
  }
  if (meta.invalidTimestampCount > 0) {
    parts.push(`${meta.invalidTimestampCount} record(s) missing valid createdAt`);
  }
  if (meta.complete === false) {
    parts.push('Series may be incomplete');
  }
  if (meta.totalInRange != null) {
    parts.push(`${meta.totalInRange} in selected range`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** @param {{ error?: string, data?: object }} apiResult */
export function resolveTimeSeriesLoadState(apiResult) {
  if (apiResult?.error) {
    return { loadState: 'error', timeSeries: null, error: apiResult.error };
  }
  if (!apiResult?.data) {
    return { loadState: 'error', timeSeries: null, error: 'No time-series data returned' };
  }
  return { loadState: 'ok', timeSeries: apiResult.data, error: null };
}
