import { state } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  emptyState,
  loadingState,
  showToast,
} from '../ui.js';
import {
  fetchMarketplaceCatalog,
  fetchInstalledPacks,
  fetchPackUpdates,
  installMarketplacePack,
} from '../api.js';
import { listCompanies } from '../services/companies.js';
import { navigateTo } from '../router.js';
import { withTimeout } from '../utils.js';
import { DEMO_COMPANIES } from '../demo-data.js';

let selectedCategory = null;

export async function renderMarketplace(container) {
  container.innerHTML = loadingState('Loading AI Marketplace...');
  selectedCategory = null;

  const [catalogRes, companiesRes] = await Promise.all([
    withTimeout(fetchMarketplaceCatalog()),
    withTimeout(listCompanies()),
  ]);

  const companies = companiesRes.items?.length ? companiesRes.items : DEMO_COMPANIES;
  const catalog = catalogRes.error ? null : catalogRes.data;
  const fallbackCatalog = buildFallbackCatalog();

  const data = catalog || fallbackCatalog;
  const companyId = state.selectedCompanyId || companies[0]?.id || null;

  let installed = [];
  let updates = [];
  if (companyId) {
    const [instRes, updRes] = await Promise.all([
      withTimeout(fetchInstalledPacks(companyId)),
      withTimeout(fetchPackUpdates(companyId)),
    ]);
    installed = instRes.data?.items || [];
    updates = updRes.data?.updates || [];
  }

  container.innerHTML = buildMarkup(data, companies, companyId, installed, updates, Boolean(catalogRes.error));
  bindEvents(container, data, companies, companyId, installed);
}

function renderStars(rating = 0) {
  const full = Math.round(rating);
  return `<span class="mp-stars">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
}

function buildFallbackCatalog() {
  const installMsg = 'Installs in minutes — customize your knowledge base and branding';
  const mk = (id, name, category, icon, color) => ({
    id, name, category, icon, color, installable: true, featured: true,
    tagline: installMsg, includes: ['1 AI Employee', '3 Knowledge Docs', '1 Workflow', 'CRM Templates'],
  });
  return {
    categories: [
      { id: 'schools', label: 'Schools', icon: '🎓', color: '#7c3aed' },
      { id: 'law', label: 'Law Firms', icon: '⚖️', color: '#b45309' },
      { id: 'doctors', label: 'Doctors', icon: '🩺', color: '#059669' },
      { id: 'sales', label: 'Sales', icon: '💼', color: '#2563eb' },
      { id: 'support', label: 'Customer Support', icon: '🎧', color: '#0891b2' },
      { id: 'funeral', label: 'Funeral Parlours', icon: '💐', color: '#6b7280' },
      { id: 'real_estate', label: 'Real Estate', icon: '🏠', color: '#16a34a' },
    ],
    packs: [
      mk('pack-school-receptionist', 'School Receptionist', 'schools', '🎓', '#7c3aed'),
      mk('pack-law-receptionist', 'Law Firm Receptionist', 'law', '⚖️', '#b45309'),
      mk('pack-medical-receptionist', 'Medical Receptionist', 'doctors', '🩺', '#059669'),
      mk('pack-sales-ai', 'Sales AI', 'sales', '💼', '#2563eb'),
      mk('pack-customer-support-ai', 'Customer Support AI', 'support', '🎧', '#0891b2'),
      mk('pack-appointment-ai', 'Appointment AI', 'scheduling', '📅', '#6366f1'),
      mk('pack-collections-ai', 'Collections AI', 'finance', '💰', '#ca8a04'),
      mk('pack-hr-ai', 'HR AI', 'hr', '👥', '#8b5cf6'),
      mk('pack-recruitment-ai', 'Recruitment AI', 'hr', '🎯', '#a855f7'),
      mk('pack-estate-agent-ai', 'Estate Agent AI', 'real_estate', '🏠', '#16a34a'),
      mk('pack-insurance-ai', 'Insurance AI', 'insurance', '🛡️', '#0369a1'),
      mk('pack-funeral-ai', 'Funeral AI', 'funeral', '💐', '#6b7280'),
      mk('pack-restaurant-ai', 'Restaurant AI', 'restaurants', '🍽️', '#dc2626'),
      mk('pack-construction-ai', 'Construction AI', 'construction', '🏗️', '#ea580c'),
      mk('pack-church-ai', 'Church AI', 'churches', '⛪', '#9333ea'),
    ],
    thirdParty: [],
    featured: [],
  };
}

function buildMarkup(catalog, companies, companyId, installed, updates, isOffline) {
  const company = companies.find((c) => c.id === companyId);
  const installedIds = new Set(installed.map((p) => p.packId));
  const updateIds = new Set(updates.map((u) => u.packId));

  return `
    ${pageHeader(
      'AI Marketplace',
      'Install industry packs — AI employees, knowledge, workflows, CRM & analytics in one click.',
      companyId
        ? `<span class="marketplace-scope-badge"><i class="fa-solid fa-building"></i> ${escapeHtml(company?.name || companyId)}</span>`
        : `<span class="marketplace-scope-badge warn"><i class="fa-solid fa-triangle-exclamation"></i> Select a company in the top bar</span>`
    )}
    ${isOffline ? '<div class="demo-banner"><i class="fa-solid fa-plug-circle-xmark"></i> API offline — showing cached catalog. Start server with <code>npm run dev</code> to install packs.</div>' : ''}

    <div class="marketplace-toolbar">
      <div class="marketplace-search-wrap">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" id="mpSearch" placeholder="Search packs…" class="marketplace-search-input" />
      </div>
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

    <section class="marketplace-section">
      <h3 class="marketplace-section-title"><i class="fa-solid fa-grid-2"></i> Browse by Industry</h3>
      <div class="marketplace-category-grid" id="categoryGrid">
        ${catalog.categories.map((cat) => {
          const packCount = catalog.packs.filter((p) => p.category === cat.id).length;
          return `
            <button type="button" class="marketplace-category-card" data-category="${escapeHtml(cat.id)}" style="--cat-color:${cat.color}">
              <span class="cat-icon">${cat.icon}</span>
              <span class="cat-label">${escapeHtml(cat.label)}</span>
              <span class="cat-count">${packCount} pack${packCount !== 1 ? 's' : ''}</span>
            </button>`;
        }).join('')}
      </div>
    </section>

    <section class="marketplace-section" id="packsSection">
      <div class="marketplace-section-head">
        <h3 class="marketplace-section-title" id="packsSectionTitle"><i class="fa-solid fa-box-open"></i> AI Employee Packs</h3>
        <button type="button" class="btn btn-secondary btn-sm hidden" id="clearCategoryFilter">Show all</button>
      </div>
      <div class="marketplace-pack-grid" id="packGrid">
        ${renderPackCards(catalog.packs.filter((p) => p.installable !== false && p.status !== 'coming_soon'), installedIds, companyId)}
      </div>
    </section>

    ${installed.length ? `
      <section class="marketplace-section">
        <h3 class="marketplace-section-title"><i class="fa-solid fa-circle-check"></i> Installed for ${escapeHtml(company?.name || companyId)}</h3>
        <div class="marketplace-installed-list">
          ${installed.map((p) => `
            <div class="marketplace-installed-item">
              <div>
                <strong>${escapeHtml(p.packName)}</strong>
                <span class="text-muted">v${escapeHtml(p.version || '1.0')} · ${new Date(p.installedAt).toLocaleString()}</span>
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

    <section class="marketplace-section marketplace-third-party">
      <h3 class="marketplace-section-title"><i class="fa-solid fa-store"></i> AI Store — Third-Party Packs</h3>
      <div class="marketplace-coming-soon-banner">
        <i class="fa-solid fa-rocket"></i>
        <div>
          <strong>Coming Soon</strong>
          <p>Publish and install packs from verified third-party authors. Registry scaffold is ready for v2.1.</p>
        </div>
      </div>
      <div class="marketplace-tp-grid">
        ${(catalog.thirdParty || []).map((tp) => `
          <div class="marketplace-tp-card">
            <span class="tp-badge">Coming Soon</span>
            <h4>${escapeHtml(tp.name)}</h4>
            <p class="text-muted">${escapeHtml(tp.description || '')}</p>
            <div class="tp-meta">
              <span><i class="fa-solid fa-user-pen"></i> ${escapeHtml(tp.author)}</span>
              <span><i class="fa-solid fa-tag"></i> v${escapeHtml(tp.version)}</span>
            </div>
          </div>`).join('') || emptyState('Third-party registry empty — check back in v2.1.')}
      </div>
    </section>
  `;
}

function renderPackCards(packs, installedIds, companyId) {
  if (!packs.length) return emptyState('No packs in this category yet.');

  return packs.map((pack) => {
    const installed = installedIds.has(pack.id);
    const comingSoon = pack.status === 'coming_soon' || pack.installable === false;
    const catColor = pack.color || '#6366f1';

    return `
      <article class="marketplace-pack-card" style="--pack-color:${catColor}">
        <div class="pack-card-header">
          <span class="pack-icon">${pack.icon || '📦'}</span>
          <div>
            <h4>${escapeHtml(pack.name)}</h4>
            <div class="mp-card-meta">${renderStars(pack.rating)} <span class="mp-rating-count">(${pack.ratingCount || 0})</span>
              ${pack.isPaid ? '<span class="mp-price paid">Paid</span>' : '<span class="mp-price free">Free</span>'}
            </div>
            <p class="pack-tagline">${escapeHtml(pack.tagline || pack.description || '')}</p>
          </div>
        </div>
        <ul class="pack-includes">
          ${(pack.includes || []).slice(0, 4).map((item) => `<li><i class="fa-solid fa-check"></i> ${escapeHtml(item)}</li>`).join('')}
        </ul>
        <div class="pack-card-footer">
          <span class="pack-meta">${escapeHtml(pack.author || 'ZiricAI')} · v${escapeHtml(pack.version || '1.0')}</span>
          ${installed
            ? `<span class="pack-status installed"><i class="fa-solid fa-circle-check"></i> Installed</span>`
            : comingSoon
              ? `<span class="pack-status soon">Coming Soon</span>`
              : `<button type="button" class="btn btn-primary btn-sm install-pack-btn" data-pack-id="${escapeHtml(pack.id)}" ${!companyId ? 'disabled title="Select a company first"' : ''}>
                  <i class="fa-solid fa-download"></i> Install
                </button>`}
        </div>
      </article>`;
  }).join('');
}

function bindEvents(container, catalog, companies, companyId, installed) {
  const packGrid = container.querySelector('#packGrid');
  const titleEl = container.querySelector('#packsSectionTitle');
  const clearBtn = container.querySelector('#clearCategoryFilter');
  const installedIds = new Set(installed.map((p) => p.packId));

  const reloadCatalog = async () => {
    const q = container.querySelector('#mpSearch')?.value || '';
    const price = container.querySelector('#mpPrice')?.value || '';
    const sort = container.querySelector('#mpSort')?.value || '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (selectedCategory) params.set('category', selectedCategory);
    if (price) params.set('price', price);
    if (sort) params.set('sort', sort);
    const res = await fetchMarketplaceCatalog(params.toString());
    const packs = res.data?.packs || catalog.packs;
    packGrid.innerHTML = renderPackCards(
      selectedCategory ? packs.filter((p) => p.category === selectedCategory || p.legacyCategory === selectedCategory) : packs.filter((p) => p.installable !== false && p.status !== 'coming_soon'),
      installedIds,
      companyId
    );
    bindInstallButtons(container, companyId);
  };

  container.querySelector('#mpSearch')?.addEventListener('input', () => setTimeout(reloadCatalog, 300));
  container.querySelector('#mpPrice')?.addEventListener('change', reloadCatalog);
  container.querySelector('#mpSort')?.addEventListener('change', reloadCatalog);

  container.querySelector('#categoryGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    selectedCategory = btn.dataset.category;
    const cat = catalog.categories.find((c) => c.id === selectedCategory);
    const packs = catalog.packs.filter((p) => p.category === selectedCategory);
    packGrid.innerHTML = renderPackCards(packs, installedIds, companyId);
    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-box-open"></i> ${escapeHtml(cat?.label || 'Packs')}`;
    clearBtn?.classList.remove('hidden');
    bindInstallButtons(container, companyId);
  });

  clearBtn?.addEventListener('click', () => {
    selectedCategory = null;
    packGrid.innerHTML = renderPackCards(
      catalog.packs.filter((p) => p.installable !== false && p.status !== 'coming_soon'),
      installedIds,
      companyId
    );
    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-box-open"></i> AI Employee Packs`;
    clearBtn.classList.add('hidden');
    bindInstallButtons(container, companyId);
  });

  bindInstallButtons(container, companyId);

  container.querySelectorAll('.installed-actions [data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });
}

function bindInstallButtons(container, companyId) {
  container.querySelectorAll('.install-pack-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!companyId) {
        showToast('Select a company in the top bar first', 'warning');
        return;
      }
      const packId = btn.dataset.packId;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Installing…';

      const result = await installMarketplacePack(companyId, packId, { demoMode: true });
      if (result.error) {
        showToast(result.error, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-download"></i> Install';
        return;
      }

      const data = result.data || {};
      const summary = data.verifiedSummary || data.validation?.summary;
      showToast(summary || data.message || 'Pack installed successfully!', 'success');

      if (data.links) {
        setTimeout(() => {
          showToast('Open AI Employees, Knowledge, or Automation to view new resources', 'info');
        }, 1200);
      }

      renderMarketplace(container);
    });
  });
}
