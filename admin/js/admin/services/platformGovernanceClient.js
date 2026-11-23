/**
 * MC-PO — Mission Control platform governance API client.
 */
import { apiRequest } from '../../shared/apiRequest.js';

async function get(path) {
  const result = await apiRequest(path, { silent: true });
  if (result.error) return { error: result.error, data: null };
  return { error: null, data: result.data };
}

async function send(method, path, body) {
  const result = await apiRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    silent: true,
  });
  if (result.error) return { error: result.error, data: null };
  return { error: null, data: result.data };
}

const G = '/api/platform/governance';

export function fetchPlatformCommandOverview(period = '30d') {
  return get(`/api/operations/platform-command-overview?period=${encodeURIComponent(period)}`);
}

export function fetchGovernanceConsumers(query = {}) {
  const q = new URLSearchParams();
  if (query.q) q.set('q', query.q);
  if (query.limit) q.set('limit', query.limit);
  if (query.cursor) q.set('cursor', query.cursor);
  const qs = q.toString();
  return get(`${G}/consumers${qs ? `?${qs}` : ''}`);
}

export function fetchGovernanceConsumer(uid) {
  return get(`${G}/consumers/${encodeURIComponent(uid)}`);
}

export function fetchGovernanceActivity() {
  return get(`${G}/activity/overview`);
}

export function fetchGovernanceSafetyCases() {
  return get(`${G}/safety/cases`);
}

export function fetchGovernanceSafetyOverview() {
  return get(`${G}/safety/overview`);
}

export function postGovernanceSafetyCase(body) {
  return send('POST', `${G}/safety/cases`, body);
}

export function postGovernanceSafetyDecision(caseId, body) {
  return send('POST', `${G}/safety/cases/${encodeURIComponent(caseId)}/decision`, body);
}

export function fetchGovernanceRs02(period = '30d') {
  return get(`${G}/rs02/console?period=${encodeURIComponent(period)}`);
}

export function fetchGovernanceOrgs() {
  return get(`${G}/orgs/overview`);
}

export function fetchGovernanceAnnouncements() {
  return get(`${G}/announcements`);
}

export function postGovernanceAnnouncement(body) {
  return send('POST', `${G}/announcements`, body);
}

export function patchGovernanceAnnouncement(id, body) {
  return send('PATCH', `${G}/announcements/${encodeURIComponent(id)}`, body);
}

export function fetchGovernanceAppMonitor(days = 7) {
  return get(`${G}/app-monitor/overview?days=${encodeURIComponent(days)}`);
}

export function fetchGovernanceAudit() {
  return get(`${G}/audit`);
}
