import { apiRequest } from '../shared/apiRequest.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function sendPersonalSarahMessage({ message, sessionId }) {
  return apiRequest('/api/personal-sarah/chat', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ message, sessionId: sessionId || null }),
  });
}

export async function fetchActivePersonalSarahSession() {
  return apiRequest('/api/personal-sarah/sessions/active', { silent: true });
}
