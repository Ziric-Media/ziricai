import { state, getSelectedCompany, setState } from '../state.js';
import {
  pageHeader,
  loadingState,
  showToast,
  escapeHtml,
} from '../ui.js';
import { withTimeout } from '../utils.js';
import {
  listKnowledge,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  listTrainingHistory,
  computeKnowledgeStats,
  createTrainingJob,
  advanceTrainingJob,
  loadTrainingQueue,
} from '../services/knowledge.js';
import { uploadKnowledgeFile, addKnowledgeEntry } from '../api.js';
import { DEMO_COMPANIES } from '../demo-data.js';
import {
  renderKbStats,
  renderKbSidebar,
  renderTrainingQueue,
  renderSectionContent,
  sectionTitle,
} from './knowledge-ui.js';

let activeSection = 'documents';

export async function renderKnowledge(container) {
  container.innerHTML = loadingState('Loading AI Training Center...');

  const companyId = state.selectedCompanyId || state.companies[0]?.id || 'demo-central-motors';
  const company = getSelectedCompany() || state.companies.find((c) => c.id === companyId) || DEMO_COMPANIES[0];

  const [knowledgeRes, historyRes] = await Promise.all([
    withTimeout(listKnowledge(companyId)),
    withTimeout(listTrainingHistory(companyId)),
  ]);

  const items = knowledgeRes.items || [];
  const history = historyRes.items || [];
  const stats = computeKnowledgeStats(items);
  const queue = loadTrainingQueue().filter((j) => j.companyId === companyId);

  setState({ knowledge: items });

  container.innerHTML = buildPageMarkup({
    company,
    companyId,
    items,
    history,
    stats,
    queue,
    isDemo: knowledgeRes.isDemo,
  });

  bindEvents(container, { companyId, company, items });
  resumeActiveJobs(container, companyId, company);
}

function buildPageMarkup({ company, companyId, items, history, stats, queue, isDemo }) {
  return `
    ${pageHeader(
      'Knowledge Base',
      `AI Training Center — ${escapeHtml(company?.name || 'Company')} knowledge brain`,
      `<div class="kb-header-actions">
        <button class="btn btn-secondary btn-sm" type="button" id="kbUploadBtn"><i class="fa-solid fa-upload"></i> Upload Knowledge</button>
        <button class="btn btn-secondary btn-sm" type="button" id="kbCreateFaqBtn"><i class="fa-solid fa-plus"></i> Create FAQ</button>
        <button class="btn btn-secondary btn-sm" type="button" id="kbImportWebBtn"><i class="fa-solid fa-globe"></i> Import Website</button>
        <button class="btn btn-primary btn-sm" type="button" id="kbManualBtn"><i class="fa-solid fa-book"></i> Add Manual Knowledge</button>
      </div>`
    )}
    ${isDemo ? `<div class="demo-banner"><i class="fa-solid fa-flask"></i> Showing demo data — Firestore unavailable or empty. Changes persist locally.</div>` : ''}

    ${renderKbStats(stats)}

    <div class="kb-layout">
      ${renderKbSidebar(activeSection)}
      <div class="kb-main">
        <div class="kb-section-header">
          <h2><i class="fa-solid fa-brain"></i> ${escapeHtml(sectionTitle(activeSection))}</h2>
        </div>
        <div id="kbSectionContent">
          ${renderSectionContent(activeSection, items, history, company)}
        </div>
      </div>
      <div id="kbTrainingQueue">
        ${renderTrainingQueue(queue)}
      </div>
    </div>

    ${buildModals(companyId, company)}
  `;
}

function buildModals(companyId, company) {
  return `
    <!-- Upload Modal -->
    <div class="wizard-overlay" id="kbUploadModal">
      <div class="wizard-modal kb-modal">
        <div class="wizard-header">
          <div><h2><i class="fa-solid fa-upload"></i> Upload Knowledge</h2><p class="wizard-sub">PDF, DOCX, TXT, CSV, Excel, PowerPoint</p></div>
          <button class="btn btn-secondary btn-sm kb-modal-close" type="button" data-modal="kbUploadModal">✕</button>
        </div>
        <div class="wizard-body">
          <div class="form-group"><label>Title *</label><input type="text" id="kbUploadTitle" placeholder="e.g. Vehicle Catalogue 2025" /></div>
          <div class="kb-upload-zone" id="kbUploadZone">
            <input type="file" id="kbUploadFile" accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx" hidden />
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <p>Drag & drop or click to browse</p>
            <small>PDF, DOCX, TXT, CSV, Excel, PowerPoint — max 20 MB</small>
            <div class="kb-upload-filename" id="kbUploadFilename"></div>
          </div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary kb-modal-close" type="button" data-modal="kbUploadModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="kbUploadSubmit"><i class="fa-solid fa-upload"></i> Upload & Train</button>
        </div>
      </div>
    </div>

    <!-- FAQ Modal -->
    <div class="wizard-overlay" id="kbFaqModal">
      <div class="wizard-modal kb-modal">
        <div class="wizard-header">
          <div><h2 id="kbFaqModalTitle"><i class="fa-solid fa-circle-question"></i> Create FAQ</h2></div>
          <button class="btn btn-secondary btn-sm kb-modal-close" type="button" data-modal="kbFaqModal">✕</button>
        </div>
        <div class="wizard-body">
          <input type="hidden" id="kbFaqEditId" value="" />
          <div class="form-group"><label>Question *</label><input type="text" id="kbFaqQuestion" placeholder="What are your business hours?" /></div>
          <div class="form-group"><label>Answer *</label><textarea id="kbFaqAnswer" rows="5" placeholder="We operate Monday to Friday from 8:00 AM to 5:00 PM."></textarea></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary kb-modal-close" type="button" data-modal="kbFaqModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="kbFaqSubmit"><i class="fa-solid fa-check"></i> Save & Train</button>
        </div>
      </div>
    </div>

    <!-- Manual Knowledge Modal -->
    <div class="wizard-overlay" id="kbManualModal">
      <div class="wizard-modal kb-modal kb-modal-wide">
        <div class="wizard-header">
          <div><h2><i class="fa-solid fa-book"></i> Add Manual Knowledge</h2><p class="wizard-sub">Instructions and rules your AI employee should follow</p></div>
          <button class="btn btn-secondary btn-sm kb-modal-close" type="button" data-modal="kbManualModal">✕</button>
        </div>
        <div class="wizard-body">
          <div class="form-group"><label>Title *</label><input type="text" id="kbManualTitle" placeholder="e.g. Finance Collection Rules" /></div>
          <div class="form-group">
            <label>Knowledge Content *</label>
            <div class="kb-rich-editor">
              <div class="kb-editor-toolbar">
                <button type="button" class="kb-toolbar-btn" data-cmd="bold" title="Bold"><i class="fa-solid fa-bold"></i></button>
                <button type="button" class="kb-toolbar-btn" data-cmd="italic" title="Italic"><i class="fa-solid fa-italic"></i></button>
                <button type="button" class="kb-toolbar-btn" data-cmd="insertUnorderedList" title="List"><i class="fa-solid fa-list-ul"></i></button>
              </div>
              <div class="kb-editor-area" id="kbManualContent" contenteditable="true" data-placeholder="Enter training instructions for your AI employee…"></div>
            </div>
          </div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary kb-modal-close" type="button" data-modal="kbManualModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="kbManualSubmit"><i class="fa-solid fa-brain"></i> Save & Train AI</button>
        </div>
      </div>
    </div>

    <!-- Product Modal -->
    <div class="wizard-overlay" id="kbProductModal">
      <div class="wizard-modal kb-modal kb-modal-wide">
        <div class="wizard-header">
          <div><h2 id="kbProductModalTitle"><i class="fa-solid fa-box"></i> Add Product</h2></div>
          <button class="btn btn-secondary btn-sm kb-modal-close" type="button" data-modal="kbProductModal">✕</button>
        </div>
        <div class="wizard-body">
          <input type="hidden" id="kbProductEditId" value="" />
          <div class="form-row">
            <div class="form-group"><label>Name *</label><input type="text" id="kbProductName" /></div>
            <div class="form-group"><label>Price</label><input type="text" id="kbProductPrice" placeholder="R329,900" /></div>
          </div>
          <div class="form-group"><label>Specifications</label><textarea id="kbProductSpecs" rows="2"></textarea></div>
          <div class="form-group"><label>Image URL</label><input type="url" id="kbProductImage" placeholder="https://..." /></div>
          <div class="form-group"><label>Features</label><textarea id="kbProductFeatures" rows="2"></textarea></div>
          <div class="form-group"><label>Warranty</label><input type="text" id="kbProductWarranty" /></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary kb-modal-close" type="button" data-modal="kbProductModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="kbProductSubmit">Save Product</button>
        </div>
      </div>
    </div>

    <!-- Service Modal -->
    <div class="wizard-overlay" id="kbServiceModal">
      <div class="wizard-modal kb-modal">
        <div class="wizard-header">
          <div><h2 id="kbServiceModalTitle"><i class="fa-solid fa-briefcase"></i> Add Service</h2></div>
          <button class="btn btn-secondary btn-sm kb-modal-close" type="button" data-modal="kbServiceModal">✕</button>
        </div>
        <div class="wizard-body">
          <input type="hidden" id="kbServiceEditId" value="" />
          <div class="form-group"><label>Service Name *</label><input type="text" id="kbServiceName" /></div>
          <div class="form-group"><label>Description</label><textarea id="kbServiceDesc" rows="3"></textarea></div>
          <div class="form-row">
            <div class="form-group"><label>Price</label><input type="text" id="kbServicePrice" /></div>
            <div class="form-group"><label>Waiting Time</label><input type="text" id="kbServiceWait" /></div>
          </div>
          <div class="form-group"><label>Requirements</label><textarea id="kbServiceReq" rows="2"></textarea></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary kb-modal-close" type="button" data-modal="kbServiceModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="kbServiceSubmit">Save Service</button>
        </div>
      </div>
    </div>

    <!-- Policy Modal -->
    <div class="wizard-overlay" id="kbPolicyModal">
      <div class="wizard-modal kb-modal kb-modal-wide">
        <div class="wizard-header">
          <div><h2 id="kbPolicyModalTitle"><i class="fa-solid fa-shield-halved"></i> Edit Policy</h2></div>
          <button class="btn btn-secondary btn-sm kb-modal-close" type="button" data-modal="kbPolicyModal">✕</button>
        </div>
        <div class="wizard-body">
          <input type="hidden" id="kbPolicyEditId" value="" />
          <div class="form-group"><label>Policy Title *</label><input type="text" id="kbPolicyTitle" /></div>
          <div class="form-group"><label>Policy Content *</label><textarea id="kbPolicyContent" rows="8"></textarea></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary kb-modal-close" type="button" data-modal="kbPolicyModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="kbPolicySubmit">Save Policy</button>
        </div>
      </div>
    </div>
  `;
}

function bindEvents(container, { companyId, company, items }) {
  const backdrop = document.getElementById('overlay');
  const openModal = (id) => {
    container.querySelector(`#${id}`)?.classList.add('open');
    backdrop?.classList.add('open');
  };
  const closeModal = (id) => {
    container.querySelector(`#${id}`)?.classList.remove('open');
    if (!container.querySelector('.wizard-overlay.open')) backdrop?.classList.remove('open');
  };

  container.querySelectorAll('.kb-modal-close').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });

  /* Header actions */
  container.querySelector('#kbUploadBtn')?.addEventListener('click', () => openModal('kbUploadModal'));
  container.querySelector('#kbCreateFaqBtn')?.addEventListener('click', () => {
    resetFaqForm(container);
    openModal('kbFaqModal');
  });
  container.querySelector('#kbImportWebBtn')?.addEventListener('click', () => {
    switchSection(container, 'website', companyId, company);
  });
  container.querySelector('#kbManualBtn')?.addEventListener('click', () => openModal('kbManualModal'));

  /* Sidebar navigation */
  container.querySelectorAll('[data-kb-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchSection(container, btn.dataset.kbSection, companyId, company);
    });
  });

  /* Empty state shortcuts */
  container.querySelector('#kbUploadFromEmpty')?.addEventListener('click', () => openModal('kbUploadModal'));
  container.querySelector('#kbFaqFromEmpty')?.addEventListener('click', () => {
    resetFaqForm(container);
    openModal('kbFaqModal');
  });

  /* Upload zone */
  const uploadZone = container.querySelector('#kbUploadZone');
  const uploadFile = container.querySelector('#kbUploadFile');
  uploadZone?.addEventListener('click', () => uploadFile?.click());
  uploadZone?.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) {
      uploadFile.files = e.dataTransfer.files;
      showSelectedFile(container, e.dataTransfer.files[0]);
    }
  });
  uploadFile?.addEventListener('change', () => {
    if (uploadFile.files[0]) showSelectedFile(container, uploadFile.files[0]);
  });

  container.querySelector('#kbUploadSubmit')?.addEventListener('click', async () => {
    const title = container.querySelector('#kbUploadTitle').value.trim();
    const file = uploadFile?.files[0];
    if (!title || !file) {
      showToast('Title and file are required', 'warning');
      return;
    }
    closeModal('kbUploadModal');
    const ext = file.name.split('.').pop().toLowerCase();
    const typeMap = { pdf: 'document', docx: 'document', doc: 'document', txt: 'document', csv: 'document', xls: 'document', xlsx: 'document', ppt: 'document', pptx: 'document' };
    const job = createTrainingJob({ companyId, title: file.name, type: 'document' });
    refreshQueuePanel(container, companyId);

    let result = await uploadKnowledgeFile({ companyId, title, type: typeMap[ext] || 'document', file });
    if (result.error) {
      result = await createKnowledge({
        companyId,
        type: 'document',
        title,
        fileName: file.name,
        pages: Math.floor(Math.random() * 40) + 5,
        status: 'training',
        uploadedBy: state.profile?.displayName || state.user?.email || 'Admin',
        chunks: Math.floor(Math.random() * 100) + 20,
        lastTrained: new Date().toISOString(),
      });
    }
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    showToast(`"${file.name}" uploaded — training started`, 'success');
    animateJob(container, job.id, companyId, company);
  });

  /* FAQ */
  container.querySelector('#kbFaqSubmit')?.addEventListener('click', async () => {
    const editId = container.querySelector('#kbFaqEditId').value;
    const question = container.querySelector('#kbFaqQuestion').value.trim();
    const answer = container.querySelector('#kbFaqAnswer').value.trim();
    if (!question || !answer) {
      showToast('Question and answer are required', 'warning');
      return;
    }
    const payload = {
      companyId,
      type: 'faq',
      title: question.slice(0, 60),
      question,
      answer,
      status: 'trained',
      uploadedBy: state.profile?.displayName || 'Admin',
      lastTrained: new Date().toISOString(),
      chunks: 2,
    };
    const result = editId
      ? await updateKnowledge(editId, payload)
      : await createKnowledge(payload);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    closeModal('kbFaqModal');
    showToast(editId ? 'FAQ updated' : 'FAQ created and trained', 'success');
    renderKnowledge(container);
  });

  /* Manual knowledge */
  container.querySelectorAll('.kb-toolbar-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
    });
  });

  container.querySelector('#kbManualSubmit')?.addEventListener('click', async () => {
    const title = container.querySelector('#kbManualTitle').value.trim();
    const contentEl = container.querySelector('#kbManualContent');
    const content = contentEl?.innerText?.trim() || '';
    if (!title || !content) {
      showToast('Title and content are required', 'warning');
      return;
    }
    const result = await createKnowledge({
      companyId,
      type: 'manual',
      title,
      content,
      status: 'trained',
      uploadedBy: state.profile?.displayName || 'Admin',
      lastTrained: new Date().toISOString(),
      chunks: Math.ceil(content.length / 200),
    });
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    const job = createTrainingJob({ companyId, title, type: 'manual' });
    closeModal('kbManualModal');
    showToast('Manual knowledge saved — training AI…', 'success');
    animateJob(container, job.id, companyId, company);
    renderKnowledge(container);
  });

  /* Website import */
  container.querySelector('#kbImportWebsiteBtn')?.addEventListener('click', async () => {
    const url = container.querySelector('#kbWebsiteUrl')?.value.trim();
    if (!url) {
      showToast('Enter a website URL', 'warning');
      return;
    }
    try {
      new URL(url);
    } catch {
      showToast('Enter a valid URL (https://...)', 'warning');
      return;
    }
    const hostname = new URL(url).hostname;
    const job = createTrainingJob({ companyId, title: hostname, type: 'website' });
    refreshQueuePanel(container, companyId);

    let result = await addKnowledgeEntry({ companyId, title: hostname, type: 'website', url });
    if (result.error) {
      result = await createKnowledge({
        companyId,
        type: 'website',
        title: hostname,
        url,
        pagesScraped: Math.floor(Math.random() * 30) + 10,
        status: 'training',
        uploadedBy: state.profile?.displayName || 'Admin',
        lastTrained: new Date().toISOString(),
        chunks: Math.floor(Math.random() * 80) + 20,
      });
    }
    showToast(`Importing ${hostname} — scraping pages…`, 'success');
    animateJob(container, job.id, companyId, company, () => {
      showToast(`Website import complete — ${hostname} trained`, 'success');
      renderKnowledge(container);
    });
  });

  /* Product / Service / Policy saves */
  bindEditModals(container, companyId, items, { openModal, closeModal });

  /* Delete & retrain */
  container.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.kb-delete');
    if (deleteBtn) {
      if (!confirm('Delete this knowledge item?')) return;
      const result = await deleteKnowledge(deleteBtn.dataset.id);
      if (result.error) showToast(result.error, 'error');
      else {
        showToast('Deleted', 'success');
        renderKnowledge(container);
      }
      return;
    }

    const retrainBtn = e.target.closest('.kb-retrain');
    if (retrainBtn) {
      const title = retrainBtn.dataset.title || 'Item';
      const job = createTrainingJob({ companyId, title, type: 'document' });
      refreshQueuePanel(container, companyId);
      showToast(`Retraining "${title}"…`, 'info');
      animateJob(container, job.id, companyId, company, () => {
        showToast(`"${title}" retrained successfully`, 'success');
        renderKnowledge(container);
      });
    }
  });
}

function bindEditModals(container, companyId, items, { openModal, closeModal }) {
  container.addEventListener('click', (e) => {
    const faqEdit = e.target.closest('.kb-edit-faq');
    if (faqEdit) {
      const item = items.find((i) => i.id === faqEdit.dataset.id);
      if (!item) return;
      container.querySelector('#kbFaqEditId').value = item.id;
      container.querySelector('#kbFaqQuestion').value = item.question || '';
      container.querySelector('#kbFaqAnswer').value = item.answer || '';
      container.querySelector('#kbFaqModalTitle').innerHTML = '<i class="fa-solid fa-pen"></i> Edit FAQ';
      openModal('kbFaqModal');
      return;
    }

    const prodEdit = e.target.closest('.kb-edit-product');
    if (prodEdit) {
      const item = items.find((i) => i.id === prodEdit.dataset.id);
      if (!item) return;
      fillProductForm(container, item);
      openModal('kbProductModal');
      return;
    }

    const svcEdit = e.target.closest('.kb-edit-service');
    if (svcEdit) {
      const item = items.find((i) => i.id === svcEdit.dataset.id);
      if (!item) return;
      fillServiceForm(container, item);
      openModal('kbServiceModal');
      return;
    }

    const polEdit = e.target.closest('.kb-edit-policy');
    if (polEdit) {
      const item = items.find((i) => i.id === polEdit.dataset.id);
      if (!item) return;
      container.querySelector('#kbPolicyEditId').value = item.id;
      container.querySelector('#kbPolicyTitle').value = item.title || '';
      container.querySelector('#kbPolicyContent').value = item.content || '';
      openModal('kbPolicyModal');
    }
  });

  container.querySelector('#kbProductSubmit')?.addEventListener('click', async () => {
    const editId = container.querySelector('#kbProductEditId').value;
    const name = container.querySelector('#kbProductName').value.trim();
    if (!name) { showToast('Product name is required', 'warning'); return; }
    const payload = {
      companyId,
      type: 'product',
      title: name,
      name,
      price: container.querySelector('#kbProductPrice').value.trim(),
      specifications: container.querySelector('#kbProductSpecs').value.trim(),
      imageUrl: container.querySelector('#kbProductImage').value.trim(),
      features: container.querySelector('#kbProductFeatures').value.trim(),
      warranty: container.querySelector('#kbProductWarranty').value.trim(),
      status: 'trained',
      uploadedBy: state.profile?.displayName || 'Admin',
      lastTrained: new Date().toISOString(),
      chunks: 4,
    };
    const result = editId ? await updateKnowledge(editId, payload) : await createKnowledge(payload);
    if (result.error) { showToast(result.error, 'error'); return; }
    closeModal('kbProductModal');
    showToast(editId ? 'Product updated' : 'Product added', 'success');
    renderKnowledge(container);
  });

  container.querySelector('#kbServiceSubmit')?.addEventListener('click', async () => {
    const editId = container.querySelector('#kbServiceEditId').value;
    const name = container.querySelector('#kbServiceName').value.trim();
    if (!name) { showToast('Service name is required', 'warning'); return; }
    const payload = {
      companyId,
      type: 'service',
      title: name,
      name,
      description: container.querySelector('#kbServiceDesc').value.trim(),
      price: container.querySelector('#kbServicePrice').value.trim(),
      waitingTime: container.querySelector('#kbServiceWait').value.trim(),
      requirements: container.querySelector('#kbServiceReq').value.trim(),
      status: 'trained',
      uploadedBy: state.profile?.displayName || 'Admin',
      lastTrained: new Date().toISOString(),
      chunks: 3,
    };
    const result = editId ? await updateKnowledge(editId, payload) : await createKnowledge(payload);
    if (result.error) { showToast(result.error, 'error'); return; }
    closeModal('kbServiceModal');
    showToast(editId ? 'Service updated' : 'Service added', 'success');
    renderKnowledge(container);
  });

  container.querySelector('#kbPolicySubmit')?.addEventListener('click', async () => {
    const editId = container.querySelector('#kbPolicyEditId').value;
    const title = container.querySelector('#kbPolicyTitle').value.trim();
    const content = container.querySelector('#kbPolicyContent').value.trim();
    if (!title || !content) { showToast('Title and content are required', 'warning'); return; }
    const payload = {
      companyId,
      type: 'policy',
      title,
      content,
      preview: content.slice(0, 120),
      status: 'trained',
      uploadedBy: state.profile?.displayName || 'Admin',
      lastTrained: new Date().toISOString(),
      chunks: 3,
    };
    const result = await updateKnowledge(editId, payload);
    if (result.error) { showToast(result.error, 'error'); return; }
    closeModal('kbPolicyModal');
    showToast('Policy updated', 'success');
    renderKnowledge(container);
  });
}

function fillProductForm(container, item) {
  container.querySelector('#kbProductEditId').value = item.id;
  container.querySelector('#kbProductName').value = item.name || '';
  container.querySelector('#kbProductPrice').value = item.price || '';
  container.querySelector('#kbProductSpecs').value = item.specifications || '';
  container.querySelector('#kbProductImage').value = item.imageUrl || '';
  container.querySelector('#kbProductFeatures').value = item.features || '';
  container.querySelector('#kbProductWarranty').value = item.warranty || '';
  container.querySelector('#kbProductModalTitle').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Product';
}

function fillServiceForm(container, item) {
  container.querySelector('#kbServiceEditId').value = item.id;
  container.querySelector('#kbServiceName').value = item.name || '';
  container.querySelector('#kbServiceDesc').value = item.description || '';
  container.querySelector('#kbServicePrice').value = item.price || '';
  container.querySelector('#kbServiceWait').value = item.waitingTime || '';
  container.querySelector('#kbServiceReq').value = item.requirements || '';
  container.querySelector('#kbServiceModalTitle').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Service';
}

function resetFaqForm(container) {
  container.querySelector('#kbFaqEditId').value = '';
  container.querySelector('#kbFaqQuestion').value = '';
  container.querySelector('#kbFaqAnswer').value = '';
  container.querySelector('#kbFaqModalTitle').innerHTML = '<i class="fa-solid fa-circle-question"></i> Create FAQ';
}

function showSelectedFile(container, file) {
  const el = container.querySelector('#kbUploadFilename');
  if (el) el.textContent = file.name;
  const titleInput = container.querySelector('#kbUploadTitle');
  if (titleInput && !titleInput.value) {
    titleInput.value = file.name.replace(/\.[^.]+$/, '');
  }
}

async function switchSection(container, section, companyId, company) {
  activeSection = section;
  container.querySelectorAll('.kb-nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.kbSection === section);
  });
  const header = container.querySelector('.kb-section-header h2');
  if (header) header.innerHTML = `<i class="fa-solid fa-brain"></i> ${sectionTitle(section)}`;

  const [knowledgeRes, historyRes] = await Promise.all([
    listKnowledge(companyId),
    listTrainingHistory(companyId),
  ]);
  const content = container.querySelector('#kbSectionContent');
  if (content) {
    content.innerHTML = renderSectionContent(section, knowledgeRes.items || [], historyRes.items || [], company);
  }
}

function refreshQueuePanel(container, companyId) {
  const queue = loadTrainingQueue().filter((j) => j.companyId === companyId);
  const panel = container.querySelector('#kbTrainingQueue');
  if (panel) panel.innerHTML = renderTrainingQueue(queue);
}

function animateJob(container, jobId, companyId, company, onComplete) {
  const stepDelay = 1200;
  let step = 0;
  const tick = () => {
    advanceTrainingJob(jobId);
    refreshQueuePanel(container, companyId);
    step += 1;
    const job = loadTrainingQueue().find((j) => j.id === jobId);
    if (job?.status === 'completed') {
      onComplete?.();
      return;
    }
    if (step < 6) setTimeout(tick, stepDelay);
  };
  setTimeout(tick, stepDelay);
}

function resumeActiveJobs(container, companyId, company) {
  const active = loadTrainingQueue().filter((j) => j.companyId === companyId && j.status !== 'completed');
  active.forEach((job) => animateJob(container, job.id, companyId, company));
}
