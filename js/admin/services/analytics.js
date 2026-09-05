/**
 * B-MC-4a — tenant Analytics via authoritative operations metrics API.
 * Read-only; no root Firestore analytics/ reads in production.
 */
import { fetchTenantMissionMetrics, fetchTenantAnalyticsTimeSeries } from '../api.js';
import {
  mapTenantMetricsToAnalyticsView,
  formatAnalyticsMetric,
  resolveTenantAnalyticsLoadState,
} from './analyticsDisplay.js';
import { resolveTimeSeriesLoadState } from './analyticsTimeSeriesDisplay.js';
import {
  defaultAnalyticsDateRange,
  validateAnalyticsDateRange,
} from './analyticsDateRange.js';

export { mapTenantMetricsToAnalyticsView, formatAnalyticsMetric } from './analyticsDisplay.js';
export {
  chartLabelsFromSeries,
  chartValuesFromSeries,
  formatSeriesMetaNote,
  resolveTimeSeriesLoadState,
} from './analyticsTimeSeriesDisplay.js';
export {
  defaultAnalyticsDateRange,
  analyticsRangeForLastDays,
  validateAnalyticsDateRange,
  ANALYTICS_MAX_RANGE_DAYS,
  ANALYTICS_RANGE_PRESETS,
} from './analyticsDateRange.js';

/**
 * Load tenant analytics for Mission Control Analytics page.
 * @param {string|null|undefined} companyId
 */
export async function loadTenantAnalytics(companyId) {
  if (!companyId) {
    return resolveTenantAnalyticsLoadState(null, {});
  }

  const result = await fetchTenantMissionMetrics(companyId);

  if (result.error) {
    return {
      loadState: 'error',
      view: null,
      error: result.error,
      status: result.status ?? null,
    };
  }

  return resolveTenantAnalyticsLoadState(companyId, { data: result.data });
}

/**
 * Load tenant analytics time-series (B-MC-4b). Default 14-day UTC range from API.
 * @param {string|null|undefined} companyId
 * @param {{ startDate?: string, endDate?: string, series?: string }} [options]
 */
export async function loadTenantAnalyticsTimeSeries(companyId, options = {}) {
  if (!companyId) {
    return { loadState: 'scope_required', timeSeries: null };
  }

  const result = await fetchTenantAnalyticsTimeSeries(companyId, options);

  if (result.error) {
    return {
      loadState: 'error',
      timeSeries: null,
      error: result.error,
      status: result.status ?? null,
    };
  }

  return resolveTimeSeriesLoadState({ data: result.data });
}
