/**
 * Portal BOS — dynamic module imports with loading skeleton.
 */
import { renderLoadingSkeleton } from './widgets/loadingSkeleton.js';

/** @type {Map<string, Promise<{ render: Function }>>} */
const moduleCache = new Map();

const MODULE_IDS = [
  'dashboard',
  'agents',
  'knowledge',
  'customers',
  'conversations',
  'appointments',
  'automation',
  'analytics',
  'marketplace',
  'billing',
  'integrations',
  'settings',
  'notifications',
  'support',
  'team',
  'activity',
];

const EXPORT_MAP = {
  dashboard: 'renderDashboard',
  agents: 'renderAgents',
  knowledge: 'renderKnowledge',
  customers: 'renderCustomers',
  conversations: 'renderConversations',
  appointments: 'renderAppointments',
  automation: 'renderAutomation',
  analytics: 'renderAnalytics',
  marketplace: 'renderMarketplace',
  billing: 'renderBilling',
  integrations: 'renderIntegrations',
  settings: 'renderSettings',
  notifications: 'renderNotifications',
  support: 'renderSupport',
  team: 'renderTeam',
  activity: 'renderActivity',
};

/**
 * @param {string} moduleId
 * @returns {Promise<(container: HTMLElement) => Promise<void> | void>}
 */
export async function loadModule(moduleId) {
  const id = MODULE_IDS.includes(moduleId) ? moduleId : 'dashboard';

  if (!moduleCache.has(id)) {
    moduleCache.set(
      id,
      import(`../modules/${id}.js`).then((mod) => {
        const exportName = EXPORT_MAP[id];
        const render = mod[exportName];
        if (typeof render !== 'function') {
          throw new Error(`Module ${id} missing export ${exportName}`);
        }
        return { render };
      })
    );
  }

  const mod = await moduleCache.get(id);
  return mod.render;
}

/**
 * @param {HTMLElement} container
 * @param {string} [label]
 */
export function showModuleSkeleton(container, label = 'Loading module…') {
  container.innerHTML = renderLoadingSkeleton({ label, rows: 3, cards: 4 });
}

/**
 * Prefetch likely next modules (non-blocking).
 * @param {string[]} moduleIds
 */
export function prefetchModules(moduleIds = ['conversations', 'customers', 'notifications']) {
  moduleIds.forEach((id) => {
    if (MODULE_IDS.includes(id) && !moduleCache.has(id)) {
      loadModule(id).catch(() => {});
    }
  });
}

export { MODULE_IDS };
