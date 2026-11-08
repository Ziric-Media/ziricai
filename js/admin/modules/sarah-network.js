/**
 * Mission Control — Sarah Network (SNET-09).
 * Overview · Entities · Verification queue (skeleton: list + officer decisions via prompts).
 * Reads/writes only the platform APIs under /api/platform/network/v1 (superadmin / platform key).
 */
import { escapeHtml, formatDate, formatNumber, pageHeader, showToast, statusBadge } from '../ui.js';
import {
  changeNetworkEntityStatus,
  decideNetworkVerification,
  fetchNetworkEntities,
  fetchNetworkEntity,
  fetchNetworkStats,
  fetchNetworkVerificationQueue,
} from '../api.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'entities', label: 'Entities' },
  { id: 'verification', label: 'Verification queue' },
];

let activeTab = 'overview';
let entityFilters = { q: '', status: '' };
let verificationFilter = 'submitted';

function errText(res) {
  const e = res?.error;
  return typeof e === 'object' && e ? e.message || e.code || 'Request failed' : e || 'Request failed';
}

function body(res) {
  return res?.data?.data ?? null;
}

function kpi(label, value, note = '') {
  return `<div class="kpi-card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div>${
    note ? `<div class="panel-hint">${escapeHtml(note)}</div>` : ''
  }</div>`;
}

function tabsMarkup() {
  return `<div class="segment-group" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">${TABS.map(
    (t) =>
      `<button type="button" class="segment ${t.id === activeTab ? 'active' : ''}" data-snet-tab="${t.id}">${escapeHtml(t.label)}</button>`
  ).join('')}</div>`;
}

function verificationBadge(state) {
  const s = String(state || 'unverified');
  const cls = s === 'verified' ? 'active' : s === 'restricted' || s === 'rejected' ? 'suspended' : 'pending';
  return `<span class="status-badge ${cls}">${escapeHtml(s.replace(/_/g, ' '))}</span>`;
}

/* ---------- Overview ---------- */
async function overviewHtml() {
  const res = await fetchNetworkStats();
  if (res.error) return errorBlock(errText(res));
  const s = body(res);
  if (!s) return errorBlock('No data returned.');
  const verified = s.verification?.byState?.verified || 0;
  const zero = s.search?.topZeroResultQueries || [];
  return `
    <div class="kpi-grid kpi-grid-ops">
      ${kpi('Network entities', formatNumber(s.entities.total))}
      ${kpi('Listed on Discover', formatNumber(s.entities.listed))}
      ${kpi('Suspended', formatNumber(s.entities.byStatus?.suspended || 0))}
      ${kpi('Verified', formatNumber(verified))}
      ${kpi('Open verification cases', formatNumber(s.verification.openCases))}
      ${kpi('Company Sarah agents', formatNumber(s.agents.active), `${formatNumber(s.agents.total)} registered`)}
      ${kpi('Relationships', formatNumber(s.connections?.total || 0), s.connections?.truncated ? 'capped scan' : '')}
      ${kpi('Searches (since restart)', formatNumber(s.search.total), `${formatNumber(s.search.zeroResults)} with no results`)}
    </div>
    <div class="profile-card" style="margin-top:16px;">
      <h4>Zero-result searches</h4>
      <div class="panel-hint">In-process, per replica, resets on restart (since ${escapeHtml(formatDate(s.search.since))}).</div>
      ${
        zero.length
          ? `<ul>${zero.map((z) => `<li>${escapeHtml(z.q)} <span class="panel-hint">× ${formatNumber(z.count)}</span></li>`).join('')}</ul>`
          : '<div class="panel-hint">None recorded.</div>'
      }
    </div>
    <div class="panel-hint" style="margin-top:8px;">Generated ${escapeHtml(new Date(s.generatedAt).toLocaleString())}</div>`;
}

/* ---------- Entities ---------- */
async function entitiesHtml() {
  const res = await fetchNetworkEntities(entityFilters);
  if (res.error) return errorBlock(errText(res));
  const { entities = [], total = 0 } = body(res) || {};
  const rows = entities
    .map(
      (e) => `
      <tr>
        <td><strong>${escapeHtml(e.displayName)}</strong><span class="panel-hint">${escapeHtml(e.snId)}</span></td>
        <td>${statusBadge(e.status === 'listed' ? 'active' : e.status)}${e.statusReason ? `<span class="panel-hint">${escapeHtml(e.statusReason)}</span>` : ''}</td>
        <td>${e.listed ? 'Yes' : 'No'}<span class="panel-hint">${escapeHtml(e.discoverability)}</span></td>
        <td>${verificationBadge(e.verification)}</td>
        <td>${escapeHtml(e.companyId || '—')}</td>
        <td>${
          e.status === 'suspended'
            ? `<button type="button" class="btn btn-secondary btn-sm" data-snet-status="reinstate" data-sn-id="${escapeHtml(e.snId)}">Reinstate</button>`
            : `<button type="button" class="btn btn-secondary btn-sm" data-snet-status="suspend" data-sn-id="${escapeHtml(e.snId)}">Suspend</button>`
        }
        <button type="button" class="btn btn-link btn-sm" data-snet-detail="${escapeHtml(e.snId)}">Audit</button></td>
      </tr>`
    )
    .join('');
  return `
    <div class="table-container">
      <div class="table-toolbar">
        <div class="search-wrapper"><input type="search" id="snetEntityQ" placeholder="Search name, SN-ID or tenant id" value="${escapeHtml(entityFilters.q)}"></div>
        <select id="snetEntityStatus">
          ${['', 'listed', 'draft', 'suspended']
            .map((v) => `<option value="${v}" ${entityFilters.status === v ? 'selected' : ''}>${v ? v : 'All statuses'}</option>`)
            .join('')}
        </select>
      </div>
      <table class="org-table">
        <thead><tr><th>Entity</th><th>Status</th><th>Discoverable</th><th>Verification</th><th>Tenant</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="panel-hint">No entities match.</td></tr>'}</tbody>
      </table>
      <div class="table-footer"><div class="info">${formatNumber(entities.length)} of ${formatNumber(total)} shown</div></div>
    </div>
    <div id="snetEntityDetail"></div>`;
}

/* ---------- Verification queue ---------- */
async function verificationHtml() {
  const res = await fetchNetworkVerificationQueue(verificationFilter);
  if (res.error) return errorBlock(errText(res));
  const { cases = [], checks = [] } = body(res) || {};
  const rows = cases
    .map((c) => {
      const actions = [];
      if (c.status === 'submitted') actions.push(['start_review', 'Start review']);
      if (c.status === 'submitted' || c.status === 'under_review') {
        actions.push(['verify', 'Verify'], ['reject', 'Reject']);
      }
      if (c.status === 'under_review' || c.status === 'verified') actions.push(['restrict', 'Restrict']);
      return `
      <tr>
        <td><strong>${escapeHtml(c.evidence?.legalName || c.companyId)}</strong><span class="panel-hint">${escapeHtml(c.snId)}</span></td>
        <td>${escapeHtml(c.evidence?.registrationNumber || '—')}</td>
        <td>${verificationBadge(c.status)}</td>
        <td>${escapeHtml(formatDate(c.submittedAt))}</td>
        <td>${actions
          .map(
            ([a, label]) =>
              `<button type="button" class="btn btn-secondary btn-sm" data-snet-decide="${a}" data-case-id="${escapeHtml(c.caseId)}">${escapeHtml(label)}</button>`
          )
          .join(' ')}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="table-container" data-snet-checks="${escapeHtml(checks.join(','))}">
      <div class="table-toolbar">
        <div class="panel-hint">Officer decisions are audited. Verifying requires recorded checks and a note.</div>
        <select id="snetVerificationStatus">
          ${['submitted', 'under_review', 'verified', 'rejected', 'restricted', '']
            .map((v) => `<option value="${v}" ${verificationFilter === v ? 'selected' : ''}>${v ? v.replace(/_/g, ' ') : 'All'}</option>`)
            .join('')}
        </select>
      </div>
      <table class="org-table">
        <thead><tr><th>Business (restricted evidence)</th><th>Registration no.</th><th>Status</th><th>Submitted</th><th>Decision</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="panel-hint">Queue is empty.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function errorBlock(message) {
  return `<div class="profile-card" style="border-color:var(--danger);"><strong>Unable to load</strong><div class="panel-hint">${escapeHtml(message)}</div></div>`;
}

/* ---------- Wiring ---------- */
async function paint(container) {
  const host = container.querySelector('#snetBody');
  if (!host) return;
  host.innerHTML = '<div class="panel-hint">Loading…</div>';
  try {
    host.innerHTML =
      activeTab === 'entities' ? await entitiesHtml() : activeTab === 'verification' ? await verificationHtml() : await overviewHtml();
  } catch (err) {
    host.innerHTML = errorBlock(err?.message || 'Failed to load.');
  }
  bind(container);
}

function bind(container) {
  container.querySelectorAll('[data-snet-tab]').forEach((btn) => {
    btn.onclick = () => {
      activeTab = btn.dataset.snetTab;
      container.querySelectorAll('[data-snet-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      paint(container);
    };
  });

  const q = container.querySelector('#snetEntityQ');
  if (q) {
    q.onkeydown = (e) => {
      if (e.key === 'Enter') {
        entityFilters.q = q.value.trim();
        paint(container);
      }
    };
  }
  const st = container.querySelector('#snetEntityStatus');
  if (st) {
    st.onchange = () => {
      entityFilters.status = st.value;
      paint(container);
    };
  }
  const vs = container.querySelector('#snetVerificationStatus');
  if (vs) {
    vs.onchange = () => {
      verificationFilter = vs.value;
      paint(container);
    };
  }

  container.querySelectorAll('[data-snet-status]').forEach((btn) => {
    btn.onclick = async () => {
      const action = btn.dataset.snetStatus;
      const reason = window.prompt(`Reason to ${action} this entity (min 5 characters, audited):`);
      if (reason === null) return;
      const res = await changeNetworkEntityStatus(btn.dataset.snId, { action, reason });
      if (res.error) return showToast(errText(res), 'error');
      showToast(action === 'suspend' ? 'Entity suspended' : 'Entity reinstated', 'success');
      paint(container);
    };
  });

  container.querySelectorAll('[data-snet-detail]').forEach((btn) => {
    btn.onclick = async () => {
      const target = container.querySelector('#snetEntityDetail');
      const res = await fetchNetworkEntity(btn.dataset.snetDetail);
      if (res.error) return showToast(errText(res), 'error');
      const d = body(res);
      target.innerHTML = `
        <div class="profile-card" style="margin-top:16px;">
          <h4>${escapeHtml(d.entity.displayName)} — audit trail</h4>
          <div class="info-row"><span class="label">Agent</span><span class="value">${escapeHtml(d.agent ? `${d.agent.agentSnId} (${d.agent.status})` : 'none')}</span></div>
          <div class="info-row"><span class="label">Verification cases</span><span class="value">${formatNumber(d.verificationCases.length)}</span></div>
          ${
            d.audit.length
              ? d.audit
                  .map(
                    (a) =>
                      `<div class="info-row"><span class="label">${escapeHtml(new Date(a.at).toLocaleString())} · ${escapeHtml(a.actor)}</span><span class="value">${escapeHtml(a.action)}${a.detail?.reason ? ` — ${escapeHtml(a.detail.reason)}` : a.detail?.note ? ` — ${escapeHtml(a.detail.note)}` : ''}</span></div>`
                  )
                  .join('')
              : '<div class="panel-hint">No administrative actions recorded.</div>'
          }
        </div>`;
    };
  });

  container.querySelectorAll('[data-snet-decide]').forEach((btn) => {
    btn.onclick = async () => {
      const action = btn.dataset.snetDecide;
      const payload = { action };
      if (action !== 'start_review') {
        const note = window.prompt(`Decision note for "${action}" (required, audited):`);
        if (note === null) return;
        payload.note = note;
      }
      if (action === 'verify') {
        const known = (btn.closest('[data-snet-checks]')?.dataset.snetChecks || '').split(',').filter(Boolean);
        const raw = window.prompt(`Checks performed (comma separated). Allowed:\n${known.join('\n')}`);
        if (raw === null) return;
        payload.checks = raw.split(',').map((s) => s.trim()).filter(Boolean);
      }
      const res = await decideNetworkVerification(btn.dataset.caseId, payload);
      if (res.error) return showToast(errText(res), 'error');
      showToast(`Case updated: ${action.replace(/_/g, ' ')}`, 'success');
      paint(container);
    };
  });
}

export async function renderSarahNetwork(container) {
  container.innerHTML = `
    ${pageHeader('Sarah Network', 'Entities, verification and trust for the Sarah Network directory')}
    ${tabsMarkup()}
    <div id="snetBody"></div>`;
  await paint(container);
}
