import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, statusBadge, errorState, showToast } from '../../admin/ui.js';
import { DEMO_KNOWLEDGE_ITEMS } from '../../admin/demo-data.js';
import { fetchKnowledgeDocuments, createKnowledgeDocument, uploadKnowledgeFile } from '../api.js';
import { getHubData } from '../core/dataService.js';
import {
  shouldUsePortalDemoContentFallback,
  resolvePortalProvisionedFlag,
} from '../../shared/dataMode.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { can, normalizeRole } from '../permissions.js';

const RETRY_BTN = '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>';

function canAddKnowledge(role) {
  const r = normalizeRole(role);
  return r === 'owner' || r === 'superadmin' || can(role, 'canUploadKnowledge');
}

function openModal(container, id) {
  container.querySelector(`#${id}`)?.classList.add('open');
}

function closeModal(container, id) {
  container.querySelector(`#${id}`)?.classList.remove('open');
}

function renderAddModal() {
  return `
    <div class="wizard-overlay" id="portalKbAddModal">
      <div class="wizard-modal kb-modal">
        <div class="wizard-header">
          <div>
            <h2><i class="fa-solid fa-plus"></i> Add Knowledge</h2>
            <p class="wizard-sub">Train your AI with documents, FAQs, or manual instructions</p>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-kb-close="portalKbAddModal">✕</button>
        </div>
        <div class="wizard-body">
          <div class="form-group">
            <label for="portalKbType">Content type</label>
            <select id="portalKbType">
              <option value="manual">Manual knowledge</option>
              <option value="faq">FAQ</option>
              <option value="document">File upload</option>
            </select>
          </div>
          <div class="form-group" id="portalKbTitleGroup">
            <label for="portalKbTitle">Title *</label>
            <input type="text" id="portalKbTitle" placeholder="e.g. Finance collection rules" />
          </div>
          <div class="form-group portal-kb-faq-fields" hidden>
            <label for="portalKbQuestion">Question *</label>
            <input type="text" id="portalKbQuestion" placeholder="What are your business hours?" />
          </div>
          <div class="form-group portal-kb-text-fields">
            <label for="portalKbContent" id="portalKbContentLabel">Content *</label>
            <textarea id="portalKbContent" rows="6" placeholder="Enter training content for your AI…"></textarea>
          </div>
          <div class="form-group portal-kb-file-fields" hidden>
            <label for="portalKbFile">File *</label>
            <input type="file" id="portalKbFile" accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx" />
            <p class="form-hint">PDF, DOCX, TXT, CSV, Excel, PowerPoint — max 20 MB</p>
          </div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" type="button" data-kb-close="portalKbAddModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="portalKbSubmit">
            <i class="fa-solid fa-brain"></i> Save &amp; Train
          </button>
        </div>
      </div>
    </div>`;
}

function syncAddFormFields(container) {
  const type = container.querySelector('#portalKbType')?.value || 'manual';
  const faqFields = container.querySelectorAll('.portal-kb-faq-fields');
  const textFields = container.querySelectorAll('.portal-kb-text-fields');
  const fileFields = container.querySelectorAll('.portal-kb-file-fields');
  const titleGroup = container.querySelector('#portalKbTitleGroup');
  const contentLabel = container.querySelector('#portalKbContentLabel');

  faqFields.forEach((el) => {
    el.hidden = type !== 'faq';
  });
  textFields.forEach((el) => {
    el.hidden = type === 'document';
  });
  fileFields.forEach((el) => {
    el.hidden = type !== 'document';
  });
  if (titleGroup) titleGroup.hidden = type === 'faq';
  if (contentLabel) contentLabel.textContent = type === 'faq' ? 'Answer *' : 'Content *';
}

function bindAddKnowledge(container, companyId, kbId) {
  const role = state.profile?.role || state.user?.role;
  if (!canAddKnowledge(role)) return;

  container.querySelector('#portalKbAddBtn')?.addEventListener('click', () => {
    openModal(container, 'portalKbAddModal');
  });

  container.querySelectorAll('[data-kb-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(container, btn.dataset.kbClose));
  });

  container.querySelector('#portalKbAddModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'portalKbAddModal') closeModal(container, 'portalKbAddModal');
  });

  container.querySelector('#portalKbType')?.addEventListener('change', () => syncAddFormFields(container));
  syncAddFormFields(container);

  container.querySelector('#portalKbSubmit')?.addEventListener('click', async () => {
    const type = container.querySelector('#portalKbType')?.value || 'manual';
    const submitBtn = container.querySelector('#portalKbSubmit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      let result;
      if (type === 'document') {
        const title = container.querySelector('#portalKbTitle')?.value.trim();
        const file = container.querySelector('#portalKbFile')?.files?.[0];
        if (!title || !file) {
          showToast('Title and file are required', 'warning');
          return;
        }
        result = await uploadKnowledgeFile(companyId, {
          title,
          type: 'document',
          file,
          knowledgeBaseId: kbId,
        });
      } else if (type === 'faq') {
        const question = container.querySelector('#portalKbQuestion')?.value.trim();
        const answer = container.querySelector('#portalKbContent')?.value.trim();
        if (!question || !answer) {
          showToast('Question and answer are required', 'warning');
          return;
        }
        result = await createKnowledgeDocument(companyId, {
          companyId,
          knowledgeBaseId: kbId,
          type: 'faq',
          title: question.slice(0, 80),
          question,
          answer,
          content: answer,
          status: 'active',
          uploadedBy: state.profile?.displayName || state.profile?.fullName || 'Owner',
        });
      } else {
        const title = container.querySelector('#portalKbTitle')?.value.trim();
        const content = container.querySelector('#portalKbContent')?.value.trim();
        if (!title || !content) {
          showToast('Title and content are required', 'warning');
          return;
        }
        result = await createKnowledgeDocument(companyId, {
          companyId,
          knowledgeBaseId: kbId,
          type: 'manual',
          title,
          content,
          status: 'active',
          uploadedBy: state.profile?.displayName || state.profile?.fullName || 'Owner',
        });
      }

      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      closeModal(container, 'portalKbAddModal');
      showToast('Knowledge saved — AI will use it in conversations', 'success');
      await renderKnowledge(container);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

export async function renderKnowledge(container) {
  if (!can(state.profile?.role, 'canEditAI')) {
    container.innerHTML = errorState('You do not have permission to view the Knowledge Base.');
    return;
  }

  container.innerHTML = loadingState('Loading knowledge base...');
  const companyId = state.companyId;
  const role = state.profile?.role || state.user?.role;
  const allowAdd = canAddKnowledge(role);

  await getHubData(companyId).catch(() => {});

  const apiRes = await fetchKnowledgeDocuments(companyId);
  const isProvisioned = resolvePortalProvisionedFlag(state);
  const useDemo = shouldUsePortalDemoContentFallback({
    companyId,
    isDemo: state.hubData?.isDemo,
    isProvisioned,
  });

  if (apiRes.error && !useDemo) {
    container.innerHTML = `
      ${pageHeader('Knowledge Base', 'Training content for your company.')}
      ${errorState(apiRes.error)}
      <div style="text-align:center;margin-top:12px;">${RETRY_BTN}</div>`;
    return;
  }

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

  const addBtnHtml = allowAdd
    ? `<button class="btn btn-primary btn-sm" type="button" id="portalKbAddBtn"><i class="fa-solid fa-plus"></i> Add Content</button>`
    : '';

  container.innerHTML = `
    ${pageHeader(
      'Knowledge Base',
      `Training content scoped to ${escapeHtml(state.company?.name || 'your company')} (${escapeHtml(kbId)}).`,
      addBtnHtml
    )}
    ${!usingApi && useDemo ? `<div class="portal-limit-banner"><i class="fa-solid fa-circle-info"></i> Showing demo knowledge — owners can add real content with Add Content.</div>` : ''}
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
            : `<tr><td colspan="5">${renderEmptyState({
                message: 'No knowledge items yet.',
                actionHtml: allowAdd
                  ? '<button class="btn btn-primary btn-sm" type="button" id="portalKbAddEmptyBtn">Add Content</button>'
                  : '',
              })}</td></tr>`}
        </tbody>
      </table>
    </div>
    ${allowAdd ? renderAddModal() : ''}
  `;

  if (allowAdd) {
    bindAddKnowledge(container, companyId, kbId);
    container.querySelector('#portalKbAddEmptyBtn')?.addEventListener('click', () => {
      openModal(container, 'portalKbAddModal');
    });
  }
}
