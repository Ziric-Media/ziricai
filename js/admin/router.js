import { state, setState } from './state.js';
import { MODULE_LABELS, MODULES } from './core/moduleRegistry.js';

import { renderDashboard } from './modules/dashboard.js';

import { renderCommandCenter } from './modules/command-center.js';

import { renderCompanies } from './modules/companies.js';

import { renderMarketplace } from './modules/marketplace.js';

import { renderAgents } from './modules/agents.js';

import { renderKnowledge } from './modules/knowledge.js';

import { renderConversations } from './modules/conversations.js';

import { renderCustomers } from './modules/customers.js';

import { renderAutomation } from './modules/automation.js';

import { renderAnalytics } from './modules/analytics.js';

import { renderBilling } from './modules/billing.js';

import { renderSettings } from './modules/settings.js';

import { errorState, loadingState } from './ui.js';

// Plugin-ready module registry — see js/admin/core/moduleRegistry.js
void MODULES;



/** Breadcrumb titles — sourced from module registry scaffold. */
const PAGE_TITLES = { ...MODULE_LABELS };



const RENDERERS = {

  dashboard: renderDashboard,

  commandCenter: renderCommandCenter,

  companies: renderCompanies,

  marketplace: renderMarketplace,

  agents: renderAgents,

  knowledge: renderKnowledge,

  conversations: renderConversations,

  customers: renderCustomers,

  automation: renderAutomation,

  analytics: renderAnalytics,

  billing: renderBilling,

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

