import {
  createDocument,
  getDocument,
  listDocuments,
  removeDocument,
  updateDocument,
} from './firestore-base.js';
import { fetchPlatformCompanies } from '../api.js';
import { DEMO_COMPANIES, PLAN_AMOUNTS } from '../demo-data.js';
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
  return Boolean(result?.error) || !result?.items?.length;
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

export async function listCompanies() {
  try {
    const platform = await fetchPlatformCompanies();
    if (platform?.items?.length) {
      return {
        items: platform.items.map((c) => ({
          ...c,
          plan: c.plan || c.billing?.planId || 'trial',
          status: c.status || 'active',
        })),
        isDemo: false,
        source: 'platform-registry',
      };
    }
  } catch {
    /* fall through to Firestore / local demo */
  }

  const result = await listDocuments(COLLECTION, { orderByField: 'createdAt' });
  if (!shouldUseDemo(result)) return result;
  // TEMP: demo fallback when Firestore empty/unavailable
  return { items: loadDemoStore(), isDemo: true };
}

export async function getCompany(id) {
  const result = await getDocument(COLLECTION, id);
  if (result.item) return result;
  const item = loadDemoStore().find((c) => c.id === id);
  if (item) return { item, isDemo: true };
  return { error: 'Company not found' };
}

export async function createCompany(data) {
  const payload = normalizePayload(data);
  if (!payload.name) return { error: 'Company name is required' };

  const result = await createDocument(COLLECTION, payload);
  if (!result.error) return result;

  // TEMP: demo fallback when Firestore write fails
  const items = loadDemoStore();
  const id = `demo-co-${Date.now()}`;
  const item = { id, ...payload, createdAt: new Date().toISOString() };
  items.unshift(item);
  saveDemoStore(items);
  return { id, item, isDemo: true };
}

export async function updateCompany(id, data) {
  const result = await updateDocument(COLLECTION, id, data);
  if (!result.error) return result;

  // TEMP: demo fallback when Firestore write fails
  const items = loadDemoStore();
  const index = items.findIndex((c) => c.id === id);
  if (index === -1) return { error: 'Company not found' };

  const merged = normalizePayload(data, items[index]);
  items[index] = { ...items[index], ...merged, updatedAt: new Date().toISOString() };
  saveDemoStore(items);
  return { success: true, item: items[index], isDemo: true };
}

export async function deleteCompany(id) {
  const result = await removeDocument(COLLECTION, id);
  if (!result.error) return result;

  // TEMP: demo fallback when Firestore write fails
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
