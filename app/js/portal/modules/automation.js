import { state } from '../state.js';
import { escapeHtml, pageHeader, emptyState, loadingState, statusBadge } from '../../admin/ui.js';
import { fetchAutomations, fetchAutomationRuns } from '../api.js';
import { can } from '../permissions.js';

export async function renderAutomation(container) {
  if (!can(state.profile?.role, 'canEditAI')) {
    container.innerHTML = emptyState('You do not have permission to manage automation.');
    return;
  }

  container.innerHTML = loadingState('Loading workflows...');
  const companyId = state.companyId;

  const [wfRes, runsRes] = await Promise.all([
    fetchAutomations(companyId),
    fetchAutomationRuns(companyId, 15),
  ]);

  const workflows = wfRes.data?.items || [];
  const runs = runsRes.data?.items || [];

  const totalRuns = workflows.reduce((acc, w) => acc + (w.runs || 0), 0);
  const totalSuccess = workflows.reduce((acc, w) => acc + (w.successCount || 0), 0);
  const successRate = totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 100) : 0;

  container.innerHTML = `
    ${pageHeader(
      'Automation',
      `Event-driven workflows for ${escapeHtml(state.company?.name || 'your company')}.`,
      `<span class="ops-tag">${workflows.filter((w) => w.status === 'active').length} active</span>`
    )}

    <div class="kpi-grid kpi-grid-ops" style="margin-bottom: 1.5rem;">
      <div class="kpi-card">
        <div class="header">
          <div>
            <div class="label">Active Workflows</div>
            <div class="value">${workflows.filter((w) => w.status === 'active').length}</div>
          </div>
          <div class="icon-wrapper purple"><i class="fa-solid fa-diagram-project"></i></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="header">
          <div>
            <div class="label">Total Runs</div>
            <div class="value">${totalRuns}</div>
          </div>
          <div class="icon-wrapper blue"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="header">
          <div>
            <div class="label">Success Rate</div>
            <div class="value">${successRate}%</div>
          </div>
          <div class="icon-wrapper green"><i class="fa-solid fa-check"></i></div>
        </div>
      </div>
    </div>

    <div class="table-container" style="margin-bottom: 1.5rem;">
      <div class="table-header"><h3><i class="fa-solid fa-bolt"></i> Workflows</h3></div>
      <table class="org-table">
        <thead><tr><th>Name</th><th>Trigger</th><th>Status</th><th>Runs</th><th>Success</th><th>Last Run</th></tr></thead>
        <tbody>
          ${workflows.length
            ? workflows.map((w) => `
              <tr>
                <td><strong>${escapeHtml(w.name)}</strong>${w.builtin ? ' <span class="ops-tag">built-in</span>' : ''}</td>
                <td><code>${escapeHtml(w.trigger?.eventType || '—')}</code></td>
                <td>${statusBadge(w.status)}</td>
                <td>${w.runs || 0}</td>
                <td>${w.successCount || 0}</td>
                <td>${escapeHtml(w.lastRunAt?.slice(0, 16) || '—')}</td>
              </tr>
            `).join('')
            : `<tr><td colspan="6">${emptyState('No workflows yet.')}</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="table-container">
      <div class="table-header"><h3><i class="fa-solid fa-clock-rotate-left"></i> Recent Runs</h3></div>
      <table class="org-table">
        <thead><tr><th>Workflow</th><th>Event</th><th>Status</th><th>Source</th><th>Started</th></tr></thead>
        <tbody>
          ${runs.length
            ? runs.map((r) => `
              <tr>
                <td>${escapeHtml(r.workflowName || r.workflowId)}</td>
                <td><code>${escapeHtml(r.eventType || '—')}</code></td>
                <td>${r.success ? '<span class="score-badge">OK</span>' : '<span class="ops-tag" style="color:var(--danger)">Failed</span>'}</td>
                <td>${escapeHtml(r.source || 'event')}</td>
                <td>${escapeHtml(r.startedAt?.slice(0, 16) || '—')}</td>
              </tr>
            `).join('')
            : `<tr><td colspan="5">${emptyState('No runs yet — workflows trigger on incoming events.')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
