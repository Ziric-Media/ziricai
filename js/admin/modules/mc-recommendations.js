/**
 * Mission Control — Sarah Recommendations (REC-02 / REC-04 queues).
 * Offering verification + campaign approval via /api/operations/recommendations/*.
 */
import { escapeHtml, formatDate, pageHeader, showToast } from '../ui.js';
import { state } from '../state.js';
import { isSuperAdminRole } from '../../auth.js';
import {
  decideRecCampaign,
  decideRecOfferingVerification,
  fetchRecCampaign,
  fetchRecCampaignApprovalQueue,
  fetchRecOfferingVerificationCase,
  fetchRecOfferingVerificationQueue,
} from '../api.js';

const TABS = [
  { id: 'offerings', label: 'Offering verification', perm: 'network.verification.read' },
  { id: 'campaigns', label: 'Campaign approvals', perm: 'network.verification.read' },
];

let activeTab = 'offerings';
let offeringFilter = 'submitted';
let campaignFilter = 'pending_approval';

function mcPermSet() {
  if (isSuperAdminRole(state.profile?.role)) return null;
  return new Set(state.platformPermissions || state.profile?.platformPermissions || []);
}

function canMc(perm) {
  const set = mcPermSet();
  if (set === null) return true;
  return set.has(perm);
}

function canDecide() {
  return canMc('network.verification.decide');
}

function errText(res) {
  const e = res?.error;
  if (typeof e === 'object' && e) return e.message || e.code || 'Request failed';
  return e || 'Request failed';
}

function body(res) {
  return res?.data?.data ?? res?.data ?? null;
}

function statusBadge(status) {
  const s = String(status || '').replace(/_/g, ' ');
  const cls =
    status === 'verified' || status === 'approved' || status === 'active'
      ? 'active'
      : status === 'rejected' || status === 'suspended'
        ? 'suspended'
        : 'pending';
  return `<span class="status-badge ${cls}">${escapeHtml(s)}</span>`;
}

function openDecisionModal({ title, lead = '', checks = null, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    const checksHtml = checks?.length
      ? `<div class="form-group"><label>Checks performed (required to verify)</label>${checks
          .map(
            (c) =>
              `<label style="display:block;font-weight:400;"><input type="checkbox" name="recCheck" value="${escapeHtml(c)}"> ${escapeHtml(c.replace(/_/g, ' '))}</label>`
          )
          .join('')}</div>`
      : '';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <h3>${escapeHtml(title)}</h3>
        ${lead ? `<div class="panel-hint" style="margin-bottom:12px;">${escapeHtml(lead)}</div>` : ''}
        ${checksHtml}
        <div class="form-group">
          <label for="recModalNote">Decision note (audited)</label>
          <textarea id="recModalNote" rows="3" maxlength="1000"></textarea>
        </div>
        <div class="panel-hint" id="recModalError" role="alert" style="color:var(--danger);min-height:1.2em;"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-rec-modal-cancel>Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" data-rec-modal-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const noteEl = overlay.querySelector('#recModalNote');
    const errEl = overlay.querySelector('#recModalError');
    const done = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector('[data-rec-modal-cancel]').onclick = () => done(null);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(null);
    });
    overlay.querySelector('[data-rec-modal-confirm]').onclick = () => {
      const note = noteEl.value.trim();
      const picked = [...overlay.querySelectorAll('input[name="recCheck"]:checked')].map((i) => i.value);
      if (!note) {
        errEl.textContent = 'A note is required.';
        return noteEl.focus();
      }
      if (checks?.length && !picked.length) {
        errEl.textContent = 'Select at least one check.';
        return;
      }
      done({ note, checks: picked });
    };
    noteEl.focus();
  });
}

function tabsMarkup() {
  const tabs = TABS.filter((t) => canMc(t.perm));
  if (!tabs.some((t) => t.id === activeTab) && tabs[0]) activeTab = tabs[0].id;
  return `<div class="segment-group" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">${tabs
    .map(
      (t) =>
        `<button type="button" class="segment ${t.id === activeTab ? 'active' : ''}" data-rec-tab="${t.id}">${escapeHtml(t.label)}</button>`
    )
    .join('')}</div>`;
}

async function offeringsHtml() {
  const res = await fetchRecOfferingVerificationQueue(offeringFilter);
  if (res.error) return `<div class="panel-hint" style="color:var(--danger);">${escapeHtml(errText(res))}</div>`;
  const { cases = [], checks = [] } = body(res) || {};
  const rows = cases
    .map((c) => {
      const actions = [];
      if (canDecide()) {
        if (c.status === 'submitted') actions.push(['start_review', 'Start review']);
        if (c.status === 'submitted' || c.status === 'under_review') {
          actions.push(['verify', 'Verify offering'], ['reject', 'Reject']);
        }
      }
      return `<tr>
        <td><strong>${escapeHtml(c.displayName || c.offeringId)}</strong><span class="panel-hint">${escapeHtml(c.companyId)}</span></td>
        <td>${escapeHtml((c.categoryIds || []).join(', ') || '—')}</td>
        <td>${statusBadge(c.status)}</td>
        <td>${escapeHtml(formatDate(c.submittedAt))}</td>
        <td>${actions
          .map(
            ([a, label]) =>
              `<button type="button" class="btn btn-secondary btn-sm" data-rec-off-action="${a}" data-case-id="${escapeHtml(c.caseId)}">${escapeHtml(label)}</button>`
          )
          .join(' ')}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="table-container" data-rec-checks="${escapeHtml(checks.join(','))}">
      <div class="table-toolbar">
        <div class="panel-hint">Organisation must be Network-verified before offerings are eligible. Decisions are audited.</div>
        <select id="recOfferingFilter">
          ${['submitted', 'under_review', 'verified', 'rejected', 'suspended', '']
            .map((v) => `<option value="${v}" ${offeringFilter === v ? 'selected' : ''}>${v ? v.replace(/_/g, ' ') : 'All'}</option>`)
            .join('')}
        </select>
      </div>
      <table class="org-table">
        <thead><tr><th>Offering</th><th>Categories</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="panel-hint">Queue is empty.</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function campaignsHtml() {
  const res = await fetchRecCampaignApprovalQueue(campaignFilter);
  if (res.error) return `<div class="panel-hint" style="color:var(--danger);">${escapeHtml(errText(res))}</div>`;
  const { campaigns = [] } = body(res) || {};
  const rows = campaigns
    .map((c) => {
      const actions = canDecide()
        ? `<button type="button" class="btn btn-primary btn-sm" data-rec-camp-action="approve" data-campaign-id="${escapeHtml(c.campaignId)}">Approve</button>
           <button type="button" class="btn btn-secondary btn-sm" data-rec-camp-action="reject" data-campaign-id="${escapeHtml(c.campaignId)}">Reject</button>`
        : '';
      return `<tr>
        <td><strong>${escapeHtml(c.name)}</strong><span class="panel-hint">${escapeHtml(c.campaignId)}</span></td>
        <td>${escapeHtml(c.companyId)}</td>
        <td>${escapeHtml(c.packageName || c.packageSkuId || '—')} · ${c.monthlyAllowance ?? '—'} presentations/mo</td>
        <td>${statusBadge(c.status)} / ${statusBadge(c.approvalStatus)}</td>
        <td>${escapeHtml(formatDate(c.submittedAt || c.createdAt))}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="table-container">
      <div class="table-toolbar">
        <div class="panel-hint">Approved campaigns still need tenant payment (RS09) before activation unless pilot-listed.</div>
        <select id="recCampaignFilter">
          ${['pending_approval', 'approved', 'rejected', 'active', '']
            .map((v) => `<option value="${v}" ${campaignFilter === v ? 'selected' : ''}>${v ? v.replace(/_/g, ' ') : 'All statuses'}</option>`)
            .join('')}
        </select>
      </div>
      <table class="org-table">
        <thead><tr><th>Campaign</th><th>Tenant</th><th>Package</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="panel-hint">Queue is empty.</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function paint(container) {
  const host = container.querySelector('#recMcBody');
  if (!host) return;
  host.innerHTML = '<div class="panel-hint">Loading…</div>';
  host.innerHTML = activeTab === 'campaigns' ? await campaignsHtml() : await offeringsHtml();
  bind(container);
}

function bind(container) {
  container.querySelectorAll('[data-rec-tab]').forEach((btn) => {
    btn.onclick = () => {
      activeTab = btn.dataset.recTab || 'offerings';
      container.querySelectorAll('[data-rec-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      paint(container);
    };
  });

  const offFilter = container.querySelector('#recOfferingFilter');
  if (offFilter) {
    offFilter.onchange = () => {
      offeringFilter = offFilter.value;
      paint(container);
    };
  }
  const campFilter = container.querySelector('#recCampaignFilter');
  if (campFilter) {
    campFilter.onchange = () => {
      campaignFilter = campFilter.value;
      paint(container);
    };
  }

  const knownChecks = (container.querySelector('[data-rec-checks]')?.dataset.recChecks || '').split(',').filter(Boolean);

  container.querySelectorAll('[data-rec-off-action]').forEach((btn) => {
    btn.onclick = async () => {
      const action = btn.dataset.recOffAction;
      const caseId = btn.dataset.caseId;
      const payload = { action };
      if (action !== 'start_review') {
        const detail = await fetchRecOfferingVerificationCase(caseId);
        const offering = detail?.error ? null : body(detail)?.offering;
        const lead = offering
          ? `Description: ${offering.description || '(none)'}. Pricing: ${offering.pricingSummary || '—'}.`
          : 'Review offering details in the tenant portal if needed.';
        const labels =
          action === 'verify'
            ? { title: 'Verify offering', confirm: 'Verify', danger: false, checks: knownChecks }
            : { title: 'Reject offering', confirm: 'Reject', danger: true, checks: null };
        const result = await openDecisionModal({
          title: labels.title,
          lead,
          checks: labels.checks,
          confirmLabel: labels.confirm,
          danger: labels.danger,
        });
        if (!result) return;
        payload.note = result.note;
        if (action === 'verify') payload.checks = result.checks;
      }
      const res = await decideRecOfferingVerification(caseId, payload);
      if (res.error) return showToast(errText(res), 'error');
      showToast(`Offering case updated (${action.replace(/_/g, ' ')})`, 'success');
      paint(container);
    };
  });

  container.querySelectorAll('[data-rec-camp-action]').forEach((btn) => {
    btn.onclick = async () => {
      const action = btn.dataset.recCampAction;
      const campaignId = btn.dataset.campaignId;
      const detail = await fetchRecCampaign(campaignId);
      const camp = detail?.error ? null : body(detail)?.campaign;
      const lead = camp
        ? `Offerings: ${(camp.offeringIds || []).length}. Targets: ${(camp.targetCategoryIds || []).join(', ') || '—'}. Geo: ${camp.targetGeo?.city || '—'}.`
        : '';
      const result = await openDecisionModal({
        title: action === 'approve' ? 'Approve campaign' : 'Reject campaign',
        lead,
        confirmLabel: action === 'approve' ? 'Approve' : 'Reject',
        danger: action === 'reject',
      });
      if (!result) return;
      const res = await decideRecCampaign(campaignId, { action, note: result.note });
      if (res.error) return showToast(errText(res), 'error');
      showToast(`Campaign ${action}d`, 'success');
      paint(container);
    };
  });
}

export async function renderMcRecommendations(container) {
  if (!canMc('network.verification.read')) {
    container.innerHTML = `${pageHeader('Sarah Recommendations', 'MC queues')}<div class="panel-hint">You do not have verification officer access.</div>`;
    return;
  }
  container.innerHTML = `
    ${pageHeader('Sarah Recommendations', 'Verify offerings and approve sponsored campaigns (RS09) before tenants can activate.')}
    ${tabsMarkup()}
    <div id="recMcBody"></div>`;
  await paint(container);
}