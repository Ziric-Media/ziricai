import { state, setState } from './state.js';
import { MODULE_LABELS, MODULES } from './core/moduleRegistry.js';

import { renderDashboard } from './modules/dashboard.js';
import { renderMcPlatformUsers } from './modules/mc-platform-users.js';
import { renderMcPlatformActivity } from './modules/mc-platform-activity.js';
import { renderMcPlatformSafety } from './modules/mc-platform-safety.js';
import { renderMcPlatformMonitor } from './modules/mc-platform-monitor.js';
import { renderMcPlatformComms } from './modules/mc-platform-comms.js';
import { renderMcOrgOversight } from './modules/mc-org-oversight.js';
import { renderMcPlatformAudit } from './modules/mc-platform-audit.js';
import { renderCompanies } from './modules/companies.js';
import {
  renderGovernmentOrganisations,
  renderPublicServiceOrganisations,
} from './modules/organisation-segment.js';
import { renderCrm } from './modules/crm.js';
import { renderSarah } from './modules/sarah-mc.js';
import { renderBilling } from './modules/billing.js';
import { renderPlatformAnalytics } from './modules/platform-analytics.js';
import { renderSupportInbox } from './modules/support-inbox.js';
import { renderIntegrations } from './modules/integrations.js';
import { renderSupportPanel } from './modules/support-panel.js';
import { renderSupportOperations } from './modules/support-operations.js';
import { renderSupportAttention } from './modules/support-attention.js';
import { renderAgents } from './modules/agents.js';
import { renderMarketplace } from './modules/marketplace.js';
import { renderSarahNetwork } from './modules/sarah-network.js';
import { renderMcRecommendations } from './modules/mc-recommendations.js';
import { renderKnowledge } from './modules/knowledge.js';
import { renderSettings } from './modules/settings.js';

import { errorState, loadingState } from './ui.js';
import { perfMark, perfNavClick } from '../shared/perfNav.js';

void MODULES;

const PAGE_TITLES = { ...MODULE_LABELS };

const RENDERERS = {
  dashboard: renderDashboard,
  mcPlatformUsers: renderMcPlatformUsers,
  mcPlatformActivity: renderMcPlatformActivity,
  mcPlatformSafety: renderMcPlatformSafety,
  mcPlatformMonitor: renderMcPlatformMonitor,
  mcPlatformComms: renderMcPlatformComms,
  mcOrgOversight: renderMcOrgOversight,
  mcPlatformAudit: renderMcPlatformAudit,
  companies: renderCompanies,
  government: renderGovernmentOrganisations,
  publicService: renderPublicServiceOrganisations,
  crm: renderCrm,
  sarah: renderSarah,
  billing: renderBilling,
  platformAnalytics: renderPlatformAnalytics,
  supportInbox: renderSupportInbox,
  integrations: renderIntegrations,
  support: renderSupportPanel,
  supportOperations: renderSupportOperations,
  supportAttention: renderSupportAttention,
  agents: renderAgents,
  marketplace: renderMarketplace,
  sarahNetwork: renderSarahNetwork,
  mcRecommendations: renderMcRecommendations,
  knowledge: renderKnowledge,
  settings: renderSettings,
};

export function navigateTo(page, params = {}) {
  perfMark('mc.navigateTo', { detail: page });
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
  perfMark('mc.loadingState painted', { detail: page });
  Promise.resolve(renderer(container))
    .then(() => perfMark('mc.module rendered', { detail: page }))
    .catch((err) => {
    console.error(`Failed to render ${page}:`, err);
    container.innerHTML = errorState(err?.message || 'Failed to load this page.');
  });
}

export function initRouter() {
  document.querySelectorAll('.sidebar-nav a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page) {
        perfNavClick(page);
        navigateTo(page);
      }
    });
  });
}
