/**
 * Finance module — Sarah workspace (full-page chat, F-Sarah 1 read-only integration).
 */
import { escapeHtml } from '../admin/ui.js';
import { sarahPageAvatarMarkup } from '../shared/sarahAvatar.js';
import { mountSarahChat } from './sarah/sarah-ui.js';
import { buildFinanceSarahPageContext } from './financeSarahContext.js';
import { state } from './core/dataStore.js';
import { can } from './permissions.js';

const FINANCE_WELCOME =
  "Hi! I'm Sarah, your Finance assistant. I can explain workspace Finance, permissions, and what's live vs preview in this module. In this phase I don't create quotations, invoices, or transactions from chat — use the Finance screens for that.";

export const FINANCE_SARAH_SUGGESTIONS = [
  'What can I do in Finance today?',
  'Explain Overview vs Income vs Expenses',
  'Which workspaces are preview only?',
  'What is the difference between Finance and Billing?',
  'What can a viewer role do in Finance?',
];

export const FINANCE_SARAH_CAPABILITIES = [
  { icon: 'fa-chart-pie', label: 'Finance Overview & KPIs' },
  { icon: 'fa-arrow-trend-up', label: 'Income, invoices & quotations' },
  { icon: 'fa-arrow-trend-down', label: 'Expenses & payables' },
  { icon: 'fa-shield-halved', label: 'Permissions & preview workspaces' },
  { icon: 'fa-credit-card', label: 'Finance vs subscription Billing' },
];

/** @type {(() => object) | null} */
let finGetter = null;

export function renderFinanceSarahPageShell() {
  return `<div class="portal-sarah-page fin-sarah-page">
    <aside class="portal-sarah-page-aside" aria-label="Sarah Finance assistant">
      <div class="portal-sarah-page-brand">
        ${sarahPageAvatarMarkup()}
        <div>
          <h2 class="portal-sarah-page-title">Sarah</h2>
          <p class="portal-sarah-page-subtitle">Finance Assistant</p>
        </div>
      </div>
      <p class="portal-sarah-page-intro">
        Full-screen chat for Finance guidance. Sarah uses your current Finance workspace context and your role — she does not create ledger records from chat in this phase.
      </p>
      <h3 class="portal-sarah-page-aside-heading">Can help with</h3>
      <ul class="portal-sarah-cap-list">
        ${FINANCE_SARAH_CAPABILITIES.map(
          (c) =>
            `<li><i class="fa-solid ${escapeHtml(c.icon)}"></i><span>${escapeHtml(c.label)}</span></li>`
        ).join('')}
      </ul>
      <h3 class="portal-sarah-page-aside-heading">Try asking</h3>
      <ul class="portal-sarah-try-list">
        ${FINANCE_SARAH_SUGGESTIONS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    </aside>
    <section class="portal-sarah-page-main" aria-label="Chat with Sarah">
      <header class="portal-sarah-page-main-header">
        <div>
          <strong>Conversation</strong>
          <span class="text-muted">Shift+Enter for a new line · Enter to send</span>
        </div>
      </header>
      <div class="portal-sarah-page-chat" id="finSarahPageChat" data-fin-sarah-page-chat></div>
    </section>
  </div>`;
}

/**
 * @param {HTMLElement} chatRoot
 * @param {() => object} getFinState
 */
export async function mountFinanceSarahPageChat(chatRoot, getFinState) {
  if (!chatRoot) return;
  finGetter = getFinState;
  chatRoot.innerHTML = '';
  chatRoot.removeAttribute('data-mounted');
  await mountSarahChat(chatRoot, {
    mode: 'page',
    persistenceScope: 'finance',
    sessionSurface: 'portal-finance',
    getPageContext: () => buildFinanceSarahPageContext(getFinState?.()),
    welcomeMessage: FINANCE_WELCOME,
    suggestions: FINANCE_SARAH_SUGGESTIONS,
  });
  chatRoot.querySelector('#portalSarahInput')?.focus();
}

/** @param {HTMLElement} container @param {() => object} getFinState */
export function initFinanceSarah(container, getFinState) {
  if (!can(state.profile?.role, 'canViewFinance')) return;
  finGetter = getFinState;
  container.dataset.finSarahInit = '1';
}

/** @param {HTMLElement} container @param {() => object} getFinState */
export async function syncFinanceSarahAfterPaint(container, getFinState) {
  finGetter = getFinState;
  const fin = getFinState?.();
  if (fin?.workspace !== 'sarah') return;
  const chatRoot = container.querySelector('[data-fin-sarah-page-chat]');
  if (chatRoot) await mountFinanceSarahPageChat(chatRoot, getFinState);
}

/** @deprecated FAB/drawer removed — Sarah is a Finance workspace nav item */
export function renderFinanceSarahChrome() {
  return '';
}
