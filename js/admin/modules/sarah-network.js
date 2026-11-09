/**
 * Mission Control — Sarah Network (SNET-09).
 * Overview · Entities · Verification queue · Moderation · Search (categories + synonyms) · Access (platform roles).
 * Reads/writes only the platform APIs under /api/platform/network/v1 (Super Admin, platform key, or a scoped
 * Sarah Network role such as Verification Officer / Search Admin).
 */
import { escapeHtml, formatDate, formatNumber, pageHeader, showToast, statusBadge } from '../ui.js';
import { state } from '../state.js';
import { isSuperAdminRole } from '../../auth.js';
import {
  changeNetworkEntityStatus,
  decideNetworkModeration,
  decideNetworkVerification,
  downloadNetworkEvidenceFile,
  fetchNetworkEntities,
  fetchNetworkEntity,
  fetchNetworkModeration,
  fetchNetworkRoles,
  fetchNetworkSearchConfig,
  fetchNetworkStats,
  fetchNetworkVerificationCase,
  fetchNetworkVerificationQueue,
  resetNetworkSearchConfig,
  saveNetworkSearchConfig,
  setNetworkRoles,
} from '../api.js';

const TABS = [
  { id: 'overview', label: 'Overview', perm: 'network.stats.read' },
  { id: 'entities', label: 'Entities', perm: 'network.entities.read' },
  { id: 'verification', label: 'Verification queue', perm: 'network.verification.read' },
  { id: 'moderation', label: 'Moderation', perm: 'network.moderation.read' },
  { id: 'search', label: 'Search', perm: 'network.search.read' },
  { id: 'access', label: 'Access', perm: 'network.roles.admin', superOnly: true },
];

function mcPermSet() {
  if (isSuperAdminRole(state.profile?.role)) return null;
  return new Set(state.platformPermissions || state.profile?.platformPermissions || []);
}

function canMc(perm) {
  const set = mcPermSet();
  if (set === null) return true;
  return set.has(perm);
}

function visibleTabs() {
  return TABS.filter((t) => {
    if (t.superOnly && mcPermSet() !== null) return false;
    return canMc(t.perm);
  });
}

let activeTab = 'overview';
let entityFilters = { q: '', status: '' };
let verificationFilter = 'submitted';
let moderationFilter = 'open';

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
  const tabs = visibleTabs();
  if (!tabs.some((t) => t.id === activeTab) && tabs[0]) activeTab = tabs[0].id;
  return `<div class="segment-group" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">${tabs
    .map(
      (t) =>
        `<button type="button" class="segment ${t.id === activeTab ? 'active' : ''}" data-snet-tab="${t.id}">${escapeHtml(t.label)}</button>`
    )
    .join('')}</div>`;
}

function verificationBadge(state) {
  const s = String(state || 'unverified');
  const cls = s === 'verified' ? 'active' : s === 'restricted' || s === 'rejected' ? 'suspended' : 'pending';
  return `<span class="status-badge ${cls}">${escapeHtml(s.replace(/_/g, ' '))}</span>`;
}

/* ---------- Decision modal (form dialog; replaces browser prompt boxes) ---------- */

/** One evidence reference → safe markup (links only for https URLs). */
function evidenceItemHtml(ev, caseId = '') {
  const href = typeof ev.url === 'string' && /^https:\/\//i.test(ev.url) ? ev.url : '';
  const target = href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ev.label)}</a>`
    : escapeHtml(ev.label);
  // Gate 6: uploaded file reference (name / size / checksum). Phase 2.0: the bytes are stored → officer download.
  const file = ev.file
    ? ` · file ${escapeHtml(ev.file.fileName || 'upload')} (${escapeHtml(String(Math.max(1, Math.round((ev.file.byteLength || 0) / 1024))))} KB, ${escapeHtml(
        String(ev.file.mimeType || '')
      )}, sha256 ${escapeHtml(String(ev.file.sha256 || '').slice(0, 16))}…)`
    : '';
  const download =
    ev.file?.stored && caseId && ev.evidenceId
      ? ` <button type="button" class="btn btn-secondary btn-sm" data-snet-download data-case-id="${escapeHtml(caseId)}" data-evidence-id="${escapeHtml(ev.evidenceId)}" data-file-name="${escapeHtml(ev.file.fileName || 'evidence')}">Download</button>`
      : ev.file
        ? ' <span class="panel-hint">(checksum only — not downloadable)</span>'
        : '';
  return `<li>${target} <span class="panel-hint">${escapeHtml(String(ev.kind || '').replace(/_/g, ' '))}${
    ev.ref ? ` · ref ${escapeHtml(ev.ref)}` : ''
  }${file}</span>${download}</li>`;
}

/**
 * Small accessible form modal for audited decisions.
 * Resolves `{ note, checks }` on confirm or `null` when cancelled.
 * @param {{ title: string, lead?: string, noteLabel?: string, noteRequired?: boolean, minNote?: number,
 *           checks?: string[]|null, evidence?: object[]|null, confirmLabel?: string, danger?: boolean }} opts
 */
function openDecisionModal({
  title,
  lead = '',
  noteLabel = 'Decision note (audited)',
  noteRequired = true,
  minNote = 1,
  checks = null,
  evidence = null,
  caseId = '',
  confirmLabel = 'Confirm',
  danger = false,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.setAttribute('data-snet-modal', '');
    const checksHtml = checks
      ? `<div class="form-group"><label>Checks performed (at least one to verify)</label>${checks
          .map(
            (c) =>
              `<label style="display:block;font-weight:400;"><input type="checkbox" name="snetCheck" value="${escapeHtml(c)}"> ${escapeHtml(c.replace(/_/g, ' '))}</label>`
          )
          .join('')}</div>`
      : '';
    const evidenceHtml = Array.isArray(evidence)
      ? `<div class="form-group"><label>Evidence references (${formatNumber(evidence.length)})</label>${
          evidence.length
            ? `<ul>${evidence.map((ev) => evidenceItemHtml(ev, caseId)).join('')}</ul>`
            : '<div class="panel-hint">None attached. You can ask the business for more with “Request info”.</div>'
        }</div>`
      : '';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="snetModalTitle">
        <h3 id="snetModalTitle">${escapeHtml(title)}</h3>
        ${lead ? `<div class="panel-hint" style="margin-bottom:12px;">${escapeHtml(lead)}</div>` : ''}
        ${evidenceHtml}
        ${checksHtml}
        <div class="form-group">
          <label for="snetModalNote">${escapeHtml(noteLabel)}${noteRequired ? '' : ' (optional)'}</label>
          <textarea id="snetModalNote" rows="3" maxlength="1000"></textarea>
        </div>
        <div class="panel-hint" id="snetModalError" role="alert" style="color:var(--danger);min-height:1.2em;"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-snet-modal-cancel>Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" data-snet-modal-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const noteEl = overlay.querySelector('#snetModalNote');
    const errEl = overlay.querySelector('#snetModalError');
    const done = (value) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(null);
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(null);
    });
    overlay.querySelectorAll('[data-snet-download]').forEach((dl) => {
      dl.onclick = async () => {
        dl.disabled = true;
        const res = await downloadNetworkEvidenceFile(dl.dataset.caseId, dl.dataset.evidenceId, dl.dataset.fileName);
        dl.disabled = false;
        if (res.error) errEl.textContent = typeof res.error === 'string' ? res.error : 'Download failed.';
        else {
          errEl.textContent = '';
          showToast('Evidence downloaded (audited)', 'success');
        }
      };
    });
    overlay.querySelector('[data-snet-modal-cancel]').onclick = () => done(null);
    overlay.querySelector('[data-snet-modal-confirm]').onclick = () => {
      const note = noteEl.value.trim();
      const picked = [...overlay.querySelectorAll('input[name="snetCheck"]:checked')].map((i) => i.value);
      if (noteRequired && note.length < minNote) {
        errEl.textContent = minNote > 1 ? `Enter at least ${minNote} characters.` : 'A note is required.';
        return noteEl.focus();
      }
      if (checks && !picked.length) {
        errEl.textContent = 'Select at least one check that was performed.';
        return;
      }
      done({ note, checks: picked });
    };
    noteEl.focus();
  });
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
      ${kpi('Open moderation cases', formatNumber(s.moderation?.open || 0), `${formatNumber(s.moderation?.total || 0)} reports total`)}
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
            ? canMc('network.entities.write')
              ? `<button type="button" class="btn btn-secondary btn-sm" data-snet-status="reinstate" data-sn-id="${escapeHtml(e.snId)}">Reinstate</button>`
              : ''
            : canMc('network.entities.write')
              ? `<button type="button" class="btn btn-secondary btn-sm" data-snet-status="suspend" data-sn-id="${escapeHtml(e.snId)}">Suspend</button>`
              : ''
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
      if (c.status === 'submitted' || c.status === 'under_review') actions.push(['request_info', 'Request info']);
      if (c.status === 'submitted' || c.status === 'under_review' || c.status === 'info_requested') {
        actions.push(['verify', 'Approve'], ['reject', 'Reject']);
      }
      if (canMc('network.verification.restrict') && (c.status === 'under_review' || c.status === 'verified'))
        actions.push(['restrict', 'Restrict']);
      return `
      <tr>
        <td><strong>${escapeHtml(c.evidence?.legalName || c.companyId)}</strong><span class="panel-hint">${escapeHtml(c.snId)}</span></td>
        <td>${escapeHtml(c.evidence?.registrationNumber || '—')}</td>
        <td>${verificationBadge(c.status)}<span class="panel-hint">${formatNumber(c.evidenceCount || 0)} evidence ref(s)</span></td>
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
          ${['submitted', 'under_review', 'info_requested', 'verified', 'rejected', 'restricted', '']
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

/* ---------- Moderation queue (list + decisions through the form modal) ---------- */
async function moderationHtml() {
  const res = await fetchNetworkModeration(moderationFilter);
  if (res.error) return errorBlock(errText(res));
  const { cases = [] } = body(res) || {};
  const rows = cases
    .map((c) => {
      const actions = [];
      if (c.status === 'open') actions.push(['start_review', 'Start review']);
      if (canMc('network.moderation.decide')) {
        if (c.status === 'open' || c.status === 'reviewing') actions.push(['dismiss', 'Dismiss']);
        if (canMc('network.entities.write') && (c.status === 'open' || c.status === 'reviewing'))
          actions.push(['suspend_entity', 'Suspend entity']);
      }
      return `
      <tr>
        <td><strong>${escapeHtml(String(c.reason || '').replace(/_/g, ' '))}</strong>${
          c.priority === 'high' ? ' <span class="status-badge suspended">high priority</span>' : ''
        }<span class="panel-hint">${escapeHtml(c.details || 'No details')}</span></td>
        <td><span class="panel-hint">${escapeHtml(c.snId)}</span>${formatNumber(c.openReportsForEntity || 0)} open report(s)</td>
        <td>${escapeHtml(c.status)}</td>
        <td>${escapeHtml(formatDate(c.createdAt))}<span class="panel-hint">reporter ${escapeHtml(c.reporterRef)}</span></td>
        <td>${actions
          .map(
            ([a, label]) =>
              `<button type="button" class="btn btn-secondary btn-sm" data-snet-moderate="${a}" data-case-id="${escapeHtml(c.caseId)}">${escapeHtml(label)}</button>`
          )
          .join(' ')}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="table-container">
      <div class="table-toolbar">
        <div class="panel-hint">Reports about entities. Reporters are pseudonymous. Humans decide — reports never auto-suspend.</div>
        <select id="snetModerationStatus">
          ${['open', 'reviewing', 'actioned', 'dismissed', '']
            .map((v) => `<option value="${v}" ${moderationFilter === v ? 'selected' : ''}>${v || 'All'}</option>`)
            .join('')}
        </select>
      </div>
      <table class="org-table">
        <thead><tr><th>Report</th><th>Entity</th><th>Status</th><th>Received</th><th>Decision</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="panel-hint">No reports in this view.</td></tr>'}</tbody>
      </table>
    </div>`;
}

/* ---------- Search administration (Phase 2.0): Discover categories + synonyms ---------- */

function categoriesToText(categories = []) {
  return categories.map((c) => `${c.id} | ${c.label} | ${(c.keywords || []).join(', ')}`).join('\n');
}

function synonymsToText(synonyms = {}) {
  return Object.entries(synonyms)
    .map(([term, list]) => `${term}: ${(list || []).join(', ')}`)
    .join('\n');
}

/** "id | Label | kw, kw" per line → [{ id, label, keywords[] }] (server validates). */
function parseCategoriesText(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [id = '', label = '', keywords = ''] = line.split('|').map((s) => s.trim());
      return { id, label, keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean) };
    });
}

/** "term: a, b, c" per line → { term: [a, b, c] }. */
function parseSynonymsText(text) {
  const out = {};
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 1) throw new Error(`Synonym line needs "term: word, word": ${line.slice(0, 40)}`);
    out[line.slice(0, idx).trim()] = line
      .slice(idx + 1)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return out;
}

async function searchHtml() {
  const res = await fetchNetworkSearchConfig();
  if (res.error) return errorBlock(errText(res));
  const c = body(res);
  if (!c) return errorBlock('No data returned.');
  const o = c.overridden || {};
  const l = c.limits || {};
  return `
    <div class="profile-card">
      <h4>Discover categories ${o.categories ? '<span class="status-badge pending">customised</span>' : '<span class="status-badge active">defaults</span>'}</h4>
      <div class="panel-hint">One per line: <code>id | Label | keyword, keyword</code>. Keywords map a business to the category by its name, tags and description. Up to ${formatNumber(l.maxCategories || 24)} categories.</div>
      <textarea id="snetCategoriesText" rows="12" spellcheck="false" style="width:100%;font-family:monospace;margin-top:8px;" ${canMc('network.search.admin') ? '' : 'readonly'}>${escapeHtml(categoriesToText(c.categories))}</textarea>
      ${
        canMc('network.search.admin')
          ? '<div class="modal-actions" style="margin-top:8px;"><button type="button" class="btn btn-primary btn-sm" data-snet-search-save="categories">Save categories</button></div>'
          : '<div class="panel-hint">Read-only — Search Admin role required to edit.</div>'
      }
    </div>
    <div class="profile-card" style="margin-top:16px;">
      <h4>Search synonyms ${o.synonyms ? '<span class="status-badge pending">customised</span>' : '<span class="status-badge active">defaults</span>'}</h4>
      <div class="panel-hint">One per line: <code>term: related, related</code>. A search for the term also matches the related words. Up to ${formatNumber(l.maxSynonymTerms || 200)} terms.</div>
      <textarea id="snetSynonymsText" rows="12" spellcheck="false" style="width:100%;font-family:monospace;margin-top:8px;" ${canMc('network.search.admin') ? '' : 'readonly'}>${escapeHtml(synonymsToText(c.synonyms))}</textarea>
      ${
        canMc('network.search.admin')
          ? `<div class="modal-actions" style="margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-sm" data-snet-search-reset>Reset all to defaults</button>
        <button type="button" class="btn btn-primary btn-sm" data-snet-search-save="synonyms">Save synonyms</button>
      </div>`
          : ''
      }
    </div>
    <div class="panel-hint" id="snetSearchStatus" role="status" style="margin-top:8px;">${
      c.updatedAt ? `Last changed ${escapeHtml(new Date(c.updatedAt).toLocaleString())} by ${escapeHtml(c.updatedBy || 'unknown')} (v${escapeHtml(String(c.version || 0))}).` : 'Using shipped defaults.'
    } Changes are audited and reach every server within about 30 seconds.</div>`;
}

/* ---------- Access (Phase 2.0): platform roles — Super Admin only ---------- */
async function accessHtml() {
  const res = await fetchNetworkRoles();
  if (res.error) {
    return res.status === 403
      ? '<div class="profile-card"><strong>Super Admin only</strong><div class="panel-hint">Granting Sarah Network roles needs a Super Admin account.</div></div>'
      : errorBlock(errText(res));
  }
  const { roles = [], grants = [] } = body(res) || {};
  const roleLabel = (id) => roles.find((r) => r.id === id)?.label || id;
  return `
    <div class="profile-card">
      <h4>Roles</h4>
      <ul>${roles
        .map((r) => `<li><strong>${escapeHtml(r.label)}</strong> <span class="panel-hint">${escapeHtml(r.id)} · ${escapeHtml((r.permissions || []).join(', '))}</span></li>`)
        .join('')}</ul>
    </div>
    <div class="table-container" style="margin-top:16px;">
      <table class="org-table">
        <thead><tr><th>User id</th><th>Roles</th><th>Updated</th><th></th></tr></thead>
        <tbody>${
          grants
            .map(
              (g) => `<tr><td>${escapeHtml(g.uid)}</td><td>${escapeHtml((g.roles || []).map(roleLabel).join(', '))}</td><td>${escapeHtml(formatDate(g.updatedAt))}<span class="panel-hint">${escapeHtml(g.updatedBy || '')}</span></td>
              <td><button type="button" class="btn btn-secondary btn-sm" data-snet-role-revoke="${escapeHtml(g.uid)}">Revoke</button></td></tr>`
            )
            .join('') || '<tr><td colspan="4" class="panel-hint">No role grants yet. Super Admins always have full access.</td></tr>'
        }</tbody>
      </table>
    </div>
    <div class="profile-card" style="margin-top:16px;">
      <h4>Grant roles</h4>
      <div class="form-group"><label for="snetRoleUid">User id (Firebase UID)</label><input type="text" id="snetRoleUid" autocomplete="off"></div>
      <div class="form-group">${roles
        .map((r) => `<label style="display:block;font-weight:400;"><input type="checkbox" name="snetRole" value="${escapeHtml(r.id)}"> ${escapeHtml(r.label)}</label>`)
        .join('')}</div>
      <div class="panel-hint" id="snetRoleError" role="alert" style="color:var(--danger);min-height:1.2em;"></div>
      <button type="button" class="btn btn-primary btn-sm" data-snet-role-save>Save roles</button>
      <div class="panel-hint">Replaces the user's roles. Saving with none selected revokes access. Audited.</div>
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
      activeTab === 'entities'
        ? await entitiesHtml()
        : activeTab === 'verification'
          ? await verificationHtml()
          : activeTab === 'moderation'
            ? await moderationHtml()
            : activeTab === 'search'
              ? await searchHtml()
              : activeTab === 'access'
                ? await accessHtml()
                : await overviewHtml();
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

  const ms = container.querySelector('#snetModerationStatus');
  if (ms) {
    ms.onchange = () => {
      moderationFilter = ms.value;
      paint(container);
    };
  }

  container.querySelectorAll('[data-snet-search-save]').forEach((btn) => {
    btn.onclick = async () => {
      const part = btn.dataset.snetSearchSave;
      let payload;
      try {
        payload = part === 'categories'
          ? { categories: parseCategoriesText(container.querySelector('#snetCategoriesText')?.value) }
          : { synonyms: parseSynonymsText(container.querySelector('#snetSynonymsText')?.value) };
      } catch (e) {
        return showToast(e.message, 'error');
      }
      const res = await saveNetworkSearchConfig(payload);
      if (res.error) return showToast(errText(res), 'error');
      showToast(part === 'categories' ? 'Categories saved' : 'Synonyms saved', 'success');
      paint(container);
    };
  });

  const resetBtn = container.querySelector('[data-snet-search-reset]');
  if (resetBtn) {
    resetBtn.onclick = async () => {
      const result = await openDecisionModal({
        title: 'Reset search configuration',
        lead: 'Categories and synonyms return to the shipped defaults for every user.',
        noteRequired: false,
        noteLabel: 'Note',
        confirmLabel: 'Reset',
        danger: true,
      });
      if (!result) return;
      const res = await resetNetworkSearchConfig();
      if (res.error) return showToast(errText(res), 'error');
      showToast('Search configuration reset to defaults', 'success');
      paint(container);
    };
  }

  const saveRole = container.querySelector('[data-snet-role-save]');
  if (saveRole) {
    saveRole.onclick = async () => {
      const uid = container.querySelector('#snetRoleUid')?.value.trim();
      const errEl = container.querySelector('#snetRoleError');
      if (!uid) {
        errEl.textContent = 'Enter a user id.';
        return;
      }
      const roles = [...container.querySelectorAll('input[name="snetRole"]:checked')].map((i) => i.value);
      const res = await setNetworkRoles(uid, { roles });
      if (res.error) {
        errEl.textContent = errText(res);
        return;
      }
      showToast(roles.length ? 'Roles saved' : 'Roles revoked', 'success');
      paint(container);
    };
  }
  container.querySelectorAll('[data-snet-role-revoke]').forEach((btn) => {
    btn.onclick = async () => {
      const result = await openDecisionModal({
        title: 'Revoke roles',
        lead: `Remove all Sarah Network roles from ${btn.dataset.snetRoleRevoke}.`,
        noteRequired: false,
        noteLabel: 'Note',
        confirmLabel: 'Revoke',
        danger: true,
      });
      if (!result) return;
      const res = await setNetworkRoles(btn.dataset.snetRoleRevoke, { roles: [] });
      if (res.error) return showToast(errText(res), 'error');
      showToast('Roles revoked', 'success');
      paint(container);
    };
  });

  container.querySelectorAll('[data-snet-moderate]').forEach((btn) => {
    btn.onclick = async () => {
      const action = btn.dataset.snetModerate;
      const payload = { action };
      if (action !== 'start_review') {
        const result = await openDecisionModal({
          title: `Report: ${action.replace(/_/g, ' ')}`,
          lead: 'Decisions are written to the audit trail with your identity.',
          noteLabel: 'Decision note (audited, min 5 characters)',
          minNote: 5,
          confirmLabel: 'Confirm',
          danger: action === 'suspend_entity',
        });
        if (!result) return;
        payload.note = result.note;
      }
      const res = await decideNetworkModeration(btn.dataset.caseId, payload);
      if (res.error) return showToast(errText(res), 'error');
      showToast(`Report updated: ${action.replace(/_/g, ' ')}`, 'success');
      paint(container);
    };
  });

  container.querySelectorAll('[data-snet-status]').forEach((btn) => {
    btn.onclick = async () => {
      const action = btn.dataset.snetStatus;
      const result = await openDecisionModal({
        title: action === 'suspend' ? 'Suspend entity' : 'Reinstate entity',
        lead:
          action === 'suspend'
            ? 'The entity is removed from Discover, search and new relationships immediately.'
            : 'The entity becomes eligible for Discover again if it is listed.',
        noteLabel: 'Reason (audited, min 5 characters)',
        minNote: 5,
        confirmLabel: action === 'suspend' ? 'Suspend' : 'Reinstate',
        danger: action === 'suspend',
      });
      if (!result) return;
      const res = await changeNetworkEntityStatus(btn.dataset.snId, { action, reason: result.note });
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
        // Show the evidence references the business attached (best effort) next to the decision form.
        const detail = await fetchNetworkVerificationCase(btn.dataset.caseId);
        const evidence = detail?.error ? null : body(detail)?.case?.evidenceRefs || [];
        const known = (btn.closest('[data-snet-checks]')?.dataset.snetChecks || '').split(',').filter(Boolean);
        const labels = {
          verify: ['Approve verification', 'Approve', 'Approval note (audited)'],
          reject: ['Reject verification', 'Reject', 'Reason for rejection (shown to the business)'],
          request_info: ['Request more information', 'Send request', 'What should the business provide? (shown to the business)'],
          restrict: ['Restrict business', 'Restrict', 'Reason for restriction (audited)'],
        }[action] || [`Decision: ${action}`, 'Confirm', 'Decision note (audited)'];
        const result = await openDecisionModal({
          title: labels[0],
          lead: 'Decisions are written to the audit trail with your identity.',
          confirmLabel: labels[1],
          noteLabel: labels[2],
          evidence,
          caseId: btn.dataset.caseId,
          checks: action === 'verify' ? known : null,
          danger: action === 'reject' || action === 'restrict',
        });
        if (!result) return;
        payload.note = result.note;
        if (action === 'verify') payload.checks = result.checks;
      }
      const res = await decideNetworkVerification(btn.dataset.caseId, payload);
      if (res.error) return showToast(errText(res), 'error');
      showToast(`Case updated: ${action.replace(/_/g, ' ')}`, 'success');
      paint(container);
    };
  });
}

export async function renderSarahNetwork(container) {
  if (state.snetDefaultTab) {
    activeTab = state.snetDefaultTab;
    state.snetDefaultTab = null;
  }
  container.innerHTML = `
    ${pageHeader('Sarah Network', 'Entities, verification and trust for the Sarah Network directory')}
    ${tabsMarkup()}
    <div id="snetBody"></div>`;
  await paint(container);
}
