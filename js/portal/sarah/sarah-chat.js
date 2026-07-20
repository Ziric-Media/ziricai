/** Sarah chat API client for Company Portal. */

const API_BASE = '';

/**
 * @param {{ message: string, sessionId?: string|null, companyId: string, token?: string|null }} params
 */
export async function sendSarahMessage({ message, sessionId, companyId, token }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}/api/sarah/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, sessionId, companyId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `Request failed (${res.status})` };
    return { data };
  } catch (err) {
    return { error: err.message || 'Network error' };
  }
}

export async function fetchSarahTools(companyId, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';

  try {
    const res = await fetch(`${API_BASE}/api/sarah/tools${qs}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `Request failed (${res.status})` };
    return { data };
  } catch (err) {
    return { error: err.message || 'Network error' };
  }
}
