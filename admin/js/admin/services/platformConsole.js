/**
 * Mission Control platform console APIs (read-only aggregates).
 */
import { apiRequest } from '../../shared/apiRequest.js';

async function get(path) {
  const result = await apiRequest(path, { silent: true });
  if (result.error) {
    return { error: result.error, status: result.status, data: null };
  }
  return { error: null, status: 200, data: result.data };
}

export function fetchPlatformExecutiveOverview() {
  return get('/api/operations/platform-executive-overview');
}

export function fetchPlatformBillingConsole() {
  return get('/api/operations/platform-billing-console');
}

export function fetchPlatformIntegrations() {
  return get('/api/operations/platform-integrations');
}

export function fetchPlatformAnalyticsOverview() {
  return get('/api/operations/platform-analytics-overview');
}

export function fetchPlatformSupportCases() {
  return get('/api/operations/platform-support-cases');
}

export async function sendMissionControlSarahChat({ message, companyId, sessionId }) {
  const result = await apiRequest('/api/operations/sarah/chat', {
    method: 'POST',
    body: { message, companyId: companyId || null, sessionId: sessionId || null },
    silent: true,
  });
  if (result.error) {
    return { error: result.error, status: result.status, data: null };
  }
  return { error: null, status: 200, data: result.data };
}
