/** Backend API client — read-only admin + knowledge upload endpoints. */

import { apiRequest } from '../shared/apiRequest.js';

async function request(path, options = {}) {
  return apiRequest(path, options);
}

export async function fetchHealth() {
  return request('/api/health');
}

export async function fetchOperationsMetrics() {
  return request('/api/operations/metrics');
}

export async function fetchOperationsActivity() {
  return request('/api/operations/activity');
}

export async function fetchPlatformCompanies() {
  return request('/api/platform/companies');
}

export async function fetchAdminConfig() {
  return request('/api/admin/config');
}

export async function uploadKnowledgeFile({ companyId, title, type, file }) {
  const form = new FormData();
  form.append('companyId', companyId);
  form.append('title', title);
  form.append('type', type);
  form.append('file', file);
  return request('/api/knowledge/upload', { method: 'POST', body: form });
}

export async function addKnowledgeEntry({ companyId, title, type, content, url }) {
  return request('/api/knowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, title, type, content, url }),
  });
}

export async function listKnowledgeFromApi(companyId) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return request(`/api/knowledge${qs}`);
}

export async function listKnowledgeDocumentsFromApi(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/knowledge/documents`);
}

export async function fetchAiEmployeesFromApi(companyId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/ai-employees`);
}

export async function createAiEmployeeFromApi(companyId, data) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/ai-employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateAiEmployeeFromApi(companyId, agentId, data) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/ai-employees/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteAiEmployeeFromApi(companyId, agentId) {
  return request(`/api/companies/${encodeURIComponent(companyId)}/ai-employees/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
}

export async function fetchConversationsFromApi(companyId) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return request(`/api/conversations${qs}`);
}

export async function fetchConversationMessagesFromApi(conversationId) {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
}

export async function fetchCustomersFromApi(query = '') {
  return request(`/api/customers${query}`);
}

export async function fetchCustomerFromApi(phone) {
  return request(`/api/customers/${encodeURIComponent(phone)}`);
}

export async function patchCustomerFromApi(phone, body) {
  return request(`/api/customers/${encodeURIComponent(phone)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchCustomerTimelineFromApi(phone) {
  return request(`/api/customers/${encodeURIComponent(phone)}/timeline`);
}

export async function provisionCompanyWorkspace(companyId, companyData = {}) {
  return request('/api/platform/provision/company', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, ...companyData }),
  });
}

export async function provisionAgentWorkspace(companyId, agentId, agentData = {}) {
  return request('/api/platform/provision/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, agentId, ...agentData }),
  });
}

export async function fetchCompanyLinks(companyId) {
  return request(`/api/platform/companies/${encodeURIComponent(companyId)}/links`);
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
  return request('/api/marketplace/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, packId, demoMode: true, ...options }),
  });
}

export async function fetchSupervisorReviews(companyId, limit = 10) {
  const qs = limit ? `?limit=${limit}` : '';
  return request(`/api/supervisor/reviews/${encodeURIComponent(companyId)}${qs}`);
}
