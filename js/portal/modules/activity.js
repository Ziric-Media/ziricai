import { state } from '../state.js';
import { escapeHtml, pageHeader, emptyState, loadingState } from '../../admin/ui.js';
import { fetchPortalActivity } from '../api.js';
import { DEMO_ACTIVITY } from '../demo-data.js';
import { shouldUseDemoFallback } from '../../shared/dataMode.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { can } from '../permissions.js';

export async function renderActivity(container) {
  if (!can(state.profile?.role, 'canManageStaff')) {
    container.innerHTML = emptyState('Activity log is restricted to Owner and Manager roles.');
    return;
  }

  container.innerHTML = loadingState('Loading activity log...');
  const companyId = state.companyId;

  const res = await fetchPortalActivity(companyId);
  const useDemo = shouldUseDemoFallback({ companyId, isDemo: state.hubData?.isDemo, isProvisioned: state.hubData?.isProvisioned });
  const items = res.data?.items?.length ? res.data.items : (useDemo ? DEMO_ACTIVITY : []);

  container.innerHTML = `
    ${pageHeader('Activity Log', `Audit trail for ${escapeHtml(state.company?.name || 'your company')}.`)}
    <div class="activity-timeline">
      ${items.length
        ? items.map((a) => activityItem(a)).join('')
        : renderEmptyState({ message: 'No activity recorded yet.', actionHtml: '<button class="btn btn-secondary btn-sm" type="button" data-nav="conversations">Open Inbox</button>' })}
    </div>
  `;
}

function activityItem(a) {
  return `
    <div class="activity-item">
      <div class="activity-icon"><i class="fa-solid ${escapeHtml(a.icon || 'fa-circle')}"></i></div>
      <div class="activity-content">
        <div class="activity-text"><strong>${escapeHtml(a.actor)}</strong> ${escapeHtml(a.action)} <em>${escapeHtml(a.target)}</em></div>
        <div class="activity-time">${escapeHtml(a.ago || a.time?.slice(0, 16) || '')}</div>
      </div>
    </div>
  `;
}
