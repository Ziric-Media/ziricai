import {
  createDocument,
  getDocument,
  listDocuments,
  removeDocument,
  updateDocument,
} from './firestore-base.js';
import {
  fetchPlatformCompanies,
  createPlatformCompany,
  updatePlatformCompany,
  deletePlatformCompany,
} from '../api.js';
import { DEMO_COMPANIES, PLAN_AMOUNTS } from '../demo-data.js';
import { isDemoDataAllowed, shouldUseDemoForEmptyOrError } from './dataMode.js';
import { getPlan } from '../../shared/billingPlans.js';

const COLLECTION = 'companies';
const DEMO_STORE_KEY = 'ziricai-demo-companies';
const DEMO_DATA_VERSION = '2025-07-companies-v2';
const DEMO_VERSION_KEY = 'ziricai-demo-companies-version';

/** @returns {object[]} */
function loadDemoStore() {
  if (localStorage.getItem(DEMO_VERSION_KEY) !== DEMO_DATA_VERSION) {
    localStorage.removeItem(DEMO_STORE_KEY);
    localStorage.setItem(DEMO_VERSION_KEY, DEMO_DATA_VERSION);
    return DEMO_COMPANIES.map((c) => ({ ...c }));
  }
  try {
    const stored = localStorage.getItem(DEMO_STORE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEMO_COMPANIES.map((c) => ({ ...c }));
}

function saveDemoStore(items) {
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(items));
}

function shouldUseDemo(result) {
  return shouldUseDemoForEmptyOrError(result);
}

function normalizePayload(data, existing = null) {
  const plan = data.plan || existing?.plan || 'business';
  const billing = {
    planAmount: Number(data.billing?.planAmount ?? data.planAmount ?? PLAN_AMOUNTS[plan] ?? getPlan(plan).price),
    currency: data.billing?.currency || existing?.billing?.currency || 'ZAR',
    status: data.billing?.status || existing?.billing?.status || 'pending',
    cycle: data.billing?.cycle || existing?.billing?.cycle || 'monthly',
  };

  return {
    name: String(data.name || existing?.name || '').trim(),
    industry: data.industry ?? existing?.industry ?? '',
    plan,
    status: data.status || existing?.status || 'active',
    owner: data.owner ?? existing?.owner ?? '',
    ownerEmail: data.ownerEmail ?? existing?.ownerEmail ?? '',
    ownerPhone: data.ownerPhone ?? existing?.ownerPhone ?? '',
    email: data.email ?? existing?.email ?? '',
    phone: data.phone ?? existing?.phone ?? '',
    website: data.website ?? existing?.website ?? '',
    logoUrl: data.logoUrl ?? existing?.logoUrl ?? '',
    knowledgeBaseId: data.knowledgeBaseId ?? existing?.knowledgeBaseId ?? null,
    knowledgeBaseName: data.knowledgeBaseName ?? existing?.knowledgeBaseName ?? '',
    knowledgeAutoSync: Boolean(data.knowledgeAutoSync ?? existing?.knowledgeAutoSync ?? true),
    knowledgeMaxDocs: Number(data.knowledgeMaxDocs ?? existing?.knowledgeMaxDocs ?? 500),
    agentId: data.agentId ?? existing?.agentId ?? null,
    agentName: data.agentName ?? existing?.agentName ?? '',
    aiModel: data.aiModel ?? existing?.aiModel ?? 'gpt-4o-mini',
    aiTemperature: Number(data.aiTemperature ?? existing?.aiTemperature ?? 0.7),
    whatsappNumber: data.whatsappNumber ?? existing?.whatsappNumber ?? '',
    whatsappConnected: Boolean(
      data.whatsappConnected ?? (data.whatsappNumber || existing?.whatsappNumber)
    ),
    whatsappBusinessId: data.whatsappBusinessId ?? existing?.whatsappBusinessId ?? '',
    whatsappWebhookUrl: data.whatsappWebhookUrl ?? existing?.whatsappWebhookUrl ?? '',
    openAiApiKey: data.openAiApiKey !== undefined ? data.openAiApiKey : (existing?.openAiApiKey || ''),
    usage: data.usage || existing?.usage || { messages: 0, tokens: 0, period: 'This month' },
    billing,
    settings: data.settings || existing?.settings || {},
  };
}

export function maskApiKey(key) {
  if (!key) return '—';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
}

/**
 * Normalize a platform company list item from GET /api/platform/companies.
 * whatsappConnected is integration-derived on the backend (B-MC-5a) — pass through only.
 */
export function normalizeCompanyItem(raw = {}) {
  const wa = raw.whatsappIntegration || null;
  return {
    ...raw,
    id: raw.id || raw.companyId,
    plan: raw.plan || raw.billing?.planId || 'trial',
    status: raw.status || 'active',
    whatsappConnected: raw.whatsappConnected === true,
    whatsappIntegration: wa
      ? {
          status: wa.status ?? null,
          phoneNumberId: wa.phoneNumberId ?? null,
          displayPhoneNumber: wa.displayPhoneNumber ?? null,
          credentialsSource: wa.credentialsSource ?? null,
          runtimeReady: wa.runtimeReady ?? null,
          missing: Array.isArray(wa.missing) ? wa.missing : [],
        }
      : {
          status: null,
          phoneNumberId: null,
          displayPhoneNumber: null,
          credentialsSource: null,
          runtimeReady: null,
          missing: [],
        },
  };
}

function mapPlatformCompanyResponse(api) {
  if (api.error) return { error: api.error };
  const company = api.data?.company;
  return {
    success: true,
    id: company?.id,
    item: company,
    company,
  };
}

export async function listCompanies() {
  const api = await fetchPlatformCompanies();

  if (!isDemoDataAllowed()) {
    if (api.error) {
      return { items: [], source: 'api', error: api.error, loadState: 'error' };
    }
    const items = (api.data?.items || []).map(normalizeCompanyItem);
    return {
      items,
      source: 'api',
      loadState: items.length ? 'ok' : 'empty',
    };
  }

  if (!api.error && api.data?.items?.length) {
    return {
      items: api.data.items.map(normalizeCompanyItem),
      source: 'api',
      loadState: 'ok',
      isDemo: false,
    };
  }

  const result = await listDocuments(COLLECTION, { orderByField: 'createdAt' });
  if (!shouldUseDemo(result)) {
    return {
      items: (result.items || []).map(normalizeCompanyItem),
      isDemo: false,
      error: result.error,
      loadState: result.error ? 'error' : 'empty',
    };
  }
  return { items: loadDemoStore(), isDemo: true, source: 'demo', loadState: 'demo' };
}

export async function getCompany(id) {
  if (!isDemoDataAllowed()) {
    return { error: 'Company not found' };
  }
  const result = await getDocument(COLLECTION, id);
  if (result.item) return result;
  const item = loadDemoStore().find((c) => c.id === id);
  if (item) return { item, isDemo: true };
  return { error: 'Company not found' };
}

export async function createCompany(data) {
  const payload = normalizePayload(data);
  if (!payload.name) return { error: 'Company name is required' };

  if (!isDemoDataAllowed()) {
    const api = await createPlatformCompany(payload);
    return mapPlatformCompanyResponse(api);
  }

  const result = await createDocument(COLLECTION, payload);
  if (!result.error) return result;

  const items = loadDemoStore();
  const id = `demo-co-${Date.now()}`;
  const item = { id, ...payload, createdAt: new Date().toISOString() };
  items.unshift(item);
  saveDemoStore(items);
  return { id, item, isDemo: true };
}

export async function updateCompany(id, data) {
  if (!isDemoDataAllowed()) {
    const api = await updatePlatformCompany(id, data);
    return mapPlatformCompanyResponse(api);
  }

  const result = await updateDocument(COLLECTION, id, data);
  if (!result.error) return result;

  const items = loadDemoStore();
  const index = items.findIndex((c) => c.id === id);
  if (index === -1) return { error: 'Company not found' };

  const merged = normalizePayload(data, items[index]);
  items[index] = { ...items[index], ...merged, updatedAt: new Date().toISOString() };
  saveDemoStore(items);
  return { success: true, item: items[index], isDemo: true };
}

export async function deleteCompany(id) {
  if (!isDemoDataAllowed()) {
    const api = await deletePlatformCompany(id);
    if (api.error) return { error: api.error };
    return { success: true };
  }

  const result = await removeDocument(COLLECTION, id);
  if (!result.error) return result;

  const items = loadDemoStore();
  const next = items.filter((c) => c.id !== id);
  if (next.length === items.length) return { error: 'Company not found' };
  saveDemoStore(next);
  return { success: true, isDemo: true };
}

export async function suspendCompany(id) {
  return updateCompany(id, { status: 'suspended' });
}

export async function activateCompany(id) {
  return updateCompany(id, { status: 'active' });
}
