import { escapeHtml, pageHeader, loadingState, emptyState } from '../ui.js';
import { fetchGovernanceAudit } from '../services/platformGovernanceClient.js';

export async function renderMcPlatformAudit(container) {
  container.innerHTML = loadingState('Loading audit log…');
  const { data, error } = await fetchGovernanceAudit();
  const entries = data?.data?.entries || [];
  container.innerHTML = `
    ${pageHeader('Platform Audit', 'Authorised Mission Control actions.', '<span class="ops-tag">MC-PO-11</span>')}
    <div class="table-container">
      <table class="org-table"><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Note</th></tr></thead>
        <tbody>${entries.map((e) => `<tr><td>${escapeHtml(e.createdAt)}</td><td>${escapeHtml(e.action)}</td><td>${escapeHtml(e.actorUid)}</td><td>${escapeHtml(e.targetId || '')}</td><td>${escapeHtml(e.note || '')}</td></tr>`).join('') || `<tr><td colspan="5">${emptyState(error || 'No audit entries yet.')}</td></tr>`}
        </tbody></table>
    </div>`;
}
