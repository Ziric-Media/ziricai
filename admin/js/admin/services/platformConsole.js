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

export function fetchPlatformSupportAttention(query = {}) {
  const params = new URLSearchParams();
  if (query.period) params.set('period', query.period);
  if (query.date) params.set('date', query.date);
  if (query.queue) params.set('queue', query.queue);
  const qs = params.toString();
  return get(`/api/operations/platform-support-attention${qs ? `?${qs}` : ''}`);
}

export function fetchPlatformSupportOperations(query = {}) {
  const params = new URLSearchParams();
  if (query.period) params.set('period', query.period);
  if (query.date) params.set('date', query.date);
  if (query.periodKey) params.set('periodKey', query.periodKey);
  const qs = params.toString();
  return get(`/api/operations/platform-support-operations${qs ? `?${qs}` : ''}`);
}

export async function sendMissionControlSarahChat({ message, companyId, sessionId, pageContext }) {
  const result = await apiRequest('/api/operations/sarah/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: String(message || '').trim(),
      companyId: companyId || null,
      sessionId: sessionId || null,
      surface: 'mission_control',
      pageContext: pageContext || null,
    }),
    silent: true,
  });
  if (result.error) {
    return { error: result.error, status: result.status, data: null };
  }
  return { error: null, status: 200, data: result.data };
}

function mcSessionsQuery(scopedCompanyId) {
  if (scopedCompanyId) {
    return `?companyId=${encodeURIComponent(scopedCompanyId)}`;
  }
  return '';
}

export async function fetchMcSarahActiveSession(scopedCompanyId = null) {
  const result = await apiRequest(`/api/operations/sarah/sessions/active${mcSessionsQuery(scopedCompanyId)}`, {
    silent: true,
  });
  if (result.error) {
    return { error: result.error, status: result.status, data: null };
  }
  return { error: null, status: 200, data: result.data };
}

export async function fetchMcSarahSession(sessionId, scopedCompanyId = null) {
  const result = await apiRequest(
    `/api/operations/sarah/sessions/${encodeURIComponent(sessionId)}${mcSessionsQuery(scopedCompanyId)}`,
    { silent: true }
  );
  if (result.error) {
    return { error: result.error, status: result.status, data: null };
  }
  return { error: null, status: 200, data: result.data };
}

export async function createMcSarahSession(scopedCompanyId = null) {
  const result = await apiRequest('/api/operations/sarah/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId: scopedCompanyId || null }),
    silent: true,
  });
  if (result.error) {
    return { error: result.error, status: result.status, data: null };
  }
  return { error: null, status: result.status || 201, data: result.data };
}
