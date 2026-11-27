import { escapeHtml, loadingState, pageHeader, emptyState, showToast } from '../ui.js';
import { fetchGovernanceConsumers, fetchGovernanceConsumer, postGovernanceSafetyCase } from '../services/platformGovernanceClient.js';

let searchQ = '';
let activeProfileUid = null;
let flyoutRoot = null;

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

function ensureFlyout() {
  if (flyoutRoot?.isConnected) return flyoutRoot;
  flyoutRoot = document.createElement('div');
  flyoutRoot.id = 'mcUserFlyout';
  flyoutRoot.className = 'mc-user-flyout';
  flyoutRoot.setAttribute('aria-hidden', 'true');
  flyoutRoot.innerHTML = `
    <div class="mc-user-flyout-backdrop" data-mc-flyout-close tabindex="-1" aria-hidden="true"></div>
    <aside class="mc-user-flyout-panel" role="dialog" aria-labelledby="mcUserFlyoutTitle" aria-modal="true">
      <header class="mc-user-flyout-toolbar">
        <span class="mc-user-flyout-kicker">Consumer profile</span>
        <button type="button" class="mc-user-flyout-close btn btn-secondary btn-sm" data-mc-flyout-close aria-label="Close profile">×</button>
      </header>
      <div class="mc-user-flyout-body" id="mcUserFlyoutBody"></div>
    </aside>
  `;
  document.body.appendChild(flyoutRoot);
  flyoutRoot.querySelectorAll('[data-mc-flyout-close]').forEach((el) => {
    el.addEventListener('click', closeProfileFlyout);
  });
  if (!flyoutRoot._escapeBound) {
    flyoutRoot._escapeBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && flyoutRoot?.classList.contains('open')) closeProfileFlyout();
    });
  }
  return flyoutRoot;
}

function closeProfileFlyout() {
  if (!flyoutRoot) return;
  flyoutRoot.classList.remove('open');
  flyoutRoot.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('mc-user-flyout-open');
  activeProfileUid = null;
  document.querySelectorAll('.mc-user-row.is-active').forEach((tr) => tr.classList.remove('is-active'));
}

function openProfileFlyout(container, uid, anchorBtn) {
  const flyout = ensureFlyout();
  const body = flyout.querySelector('#mcUserFlyoutBody');
  flyout.classList.add('open');
  flyout.setAttribute('aria-hidden', 'false');
  document.body.classList.add('mc-user-flyout-open');
  activeProfileUid = uid;

  container?.querySelectorAll('.mc-user-row.is-active').forEach((tr) => tr.classList.remove('is-active'));
  const row = anchorBtn?.closest('tr');
  row?.classList.add('is-active');

  body.innerHTML = loadingState('Loading profile…');
  requestAnimationFrame(() => {
    anchorBtn?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  return body;
}

function renderProfileDetail(detailEl, d, uid) {
  const orgs = d.organisations || [];
  const cases = d.safety?.recentCases || [];
  const signals = d.safety?.recentSignals || [];
  detailEl.innerHTML = `
    <div class="mc-user-profile-head">
      <div class="mc-user-profile-titles">
        <h3 id="mcUserFlyoutTitle" class="mc-user-profile-name">${escapeHtml(d.overview.displayName)}</h3>
        <p class="mc-user-profile-meta">Consumer account</p>
        <p class="mc-user-profile-uid" title="${escapeHtml(uid)}">${escapeHtml(uid)}</p>
      </div>
      <div class="mc-user-profile-badges">
        <span class="${safetyBadge(d.overview.safetyStatus)}">${escapeHtml(d.overview.safetyStatus)}</span>
        <span class="ops-tag">${escapeHtml(d.overview.tier)}</span>
      </div>
    </div>
    <p class="mc-user-privacy-note">Private chat content is not shown. Safety excerpts are redacted previews only.</p>
    <div class="mc-user-detail-stats">
      <div class="mc-user-stat"><span class="label">First name</span><span class="value">${escapeHtml(d.profile.firstName || '—')}</span></div>
      <div class="mc-user-stat"><span class="label">Surname</span><span class="value">${escapeHtml(d.profile.lastName || '—')}</span></div>
      <div class="mc-user-stat"><span class="label">Registered</span><span class="value">${escapeHtml(fmtDate(d.overview.registeredAt || d.profile.createdAt))}</span></div>
      <div class="mc-user-stat"><span class="label">Last active</span><span class="value">${escapeHtml(fmtDate(d.overview.lastActiveAt))}</span></div>
      <div class="mc-user-stat"><span class="label">Subscription</span><span class="value">${escapeHtml(d.overview.subscriptionStatus)}</span></div>
      <div class="mc-user-stat"><span class="label">Open safety cases</span><span class="value">${escapeHtml(String(d.safety?.openCases ?? 0))}</span></div>
      <div class="mc-user-stat mc-user-stat--full"><span class="label">Email</span><span class="value is-email">${escapeHtml(d.profile.email || '—')}</span></div>
      <div class="mc-user-stat mc-user-stat--full"><span class="label">Location</span><span class="value">${escapeHtml([d.profile.city, d.profile.country].filter(Boolean).join(', ') || '—')}</span></div>
    </div>
    <section class="mc-user-section">
      <h4>Organisations (Sarah Network)</h4>
      ${orgs.length ? `<ul class="mc-user-list">${orgs.map((o) => `<li>${escapeHtml(o.companyId || '—')} · ${escapeHtml(o.state || '')}</li>`).join('')}</ul>` : '<p class="mc-user-section-hint">No linked organisations.</p>'}
    </section>
    <section class="mc-user-section">
      <h4>Safety</h4>
      <p class="mc-user-section-hint">Level ${escapeHtml(String(d.safety?.level ?? 0))} · ${escapeHtml((d.safety?.restrictions || []).join(', ') || 'no restrictions')}</p>
      ${signals.length ? `<p class="mc-user-subheading">Recent signals</p><ul class="mc-user-list">${signals.map((s) => `<li>${escapeHtml(s.reference)} · ${escapeHtml(s.severity)} · ${escapeHtml(s.category || '')} · ${escapeHtml(fmtDate(s.createdAt))}</li>`).join('')}</ul>` : ''}
      ${cases.length ? `<p class="mc-user-subheading">Cases</p><ul class="mc-user-list">${cases.map((c) => `<li>${escapeHtml(c.caseId.slice(0, 8))}… · ${escapeHtml(c.status)} · ${escapeHtml(c.reason?.slice(0, 80) || '')}</li>`).join('')}</ul>` : '<p class="mc-user-section-hint">No safety cases on file.</p>'}
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
        <thead><tr><th>First name</th><th>Surname</th><th>Email</th><th>Package</th><th>Status</th><th>Safety</th><th>Registered</th><th>Last active</th><th></th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr class="mc-user-row${r.uid === activeProfileUid ? ' is-active' : ''}">
              <td>${escapeHtml(r.firstName || '—')}</td>
              <td>${escapeHtml(r.lastName || '—')}</td>
              <td class="is-email">${escapeHtml(r.email || '—')}<div class="panel-hint">${escapeHtml(r.uid)}</div></td>
              <td>${escapeHtml(r.tier)}</td>
              <td>${escapeHtml(r.subscriptionStatus)}</td>
              <td><span class="${safetyBadge(r.safetyStatus)}">${escapeHtml(r.safetyStatus)}</span></td>
              <td>${escapeHtml(fmtDate(r.registeredAt || r.createdAt))}</td>
              <td>${escapeHtml(fmtDate(r.lastActiveAt))}</td>
              <td><button type="button" class="btn btn-secondary btn-sm mc-user-open" data-uid="${escapeHtml(r.uid)}">Open</button></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
  container.querySelector('#mcUsersSearchBtn')?.addEventListener('click', () => {
    searchQ = container.querySelector('#mcUsersSearch')?.value?.trim() || '';
    renderMcPlatformUsers(container);
  });
  container.querySelectorAll('.mc-user-open').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-uid');
      const detailEl = openProfileFlyout(container, uid, btn);
      const res = await fetchGovernanceConsumer(uid);
      if (res.error) {
        detailEl.innerHTML = emptyState(res.error);
        return;
      }
      const d = res.data?.data || res.data;
      renderProfileDetail(detailEl, d, uid);
    });
  });

  if (activeProfileUid && flyoutRoot?.classList.contains('open')) {
    const stillListed = rows.some((r) => r.uid === activeProfileUid);
    if (!stillListed) closeProfileFlyout();
  }
}