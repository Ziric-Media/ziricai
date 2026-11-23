import { escapeHtml, loadingState, pageHeader, emptyState, showToast } from '../ui.js';
import { fetchGovernanceConsumers, fetchGovernanceConsumer, postGovernanceSafetyCase } from '../services/platformGovernanceClient.js';

let searchQ = '';

function fmtDate(iso) {
  if (!iso) return '—';
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 16).replace('T', ' ') : s;
}

function safetyBadge(status) {
  const st = String(status || 'ok').toLowerCase();
  if (st === 'suspended' || st === 'terminated') return 'mc-safety-pill mc-safety-pill--bad';
  if (st === 'restricted' || st === 'warned') return 'mc-safety-pill mc-safety-pill--warn';
  return 'mc-safety-pill';
}

function renderProfileDetail(detailEl, d, uid) {
  const orgs = d.organisations || [];
  const cases = d.safety?.recentCases || [];
  const signals = d.safety?.recentSignals || [];
  detailEl.innerHTML = `
    <div class="panel-header mc-user-profile-head">
      <div>
        <h3>${escapeHtml(d.overview.displayName)}</h3>
        <p class="panel-hint">Consumer account · ${escapeHtml(uid)}</p>
      </div>
      <div class="mc-user-profile-badges">
        <span class="${safetyBadge(d.overview.safetyStatus)}">${escapeHtml(d.overview.safetyStatus)}</span>
        <span class="ops-tag">${escapeHtml(d.overview.tier)}</span>
      </div>
    </div>
    <p class="panel-hint">${escapeHtml(d.privacy?.conversationContentVisible ? '' : 'Private chat content is not shown. Safety excerpts are redacted previews only.')}</p>
    <div class="mc-user-detail-stats">
      <div class="mc-user-stat"><span class="label">Account created</span><span class="value">${escapeHtml(fmtDate(d.profile.createdAt))}</span></div>
      <div class="mc-user-stat"><span class="label">Last active</span><span class="value">${escapeHtml(fmtDate(d.overview.lastActiveAt))}</span></div>
      <div class="mc-user-stat"><span class="label">Subscription</span><span class="value">${escapeHtml(d.overview.subscriptionStatus)}</span></div>
      <div class="mc-user-stat"><span class="label">Open safety cases</span><span class="value">${escapeHtml(String(d.safety?.openCases ?? 0))}</span></div>
      <div class="mc-user-stat mc-user-stat--wide"><span class="label">Email</span><span class="value is-email">${escapeHtml(d.profile.email || '—')}</span></div>
      <div class="mc-user-stat"><span class="label">Location</span><span class="value">${escapeHtml([d.profile.city, d.profile.country].filter(Boolean).join(', ') || '—')}</span></div>
    </div>
    <section class="mc-user-section">
      <h4>Organisations (Sarah Network)</h4>
      ${orgs.length ? `<ul class="mc-user-list">${orgs.map((o) => `<li>${escapeHtml(o.companyId || '—')} · ${escapeHtml(o.state || '')}</li>`).join('')}</ul>` : '<p class="panel-hint">No linked organisations.</p>'}
    </section>
    <section class="mc-user-section">
      <h4>Safety</h4>
      <p class="panel-hint">Level ${escapeHtml(String(d.safety?.level ?? 0))} · ${escapeHtml((d.safety?.restrictions || []).join(', ') || 'no restrictions')}</p>
      ${signals.length ? `<p><strong>Recent signals</strong></p><ul class="mc-user-list">${signals.map((s) => `<li>${escapeHtml(s.reference)} · ${escapeHtml(s.severity)} · ${escapeHtml(s.category || '')} · ${escapeHtml(fmtDate(s.createdAt))}</li>`).join('')}</ul>` : ''}
      ${cases.length ? `<p><strong>Cases</strong></p><ul class="mc-user-list">${cases.map((c) => `<li>${escapeHtml(c.caseId.slice(0, 8))}… · ${escapeHtml(c.status)} · ${escapeHtml(c.reason?.slice(0, 80) || '')}</li>`).join('')}</ul>` : '<p class="panel-hint">No safety cases on file.</p>'}
      <button type="button" class="btn btn-secondary btn-sm" id="mcUserOpenCase">Open safety case</button>
    </section>
  `;
  detailEl.querySelector('#mcUserOpenCase')?.addEventListener('click', async () => {
    const reason = window.prompt('Reason for safety case (min 5 chars):', 'Manual review from consumer profile');
    if (!reason || reason.length < 5) return;
    const res = await postGovernanceSafetyCase({ subjectUid: uid, reason });
    if (res.error) return showToast(res.error, 'error');
    showToast('Safety case opened', 'success');
    const fresh = await fetchGovernanceConsumer(uid);
    const nd = fresh.data?.data || fresh.data;
    if (nd) renderProfileDetail(detailEl, nd, uid);
  });
}

export async function renderMcPlatformUsers(container) {
  container.innerHTML = loadingState('Loading Sarah users…');
  const { data, error } = await fetchGovernanceConsumers({ q: searchQ, limit: 50 });
  const rows = data?.data?.rows || data?.rows || [];
  if (error && !rows.length) {
    container.innerHTML = pageHeader('Sarah Users', 'Registered Sarah App consumers (metadata only).') + emptyState(error);
    return;
  }
  container.innerHTML = `
    ${pageHeader('Sarah Users', 'Consumer directory — packages, usage metadata and safety status. Private chats are not shown.', '<span class="ops-tag">MC-PO-02A</span>')}
    <div class="filter-bar" style="margin-bottom:12px;display:flex;gap:8px;">
      <input id="mcUsersSearch" class="form-control" type="search" placeholder="Search name, email, uid" value="${escapeHtml(searchQ)}" style="max-width:320px">
      <button type="button" class="btn btn-secondary btn-sm" id="mcUsersSearchBtn">Search</button>
    </div>
    <div class="table-container">
      <table class="org-table">
        <thead><tr><th>User</th><th>Package</th><th>Status</th><th>Safety</th><th>Last active</th><th></th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
              <td>${escapeHtml(r.displayName)}<div class="panel-hint">${escapeHtml(r.uid)}</div></td>
              <td>${escapeHtml(r.tier)}</td>
              <td>${escapeHtml(r.subscriptionStatus)}</td>
              <td><span class="${safetyBadge(r.safetyStatus)}">${escapeHtml(r.safetyStatus)}</span></td>
              <td>${escapeHtml(fmtDate(r.lastActiveAt))}</td>
              <td><button type="button" class="btn btn-secondary btn-sm mc-user-open" data-uid="${escapeHtml(r.uid)}">Open</button></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div id="mcUserDetail" class="panel-card hidden" style="margin-top:16px"></div>
  `;
  container.querySelector('#mcUsersSearchBtn')?.addEventListener('click', () => {
    searchQ = container.querySelector('#mcUsersSearch')?.value?.trim() || '';
    renderMcPlatformUsers(container);
  });
  container.querySelectorAll('.mc-user-open').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-uid');
      const detailEl = container.querySelector('#mcUserDetail');
      detailEl.classList.remove('hidden');
      detailEl.innerHTML = loadingState('Loading profile…');
      const res = await fetchGovernanceConsumer(uid);
      if (res.error) {
        detailEl.innerHTML = emptyState(res.error);
        return;
      }
      const d = res.data?.data || res.data;
      renderProfileDetail(detailEl, d, uid);
    });
  });
}