/** Portal API client — tenant-scoped backend endpoints (cached via dataService where applicable). */

import { apiRequest } from '../shared/apiRequest.js';
import {
  fetchPortalCompany,
  fetchPortalTeam,
  fetchPortalUsage,
  fetchPortalActivity,
  fetchPortalDashboard,
  fetchPortalNotifications,
  fetchConversations as fetchConversationsCached,
  prefetchHub,
  getHubData,
  invalidateHub,
  invalidateAllPortalCache,
} from './core/dataService.js';

export {
  fetchPortalCompany,
  fetchPortalTeam,
  fetchPortalUsage,
  fetchPortalActivity,
  fetchPortalDashboard,
  fetchPortalNotifications,
  prefetchHub,
  getHubData,
  invalidateHub,
  invalidateAllPortalCache,
};

async function request(path, options = {}) {
  return apiRequest(path, options);
}

export async function fetchPortalHub(companyId) {
  return getHubData(companyId);
}

export async function fetchPortalAnalytics(companyId) {
  return request(`/api/analytics/dashboard/${encodeURIComponent(companyId)}`);
}

export async function fetchAnalyticsEvents(companyId, { limit = 50, cursor, type } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (type) params.set('type', type);
  return request(`/api/analytics/events/${encodeURIComponent(companyId)}?${params}`);
}

export async function fetchPopularQuestions(companyId, limit = 10) {
  return request(`/api/analytics/popular-questions/${encodeURIComponent(companyId)}?limit=${limit}`);
}

export async function fetchAutomations(companyId) {
  return request(`/api/automations/${encodeURIComponent(companyId)}`);
}

export async function fetchAutomationRuns(companyId, limit = 20) {
  return request(`/api/automations/${encodeURIComponent(companyId)}/runs?limit=${limit}`);
}

export async function runAutomation(companyId, workflowId, payload = {}) {
  return request(`/api/automations/${encodeURIComponent(companyId)}/${encodeURIComponent(workflowId)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchKnowledge(companyId) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return request(`/api/knowledge${qs}`);
}

export async function fetchKnowledgeDocuments(companyId, { knowledgeBaseId } = {}) {
  const params = new URLSearchParams();
  if (knowledgeBaseId) params.set('knowledgeBaseId', knowledgeBaseId);
  const qs = params.toString() ? `?${params}` : '';
  return request(`/api/companies/${encodeURIComponent(companyId)}/knowledge/documents${qs}`);
}

export async function fetchAiEmployees(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/ai-employees`);
}

export async function createAiEmployeeApi(companyId, data) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/ai-employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateAiEmployeeApi(companyId, agentId, data) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/ai-employees/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteAiEmployeeApi(companyId, agentId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/ai-employees/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
}

export async function fetchConversations(companyId) {
  return fetchConversationsCached(companyId);
}

export async function fetchCustomers(companyId) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return request(`/api/customers${qs}`);
}

export async function fetchCrmCustomers(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/crm/customers`);
}

export async function fetchCrmLeads(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/crm/leads`);
}

export async function fetchCrmPipeline(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/crm/pipeline`);
}

export async function fetchTenantConversations(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/conversations`);
}

export async function fetchConversationDetail(companyId, conversationId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/conversations/${encodeURIComponent(conversationId)}`);
}

export async function sendConversationReply(companyId, conversationId, payload) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/conversations/${encodeURIComponent(conversationId)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchAppointments(companyId, { upcoming = true } = {}) {
  const qs = upcoming ? '?upcoming=true' : '';
  return request(`/api/companies/${encodeURIComponent(companyId)}/appointments${qs}`);
}

export async function createAppointmentApi(companyId, data) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function cancelAppointmentApi(companyId, appointmentId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
    method: 'POST',
  });
}

export async function fetchTenantNotifications(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/notifications`);
}

export async function markAllNotificationsRead(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/notifications/mark-all-read`, {
    method: 'POST',
  });
}

export async function downloadReport(companyId, reportType = 'weekly', format = 'html') {
  return request(`/api/companies/${encodeURIComponent(companyId)}/reports/${encodeURIComponent(reportType)}?format=${format}`);
}

export async function saveAutomation(companyId, workflow) {
  return request(`/api/automations/${encodeURIComponent(companyId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  });
}

export async function fetchWorkflows(companyId) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return request(`/api/workflows${qs}`);
}

export async function patchPortalBranding(companyId, branding) {
  return request(`/api/portal/company/${encodeURIComponent(companyId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branding }),
  });
}

export async function fetchWorkspaceSnapshot(companyId) {
  return request(`/api/portal/workspace/${encodeURIComponent(companyId)}`);
}

export async function inviteTeamMember(companyId, { email, role, departmentId } = {}) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/team/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role, departmentId }),
  });
}

export async function updateTeamMemberRole(companyId, uid, role) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/team/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export async function fetchDepartments(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/departments`);
}

export async function fetchMarketplaceCatalog(queryString = '') {
  const qs = queryString ? `?${queryString}` : '';
  return request(`/api/marketplace/catalog${qs}`);
}

export async function fetchPackDetail(packId) {
  return request(`/api/marketplace/pack/${encodeURIComponent(packId)}`);
}

export async function fetchInstalledPacks(companyId) {
  return request(`/api/marketplace/installed/${encodeURIComponent(companyId)}`);
}

export async function fetchPackUpdates(companyId) {
  return request(`/api/marketplace/installed/${encodeURIComponent(companyId)}/updates`);
}

export async function installMarketplacePack(companyId, packId, options = {}) {
  const result = await request('/api/marketplace/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, packId, demoMode: true, ...options }),
  });

  if (result.data && !result.error && companyId) {
    invalidateHub();
    await prefetchHub(companyId, { force: true });
  }

  return result;
}

export async function submitPackReview(companyId, packId, review) {
  return request('/api/marketplace/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, packId, ...review }),
  });
}

export async function fetchIntegrationsHealth(companyId) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return request(`/api/integrations/health${qs}`);
}

export async function fetchIntegrationChannels(companyId) {
  return request(`/api/integrations/channels/${encodeURIComponent(companyId)}`);
}

export async function fetchIntegrationLogs(companyId, { limit = 50, channel } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (channel) params.set('channel', channel);
  return request(`/api/integrations/logs/${encodeURIComponent(companyId)}?${params}`);
}

export async function sarahChat(payload) {
  return request('/api/sarah/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchSarahTools(companyId) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return request(`/api/sarah/tools${qs}`);
}
