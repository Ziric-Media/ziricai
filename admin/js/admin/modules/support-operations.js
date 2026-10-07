import { loadingState, emptyState, escapeHtml, formatNumber } from '../ui.js';
import { fetchPlatformSupportOperations } from '../services/platformConsole.js';
import { resolvePlatformIntelligenceQuery } from '../services/platformIntelligenceClient.js';
import { navigateTo } from '../router.js';

let selectedAudit = null;

export async function renderSupportOperations(container) {
  container.innerHTML = loadingState('Loading Sarah operational actions…');
  const periodQuery = resolvePlatformIntelligenceQuery(
    localStorage.getItem('mc-pi-period') || 'today',
    {
      customDate: localStorage.getItem('mc-pi-custom-date') || '',
      customPeriod: localStorage.getItem('mc-pi-custom-grain') || 'day',
    }
  );

  const res = await fetchPlatformSupportOperations({
    period: periodQuery.period,
    date: periodQuery.date,
    periodKey: periodQuery.periodKey,
  });

  if (res.error || !res.data) {
    container.innerHTML = emptyState(res.error || 'Failed to load support operations.');
    return;
  }

  const ops = res.data;
  const a = ops.activity || {};
  const actions = ops.actions || [];

  container.innerHTML = `
    <header class="page-header">
      <div>
        <h1>Operational Actions &amp; Audit</h1>
        <p class="page-subtitle">Sarah support control room · ${escapeHtml(periodQuery.label)} (${escapeHtml(ops.periodKey || '')})</p>
      </div>
      <button type="button" class="btn btn-ghost" id="backDashboard"><i class="fa-solid fa-arrow-left"></i> Dashboard</button>
    </header>
    <section class="pi-support-ops pi-support-ops--page">
      <div class="pi-support-ops-grid">
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.casesInvestigated ?? 0)}</span><span class="pi-stat-lbl">Cases investigated</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.casesResolvedBySarah ?? 0)}</span><span class="pi-stat-lbl">Resolved by Sarah</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.remediationAttempts ?? 0)}</span><span class="pi-stat-lbl">Remediation attempts</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.failedRemediations ?? 0)}</span><span class="pi-stat-lbl">Failed (post-verify)</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${a.averageResolutionTimeLabel || '—'}</span><span class="pi-stat-lbl">Avg resolution</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.organisationsRequiringAttention ?? 0)}</span><span class="pi-stat-lbl">Orgs need attention</span></div>
      </div>
    </section>
    <div class="ops-grid ops-row-1">
      <div class="panel-card">
        <div class="panel-header"><h3>Recent remediations</h3></div>
        <div class="table-wrap">
          <table class="data-table mc-audit-table">
            <thead><tr><th>Time</th><th>Organisation</th><th>Problem</th><th>Action</th><th>Result</th></tr></thead>
            <tbody>
              ${actions.length
                ? actions
                    .map(
                      (row) => `
                <tr class="mc-audit-row" data-company="${escapeHtml(row.companyId)}" data-audit="${escapeHtml(row.auditId)}">
                  <td>${escapeHtml(String(row.timestamp || '').slice(11, 16))}</td>
                  <td>${escapeHtml(row.companyName || row.companyId)}</td>
                  <td>${escapeHtml(String(row.issue || '').slice(0, 48))}</td>
                  <td>${escapeHtml(row.actionLabel || row.action)}</td>
                  <td>${resultBadge(row)}</td>
                </tr>`
                    )
                    .join('')
                : `<tr><td colspan="5">${emptyState('No remediation audits in this period yet.')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel-card" id="auditDetailPanel">
        <div class="panel-header"><h3>Audit detail</h3></div>
        <div class="mc-audit-detail" id="auditDetailBody">
          <p class="pi-panel-hint">Select a row to view diagnosis → preconditions → action → verification → outcome.</p>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#backDashboard')?.addEventListener('click', () => navigateTo('dashboard'));
  container.querySelectorAll('.mc-audit-row').forEach((tr) => {
    tr.addEventListener('click', () => {
      const companyId = tr.dataset.company;
      const auditId = tr.dataset.audit;
      const row = actions.find((r) => r.companyId === companyId && r.auditId === auditId);
      selectedAudit = row;
      renderAuditDetail(container.querySelector('#auditDetailBody'), row);
    });
  });
}

function resultBadge(row) {
  if (row.resultLabel === 'Resolved') return '<span class="badge badge-green">Resolved</span>';
  if (row.resultLabel === 'Escalated') return '<span class="badge badge-amber">Escalated</span>';
  if (row.resultLabel === 'Skipped') return '<span class="badge badge-gray">Skipped</span>';
  return '<span class="badge badge-red">Failed</span>';
}

function renderAuditDetail(el, row) {
  if (!el || !row) return;
  const d = row.drillDown || {};
  el.innerHTML = `
    <h4>${escapeHtml(row.companyName)} — ${escapeHtml(String(row.issue || '').slice(0, 80))}</h4>
    <dl class="mc-audit-dl">
      <dt>Diagnosis</dt><dd>${escapeHtml(d.diagnosis?.summary || '—')} <small>Confidence: ${escapeHtml(row.sarahConfidence || d.diagnosis?.confidence || '—')}</small></dd>
      <dt>Pre-check</dt><dd>${row.preconditionsPassed ? 'Passed' : 'Failed / skipped'}</dd>
      <dt>Action</dt><dd>${escapeHtml(row.actionLabel)}</dd>
      <dt>Post-check</dt><dd>${row.verified ? 'Passed (verified)' : escapeHtml(row.failureReason || 'Failed verification')}</dd>
      <dt>Outcome</dt><dd><strong>${escapeHtml(row.outcome || row.resultLabel)}</strong></dd>
      <dt>Phases</dt><dd><code>${escapeHtml(JSON.stringify(row.phases || {}, null, 0))}</code></dd>
    </dl>
    <p class="pi-panel-hint">Diagnosis ≠ action ≠ verification ≠ resolution — success requires verified post-check.</p>
  `;
}
