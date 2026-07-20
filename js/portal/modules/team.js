import { state, setState } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  emptyState,
  loadingState,
  showToast,
  statusBadge,
} from '../../admin/ui.js';
import {
  getPermissions,
  PERMISSION_LABELS,
  PORTAL_ROLES,
  roleLabel,
  can,
} from '../permissions.js';
import { fetchPortalTeam, inviteTeamMember } from '../api.js';

export async function renderTeam(container) {
  if (!can(state.profile?.role, 'canManageStaff')) {
    container.innerHTML = emptyState('You do not have permission to manage team members.');
    return;
  }

  container.innerHTML = loadingState('Loading team...');
  const companyId = state.companyId;

  const res = await fetchPortalTeam(companyId);
  const team = res.data?.items?.length ? res.data.items : state.team || [];
  const isDemo = res.data?.isDemo && !team.length;
  setState({ team });

  container.innerHTML = `
    ${pageHeader(
      'Team Management',
      `Members and roles for ${escapeHtml(state.company?.name || 'your company')}.`,
      `<button class="btn btn-primary btn-sm" type="button" id="openInviteModal"><i class="fa-solid fa-user-plus"></i> Invite Member</button>`
    )}

    <div class="table-container">
      <table class="org-table">
        <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th><th>Last Active</th><th></th></tr></thead>
        <tbody>
          ${team.map((m) => `
            <tr>
              <td><div class="member-cell"><span class="avatar sm">${escapeHtml(m.avatar || m.name?.charAt(0) || '?')}</span> ${escapeHtml(m.name)}</div></td>
              <td>${escapeHtml(m.email)}</td>
              <td><span class="role-badge">${escapeHtml(roleLabel(m.role))}</span></td>
              <td>${statusBadge(m.status)}</td>
              <td>${escapeHtml(m.lastActive?.slice(0, 10) || '—')}</td>
              <td><button class="btn btn-secondary btn-sm" type="button" disabled>Edit</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:24px;">
      <div class="card-header"><h3>Permissions Matrix</h3></div>
      <div class="card-body permissions-matrix-wrap">
        <table class="org-table permissions-matrix">
          <thead>
            <tr><th>Permission</th>${PORTAL_ROLES.map((r) => `<th>${escapeHtml(roleLabel(r))}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${Object.entries(PERMISSION_LABELS).map(([key, label]) => `
              <tr>
                <td>${escapeHtml(label)}</td>
                ${PORTAL_ROLES.map((r) => {
                  const p = getPermissions(r);
                  return `<td class="perm-cell ${p[key] ? 'yes' : 'no'}">${p[key] ? '✓' : '—'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="wizard-overlay" id="inviteModal">
      <div class="wizard-modal" style="max-width:480px;">
        <div class="wizard-header">
          <div><h2>Invite Team Member</h2></div>
          <button class="btn btn-secondary btn-sm" type="button" id="closeInviteModal">✕</button>
        </div>
        <div class="wizard-body">
          <div class="form-group"><label>Email</label><input type="email" id="inviteEmail" placeholder="colleague@company.com" /></div>
          <div class="form-group"><label>Role</label>
            <select id="inviteRole">
              ${PORTAL_ROLES.filter((r) => r !== 'owner').map((r) => `<option value="${r}">${escapeHtml(roleLabel(r))}</option>`).join('')}
            </select>
          </div>
          <p class="form-hint">${isDemo ? 'Demo mode — invite is simulated locally.' : 'Invite is recorded on the server; email delivery pending.'}</p>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" type="button" id="cancelInviteModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="sendInviteBtn">Send Invite</button>
        </div>
      </div>
    </div>
  `;

  bindTeamEvents(container);
}

function bindTeamEvents(container) {
  const modal = container.querySelector('#inviteModal');
  const open = () => modal?.classList.add('open');
  const close = () => modal?.classList.remove('open');

  container.querySelector('#openInviteModal')?.addEventListener('click', open);
  container.querySelector('#closeInviteModal')?.addEventListener('click', close);
  container.querySelector('#cancelInviteModal')?.addEventListener('click', close);

  container.querySelector('#sendInviteBtn')?.addEventListener('click', async () => {
    const email = container.querySelector('#inviteEmail')?.value?.trim();
    const role = container.querySelector('#inviteRole')?.value;
    if (!email) {
      showToast('Enter an email address', 'warning');
      return;
    }
    const result = await inviteTeamMember(state.companyId, { email, role });
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    showToast(`Invite sent to ${email} as ${roleLabel(role)}`, 'success');
    close();
    renderTeam(container);
  });
}
