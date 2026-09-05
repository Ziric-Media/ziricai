/**
 * B-MC-4a — tenant Analytics via authoritative operations metrics API.
 * Read-only; no root Firestore analytics/ reads in production.
 */
import { fetchTenantMissionMetrics } from '../api.js';
import {
  mapTenantMetricsToAnalyticsView,
  formatAnalyticsMetric,
  resolveTenantAnalyticsLoadState,
} from './analyticsDisplay.js';

export { mapTenantMetricsToAnalyticsView, formatAnalyticsMetric } from './analyticsDisplay.js';

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
