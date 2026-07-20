import { requireCompanyId } from '../state.js';
import { escapeHtml, pageHeader, loadingState, showToast, emptyState } from '../../admin/ui.js';
import {
  fetchMarketplaceCatalog,
  fetchInstalledPacks,
  fetchPackUpdates,
  fetchPackDetail,
  installMarketplacePack,
} from '../api.js';
import { withTimeout } from '../../admin/utils.js';
import { navigateTo } from '../router.js';

let wizardState = {};

export async function renderMarketplace(container) {
  container.innerHTML = loadingState('Loading Marketplace...');
  const companyId = requireCompanyId();

  const [catalogRes, instRes, updatesRes] = await Promise.all([
    withTimeout(fetchMarketplaceCatalog()),
    withTimeout(fetchInstalledPacks(companyId)),
    withTimeout(fetchPackUpdates(companyId)),
  ]);

  const catalog = catalogRes.error ? { categories: [], packs: [] } : catalogRes.data;
  const installed = instRes.data?.items || [];
  const updates = updatesRes.data?.updates || [];
  const installedIds = new Set(installed.map((p) => p.packId));
  const updateIds = new Set(updates.map((u) => u.packId));

  container.innerHTML = `
    ${pageHeader(
      'AI Marketplace',
      'One-click install complete AI Employees — under 5 minutes.',
    )}

    <div class="marketplace-toolbar">
      <div class="marketplace-search-wrap">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" id="mpSearch" placeholder="Search packs…" class="marketplace-search-input" />
      </div>
      <select id="mpCategory" class="marketplace-filter-select">
        <option value="">All categories</option>
        ${(catalog.categories || []).map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join('')}
      </select>
      <select id="mpPrice" class="marketplace-filter-select">
        <option value="">All prices</option>
        <option value="free">Free</option>
        <option value="paid">Paid</option>
      </select>
      <select id="mpSort" class="marketplace-filter-select">
        <option value="">Featured</option>
        <option value="rating">Top rated</option>
      </select>
    </div>

    ${installed.length ? `
    <section class="marketplace-section">
      <h3 class="marketplace-section-title"><i class="fa-solid fa-circle-check"></i> Installed Packs</h3>
      <div class="marketplace-installed-list">
        ${installed.map((p) => `
          <div class="marketplace-installed-item">
            <div>
              <strong>${escapeHtml(p.packName)}</strong>
              <span class="text-muted">v${escapeHtml(p.version || '1.0')} · ${new Date(p.installedAt).toLocaleDateString()}</span>
              ${updateIds.has(p.packId) ? `<span class="mp-update-badge"><i class="fa-solid fa-arrow-up"></i> Update available</span>` : ''}
            </div>
            <div class="installed-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-nav="agents">Agents</button>
              <button type="button" class="btn btn-secondary btn-sm" data-nav="knowledge">Knowledge</button>
              <button type="button" class="btn btn-secondary btn-sm" data-nav="automation">Workflows</button>
            </div>
          </div>`).join('')}
      </div>
    </section>` : ''}

    <div class="marketplace-pack-grid" id="mpPackGrid">
      ${renderPackCards(catalog.packs || [], installedIds, companyId)}
    </div>

    <div id="mpDetailModal" class="mp-modal hidden" aria-hidden="true"></div>
    <div id="mpWizardModal" class="mp-modal hidden" aria-hidden="true"></div>
  `;

  bindMarketplaceEvents(container, companyId, catalog);
}

function renderPackCards(packs, installedIds, companyId) {
  const visible = packs.filter((p) => p.installable !== false && p.status !== 'coming_soon');
  if (!visible.length) return emptyState('No packs match your filters.');

  return visible.map((pack) => {
    const installed = installedIds.has(pack.id) || installedIds.has(pack.canonicalId);
    const stars = renderStars(pack.rating);
    const priceBadge = pack.isPaid
      ? `<span class="mp-price paid">Paid</span>`
      : `<span class="mp-price free">Free</span>`;

    return `
      <article class="marketplace-pack-card" style="--pack-color:${pack.color || '#6366f1'}">
        <div class="pack-card-header">
          <span class="pack-icon">${pack.icon || '📦'}</span>
          <div>
            <h4>${escapeHtml(pack.name)}</h4>
            <div class="mp-card-meta">${stars} <span class="mp-rating-count">(${pack.ratingCount || 0})</span> ${priceBadge}</div>
            <p class="pack-tagline">${escapeHtml(pack.tagline || pack.description || '')}</p>
          </div>
        </div>
        <ul class="pack-includes">
          ${(pack.includes || []).slice(0, 3).map((item) => `<li><i class="fa-solid fa-check"></i> ${escapeHtml(item)}</li>`).join('')}
        </ul>
        <div class="pack-card-footer">
          <button type="button" class="btn btn-secondary btn-sm mp-detail-btn" data-pack-id="${escapeHtml(pack.id)}">Details</button>
          ${installed
            ? `<span class="pack-status installed"><i class="fa-solid fa-circle-check"></i> Installed</span>`
            : `<button type="button" class="btn btn-primary btn-sm mp-install-btn" data-pack-id="${escapeHtml(pack.id)}">
                <i class="fa-solid fa-download"></i> Install
              </button>`}
        </div>
      </article>`;
  }).join('');
}

function renderStars(rating = 0) {
  const full = Math.round(rating);
  return `<span class="mp-stars">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
}

function bindMarketplaceEvents(container, companyId, catalog) {
  const reloadCatalog = async () => {
    const q = container.querySelector('#mpSearch')?.value || '';
    const category = container.querySelector('#mpCategory')?.value || '';
    const price = container.querySelector('#mpPrice')?.value || '';
    const sort = container.querySelector('#mpSort')?.value || '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (price) params.set('price', price);
    if (sort) params.set('sort', sort);

    const res = await fetchMarketplaceCatalog(params.toString());
    const packs = res.data?.packs || catalog.packs;
    const instRes = await fetchInstalledPacks(companyId);
    const installedIds = new Set((instRes.data?.items || []).map((p) => p.packId));
    container.querySelector('#mpPackGrid').innerHTML = renderPackCards(packs, installedIds, companyId);
    bindPackButtons(container, companyId);
  };

  container.querySelector('#mpSearch')?.addEventListener('input', debounce(reloadCatalog, 300));
  container.querySelector('#mpCategory')?.addEventListener('change', reloadCatalog);
  container.querySelector('#mpPrice')?.addEventListener('change', reloadCatalog);
  container.querySelector('#mpSort')?.addEventListener('change', reloadCatalog);

  container.querySelectorAll('.installed-actions [data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });

  bindPackButtons(container, companyId);
}

function bindPackButtons(container, companyId) {
  container.querySelectorAll('.mp-detail-btn').forEach((btn) => {
    btn.addEventListener('click', () => openDetailModal(container, btn.dataset.packId));
  });
  container.querySelectorAll('.mp-install-btn').forEach((btn) => {
    btn.addEventListener('click', () => openWizardModal(container, companyId, btn.dataset.packId));
  });
}

async function openDetailModal(container, packId) {
  const modal = container.querySelector('#mpDetailModal');
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="mp-modal-backdrop"><div class="mp-modal-panel">${loadingState('Loading pack…')}</div></div>`;

  const res = await fetchPackDetail(packId);
  if (res.error) {
    modal.innerHTML = '';
    modal.classList.add('hidden');
    showToast(res.error, 'error');
    return;
  }

  const d = res.data;
  const checklist = (d.contentsChecklist || []).map((c) => `
    <div class="mp-checklist-group">
      <strong>${escapeHtml(c.label)} (${c.count})</strong>
      <ul>${(c.items || []).slice(0, 4).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    </div>`).join('');

  modal.innerHTML = `
    <div class="mp-modal-backdrop" data-close="1">
      <div class="mp-modal-panel" role="dialog">
        <button type="button" class="mp-modal-close" data-close="1"><i class="fa-solid fa-xmark"></i></button>
        <div class="mp-detail-header">
          <span class="pack-icon">${d.pack?.icon || '📦'}</span>
          <div>
            <h3>${escapeHtml(d.pack?.name || '')}</h3>
            <p>${renderStars(d.pack?.rating)} v${escapeHtml(d.pack?.version || '1.0')} · ${escapeHtml(d.pack?.priceLabel || 'Free')}</p>
            ${d.pack?.extends ? `<p class="text-muted"><i class="fa-solid fa-sitemap"></i> Extends ${escapeHtml(d.pack.extends)}</p>` : ''}
          </div>
        </div>
        <p>${escapeHtml(d.pack?.description || '')}</p>
        <h4>Pack Contents</h4>
        <div class="mp-checklist-grid">${checklist}</div>
        <h4>Reviews</h4>
        <div class="mp-reviews">
          ${(d.reviews || []).map((r) => `
            <div class="mp-review">
              ${renderStars(r.rating)} <strong>${escapeHtml(r.title)}</strong>
              <p>${escapeHtml(r.body)}</p>
              <span class="text-muted">— ${escapeHtml(r.author)}</span>
            </div>`).join('')}
        </div>
        <div class="mp-modal-actions">
          <button type="button" class="btn btn-primary mp-wizard-from-detail" data-pack-id="${escapeHtml(packId)}">
            <i class="fa-solid fa-download"></i> Install Pack
          </button>
        </div>
      </div>
    </div>`;

  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.close) closeModal(modal);
    });
  });
  modal.querySelector('.mp-wizard-from-detail')?.addEventListener('click', (e) => {
    closeModal(modal);
    openWizardModal(container, requireCompanyId(), e.target.dataset.packId);
  });
}

function openWizardModal(container, companyId, packId) {
  wizardState = { companyId, packId, step: 1, branding: {}, integrations: [] };
  const modal = container.querySelector('#mpWizardModal');
  modal.classList.remove('hidden');
  renderWizardStep(container, modal);
}

async function renderWizardStep(container, modal) {
  const { companyId, packId, step } = wizardState;
  const steps = ['Preview', 'Branding', 'Integrations', 'Install', 'Success'];
  modal.innerHTML = `
    <div class="mp-modal-backdrop">
      <div class="mp-modal-panel mp-wizard-panel" role="dialog">
        <button type="button" class="mp-modal-close" id="mpWizardClose"><i class="fa-solid fa-xmark"></i></button>
        <div class="mp-wizard-steps">
          ${steps.map((s, i) => `<span class="mp-wizard-step ${i + 1 <= step ? 'active' : ''}">${i + 1}. ${s}</span>`).join('')}
        </div>
        <div id="mpWizardBody">${loadingState('Loading…')}</div>
      </div>
    </div>`;

  modal.querySelector('#mpWizardClose')?.addEventListener('click', () => closeModal(modal));

  const body = modal.querySelector('#mpWizardBody');

  if (step === 1) {
    const res = await installMarketplacePack(companyId, packId, { step: 'preview' });
    const d = res.data;
    body.innerHTML = `
      <h3>${escapeHtml(d?.pack?.name || 'Pack Preview')}</h3>
      <p>Estimated install: ${d?.estimatedMinutes || 4} minutes</p>
      <div class="mp-checklist-grid">
        ${(d?.contentsChecklist || []).map((c) => `
          <div class="mp-checklist-group">
            <strong><i class="fa-solid fa-check"></i> ${escapeHtml(c.label)} (${c.count})</strong>
          </div>`).join('')}
      </div>
      <div class="mp-modal-actions">
        <button type="button" class="btn btn-primary" id="mpNext1">Next: Branding</button>
      </div>`;
    body.querySelector('#mpNext1')?.addEventListener('click', () => { wizardState.step = 2; renderWizardStep(container, modal); });
  } else if (step === 2) {
    body.innerHTML = `
      <h3>Customize Branding (optional)</h3>
      <label class="mp-field"><span>Agent display name</span>
        <input type="text" id="mpAgentName" placeholder="e.g. Emma (AI)" /></label>
      <label class="mp-field"><span>Custom greeting</span>
        <textarea id="mpGreeting" rows="3" placeholder="Hello! How can I help?"></textarea></label>
      <div class="mp-modal-actions">
        <button type="button" class="btn btn-secondary" id="mpBack2">Back</button>
        <button type="button" class="btn btn-primary" id="mpNext2">Next: Integrations</button>
      </div>`;
    body.querySelector('#mpBack2')?.addEventListener('click', () => { wizardState.step = 1; renderWizardStep(container, modal); });
    body.querySelector('#mpNext2')?.addEventListener('click', () => {
      wizardState.branding = {
        agentName: body.querySelector('#mpAgentName')?.value || null,
        greetingMessage: body.querySelector('#mpGreeting')?.value || null,
      };
      wizardState.step = 3;
      renderWizardStep(container, modal);
    });
  } else if (step === 3) {
    const preview = await installMarketplacePack(companyId, packId, { step: 'preview' });
    const available = preview.data?.contents?.integrations || ['whatsapp', 'email'];
    wizardState.integrations = [...available];
    body.innerHTML = `
      <h3>Select Integrations</h3>
      <div class="mp-integration-list">
        ${available.map((id) => `
          <label class="mp-integration-item">
            <input type="checkbox" checked data-int="${escapeHtml(id)}" /> ${escapeHtml(id)}
          </label>`).join('')}
      </div>
      <div class="mp-modal-actions">
        <button type="button" class="btn btn-secondary" id="mpBack3">Back</button>
        <button type="button" class="btn btn-primary" id="mpNext3">Next: Install</button>
      </div>`;
    body.querySelector('#mpBack3')?.addEventListener('click', () => { wizardState.step = 2; renderWizardStep(container, modal); });
    body.querySelector('#mpNext3')?.addEventListener('click', () => {
      wizardState.integrations = [...body.querySelectorAll('[data-int]:checked')].map((el) => el.dataset.int);
      wizardState.step = 4;
      renderWizardStep(container, modal);
    });
  } else if (step === 4) {
    body.innerHTML = loadingState('Installing pack…');
    const result = await installMarketplacePack(companyId, packId, {
      step: 'install',
      branding: wizardState.branding,
      integrations: wizardState.integrations,
      demoMode: true,
    });
    if (result.error) {
      body.innerHTML = `<p class="mp-error">${escapeHtml(result.error)}</p>
        <button type="button" class="btn btn-secondary" id="mpBack4">Back</button>`;
      body.querySelector('#mpBack4')?.addEventListener('click', () => { wizardState.step = 3; renderWizardStep(container, modal); });
      return;
    }
    wizardState.result = result.data;
    wizardState.step = 5;
    renderWizardStep(container, modal);
  } else if (step === 5) {
    const r = wizardState.result || {};
    const verified = r.validation?.verified || {};
    const summary = r.verifiedSummary || r.validation?.summary || '';
    body.innerHTML = `
      <div class="mp-success">
        <i class="fa-solid fa-circle-check"></i>
        <h3>Installation Complete!</h3>
        <p>${escapeHtml(r.message || 'Your AI Employee pack is ready.')}</p>
        ${summary ? `<p class="mp-verified-summary"><i class="fa-solid fa-shield-check"></i> ${escapeHtml(summary)}</p>` : ''}
        ${verified.agentNames?.length || verified.knowledgeDocs != null ? `
        <ul class="mp-verified-list">
          ${(verified.agentNames || []).map((n) => `<li><i class="fa-solid fa-robot"></i> ${escapeHtml(n)}</li>`).join('')}
          ${verified.knowledgeDocs != null ? `<li><i class="fa-solid fa-book"></i> ${verified.knowledgeDocs} knowledge doc${verified.knowledgeDocs === 1 ? '' : 's'}</li>` : ''}
          ${verified.workflows != null ? `<li><i class="fa-solid fa-diagram-project"></i> ${verified.workflows} workflow${verified.workflows === 1 ? '' : 's'}</li>` : ''}
        </ul>` : ''}
        <div class="mp-success-links">
          <button type="button" class="btn btn-secondary btn-sm" data-nav="agents">AI Employees</button>
          <button type="button" class="btn btn-secondary btn-sm" data-nav="knowledge">Knowledge</button>
          <button type="button" class="btn btn-secondary btn-sm" data-nav="automation">Automation</button>
          <button type="button" class="btn btn-secondary btn-sm" data-nav="analytics">Analytics</button>
        </div>
      </div>
      <div class="mp-modal-actions">
        <button type="button" class="btn btn-primary" id="mpDone">Done</button>
      </div>`;
    body.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => { closeModal(modal); navigateTo(btn.dataset.nav); });
    });
    body.querySelector('#mpDone')?.addEventListener('click', () => {
      closeModal(modal);
      renderMarketplace(container);
    });
  }
}

function closeModal(modal) {
  modal.classList.add('hidden');
  modal.innerHTML = '';
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
