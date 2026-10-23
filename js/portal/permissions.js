/** Role-based permissions for Company Admin Portal. */



/** Legacy / invite aliases map to these canonical portal roles. */
const ROLE_ALIASES = {
  member: 'support',
  staff: 'support',
  agent: 'sales',
  admin: 'manager',
  administrator: 'manager',
  readonly: 'viewer',
};

export const PORTAL_ROLES = [
  'owner',
  'manager',
  'hr',
  'sales',
  'support',
  'reception',
  'marketing',
  'finance',
  'viewer',
  'superadmin',
];

/** Roles shown in team invite + permissions matrix (no platform roles). */
export const STAFF_PORTAL_ROLES = PORTAL_ROLES.filter((r) => r !== 'superadmin');



const ROLE_LABELS = {

  owner: 'Owner',

  manager: 'Manager',

  sales: 'Sales',

  support: 'Support',

  reception: 'Reception',

  marketing: 'Marketing',

  finance: 'Finance',
  hr: 'HR',
  viewer: 'Viewer (read-only)',

};



/** Permission matrix — which roles can perform each action. */

const PERMISSION_MATRIX = {

  canViewInbox: ['owner', 'manager', 'sales', 'support', 'reception', 'viewer'],

  canReply: ['owner', 'manager', 'sales', 'support', 'reception'],

  canEditAI: ['owner', 'manager', 'marketing'],

  canManageStaff: ['owner', 'manager'],

  canViewBilling: ['owner', 'finance'],

  canExportData: ['owner', 'manager', 'finance'],

  /** Branding, communications templates, workspace links. */
  canManageWorkspace: ['owner', 'manager'],

  /** WhatsApp and third-party channel configuration. */
  canManageIntegrations: ['owner', 'manager'],

  /** Portal knowledge write — owners only. */
  canUploadKnowledge: ['owner'],

  canRunAutomations: ['owner', 'manager', 'marketing'],

  canViewTasks: ['owner', 'manager', 'finance', 'hr', 'sales', 'support', 'reception', 'marketing', 'viewer'],
  canCreateTasks: ['owner', 'manager'],
  canAssignTasks: ['owner', 'manager'],
  canUpdateOwnTasks: ['owner', 'manager', 'finance', 'hr', 'sales', 'support', 'reception', 'marketing', 'viewer'],
  canUpdateAnyTask: ['owner', 'manager'],
  canCompleteTasks: ['owner', 'manager', 'finance', 'hr', 'sales', 'support', 'reception', 'marketing', 'viewer'],

  canViewFinance: ['owner', 'manager', 'finance', 'viewer'],
  canCreateFinance: ['owner', 'manager', 'finance'],
  canUpdateFinance: ['owner', 'manager', 'finance'],
  canVoidFinance: ['owner', 'finance'],
  canExportFinance: ['owner', 'manager', 'finance'],

  /** HR workspace landing (preview sections); not confidential employee records. */
  canViewHr: ['owner', 'manager', 'hr', 'viewer'],
  canManageHr: ['owner', 'manager', 'hr'],

};

/** Sarah specialist workspaces — owners always discover; feature gates remain on actions/APIs. */
export const SARAH_WORKSPACE_MODULE_IDS = new Set([
  'sarah',
  'conversations',
  'finance',
  'operations',
  'hr',
]);



/** Sidebar modules gated by permission key (null = always visible). */

export const MODULE_PERMISSIONS = {

  dashboard: null,

  automotiveCommandCentre: null,

  sarah: null,

  agents: 'canEditAI',

  knowledge: 'canEditAI',

  customers: 'canViewInbox',

  appointments: 'canViewInbox',

  conversations: 'canViewInbox',

  automation: 'canEditAI',

  analytics: 'canExportData',

  team: 'canManageStaff',

  billing: 'canViewBilling',

  integrations: 'canManageIntegrations',

  settings: null,

  notifications: null,

  activity: 'canManageStaff',

  marketplace: 'canManageStaff',

  support: null,

  /** Operations Centre (Phase 1) — task workspace. */
  operations: 'canViewTasks',

  /** Company workspace finance (not subscription billing). */
  finance: 'canViewFinance',

  /** Sarah HR — people-management workspace (preview-first). */
  hr: 'canViewHr',

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

/** Least-privilege effective role for UI gating (must match server SEC-04). */
export function resolveEffectivePortalRole(role) {
  const raw = String(role || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '');
  if (!raw) return 'viewer';
  if (raw === 'superadmin') return 'superadmin';
  const normalized = ROLE_ALIASES[raw] || raw;
  if (PORTAL_ROLES.includes(normalized)) return normalized;
  return 'viewer';
}

export function normalizeRole(role) {
  return resolveEffectivePortalRole(role);
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

  const r = normalizeRole(role);
  if (r === 'superadmin') return true;

  const allowed = PERMISSION_MATRIX[permission];

  if (!allowed) return false;

  return allowed.includes(r);

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

export function canDiscoverSarahWorkspace(role, moduleId) {
  return normalizeRole(role) === 'owner' && SARAH_WORKSPACE_MODULE_IDS.has(moduleId);
}

export function canAccessModule(role, moduleId) {
  if (canDiscoverSarahWorkspace(role, moduleId)) return true;

  const perm = MODULE_PERMISSIONS[moduleId];
  if (!perm) return true;
  return can(role, perm);
}



/** Human-readable permission labels for team matrix UI. */

export const PERMISSION_LABELS = {

  canViewInbox: 'Can View Inbox',

  canReply: 'Can Reply',

  canEditAI: 'Can Edit AI',

  canUploadKnowledge: 'Can Upload Knowledge',

  canManageStaff: 'Can Manage Staff',

  canManageWorkspace: 'Can Manage Workspace Settings',

  canManageIntegrations: 'Can Manage Integrations',

  canViewBilling: 'Can View Billing',

  canExportData: 'Can Export Data',

  canViewTasks: 'Can View Tasks',
  canCreateTasks: 'Can Create Tasks',
  canAssignTasks: 'Can Assign Tasks',
  canUpdateOwnTasks: 'Can Update Own Tasks',
  canUpdateAnyTask: 'Can Update Any Task',
  canCompleteTasks: 'Can Complete Tasks',

  canViewFinance: 'Can View Finance',
  canCreateFinance: 'Can Create Finance Records',
  canUpdateFinance: 'Can Update Finance Records',
  canVoidFinance: 'Can Void Finance Records',
  canExportFinance: 'Can Export Finance Data',

  canViewHr: 'Can View HR Workspace',
  canManageHr: 'Can Manage HR Records',

};

/** Roles assignable when inviting (never owner or superadmin). */
export function invitableRoles() {
  return STAFF_PORTAL_ROLES.filter((r) => r !== 'owner');
}

