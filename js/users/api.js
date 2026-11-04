import { apiRequest } from '../shared/apiRequest.js';

export const POPIA_CONSENT_VERSION = 'sarah-u1-2026-11-04';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function bootstrapConsumerProfile(body = {}) {
  return apiRequest('/api/users/bootstrap', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function fetchConsumerProfile() {
  return apiRequest('/api/users/profile');
}

export async function patchConsumerProfile(body) {
  return apiRequest('/api/users/profile', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function fetchKnowledgeSections() {
  return apiRequest('/api/personal-knowledge/sections');
}

export async function saveKnowledgeSection(sectionKey, body) {
  return apiRequest(`/api/personal-knowledge/sections/${encodeURIComponent(sectionKey)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
