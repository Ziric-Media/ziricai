/**
 * Mission Control tenant scope labels (MC-U-2D) — disambiguate duplicate display names.
 */
import { classifyTenant } from '../../shared/tenantClassification.js';

const CLASS_SHORT = {
  'PRODUCTION CUSTOMER': 'Prod',
  PILOT: 'Pilot',
  ACCEPTANCE: 'Acc',
  'DEMO/SHOWCASE': 'Demo',
  TEST: 'Test',
  UNKNOWN: 'Unknown',
};

/** @param {{ id?: string, name?: string }} company */
export function formatScopeOptionLabel(company) {
  if (!company?.id) return 'Unknown tenant';
  const name = String(company.name || company.id).trim();
  const { classification } = classifyTenant(company);
  const short = CLASS_SHORT[classification] || 'Unknown';
  return `${name} · ${company.id} · ${short}`;
}
