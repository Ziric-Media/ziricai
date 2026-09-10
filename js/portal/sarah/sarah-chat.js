/** Sarah chat API client for Company Portal — delegates to authenticated apiRequest. */

import { apiRequest } from '../../shared/apiRequest.js';

/**
 * @param {{ message: string, sessionId?: string|null, companyId: string }} params
 */
export async function sendSarahMessage({ message, sessionId, companyId }) {
  return apiRequest('/api/sarah/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId, companyId }),
  });
}

export async function fetchSarahTools(companyId) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return apiRequest(`/api/sarah/tools${qs}`);
}
