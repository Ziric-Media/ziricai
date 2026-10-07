import { escapeHtml, emptyState, formatDate, formatNumber } from '../ui.js';

export const KB_SECTIONS = [
  { id: 'documents', label: 'Documents', icon: 'fa-file-lines' },
  { id: 'faqs', label: 'FAQs', icon: 'fa-circle-question' },
  { id: 'products', label: 'Products', icon: 'fa-box' },
  { id: 'services', label: 'Services', icon: 'fa-briefcase' },
  { id: 'policies', label: 'Policies', icon: 'fa-shield-halved' },
  { id: 'price-lists', label: 'Price Lists', icon: 'fa-tags' },
  { id: 'website', label: 'Website Imports', icon: 'fa-globe' },
  { id: 'training-history', label: 'Training History', icon: 'fa-clock-rotate-left' },
];

const STEP_LABELS = {
  uploading: 'Uploading…',
  extracting: 'Extracting Text…',
  chunking: 'Chunking…',
  embedding: 'Embedding…',
  training: 'Training AI…',
  completed: 'Completed',
};

export function trainingStepLabel(step) {
  return STEP_LABELS[step] || step;
}

export function knowledgeStatusBadge(status) {
  const normalized = String(status || 'pending').toLowerCase();
  let cls = 'pending';
  if (['trained', 'active', 'completed'].includes(normalized)) cls = 'active';
  else if (['failed', 'error'].includes(normalized)) cls = 'suspended';
  else if (['processing', 'training', 'embedding', 'chunking', 'extracting', 'uploading'].includes(normalized)) cls = 'trial';
  const labels = {
    trained: 'Trained',
    pending: 'Pending',
    processing: 'Processing',
    uploading: 'Uploading',
    extracting: 'Extracting',
    chunking: 'Chunking',
    embedding: 'Embedding',
    training: 'Training',
    completed: 'Completed',
    failed: 'Failed',
  };
  return `<span class="status-badge ${cls}">${escapeHtml(labels[normalized] || status || 'Pending')}</span>`;
}

export function renderKbStats(stats) {
  return `
    <div class="kpi-grid kb-kpi-grid">
      <div class="kpi-card">
        <div class="header">
          <div><div class="label">Documents</div><div class="value">${formatNumber(stats.documents)}</div></div>
          <div class="icon-wrapper purple"><i class="fa-solid fa-file-pdf"></i></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="header">
          <div><div class="label">FAQs</div><div class="value">${formatNumber(stats.faqs)}</div></div>
          <div class="icon-wrapper blue"><i class="fa-solid fa-circle-question"></i></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="header">
          <div><div class="label">Web Pages</div><div class="value">${formatNumber(stats.webPages)}</div></div>
          <div class="icon-wrapper green"><i class="fa-solid fa-globe"></i></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="header">
          <div><div class="label">Knowledge Chunks</div><div class="value">${formatNumber(stats.chunks)}</div></div>
          <div class="icon-wrapper yellow"><i class="fa-solid fa-puzzle-piece"></i></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="header">
          <div><div class="label">Last Training</div><div class="value kb-kpi-date">${escapeHtml(formatDate(stats.lastTrainingDate))}</div></div>
          <div class="icon-wrapper purple"><i class="fa-solid fa-brain"></i></div>
        </div>
      </div>
    </div>
  `;
}

export function renderKbSidebar(activeSection) {
  return `
    <nav class="kb-sidebar" aria-label="Knowledge sections">
      ${KB_SECTIONS.map((s) => `
        <button class="kb-nav-item ${s.id === activeSection ? 'active' : ''}" type="button" data-kb-section="${escapeHtml(s.id)}">
          <i class="fa-solid ${s.icon}"></i>
          <span>${escapeHtml(s.label)}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

export function renderTrainingQueue(jobs) {
  const activeJobs = jobs.filter((j) => j.status !== 'completed');
  if (!activeJobs.length) {
    return `
      <div class="kb-training-queue">
        <div class="kb-queue-header">
          <h3><i class="fa-solid fa-bolt"></i> Training Queue</h3>
        </div>
        <div class="kb-queue-idle">
          <i class="fa-solid fa-check-circle"></i>
          <p>All caught up — no active training jobs</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="kb-training-queue">
      <div class="kb-queue-header">
        <h3><i class="fa-solid fa-bolt"></i> Training Queue</h3>
        <span class="kb-queue-count">${activeJobs.length} active</span>
      </div>
      ${activeJobs.map((job) => renderTrainingJob(job)).join('')}
    </div>
  `;
}

function renderTrainingJob(job) {
  const stepIndex = job.currentStep ?? 0;
  const steps = job.steps || [];
  return `
    <div class="kb-queue-job" data-job-id="${escapeHtml(job.id)}">
      <div class="kb-queue-job-title">${escapeHtml(job.title)}</div>
      <div class="kb-queue-steps">
        ${steps.map((step, i) => `
          <div class="kb-queue-step ${i < stepIndex ? 'done' : ''} ${i === stepIndex ? 'active' : ''} ${i > stepIndex ? 'pending' : ''}">
            <span class="kb-step-dot"></span>
            <span class="kb-step-label">${escapeHtml(trainingStepLabel(step))}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderDocumentsSection(items) {
  if (!items.length) {
    return emptyState('No documents uploaded yet.', '<button class="btn btn-primary btn-sm" type="button" id="kbUploadFromEmpty"><i class="fa-solid fa-upload"></i> Upload Knowledge</button>');
  }
  return `
    <div class="table-container">
      <table class="org-table kb-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Pages</th>
            <th>Status</th>
            <th>Uploaded By</th>
            <th>Last Trained</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          ${items.map((doc) => `
            <tr>
              <td>
                <div class="kb-file-cell">
                  <i class="fa-solid fa-file-pdf kb-file-icon"></i>
                  <div>
                    <div class="kb-file-name">${escapeHtml(doc.fileName || doc.title)}</div>
                    <div class="kb-file-meta">${formatNumber(doc.chunks || 0)} chunks</div>
                  </div>
                </div>
              </td>
              <td>${doc.pages || '—'}</td>
              <td>${knowledgeStatusBadge(doc.status)}</td>
              <td>${escapeHtml(doc.uploadedBy || '—')}</td>
              <td>${escapeHtml(formatDate(doc.lastTrained))}</td>
              <td class="col-actions">
                <button class="btn btn-secondary btn-sm kb-retrain" type="button" data-id="${escapeHtml(doc.id)}" data-title="${escapeHtml(doc.fileName || doc.title)}" title="Retrain">
                  <i class="fa-solid fa-rotate"></i>
                </button>
                <button class="btn btn-secondary btn-sm kb-delete" type="button" data-id="${escapeHtml(doc.id)}" title="Delete">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderFaqsSection(items) {
  if (!items.length) {
    return emptyState(
      'No FAQs yet. Create your first FAQ to train your AI employee.',
      '<button class="btn btn-primary btn-sm" type="button" id="kbFaqFromEmpty"><i class="fa-solid fa-plus"></i> Create FAQ</button>'
    );
  }
  return `
    ${sectionToolbar('kbAddFaqBtn', 'Create FAQ', 'fa-circle-question')}
    <div class="kb-service-list">
      ${items.map((faq) => {
        const title = faq.question || faq.title || 'FAQ';
        return `
        <div class="kb-service-card kb-entry-card" data-id="${escapeHtml(faq.id)}">
          ${kbEntryCardHeader({
            badgeHtml: '<i class="fa-solid fa-circle-question"></i> FAQ',
            icon: 'fa-circle-question',
            title,
            editClass: 'kb-edit-faq',
            id: faq.id,
          })}
          <p class="kb-narrative-preview">${kbPreviewText(faq.answer || faq.content || '')}</p>
          <div class="kb-service-meta">
            <span>${knowledgeStatusBadge(faq.status)}</span>
            <span>Updated ${escapeHtml(formatDate(faq.lastTrained))}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function sectionToolbar(buttonId, label, icon = 'fa-plus') {
  return `
    <div class="kb-section-toolbar">
      <button class="btn btn-primary btn-sm" type="button" id="${buttonId}"><i class="fa-solid ${icon}"></i> ${escapeHtml(label)}</button>
    </div>`;
}

function sectionToolbarDual(structuredId, structuredLabel, explainId, explainLabel, icon = 'fa-plus') {
  return `
    <div class="kb-section-toolbar kb-section-toolbar-dual">
      <button class="btn btn-primary btn-sm" type="button" id="${structuredId}">
        <i class="fa-solid ${icon}"></i> ${escapeHtml(structuredLabel)}
      </button>
      <button class="btn btn-secondary btn-sm" type="button" id="${explainId}">
        <i class="fa-solid fa-book-open"></i> ${escapeHtml(explainLabel)}
      </button>
    </div>`;
}

function emptyStateDualActions(structuredId, structuredLabel, explainId, explainLabel, icon = 'fa-plus') {
  return `
    <div class="kb-empty-actions">
      <button class="btn btn-primary btn-sm" type="button" id="${structuredId}">
        <i class="fa-solid ${icon}"></i> ${escapeHtml(structuredLabel)}
      </button>
      <button class="btn btn-secondary btn-sm" type="button" id="${explainId}">
        <i class="fa-solid fa-book-open"></i> ${escapeHtml(explainLabel)}
      </button>
    </div>`;
}

export function isNarrativeKnowledgeEntry(item) {
  if (!item) return false;
  if (item.entryMode === 'narrative') return true;
  if (item.entryMode === 'structured') return false;
  const hasStructuredFields =
    item.price ||
    item.specifications ||
    item.imageUrl ||
    item.features ||
    item.warranty ||
    item.waitingTime ||
    item.requirements;
  return Boolean(item.content && !hasStructuredFields);
}

const KB_PREVIEW_CHARS = 320;

function kbPreviewText(text, max = KB_PREVIEW_CHARS) {
  const body = String(text || '');
  return `${escapeHtml(body.slice(0, max))}${body.length > max ? '…' : ''}`;
}

function kbEntryActions(editClass, id) {
  return `
    <div class="kb-service-actions">
      <button class="btn btn-secondary btn-sm ${editClass}" type="button" data-id="${escapeHtml(id)}" title="Edit"><i class="fa-solid fa-pen"></i></button>
      <button class="btn btn-secondary btn-sm kb-delete" type="button" data-id="${escapeHtml(id)}" title="Delete"><i class="fa-solid fa-trash"></i></button>
    </div>`;
}

function kbEntryCardHeader({ badgeHtml, icon, title, editClass, id }) {
  return `
    <div class="kb-service-header">
      <div class="kb-entry-heading">
        ${badgeHtml ? `<div class="kb-narrative-badge">${badgeHtml}</div>` : ''}
        <h4><i class="fa-solid ${icon}"></i> ${escapeHtml(title)}</h4>
      </div>
      ${kbEntryActions(editClass, id)}
    </div>`;
}

const NARRATIVE_BADGE = '<i class="fa-solid fa-book-open"></i> Explanation';

export function renderProductsSection(items) {
  if (!items.length) {
    return emptyState(
      'No products yet. Add structured catalog items one-by-one, or write free-form explanations Sarah can learn from.',
      emptyStateDualActions(
        'kbAddProductBtn',
        'Structured product',
        'kbAddProductExplainBtn',
        'Product explanation'
      )
    );
  }
  return `
    ${sectionToolbarDual(
      'kbAddProductBtn',
      'Structured product',
      'kbAddProductExplainBtn',
      'Product explanation'
    )}
    <div class="kb-service-list">
      ${items.map((p) => {
        const title = p.name || p.title || 'Product';
        if (isNarrativeKnowledgeEntry(p)) {
          return `
        <div class="kb-service-card kb-entry-card kb-narrative-card" data-id="${escapeHtml(p.id)}">
          ${kbEntryCardHeader({
            badgeHtml: NARRATIVE_BADGE,
            icon: 'fa-box',
            title,
            editClass: 'kb-edit-product',
            id: p.id,
          })}
          <p class="kb-narrative-preview">${kbPreviewText(p.content || '')}</p>
        </div>`;
        }
        const detail = [p.specifications, p.features].filter(Boolean).join('\n');
        return `
        <div class="kb-service-card kb-entry-card" data-id="${escapeHtml(p.id)}">
          ${kbEntryCardHeader({
            badgeHtml: '<i class="fa-solid fa-box"></i> Structured',
            icon: 'fa-box',
            title,
            editClass: 'kb-edit-product',
            id: p.id,
          })}
          ${detail ? `<p class="kb-narrative-preview">${kbPreviewText(detail)}</p>` : ''}
          <div class="kb-service-meta">
            <span><strong>Price:</strong> ${escapeHtml(p.price || '—')}</span>
            ${p.warranty ? `<span><strong>Warranty:</strong> ${escapeHtml(p.warranty)}</span>` : ''}
            ${p.imageUrl ? `<span><strong>Image:</strong> linked</span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

export function renderServicesSection(items) {
  if (!items.length) {
    return emptyState(
      'No services yet. Add structured service cards, or write explanations Sarah can learn from.',
      emptyStateDualActions(
        'kbAddServiceBtn',
        'Structured service',
        'kbAddServiceExplainBtn',
        'Service explanation',
        'fa-briefcase'
      )
    );
  }
  return `
    ${sectionToolbarDual(
      'kbAddServiceBtn',
      'Structured service',
      'kbAddServiceExplainBtn',
      'Service explanation',
      'fa-briefcase'
    )}
    <div class="kb-service-list">
      ${items.map((s) => {
        const title = s.name || s.title || 'Service';
        if (isNarrativeKnowledgeEntry(s)) {
          return `
        <div class="kb-service-card kb-entry-card kb-narrative-card" data-id="${escapeHtml(s.id)}">
          ${kbEntryCardHeader({
            badgeHtml: NARRATIVE_BADGE,
            icon: 'fa-briefcase',
            title,
            editClass: 'kb-edit-service',
            id: s.id,
          })}
          <p class="kb-narrative-preview">${kbPreviewText(s.content || s.description || '')}</p>
        </div>`;
        }
        return `
        <div class="kb-service-card kb-entry-card" data-id="${escapeHtml(s.id)}">
          ${kbEntryCardHeader({
            badgeHtml: '<i class="fa-solid fa-briefcase"></i> Structured',
            icon: 'fa-briefcase',
            title,
            editClass: 'kb-edit-service',
            id: s.id,
          })}
          ${s.description ? `<p class="kb-narrative-preview">${kbPreviewText(s.description)}</p>` : ''}
          <div class="kb-service-meta">
            <span><strong>Price:</strong> ${escapeHtml(s.price || '—')}</span>
            <span><strong>Wait time:</strong> ${escapeHtml(s.waitingTime || '—')}</span>
          </div>
          ${s.requirements ? `<div class="kb-service-req"><strong>Requirements:</strong> ${escapeHtml(s.requirements)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
}

export function renderPoliciesSection(items) {
  if (!items.length) {
    return emptyState(
      'No policies added. Define refund, privacy, and warranty policies for your AI.',
      '<button class="btn btn-primary btn-sm" type="button" id="kbAddPolicyBtn"><i class="fa-solid fa-plus"></i> Add Policy</button>'
    );
  }
  return `
    ${sectionToolbar('kbAddPolicyBtn', 'Add Policy', 'fa-shield-halved')}
    <div class="kb-service-list">
      ${items.map((p) => `
        <div class="kb-service-card kb-entry-card" data-id="${escapeHtml(p.id)}">
          ${kbEntryCardHeader({
            badgeHtml: '<i class="fa-solid fa-shield-halved"></i> Policy',
            icon: 'fa-shield-halved',
            title: p.title || 'Policy',
            editClass: 'kb-edit-policy',
            id: p.id,
          })}
          <p class="kb-narrative-preview">${kbPreviewText(p.content || p.preview || '')}</p>
          <div class="kb-service-meta">
            <span>${knowledgeStatusBadge(p.status)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderPriceListsSection(items) {
  if (!items.length) {
    return emptyState(
      'No price lists yet. Add structured pricing your AI can reference.',
      '<button class="btn btn-primary btn-sm" type="button" id="kbAddPriceBtn"><i class="fa-solid fa-plus"></i> Add Price List</button>'
    );
  }
  return `
    ${sectionToolbar('kbAddPriceBtn', 'Add Price List', 'fa-tags')}
    <div class="kb-service-list">
      ${items.map((pl) => `
        <div class="kb-service-card kb-entry-card" data-id="${escapeHtml(pl.id)}">
          ${kbEntryCardHeader({
            badgeHtml: '<i class="fa-solid fa-tags"></i> Price list',
            icon: 'fa-tags',
            title: pl.title || 'Price list',
            editClass: 'kb-edit-price',
            id: pl.id,
          })}
          <pre class="kb-narrative-preview kb-price-content">${escapeHtml(pl.content || '')}</pre>
          <div class="kb-service-meta">
            <span>Last trained: ${escapeHtml(formatDate(pl.lastTrained))}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderWebsiteSection(items, defaultUrl = '') {
  return `
    <div class="kb-website-import">
      <div class="kb-import-bar">
        <div class="kb-import-input-wrap">
          <i class="fa-solid fa-globe"></i>
          <input type="url" id="kbWebsiteUrl" placeholder="https://centralmotors.co.za" value="${escapeHtml(defaultUrl)}" />
        </div>
        <button class="btn btn-primary" type="button" id="kbImportWebsiteBtn">
          <i class="fa-solid fa-download"></i> Import Website
        </button>
      </div>
      ${items.length ? `
        <div class="table-container" style="margin-top:24px;">
          <table class="org-table kb-table">
            <thead>
              <tr><th>Website</th><th>Pages Scraped</th><th>Status</th><th>Last Trained</th><th class="col-actions"></th></tr>
            </thead>
            <tbody>
              ${items.map((w) => `
                <tr>
                  <td><a href="${escapeHtml(w.url)}" target="_blank" rel="noopener">${escapeHtml(w.url || w.title)}</a></td>
                  <td>${formatNumber(w.pagesScraped || 0)}</td>
                  <td>${knowledgeStatusBadge(w.status)}</td>
                  <td>${escapeHtml(formatDate(w.lastTrained))}</td>
                  <td class="col-actions">
                    <button class="btn btn-secondary btn-sm kb-retrain" type="button" data-id="${escapeHtml(w.id)}" data-title="${escapeHtml(w.url || w.title)}"><i class="fa-solid fa-rotate"></i></button>
                    <button class="btn btn-secondary btn-sm kb-delete" type="button" data-id="${escapeHtml(w.id)}"><i class="fa-solid fa-trash"></i></button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : emptyState('No websites imported yet. Enter a URL above to scrape and train your AI.')}
    </div>
  `;
}

export function renderTrainingHistorySection(items) {
  if (!items.length) {
    return emptyState('No training history yet. Upload knowledge to start training your AI employee.');
  }
  return `
    <div class="table-container">
      <table class="org-table kb-table">
        <thead>
          <tr><th>Item</th><th>Type</th><th>Chunks</th><th>Duration</th><th>Status</th><th>Completed</th></tr>
        </thead>
        <tbody>
          ${items.map((h) => `
            <tr>
              <td>${escapeHtml(h.title)}</td>
              <td><span class="model-tag">${escapeHtml(h.type)}</span></td>
              <td>${formatNumber(h.chunksCreated || 0)}</td>
              <td>${h.durationSec ? `${h.durationSec}s` : '—'}</td>
              <td>${knowledgeStatusBadge(h.status)}</td>
              <td>${escapeHtml(formatDate(h.completedAt || h.startedAt))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderSectionContent(section, items, history, company) {
  const byType = (type) => items.filter((i) => i.type === type);
  const byTypes = (...types) => items.filter((i) => types.includes(i.type));
  switch (section) {
    case 'documents': return renderDocumentsSection(byTypes('document', 'manual', 'guide', 'brochure'));
    case 'faqs': return renderFaqsSection(byType('faq'));
    case 'products': return renderProductsSection(byType('product'));
    case 'services': return renderServicesSection(byType('service'));
    case 'policies': return renderPoliciesSection(byType('policy'));
    case 'price-lists': return renderPriceListsSection(byType('price-list'));
    case 'website': return renderWebsiteSection(byType('website'), company?.website || '');
    case 'training-history': return renderTrainingHistorySection(history);
    default: return renderDocumentsSection(byType('document'));
  }
}

export function sectionTitle(section) {
  const match = KB_SECTIONS.find((s) => s.id === section);
  return match?.label || 'Documents';
}
