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

export async function fetchChatConversations(filter = 'all') {
  const qs = filter && filter !== 'all' ? `?filter=${encodeURIComponent(filter)}` : '';
  return apiRequest(`/api/chat/conversations${qs}`);
}

export async function requestHumanHandover(companyId) {
  return apiRequest(`/api/user-conversations/${encodeURIComponent(companyId)}/request-human`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({}),
  });
}

export async function fetchPersonMessages(conversationId) {
  return apiRequest(`/api/person-conversations/${encodeURIComponent(conversationId)}/messages`);
}

export async function sendPersonMessage(conversationId, message) {
  return apiRequest(`/api/person-conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ message }),
  });
}

export async function fetchGroupMessages(groupId) {
  return apiRequest(`/api/group-conversations/${encodeURIComponent(groupId)}/messages`);
}

export async function sendGroupMessage(groupId, message) {
  return apiRequest(`/api/group-conversations/${encodeURIComponent(groupId)}/messages`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ message }),
  });
}

export async function fetchNetworkMessages(conversationId, since = null) {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return apiRequest(`/api/network-conversations/${encodeURIComponent(conversationId)}/messages${qs}`);
}

export async function searchChatThreads(query) {
  const qs = query ? `?q=${encodeURIComponent(query)}` : '';
  return apiRequest(`/api/chat/search${qs}`);
}

export async function patchChatPreferences(conversationId, patch) {
  return apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/preferences`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch || {}),
  });
}

export async function createChatMediaUpload(meta) {
  return apiRequest('/api/chat/media/uploads', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(meta || {}),
  });
}
