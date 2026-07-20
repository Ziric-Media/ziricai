import { state } from '../state.js';
import { escapeHtml, showToast, loadingState } from '../ui.js';
import { listTemplates, installTemplate } from '../services/workflows.js';
import { listCompanies } from '../services/companies.js';
import { DEMO_COMPANIES } from '../demo-data.js';
import { withTimeout } from '../utils.js';

let onInstalled = null;

export function setTemplateInstallCallback(cb) {
  onInstalled = cb;
}

export async function openTemplatesGallery(container, { onClose, onInstall } = {}) {
  if (onInstall) onInstalled = onInstall;
  container.innerHTML = loadingState('Loading templates...');

  const [tplResult, coResult] = await Promise.all([
    withTimeout(listTemplates()),
    withTimeout(listCompanies()),
  ]);

  const templates = tplResult.items?.length ? tplResult.items : [];
  const companies = coResult.items?.length ? coResult.items : DEMO_COMPANIES;
  const scopedCompany = state.selectedCompanyId || '';

  container.innerHTML = buildGalleryMarkup(templates, companies, scopedCompany, tplResult.isDemo);
  bindGalleryEvents(container, companies, onClose);
}

function buildGalleryMarkup(templates, companies, scopedCompany, isDemo) {
  const categories = [...new Set(templates.map((t) => t.industry))];
  const companyOptions = companies.map((c) =>
    `<option value="${escapeHtml(c.id)}" ${c.id === scopedCompany ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');

  return `
    <div class="templates-overlay open" id="templatesOverlay">
      <div class="templates-panel">
        <div class="templates-header">
          <div>
            <h2><i class="fa-solid fa-layer-group"></i> Workflow Templates</h2>
            <p class="text-muted">One-click install pre-built AI workflows for your industry</p>
          </div>
          <button class="btn btn-icon close-templates" type="button" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        ${isDemo ? '<div class="demo-banner"><i class="fa-solid fa-flask"></i> Template install requires server when API unavailable.</div>' : ''}

        <div class="templates-toolbar">
          <div class="templates-filters">
            <button class="tpl-filter active" type="button" data-category="all">All</button>
            ${categories.map((cat) => `<button class="tpl-filter" type="button" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('')}
          </div>
          <div class="templates-company-select">
            <label>Install for</label>
            <select id="templateCompanySelect">${companyOptions}</select>
          </div>
        </div>

        <div class="templates-grid" id="templatesGrid">
          ${templates.map((t) => renderTemplateCard(t)).join('')}
        </div>
      </div>
    </div>`;
}

function renderTemplateCard(t) {
  return `
    <div class="template-card" data-category="${escapeHtml(t.industry)}" data-id="${escapeHtml(t.id)}">
      <div class="template-card-icon"><i class="${escapeHtml(t.icon || 'fa-solid fa-diagram-project')}"></i></div>
      <div class="template-card-body">
        <span class="template-industry">${escapeHtml(t.industry)}</span>
        <h3>${escapeHtml(t.name)}</h3>
        <p>${escapeHtml(t.description)}</p>
        <div class="template-meta">
          <span><i class="fa-solid fa-list-ol"></i> ${t.stepCount || '—'} steps</span>
          ${t.companyHint ? `<span><i class="fa-solid fa-building"></i> ${escapeHtml(t.companyHint)}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-primary btn-sm install-template" type="button" data-id="${escapeHtml(t.id)}">
        <i class="fa-solid fa-download"></i> Install
      </button>
    </div>`;
}

function bindGalleryEvents(container, companies, onClose) {
  container.querySelector('.close-templates')?.addEventListener('click', () => {
    container.innerHTML = '';
    onClose?.();
  });

  container.querySelector('#templatesOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'templatesOverlay') {
      container.innerHTML = '';
      onClose?.();
    }
  });

  container.querySelectorAll('.tpl-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tpl-filter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.category;
      container.querySelectorAll('.template-card').forEach((card) => {
        card.style.display = cat === 'all' || card.dataset.category === cat ? '' : 'none';
      });
    });
  });

  container.querySelectorAll('.install-template').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const templateId = btn.dataset.id;
      const companyId = container.querySelector('#templateCompanySelect')?.value;
      const company = companies.find((c) => c.id === companyId);
      if (!companyId) {
        showToast('Select a company first', 'warning');
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Installing...';
      const result = await installTemplate({ templateId, companyId, companyName: company?.name });
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-download"></i> Install';
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      showToast(`"${result.item?.name || 'Workflow'}" installed as draft`, 'success');
      container.innerHTML = '';
      onInstalled?.(result.item);
    });
  });
}

export { buildGalleryMarkup as renderTemplatesMarkup };
