import { escapeHtml, pageHeader, loadingState, emptyState, showToast } from '../ui.js';
import {
  fetchGovernanceSafetyCases,
  fetchGovernanceSafetyOverview,
  postGovernanceSafetyCase,
  postGovernanceSafetyDecision,
} from '../services/platformGovernanceClient.js';

function fmtDate(iso) {
  if (!iso) return '—';
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 16).replace('T', ' ') : s;
}

function extractRef(reason) {
  const m = String(reason || '').match(/\[(TS-\d{2}-[A-Z0-9]+)\]/);
  return m ? m[1] : '—';
}

export async function renderMcPlatformSafety(container) {
  container.innerHTML = loadingState('Loading safety queue…');
  const [overviewRes, casesRes] = await Promise.all([fetchGovernanceSafetyOverview(), fetchGovernanceSafetyCases()]);
  const overview = overviewRes.data?.data || overviewRes.data || {};
  const cases = casesRes.data?.data?.cases || casesRes.data?.cases || [];
  const err = overviewRes.error || casesRes.error;

  container.innerHTML = `
    ${pageHeader('Sarah Trust & Safety', 'Detection signals, human review and graduated enforcement on consumer accounts.', '<span class="ops-tag">MC-PO-04</span>')}
    <div class="mc-user-detail-stats" style="margin-bottom:16px">
      <div class="mc-user-stat"><span class="label">Critical review</span><span class="value">${escapeHtml(String(overview.criticalReview ?? 0))}</span></div>
      <div class="mc-user-stat"><span class="label">Elevated review</span><span class="value">${escapeHtml(String(overview.elevatedReview ?? 0))}</span></div>
      <div class="mc-user-stat"><span class="label">Open cases</span><span class="value">${escapeHtml(String(overview.openCases ?? 0))}</span></div>
      <div class="mc-user-stat"><span class="label">Signals (24h)</span><span class="value">${escapeHtml(String(overview.signals24h ?? 0))}</span></div>
    </div>
    <p class="panel-hint">Private chats are not browsed here by default. Reviewers see redacted excerpts on signals and case reasons.</p>
    <div class="panel-card mc-po-panel" style="margin-bottom:16px">
      <h3 class="mc-po-panel-title">Open case manually</h3>
      <div class="mc-po-form mc-po-form-grid">
        <div class="form-group"><label for="mcSafetyUid">Subject uid</label><input id="mcSafetyUid" class="form-control" autocomplete="off" /></div>
        <div class="form-group mc-po-field--wide"><label for="mcSafetyReason">Reason</label><input id="mcSafetyReason" class="form-control" autocomplete="off" placeholder="e.g. Report from partner organisation" /></div>
      </div>
      <div class="mc-po-form-actions">
        <button type="button" class="btn btn-primary btn-sm" id="mcSafetyOpen">Open case</button>
      </div>
    </div>
    <div class="table-container">
      <table class="org-table">
        <thead><tr><th>Ref</th><th>Case</th><th>Subject</th><th>Status</th><th>Reason</th><th>Updated</th><th></th></tr></thead>
        <tbody>
          ${
            cases.length
              ? cases
                  .map(
                    (c) => `<tr data-case="${escapeHtml(c.caseId)}">
              <td>${escapeHtml(extractRef(c.reason))}</td>
              <td>${escapeHtml(c.caseId.slice(0, 8))}…</td>
              <td>${escapeHtml(c.subjectUid)}</td>
              <td>${escapeHtml(c.status)}</td>
              <td>${escapeHtml((c.reason || '').slice(0, 120))}</td>
              <td>${escapeHtml(fmtDate(c.updatedAt))}</td>
              <td><button type="button" class="btn btn-secondary btn-sm mc-safety-decide" data-case="${escapeHtml(c.caseId)}" data-subject="${escapeHtml(c.subjectUid)}">Review</button></td>
            </tr>`
                  )
                  .join('')
              : `<tr><td colspan="7">${emptyState(err || 'No cases yet.')}</td></tr>`
          }
        </tbody>
      </table>
    </div>`;

  container.querySelector('#mcSafetyOpen')?.addEventListener('click', async () => {
    const subjectUid = container.querySelector('#mcSafetyUid')?.value?.trim();
    const reason = container.querySelector('#mcSafetyReason')?.value?.trim();
    const res = await postGovernanceSafetyCase({ subjectUid, reason });
    if (res.error) return showToast(res.error, 'error');
    showToast('Case opened', 'success');
    renderMcPlatformSafety(container);
  });

  container.querySelectorAll('.mc-safety-decide').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const caseId = btn.getAttribute('data-case');
      const decision = window.prompt(
        'Decision: dismiss, warn, restrict_messaging, suspend, terminate (requires note)',
        'dismiss'
      );
      if (!decision) return;
      const note = window.prompt('Reviewer note (min 5 chars for enforcement actions):', 'Reviewed — no action') || '';
      const res = await postGovernanceSafetyDecision(caseId, { decision, note });
      if (res.error) return showToast(res.error, 'error');
      showToast('Decision recorded', 'success');
      renderMcPlatformSafety(container);
    });
  });
}