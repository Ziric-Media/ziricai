import { state } from '../state.js';
import { escapeHtml, pageHeader, emptyState, loadingState, statusBadge } from '../../admin/ui.js';
import { DEMO_KNOWLEDGE_ITEMS } from '../../admin/demo-data.js';
import { fetchKnowledgeDocuments } from '../api.js';
import { shouldUseDemoFallback } from '../../shared/dataMode.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { can } from '../permissions.js';

export async function renderKnowledge(container) {
  if (!can(state.profile?.role, 'canEditAI')) {
    container.innerHTML = emptyState('You do not have permission to view the Knowledge Base.');
    return;
  }

  container.innerHTML = loadingState('Loading knowledge base...');
  const companyId = state.companyId;

  const apiRes = await fetchKnowledgeDocuments(companyId);
  const useDemo = shouldUseDemoFallback({ companyId, isDemo: state.hubData?.isDemo, isProvisioned: state.hubData?.isProvisioned });
  let items = [];
  if (apiRes.data?.items?.length) {
    items = apiRes.data.items;
  } else if (apiRes.items?.length) {
    items = apiRes.items;
  } else if (useDemo) {
    items = DEMO_KNOWLEDGE_ITEMS.filter((k) => k.companyId === companyId);
  }

  const usingApi = Boolean(apiRes.data?.items?.length || apiRes.items?.length);
  const kbId = apiRes.data?.knowledgeBaseId || apiRes.knowledgeBaseId || `kb-${companyId}`;

  const byType = {};
  items.forEach((item) => {
    const t = item.type || 'other';
    if (!byType[t]) byType[t] = [];
    byType[t].push(item);
  });

  container.innerHTML = `
    ${pageHeader(
      'Knowledge Base',
      `Training content scoped to ${escapeHtml(state.company?.name || 'your company')} (${escapeHtml(kbId)}).`,
      state.permissions.canEditAI
        ? `<button class="btn btn-primary btn-sm" type="button" disabled title="Upload via Sarah or Admin">+ Add Content</button>`
        : ''
    )}
    ${!usingApi && useDemo ? `<div class="portal-limit-banner"><i class="fa-solid fa-circle-info"></i> Showing demo knowledge — upload real documents via Sarah or the Admin console.</div>` : ''}
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:24px;">
      <div class="kpi-card purple"><div class="kpi-content"><div class="kpi-label">Total Items</div><div class="kpi-value">${items.length}</div></div></div>
      <div class="kpi-card green"><div class="kpi-content"><div class="kpi-label">Active</div><div class="kpi-value">${items.filter((i) => (i.status || 'active') === 'active').length}</div></div></div>
      <div class="kpi-card blue"><div class="kpi-content"><div class="kpi-label">Types</div><div class="kpi-value">${Object.keys(byType).length}</div></div></div>
    </div>
    <div class="table-container">
      <table class="org-table">
        <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>KB</th><th>Updated</th></tr></thead>
        <tbody>
          ${items.length
            ? items.map((item) => `
              <tr>
                <td><strong>${escapeHtml(item.title)}</strong></td>
                <td><span class="type-badge">${escapeHtml(item.type || 'manual')}</span></td>
                <td>${statusBadge(item.status || 'active')}</td>
                <td>${escapeHtml(item.knowledgeBaseId || kbId)}</td>
                <td>${escapeHtml(item.updatedAt?.slice?.(0, 10) || item.createdAt?.slice?.(0, 10) || '—')}</td>
              </tr>
            `).join('')
            : `<tr><td colspan="5">${renderEmptyState({ message: 'No knowledge items yet.', actionHtml: '<button class="btn btn-primary btn-sm" type="button" data-nav="integrations">Get started</button>' })}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
