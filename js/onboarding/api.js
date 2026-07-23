import { withAuthHeaders, getApiBase } from '../shared/apiRequest.js';

async function request(path, options = {}) {
  const apiBase = getApiBase().replace(/\/$/, '');
  const finalOptions = await withAuthHeaders({
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const res = await fetch(`${apiBase}${path}`, finalOptions);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function fetchIndustries() {
  return request('/api/onboarding/industries');
}

export function startOnboarding(payload) {
  return request('/api/onboarding/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function completeStep(sessionId, step, data = {}) {
  return request('/api/onboarding/complete-step', {
    method: 'POST',
    body: JSON.stringify({ sessionId, step, data }),
  });
}

export async function uploadKnowledge(companyId, file, title) {
  const form = new FormData();
  form.append('companyId', companyId);
  form.append('title', title || file.name);
  form.append('file', file);
  const finalOptions = await withAuthHeaders({ method: 'POST', body: form });
  const apiBase = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${apiBase}/api/knowledge/upload`, finalOptions);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export function fetchHealth() {
  return request('/api/health');
}
