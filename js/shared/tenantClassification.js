/**
 * Read-only tenant classification for Mission Control (MC-U-0.2 / MC-U-1B).
 * Policy: docs/architecture/TENANT_TAXONOMY.md
 *
 * Never infers PRODUCTION CUSTOMER from absence of test patterns.
 */

export const TENANT_CLASS = {
  PRODUCTION_CUSTOMER: 'PRODUCTION CUSTOMER',
  PILOT: 'PILOT',
  ACCEPTANCE: 'ACCEPTANCE',
  DEMO_SHOWCASE: 'DEMO/SHOWCASE',
  TEST: 'TEST',
  UNKNOWN: 'UNKNOWN',
};

const KNOWN_PILOT = new Set(['central-motors-rtb']);
const KNOWN_DEMO = new Set(['demo-central-motors', 'demo-econo-funerals']);
const KNOWN_ACCEPTANCE = new Set([
  'client2-tp2c-accept-20260917',
  'client2-tp1-accept-20260915',
]);

const ACCEPTANCE_ID_PATTERNS = [
  /^client2-tp/i,
  /^tp2c-/i,
  /-accept-/i,
  /acceptance/i,
];

const TEST_ID_PATTERNS = [
  /^portal-4/i,
  /^portal-/i,
  /-test-/i,
  /-lc-test-/i,
  /registry-test/i,
  /entitlement/i,
  /lifecycle-test/i,
  /smoke-/i,
  /harness/i,
];

function companyKey(company) {
  return company?.id || company?.companyId || '';
}

function normalizeStoredClass(raw) {
  if (!raw) return null;
  const token = String(raw).toLowerCase().replace(/[\s_-]+/g, '_');
  if (token === 'production_customer' || token === 'real_customer' || token === 'productioncustomer') {
    return TENANT_CLASS.PRODUCTION_CUSTOMER;
  }
  if (token === 'demo_showcase' || token === 'demo') return TENANT_CLASS.DEMO_SHOWCASE;
  if (token === 'test') return TENANT_CLASS.TEST;
  if (token === 'acceptance') return TENANT_CLASS.ACCEPTANCE;
  if (token === 'pilot') return TENANT_CLASS.PILOT;
  if (token === 'unknown') return TENANT_CLASS.UNKNOWN;
  const upper = String(raw).toUpperCase();
  if (Object.values(TENANT_CLASS).includes(upper)) return upper;
  return null;
}

function readKnownProductionCustomerIds() {
  if (typeof globalThis === 'undefined') return new Set();
  const cfg = globalThis.__ZIRICAI_CONFIG__;
  const list = cfg?.knownProductionCustomerIds;
  if (!Array.isArray(list)) return new Set();
  return new Set(list.map((s) => String(s).trim()).filter(Boolean));
}

/**
 * @param {object} company — platform company list item
 * @returns {{
 *   classification: string,
 *   classificationSource: string,
 *   classificationConfidence: 'HIGH'|'MEDIUM'|'LOW',
 *   evidence: string[]
 * }}
 */
export function classifyTenant(company) {
  const evidence = [];
  const companyId = companyKey(company);
  const id = String(companyId).toLowerCase();
  const ownerEmail = company?.ownerEmail || company?.email || '';
  const email = String(ownerEmail).toLowerCase();
  const displayName = String(company?.name || '');
  const settings = company?.settings || {};

  const storedRaw =
    settings.tenantClass || settings.general?.tenantClass || settings.censusClass || null;
  const stored = normalizeStoredClass(storedRaw);
  if (stored) {
    evidence.push(`settings.tenantClass=${storedRaw}`);
    return {
      classification: stored,
      classificationSource: 'stored_metadata',
      classificationConfidence: 'HIGH',
      evidence,
    };
  }

  if (settings.productionCustomer === true || settings.isProductionCustomer === true) {
    evidence.push('settings.productionCustomer === true');
    return {
      classification: TENANT_CLASS.PRODUCTION_CUSTOMER,
      classificationSource: 'stored_metadata',
      classificationConfidence: 'HIGH',
      evidence,
    };
  }

  const operatorIds = readKnownProductionCustomerIds();
  if (operatorIds.has(companyId)) {
    evidence.push('knownProductionCustomerIds (operator config)');
    return {
      classification: TENANT_CLASS.PRODUCTION_CUSTOMER,
      classificationSource: 'operator_registry',
      classificationConfidence: 'HIGH',
      evidence,
    };
  }

  if (KNOWN_PILOT.has(companyId)) {
    evidence.push(`known pilot id (${companyId})`);
    return {
      classification: TENANT_CLASS.PILOT,
      classificationSource: 'operator_policy',
      classificationConfidence: 'HIGH',
      evidence,
    };
  }

  if (KNOWN_ACCEPTANCE.has(companyId)) {
    evidence.push(`known acceptance id (${companyId})`);
    return {
      classification: TENANT_CLASS.ACCEPTANCE,
      classificationSource: 'operator_policy',
      classificationConfidence: 'HIGH',
      evidence,
    };
  }

  if (KNOWN_DEMO.has(companyId) || id.startsWith('demo-')) {
    if (KNOWN_DEMO.has(companyId)) evidence.push(`known demo id (${companyId})`);
    if (id.startsWith('demo-')) evidence.push('companyId prefix demo-');
    return {
      classification: TENANT_CLASS.DEMO_SHOWCASE,
      classificationSource: 'operator_policy',
      classificationConfidence: 'HIGH',
      evidence,
    };
  }

  for (const re of ACCEPTANCE_ID_PATTERNS) {
    if (re.test(id) || re.test(displayName.toLowerCase())) {
      evidence.push(`acceptance pattern ${re}`);
      return {
        classification: TENANT_CLASS.ACCEPTANCE,
        classificationSource: 'gate_harness',
        classificationConfidence: 'MEDIUM',
        evidence,
      };
    }
  }

  for (const re of TEST_ID_PATTERNS) {
    if (re.test(id)) {
      evidence.push(`test pattern ${re}`);
    }
  }
  if (/portal-4b|portal-4c|portal-6c|portal-6e|6c6e|4c4b/i.test(id)) {
    evidence.push('Portal gate id prefix (4B/4C/6C/6E)');
  }
  if (email.endsWith('@ziricai.com')) {
    evidence.push(`ownerEmail @ziricai.com (${ownerEmail})`);
  }

  if (evidence.length) {
    return {
      classification: TENANT_CLASS.TEST,
      classificationSource: 'gate_harness',
      classificationConfidence: evidence.length >= 2 ? 'HIGH' : 'MEDIUM',
      evidence,
    };
  }

  evidence.push('no classification heuristics matched');
  return {
    classification: TENANT_CLASS.UNKNOWN,
    classificationSource: 'manual_review',
    classificationConfidence: 'LOW',
    evidence,
  };
}

/** @param {object[]} companies */
export function summarizeByClassification(companies) {
  const summary = {
    total: companies.length,
    [TENANT_CLASS.PRODUCTION_CUSTOMER]: 0,
    [TENANT_CLASS.PILOT]: 0,
    [TENANT_CLASS.ACCEPTANCE]: 0,
    [TENANT_CLASS.DEMO_SHOWCASE]: 0,
    [TENANT_CLASS.TEST]: 0,
    [TENANT_CLASS.UNKNOWN]: 0,
  };
  for (const company of companies) {
    const { classification } = classifyTenant(company);
    if (summary[classification] != null) summary[classification] += 1;
    else summary[TENANT_CLASS.UNKNOWN] += 1;
  }
  return summary;
}

export function tenantClassFilterOptions() {
  return [
    { value: '', label: 'All' },
    { value: TENANT_CLASS.PRODUCTION_CUSTOMER, label: 'Production' },
    { value: TENANT_CLASS.PILOT, label: 'Pilot' },
    { value: TENANT_CLASS.ACCEPTANCE, label: 'Acceptance' },
    { value: TENANT_CLASS.DEMO_SHOWCASE, label: 'Demo' },
    { value: TENANT_CLASS.TEST, label: 'Test' },
    { value: TENANT_CLASS.UNKNOWN, label: 'Unknown' },
  ];
}
