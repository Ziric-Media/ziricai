/**
 * Plugin-ready module registry (scaffold).
 * Future: lazy-load renderers by id; register third-party admin modules here.
 */
export const MODULES = [
  'dashboard',
  'commandCenter',
  'companies',
  'marketplace',
  'agents',
  'knowledge',
  'conversations',
  'customers',
  'automation',
  'analytics',
  'billing',
  'settings',
];

export const MODULE_LABELS = {
  dashboard: 'Mission Control',
  commandCenter: 'Command Center',
  companies: 'Companies',
  marketplace: 'Marketplace',
  agents: 'AI Employees',
  knowledge: 'Knowledge Base',
  conversations: 'Live Conversations',
  customers: 'Customers',
  automation: 'Automation',
  analytics: 'Analytics',
  billing: 'Billing',
  settings: 'Settings',
};
