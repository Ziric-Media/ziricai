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
    return emptyState('No FAQs yet. Create your first FAQ to train your AI employee.', '<button class="btn btn-primary btn-sm" type="button" id="kbFaqFromEmpty"><i class="fa-solid fa-plus"></i> Create FAQ</button>');
  }
  return `
    <div class="kb-faq-list">
      ${items.map((faq) => `
        <div class="kb-faq-card" data-id="${escapeHtml(faq.id)}">
          <div class="kb-faq-header">
            <div class="kb-faq-q"><i class="fa-solid fa-circle-question"></i> ${escapeHtml(faq.question || faq.title)}</div>
            <div class="kb-faq-actions">
              <button class="btn btn-secondary btn-sm kb-edit-faq" type="button" data-id="${escapeHtml(faq.id)}" title="Edit"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-secondary btn-sm kb-delete" type="button" data-id="${escapeHtml(faq.id)}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
          <div class="kb-faq-a">${escapeHtml(faq.answer || faq.content || '')}</div>
          <div class="kb-faq-footer">${knowledgeStatusBadge(faq.status)} · ${escapeHtml(formatDate(faq.lastTrained))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderProductsSection(items) {
  if (!items.length) {
    return emptyState('No products added yet. Add individual product entries for your AI to recommend.');
  }
  return `
    <div class="kb-product-grid">
      ${items.map((p) => `
        <div class="kb-product-card" data-id="${escapeHtml(p.id)}">
          <div class="kb-product-image">
            ${p.imageUrl
              ? `<img src="${escapeHtml(p.imageUrl)}" alt="" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-car\\'></i>'" />`
              : '<i class="fa-solid fa-car"></i>'}
          </div>
          <div class="kb-product-body">
            <h4>${escapeHtml(p.name || p.title)}</h4>
            <div class="kb-product-price">${escapeHtml(p.price || '—')}</div>
            <p class="kb-product-spec">${escapeHtml(p.specifications || '')}</p>
            ${p.features ? `<div class="kb-product-features"><i class="fa-solid fa-star"></i> ${escapeHtml(p.features)}</div>` : ''}
            ${p.warranty ? `<div class="kb-product-warranty"><i class="fa-solid fa-shield"></i> ${escapeHtml(p.warranty)}</div>` : ''}
          </div>
          <div class="kb-product-actions">
            <button class="btn btn-secondary btn-sm kb-edit-product" type="button" data-id="${escapeHtml(p.id)}"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn btn-secondary btn-sm kb-delete" type="button" data-id="${escapeHtml(p.id)}"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderServicesSection(items) {
  if (!items.length) {
    return emptyState('No services defined yet. Add services your AI employee can explain and quote.');
  }
  return `
    <div class="kb-service-list">
      ${items.map((s) => `
        <div class="kb-service-card" data-id="${escapeHtml(s.id)}">
          <div class="kb-service-header">
            <h4><i class="fa-solid fa-briefcase"></i> ${escapeHtml(s.name || s.title)}</h4>
            <div class="kb-service-actions">
              <button class="btn btn-secondary btn-sm kb-edit-service" type="button" data-id="${escapeHtml(s.id)}"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-secondary btn-sm kb-delete" type="button" data-id="${escapeHtml(s.id)}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
          <p>${escapeHtml(s.description || '')}</p>
          <div class="kb-service-meta">
            <span><strong>Price:</strong> ${escapeHtml(s.price || '—')}</span>
            <span><strong>Wait time:</strong> ${escapeHtml(s.waitingTime || '—')}</span>
          </div>
          ${s.requirements ? `<div class="kb-service-req"><strong>Requirements:</strong> ${escapeHtml(s.requirements)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

export function renderPoliciesSection(items) {
  if (!items.length) {
    return emptyState('No policies added. Define refund, privacy, and warranty policies for your AI.');
  }
  return `
    <div class="kb-policy-grid">
      ${items.map((p) => `
        <div class="kb-policy-card" data-id="${escapeHtml(p.id)}">
          <div class="kb-policy-icon"><i class="fa-solid fa-shield-halved"></i></div>
          <h4>${escapeHtml(p.title)}</h4>
          <p class="kb-policy-preview">${escapeHtml(p.preview || (p.content || '').slice(0, 120))}${(p.content || '').length > 120 ? '…' : ''}</p>
          <div class="kb-policy-footer">
            ${knowledgeStatusBadge(p.status)}
            <button class="btn btn-secondary btn-sm kb-edit-policy" type="button" data-id="${escapeHtml(p.id)}"><i class="fa-solid fa-pen"></i> Edit</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderPriceListsSection(items) {
  if (!items.length) {
    return emptyState('No price lists yet. Add structured pricing your AI can reference.');
  }
  return `
    <div class="kb-price-list">
      ${items.map((pl) => `
        <div class="kb-price-card" data-id="${escapeHtml(pl.id)}">
          <div class="kb-price-header">
            <h4><i class="fa-solid fa-tags"></i> ${escapeHtml(pl.title)}</h4>
            <div>
              <button class="btn btn-secondary btn-sm kb-edit-price" type="button" data-id="${escapeHtml(pl.id)}"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-secondary btn-sm kb-delete" type="button" data-id="${escapeHtml(pl.id)}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
          <pre class="kb-price-content">${escapeHtml(pl.content || '')}</pre>
          <div class="kb-price-footer">Last trained: ${escapeHtml(formatDate(pl.lastTrained))}</div>
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
  switch (section) {
    case 'documents': return renderDocumentsSection(byType('document'));
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
