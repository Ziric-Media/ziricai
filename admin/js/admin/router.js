import { state, setState } from './state.js';
import { MODULE_LABELS, MODULES } from './core/moduleRegistry.js';

import { renderDashboard } from './modules/dashboard.js';
import { renderCompanies } from './modules/companies.js';
import { renderCrm } from './modules/crm.js';
import { renderSarah } from './modules/sarah-mc.js';
import { renderBilling } from './modules/billing.js';
import { renderPlatformAnalytics } from './modules/platform-analytics.js';
import { renderSupportInbox } from './modules/support-inbox.js';
import { renderIntegrations } from './modules/integrations.js';
import { renderSupportPanel } from './modules/support-panel.js';
import { renderAgents } from './modules/agents.js';
import { renderKnowledge } from './modules/knowledge.js';
import { renderSettings } from './modules/settings.js';

import { errorState, loadingState } from './ui.js';

void MODULES;

const PAGE_TITLES = { ...MODULE_LABELS };

const RENDERERS = {
  dashboard: renderDashboard,
  companies: renderCompanies,
  crm: renderCrm,
  sarah: renderSarah,
  billing: renderBilling,
  platformAnalytics: renderPlatformAnalytics,
  supportInbox: renderSupportInbox,
  integrations: renderIntegrations,
  support: renderSupportPanel,
  agents: renderAgents,
  knowledge: renderKnowledge,
  settings: renderSettings,
};

export function navigateTo(page, params = {}) {
  if (params.phone) {
    setState({ selectedCustomerPhone: params.phone });
  }

  if (params.companyId !== undefined) {
    setState({ selectedCompanyId: params.companyId || null });
    const selector = document.getElementById('companySelector');
    if (selector) selector.value = params.companyId || '';
  }

  const renderer = RENDERERS[page] || RENDERERS.dashboard;

  setState({ currentPage: page });

  document.querySelectorAll('.sidebar-nav a').forEach((a) => a.classList.remove('active'));
  const link = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
  if (link) link.classList.add('active');

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] || 'Mission Control';

  const container = document.getElementById('pageContent');
  if (!container) return;
  container.innerHTML = loadingState('Loading...');
  Promise.resolve(renderer(container)).catch((err) => {
    console.error(`Failed to render ${page}:`, err);
    container.innerHTML = errorState(err?.message || 'Failed to load this page.');
  });
}

export function initRouter() {
  document.querySelectorAll('.sidebar-nav a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page) navigateTo(page);
    });
  });
}
