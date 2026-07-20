/** Role-based permissions for Company Admin Portal. */



export const PORTAL_ROLES = [
  'owner',
  'manager',
  'sales',
  'support',
  'reception',
  'marketing',
  'finance',
  'superadmin',
];



const ROLE_LABELS = {

  owner: 'Owner',

  manager: 'Manager',

  sales: 'Sales',

  support: 'Support',

  reception: 'Reception',

  marketing: 'Marketing',

  finance: 'Finance',

};



/** Permission matrix — which roles can perform each action. */

const PERMISSION_MATRIX = {

  canViewInbox: ['owner', 'manager', 'sales', 'support', 'reception'],

  canReply: ['owner', 'manager', 'sales', 'support', 'reception'],

  canEditAI: ['owner', 'manager', 'marketing'],

  canManageStaff: ['owner', 'manager'],

  canViewBilling: ['owner', 'finance'],

  canExportData: ['owner', 'manager', 'finance'],

};



/** Sidebar modules gated by permission key (null = always visible). */

export const MODULE_PERMISSIONS = {

  dashboard: null,

  agents: 'canEditAI',

  knowledge: 'canEditAI',

  customers: 'canViewInbox',

  appointments: 'canViewInbox',

  conversations: 'canViewInbox',

  automation: 'canEditAI',

  analytics: 'canExportData',

  team: 'canManageStaff',

  billing: 'canViewBilling',

  integrations: 'canEditAI',

  settings: null,

  notifications: null,

  activity: 'canManageStaff',

  marketplace: 'canManageStaff',

  support: null,

};



/**

 * @param {string | undefined | null} role

 * @returns {Record<string, boolean>}

 */

export function getPermissions(role) {
  const r = normalizeRole(role);
  const out = {};
  if (r === 'superadmin') {
    for (const key of Object.keys(PERMISSION_MATRIX)) {
      out[key] = true;
    }
    return out;
  }
  for (const [key, roles] of Object.entries(PERMISSION_MATRIX)) {
    out[key] = roles.includes(r);
  }
  return out;
}



/** @param {string | undefined | null} role */

export function normalizeRole(role) {
  return String(role || 'owner')
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '');
}



/** @param {string | undefined | null} role */

export function roleLabel(role) {

  const r = normalizeRole(role);

  return ROLE_LABELS[r] || r;

}



/**

 * @param {string | undefined | null} role

 * @param {keyof typeof PERMISSION_MATRIX} permission

 */

export function can(role, permission) {

  const allowed = PERMISSION_MATRIX[permission];

  if (!allowed) return false;

  return allowed.includes(normalizeRole(role));

}



/**

 * @param {string | undefined | null} role

 * @returns {string[]}

 */

export function getVisibleModules(role) {

  return Object.entries(MODULE_PERMISSIONS)

    .filter(([, perm]) => !perm || can(role, perm))

    .map(([mod]) => mod);

}



/**

 * @param {string | undefined | null} role

 * @param {string} moduleId

 */

export function canAccessModule(role, moduleId) {

  const perm = MODULE_PERMISSIONS[moduleId];

  if (!perm) return true;

  return can(role, perm);

}



/** Human-readable permission labels for team matrix UI. */

export const PERMISSION_LABELS = {

  canViewInbox: 'Can View Inbox',

  canReply: 'Can Reply',

  canEditAI: 'Can Edit AI',

  canManageStaff: 'Can Manage Staff',

  canViewBilling: 'Can View Billing',

  canExportData: 'Can Export Data',

};

