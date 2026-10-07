import { loadingState, emptyState, escapeHtml, formatNumber } from '../ui.js';
import { fetchPlatformSupportAttention } from '../services/platformConsole.js';
import { navigateTo } from '../router.js';

export async function renderSupportAttention(container) {
  container.innerHTML = loadingState('Loading Attention Centre…');
  const res = await fetchPlatformSupportAttention({ period: 'day' });
  if (res.error || !res.data) {
    container.innerHTML = emptyState(res.error || 'Failed to load attention centre.');
    return;
  }
  const data = res.data;
  const red = data.queues?.requires_attention || [];
  const yellow = data.queues?.sarah_monitoring || [];
  const green = data.queues?.resolved || [];
  const cat = data.requiresAttentionCategories || {};

  container.innerHTML = `
    <div class="attention-page">
    <header class="page-header">
      <div>
        <h1>Attention Centre</h1>
        <p class="page-subtitle">Exception management · Sarah manages support; you manage exceptions</p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-ghost" id="openOpsAudit">Operational audit</button>
        <button type="button" class="btn btn-ghost" id="backDashboard"><i class="fa-solid fa-arrow-left"></i> Dashboard</button>
      </div>
    </header>
    <div class="attention-summary-grid">
      <div class="attention-card attention-card--red">
        <h3>🔴 Requires Your Attention</h3>
        <p class="attention-count">${formatNumber(data.counts?.requiresAttention ?? 0)}</p>
        <ul class="attention-meta">
          <li>Credentials/Meta: ${formatNumber(cat.credentials ?? 0)}</li>
          <li>Repeated failures: ${formatNumber(cat.repeated_failure ?? 0)}</li>
          <li>Critical/High: ${formatNumber(data.counts?.criticalOrHigh ?? 0)}</li>
        </ul>
      </div>
      <div class="attention-card attention-card--yellow">
        <h3>🟡 Sarah Monitoring</h3>
        <p class="attention-count">${formatNumber(data.counts?.sarahMonitoring ?? 0)}</p>
        <p class="pi-panel-hint">Recovered or investigating — observation continues</p>
      </div>
      <div class="attention-card attention-card--green">
        <h3>🟢 Resolved by Sarah</h3>
        <p class="attention-count">${formatNumber(data.counts?.resolved ?? 0)}</p>
        <p class="pi-panel-hint">Diagnosed, remediated, post-verified</p>
      </div>
    </div>
    ${renderQueueTable('Requires attention', red, 'red')}
    ${renderQueueTable('Sarah monitoring', yellow, 'yellow')}
    ${renderRecurring(data.recurring || [])}
    ${renderPlatformPatterns(data.platformPatterns)}
    <div id="attentionDetail" class="panel-card attention-detail-panel" hidden></div>
    </div>
  `;

  container.querySelector('#backDashboard')?.addEventListener('click', () => navigateTo('dashboard'));
  container.querySelector('#openOpsAudit')?.addEventListener('click', () => navigateTo('supportOperations'));
  container.querySelectorAll('[data-attention-row]').forEach((row) => {
    row.addEventListener('click', () => showDetail(container, row.dataset.payload));
  });
}

function severityPill(severity) {
  const raw = String(severity || '').trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, '-') || 'unknown';
  const label = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '—';
  return `<span class="severity-pill severity-pill--${escapeHtml(slug)}">${escapeHtml(label)}</span>`;
}

function renderQueueTable(title, rows, tone) {
  const head = `
    <div class="attention-queue-head">
      <h3 class="attention-queue-title">${escapeHtml(title)}</h3>
      <span class="attention-queue-count">${formatNumber(rows.length)}</span>
    </div>`;
  if (!rows.length) {
    return `
    <section class="panel-card attention-queue attention-queue--${tone} attention-queue--empty">
      ${head}
      <div class="attention-empty-state">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        <p>Nothing queued here right now.</p>
        <span class="pi-panel-hint">Sarah will surface items when they need your input.</span>
      </div>
    </section>`;
  }
  return `
    <section class="panel-card attention-queue attention-queue--${tone}">
      ${head}
      <div class="table-wrap attention-table-wrap">
        <table class="data-table attention-data-table">
          <thead><tr><th>Organisation</th><th>Issue</th><th>Severity</th><th>Why</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr class="mc-audit-row attention-row" data-attention-row data-payload="${escapeHtml(encodeURIComponent(JSON.stringify(r.evidence || {})))}">
                <td class="attention-org">${escapeHtml(r.companyName)}</td>
                <td class="attention-issue">${escapeHtml(String(r.issue || '').slice(0, 80))}</td>
                <td>${severityPill(r.severity)}</td>
                <td class="attention-why">${escapeHtml(String(r.attentionReason || '').slice(0, 96))}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderPlatformPatterns(platformPatterns) {
  const patterns = platformPatterns?.patterns || [];
  const narratives = platformPatterns?.operatorNarratives || [];
  if (!patterns.length && !narratives.length) return '';
  return `
    <section class="panel-card">
      <h3>Cross-organisation patterns</h3>
      <p class="pi-panel-hint">Aggregated from support cases — same Attention Centre lifecycle (PI-4F-6).</p>
      ${narratives.length ? `<ul class="attention-recurring-list">${narratives.slice(0, 5).map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
      ${patterns.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Signal</th><th>Organisations</th><th>Cases</th><th>Common cause</th></tr></thead><tbody>
        ${patterns.slice(0, 8).map((p) => `<tr><td>${escapeHtml(p.affectedService)} / ${escapeHtml(p.problemKey)}</td><td>${formatNumber(p.organisationCount)}</td><td>${formatNumber(p.caseCount)}</td><td>${escapeHtml(p.commonSignal || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    </section>`;
}

function renderRecurring(recurring) {
  if (!recurring.length) return '';
  return `
    <section class="panel-card">
      <h3>Recurring problems</h3>
      <ul class="attention-recurring-list">
        ${recurring
          .slice(0, 10)
          .map(
            (r) =>
              `<li><strong>${escapeHtml(r.companyName || r.companyId)}</strong> — ${escapeHtml(r.affectedService)} (${r.count} cases)</li>`
          )
          .join('')}
      </ul>
    </section>`;
}

function showDetail(container, payloadJson) {
  const panel = container.querySelector('#attentionDetail');
  if (!panel) return;
  let evidence;
  try {
    evidence = JSON.parse(decodeURIComponent(payloadJson));
  } catch {
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `
    <h3>Evidence</h3>
    <dl class="mc-audit-dl">
      <dt>Source</dt><dd>${escapeHtml(evidence.source || evidence.proactiveDetection?.ruleId || '—')}</dd>
      <dt>Diagnosis</dt><dd>${escapeHtml(evidence.diagnosis?.summary || '—')}</dd>
      <dt>Confidence</dt><dd>${escapeHtml(String(evidence.proactiveDetection?.confidence || evidence.diagnosis?.confidence || '—'))}</dd>
      <dt>Actions attempted</dt><dd>${formatNumber((evidence.actionsAttempted || []).length)}</dd>
      <dt>Escalation</dt><dd>${escapeHtml(evidence.escalation?.reason || '—')}</dd>
      <dt>Resolution</dt><dd>${escapeHtml(evidence.resolution?.summary || '—')}</dd>
    </dl>
  `;
}
