import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, statusBadge, errorState, showToast } from '../../admin/ui.js';
import { DEMO_KNOWLEDGE_ITEMS } from '../../admin/demo-data.js';
import { fetchKnowledgeDocuments, createKnowledgeDocument, uploadKnowledgeFile } from '../api.js';
import { getHubData, clearCacheKey } from '../core/dataService.js';
import {
  shouldUsePortalDemoContentFallback,
  resolvePortalProvisionedFlag,
} from '../../shared/dataMode.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { can, normalizeRole } from '../permissions.js';
import {
  knowledgeTypeToSection,
  resolveAuthoritativeKnowledgeBaseId,
} from '../../admin/services/knowledgeDisplay.js';

const RETRY_BTN = '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>';

const PORTAL_KB_SECTIONS = [
  { id: 'documents', label: 'Documents', icon: 'fa-file-lines' },
  { id: 'faqs', label: 'FAQs', icon: 'fa-circle-question' },
  { id: 'products', label: 'Products', icon: 'fa-box' },
  { id: 'services', label: 'Services', icon: 'fa-briefcase' },
  { id: 'policies', label: 'Policies', icon: 'fa-shield-halved' },
  { id: 'price-lists', label: 'Price Lists', icon: 'fa-tags' },
];

const PORTAL_KB_CATEGORIES = [
  { value: 'document', label: 'Document upload', group: 'Documents' },
  { value: 'manual', label: 'Manual knowledge', group: 'Documents' },
  { value: 'faq', label: 'FAQ', group: 'FAQs' },
  { value: 'product-structured', label: 'Structured product', group: 'Products' },
  { value: 'product-narrative', label: 'Product explanation', group: 'Products' },
  { value: 'service-structured', label: 'Structured service', group: 'Services' },
  { value: 'service-narrative', label: 'Service explanation', group: 'Services' },
  { value: 'policy', label: 'Policy', group: 'Policies' },
  { value: 'price-list', label: 'Price list', group: 'Price Lists' },
];

function canAddKnowledge(role) {
  const r = normalizeRole(role);
  return r === 'owner' || r === 'superadmin' || can(role, 'canUploadKnowledge');
}

function openModal(container, id) {
  container.querySelector(`#${id}`)?.classList.add('open');
  document.getElementById('overlay')?.classList.add('open');
}

function closeModal(container, id) {
  container.querySelector(`#${id}`)?.classList.remove('open');
  if (!container.querySelector('.wizard-overlay.open')) {
    document.getElementById('overlay')?.classList.remove('open');
  }
}

function uploaderLabel() {
  return state.profile?.displayName || state.profile?.fullName || state.profile?.email || 'Owner';
}

function renderCategoryOptions() {
  const groups = new Map();
  PORTAL_KB_CATEGORIES.forEach((c) => {
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group).push(c);
  });
  return [...groups.entries()]
    .map(
      ([group, opts]) => `
      <optgroup label="${escapeHtml(group)}">
        ${opts.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}
      </optgroup>`
    )
    .join('');
}

function renderAddModal() {
  return `
    <div class="wizard-overlay" id="portalKbAddModal">
      <div class="wizard-modal kb-modal kb-modal-wide">
        <div class="wizard-header">
          <div>
            <h2><i class="fa-solid fa-plus"></i> Add Knowledge</h2>
            <p class="wizard-sub">Choose a category — the same content appears in Mission Control for your team</p>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-kb-close="portalKbAddModal">✕</button>
        </div>
        <div class="wizard-body">
          <div class="form-group">
            <label for="portalKbCategory">Category *</label>
            <select id="portalKbCategory">${renderCategoryOptions()}</select>
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="title">
            <label for="portalKbTitle">Title *</label>
            <input type="text" id="portalKbTitle" placeholder="e.g. Warranty policy" />
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="name" hidden>
            <label for="portalKbName">Name *</label>
            <input type="text" id="portalKbName" placeholder="Product or service name" />
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="faq" hidden>
            <label for="portalKbQuestion">Question *</label>
            <input type="text" id="portalKbQuestion" placeholder="What are your business hours?" />
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="content">
            <label for="portalKbContent" id="portalKbContentLabel">Content *</label>
            <textarea id="portalKbContent" rows="6" placeholder="Enter training content for your AI…"></textarea>
          </div>
          <div class="form-row portal-kb-field" data-kb-fields="product-meta" hidden>
            <div class="form-group"><label for="portalKbPrice">Price</label><input type="text" id="portalKbPrice" placeholder="R329,900" /></div>
            <div class="form-group"><label for="portalKbWarranty">Warranty</label><input type="text" id="portalKbWarranty" /></div>
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="product-meta" hidden>
            <label for="portalKbSpecs">Specifications</label>
            <textarea id="portalKbSpecs" rows="2"></textarea>
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="product-meta" hidden>
            <label for="portalKbFeatures">Features</label>
            <textarea id="portalKbFeatures" rows="2"></textarea>
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="product-meta" hidden>
            <label for="portalKbImage">Image URL</label>
            <input type="url" id="portalKbImage" placeholder="https://..." />
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="service-meta" hidden>
            <label for="portalKbDesc">Description</label>
            <textarea id="portalKbDesc" rows="3"></textarea>
          </div>
          <div class="form-row portal-kb-field" data-kb-fields="service-meta" hidden>
            <div class="form-group"><label for="portalKbServicePrice">Price</label><input type="text" id="portalKbServicePrice" /></div>
            <div class="form-group"><label for="portalKbWait">Waiting time</label><input type="text" id="portalKbWait" /></div>
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="service-meta" hidden>
            <label for="portalKbReq">Requirements</label>
            <textarea id="portalKbReq" rows="2"></textarea>
          </div>
          <div class="form-group portal-kb-field" data-kb-fields="file" hidden>
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

function syncPortalKbForm(container) {
  const category = container.querySelector('#portalKbCategory')?.value || 'manual';
  const show = (...keys) => keys.includes(category);

  const toggle = (selector, visible) => {
    container.querySelectorAll(selector).forEach((el) => {
      el.hidden = !visible;
    });
  };

  toggle('[data-kb-fields="file"]', show('document'));
  toggle('[data-kb-fields="faq"]', show('faq'));
  toggle('[data-kb-fields="name"]', show('product-structured', 'service-structured'));
  toggle('[data-kb-fields="title"]', !show('faq', 'product-structured', 'service-structured'));
  toggle('[data-kb-fields="content"]', show('manual', 'faq', 'product-narrative', 'service-narrative', 'policy', 'price-list'));
  toggle('[data-kb-fields="product-meta"]', show('product-structured'));
  toggle('[data-kb-fields="service-meta"]', show('service-structured'));

  const contentLabel = container.querySelector('#portalKbContentLabel');
  if (contentLabel) {
    if (category === 'faq') contentLabel.textContent = 'Answer *';
    else if (category === 'price-list') contentLabel.textContent = 'Pricing content *';
    else contentLabel.textContent = 'Content *';
  }
}

async function submitPortalKnowledge(container, companyId, kbId) {
  const category = container.querySelector('#portalKbCategory')?.value || 'manual';
  const uploadedBy = uploaderLabel();
  const base = {
    companyId,
    knowledgeBaseId: kbId,
    status: 'active',
    uploadedBy,
    source: 'company-portal',
  };

  if (category === 'document') {
    const title = container.querySelector('#portalKbTitle')?.value.trim();
    const file = container.querySelector('#portalKbFile')?.files?.[0];
    if (!title || !file) {
      showToast('Title and file are required', 'warning');
      return { error: 'validation' };
    }
    return uploadKnowledgeFile(companyId, { title, type: 'document', file, knowledgeBaseId: kbId });
  }

  if (category === 'faq') {
    const question = container.querySelector('#portalKbQuestion')?.value.trim();
    const answer = container.querySelector('#portalKbContent')?.value.trim();
    if (!question || !answer) {
      showToast('Question and answer are required', 'warning');
      return { error: 'validation' };
    }
    return createKnowledgeDocument(companyId, {
      ...base,
      type: 'faq',
      title: question.slice(0, 80),
      question,
      answer,
      content: answer,
    });
  }

  if (category === 'product-structured') {
    const name = container.querySelector('#portalKbName')?.value.trim();
    if (!name) {
      showToast('Product name is required', 'warning');
      return { error: 'validation' };
    }
    return createKnowledgeDocument(companyId, {
      ...base,
      type: 'product',
      entryMode: 'structured',
      title: name,
      name,
      price: container.querySelector('#portalKbPrice')?.value.trim() || '',
      specifications: container.querySelector('#portalKbSpecs')?.value.trim() || '',
      imageUrl: container.querySelector('#portalKbImage')?.value.trim() || '',
      features: container.querySelector('#portalKbFeatures')?.value.trim() || '',
      warranty: container.querySelector('#portalKbWarranty')?.value.trim() || '',
      content: container.querySelector('#portalKbSpecs')?.value.trim() || name,
    });
  }

  if (category === 'product-narrative') {
    const title = container.querySelector('#portalKbTitle')?.value.trim();
    const content = container.querySelector('#portalKbContent')?.value.trim();
    if (!title || !content) {
      showToast('Title and content are required', 'warning');
      return { error: 'validation' };
    }
    return createKnowledgeDocument(companyId, {
      ...base,
      type: 'product',
      entryMode: 'narrative',
      title,
      name: title,
      content,
    });
  }

  if (category === 'service-structured') {
    const name = container.querySelector('#portalKbName')?.value.trim();
    if (!name) {
      showToast('Service name is required', 'warning');
      return { error: 'validation' };
    }
    const description = container.querySelector('#portalKbDesc')?.value.trim() || '';
    return createKnowledgeDocument(companyId, {
      ...base,
      type: 'service',
      entryMode: 'structured',
      title: name,
      name,
      description,
      content: description || name,
      price: container.querySelector('#portalKbServicePrice')?.value.trim() || '',
      waitingTime: container.querySelector('#portalKbWait')?.value.trim() || '',
      requirements: container.querySelector('#portalKbReq')?.value.trim() || '',
    });
  }

  if (category === 'service-narrative') {
    const title = container.querySelector('#portalKbTitle')?.value.trim();
    const content = container.querySelector('#portalKbContent')?.value.trim();
    if (!title || !content) {
      showToast('Title and content are required', 'warning');
      return { error: 'validation' };
    }
    return createKnowledgeDocument(companyId, {
      ...base,
      type: 'service',
      entryMode: 'narrative',
      title,
      name: title,
      content,
    });
  }

  if (category === 'policy') {
    const title = container.querySelector('#portalKbTitle')?.value.trim();
    const content = container.querySelector('#portalKbContent')?.value.trim();
    if (!title || !content) {
      showToast('Title and policy content are required', 'warning');
      return { error: 'validation' };
    }
    return createKnowledgeDocument(companyId, {
      ...base,
      type: 'policy',
      title,
      content,
      preview: content.slice(0, 120),
    });
  }

  if (category === 'price-list') {
    const title = container.querySelector('#portalKbTitle')?.value.trim();
    const content = container.querySelector('#portalKbContent')?.value.trim();
    if (!title || !content) {
      showToast('Title and pricing content are required', 'warning');
      return { error: 'validation' };
    }
    return createKnowledgeDocument(companyId, {
      ...base,
      type: 'price-list',
      title,
      content,
    });
  }

  const title = container.querySelector('#portalKbTitle')?.value.trim();
  const content = container.querySelector('#portalKbContent')?.value.trim();
  if (!title || !content) {
    showToast('Title and content are required', 'warning');
    return { error: 'validation' };
  }
  return createKnowledgeDocument(companyId, {
    ...base,
    type: 'manual',
    title,
    content,
  });
}

function resetPortalKbForm(container) {
  container.querySelector('#portalKbCategory').value = 'manual';
  ['#portalKbTitle', '#portalKbName', '#portalKbQuestion', '#portalKbContent', '#portalKbPrice', '#portalKbWarranty', '#portalKbSpecs', '#portalKbFeatures', '#portalKbImage', '#portalKbDesc', '#portalKbServicePrice', '#portalKbWait', '#portalKbReq'].forEach((sel) => {
    const el = container.querySelector(sel);
    if (el) el.value = '';
  });
  const file = container.querySelector('#portalKbFile');
  if (file) file.value = '';
  syncPortalKbForm(container);
}

function bindAddKnowledge(container, companyId, kbId) {
  const role = state.profile?.role || state.user?.role;
  if (!canAddKnowledge(role)) return;

  const openAdd = () => {
    resetPortalKbForm(container);
    openModal(container, 'portalKbAddModal');
  };

  container.querySelector('#portalKbAddBtn')?.addEventListener('click', openAdd);
  container.querySelector('#portalKbAddEmptyBtn')?.addEventListener('click', openAdd);

  container.querySelectorAll('[data-kb-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(container, btn.dataset.kbClose));
  });

  container.querySelector('#portalKbAddModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'portalKbAddModal') closeModal(container, 'portalKbAddModal');
  });

  container.querySelector('#portalKbCategory')?.addEventListener('change', () => syncPortalKbForm(container));
  syncPortalKbForm(container);

  container.querySelector('#portalKbSubmit')?.addEventListener('click', async () => {
    const submitBtn = container.querySelector('#portalKbSubmit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await submitPortalKnowledge(container, companyId, kbId);
      if (result?.error === 'validation') return;
      if (result?.error) {
        showToast(result.error, 'error');
        return;
      }
      closeModal(container, 'portalKbAddModal');
      clearCacheKey(`hub:${companyId}`);
      showToast('Knowledge saved — visible in Mission Control and Sarah', 'success');
      await renderKnowledge(container);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function groupItemsBySection(items) {
  const grouped = Object.fromEntries(PORTAL_KB_SECTIONS.map((s) => [s.id, []]));
  items.forEach((item) => {
    const section = knowledgeTypeToSection(item.type);
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(item);
  });
  return grouped;
}

function renderSectionBlock(section, sectionItems, kbId) {
  if (!sectionItems.length) return '';
  return `
    <div class="portal-kb-section" style="margin-bottom:28px;">
      <h3 class="portal-kb-section-title"><i class="fa-solid ${section.icon}"></i> ${escapeHtml(section.label)}</h3>
      <div class="table-container">
        <table class="org-table">
          <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Source</th><th>Updated</th></tr></thead>
          <tbody>
            ${sectionItems
              .map(
                (item) => `
              <tr>
                <td><strong>${escapeHtml(item.title || item.name || '—')}</strong></td>
                <td><span class="type-badge">${escapeHtml(item.type || 'manual')}${item.entryMode ? ` · ${escapeHtml(item.entryMode)}` : ''}</span></td>
                <td>${statusBadge(item.status || 'active')}</td>
                <td>${escapeHtml(item.source === 'company-portal' ? 'Portal' : item.uploadedBy || '—')}</td>
                <td>${escapeHtml(item.updatedAt?.slice?.(0, 10) || item.createdAt?.slice?.(0, 10) || '—')}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`;
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
  const kbId =
    apiRes.data?.knowledgeBaseId ||
    apiRes.knowledgeBaseId ||
    resolveAuthoritativeKnowledgeBaseId({ company: state.company, existingItems: items }) ||
    state.company?.knowledgeBaseId ||
    `kb-${companyId}`;

  const grouped = groupItemsBySection(items);

  const addBtnHtml = allowAdd
    ? `<button class="btn btn-primary btn-sm" type="button" id="portalKbAddBtn"><i class="fa-solid fa-plus"></i> Add Content</button>`
    : '';

  const sectionsHtml = items.length
    ? PORTAL_KB_SECTIONS.map((section) => renderSectionBlock(section, grouped[section.id] || [], kbId)).join('')
    : `<div class="profile-card" style="padding:32px;text-align:center;">
        ${renderEmptyState({
          message: 'No knowledge items yet.',
          actionHtml: allowAdd
            ? '<button class="btn btn-primary btn-sm" type="button" id="portalKbAddEmptyBtn">Add Content</button>'
            : '',
        })}
      </div>`;

  container.innerHTML = `
    ${pageHeader(
      'Knowledge Base',
      `Same knowledge as Mission Control — scoped to ${escapeHtml(state.company?.name || 'your company')} (${escapeHtml(kbId)}).`,
      addBtnHtml
    )}
    ${!usingApi && useDemo ? `<div class="portal-limit-banner"><i class="fa-solid fa-circle-info"></i> Showing demo knowledge — add real content with Add Content.</div>` : ''}
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:24px;">
      <div class="kpi-card purple"><div class="kpi-content"><div class="kpi-label">Total Items</div><div class="kpi-value">${items.length}</div></div></div>
      <div class="kpi-card green"><div class="kpi-content"><div class="kpi-label">Active</div><div class="kpi-value">${items.filter((i) => (i.status || 'active') === 'active').length}</div></div></div>
      <div class="kpi-card blue"><div class="kpi-content"><div class="kpi-label">Categories</div><div class="kpi-value">${PORTAL_KB_SECTIONS.filter((s) => (grouped[s.id] || []).length).length}</div></div></div>
    </div>
    ${sectionsHtml}
    ${allowAdd ? renderAddModal() : ''}
  `;

  if (allowAdd) {
    bindAddKnowledge(container, companyId, kbId);
  }
}
