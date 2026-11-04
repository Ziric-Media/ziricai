import { apiRequest } from '../shared/apiRequest.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchDiscoverCompanies() {
  return apiRequest('/api/discover/companies');
}

export async function fetchCompanyMessages(companyId) {
  return apiRequest(`/api/user-conversations/${encodeURIComponent(companyId)}/messages`);
}

export async function sendCompanyMessage(companyId, message) {
  return apiRequest(`/api/user-conversations/${encodeURIComponent(companyId)}/messages`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ message }),
  });
}

export async function fetchUserConversations() {
  return apiRequest('/api/user-conversations');
}
