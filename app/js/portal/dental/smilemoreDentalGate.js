/**
 * Dental practice portal modules (Command Center, client file, medical aid, till).
 * UI/navigation guard — backend uses isDentalPracticeCompany.
 */
import { state } from '../core/dataStore.js';
import { isDentalPracticePortalTenant } from './dentalPreset.js';

export const SMILEMORE_DEMO_COMPANY_ID = 'smilemore-demo';

export function isSmilemoreDentalCommandCentreTenant(companyId) {
  return isDentalPracticePortalTenant(companyId, state.company);
}

const LINK_LABELS = {
  dashboard: 'Overview',
  dentalCommandCentre: 'Command Center',
  appointments: 'Bookings',
  dentalPatients: 'Client database',
  dentalMedicalAid: 'Medical aid',
  dentalPos: 'Point of Sale',
  customers: 'CRM',
  analytics: 'Analytics',
  agents: 'AI Employees',
  knowledge: 'Knowledge Base',
  automation: 'Automation',
  billing: 'Billing',
  integrations: 'Integrations',
  team: 'Team',
  settings: 'Settings',
  conversations: 'Sarah Sales',
  finance: 'Sarah Finance',
  operations: 'Sarah Operations',
  hr: 'Sarah HR',
  sarah: 'Sarah Admin',
};

/** The practice record: one phone number joins diary, client file, till, claims, and CRM. */
export function smilemorePracticeRibbon() {
  return smilemoreModuleLinks([
    'dashboard',
    'dentalCommandCentre',
    'conversations',
    'appointments',
    'dentalPatients',
    'dentalMedicalAid',
    'dentalPos',
    'customers',
    'analytics',
  ]);
}

/** Buttons that open SmileMore modules. data-nav is handled by the portal router. */
export function smilemoreModuleLinks(pages) {
  const buttons = pages
    .filter((page) => LINK_LABELS[page])
    .map((page) => `<button class="btn btn-secondary btn-sm" type="button" data-nav="${page}">${LINK_LABELS[page]}</button>`)
    .join('');
  return buttons ? `<div class="dental-booking__actions" style="margin:12px 0;">${buttons}</div>` : '';
}
