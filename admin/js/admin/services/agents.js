import {
  createDocument,
  listDocuments,
  removeDocument,
  updateDocument,
} from './firestore-base.js';
import { DEMO_AGENTS } from '../demo-data.js';
import {
  fetchAiEmployeesFromApi,
  createAiEmployeeFromApi,
  updateAiEmployeeFromApi,
  deleteAiEmployeeFromApi,
} from '../api.js';

const COLLECTION = 'agents';
const DEMO_STORE_KEY = 'ziricai-demo-agents';
const DEMO_DATA_VERSION = '2025-07-agents-v2';
const DEMO_VERSION_KEY = 'ziricai-demo-agents-version';

/** @returns {object[]} */
function loadDemoStore() {
  if (localStorage.getItem(DEMO_VERSION_KEY) !== DEMO_DATA_VERSION) {
    localStorage.removeItem(DEMO_STORE_KEY);
    localStorage.setItem(DEMO_VERSION_KEY, DEMO_DATA_VERSION);
    return DEMO_AGENTS.map((a) => ({ ...a }));
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
  return DEMO_AGENTS.map((a) => ({ ...a }));
}

function saveDemoStore(items) {
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(items));
}

function shouldUseDemo(result) {
  return Boolean(result?.error) || !result?.items?.length;
}

function normalizePayload(data, existing = null) {
  const knowledgeSources = {
    pdfs: Boolean(data.knowledgeSources?.pdfs ?? existing?.knowledgeSources?.pdfs),
    docx: Boolean(data.knowledgeSources?.docx ?? existing?.knowledgeSources?.docx),
    faqs: Boolean(data.knowledgeSources?.faqs ?? existing?.knowledgeSources?.faqs),
    websiteUrl: Boolean(data.knowledgeSources?.websiteUrl ?? existing?.knowledgeSources?.websiteUrl),
    manualKnowledge: Boolean(data.knowledgeSources?.manualKnowledge ?? existing?.knowledgeSources?.manualKnowledge),
    policies: Boolean(data.knowledgeSources?.policies ?? existing?.knowledgeSources?.policies),
    products: Boolean(data.knowledgeSources?.products ?? existing?.knowledgeSources?.products),
    services: Boolean(data.knowledgeSources?.services ?? existing?.knowledgeSources?.services),
  };

  const channels = {
    whatsapp: Boolean(data.channels?.whatsapp ?? existing?.channels?.whatsapp ?? true),
    websiteChat: Boolean(data.channels?.websiteChat ?? existing?.channels?.websiteChat),
    facebookMessenger: Boolean(data.channels?.facebookMessenger ?? existing?.channels?.facebookMessenger),
    instagram: Boolean(data.channels?.instagram ?? existing?.channels?.instagram),
    telegram: Boolean(data.channels?.telegram ?? existing?.channels?.telegram),
    email: Boolean(data.channels?.email ?? existing?.channels?.email),
  };

  const whatsappNumber = data.whatsappNumber ?? existing?.whatsappNumber ?? '';
  const whatsappConnected = data.whatsappConnected !== undefined
    ? Boolean(data.whatsappConnected)
    : Boolean(existing?.whatsappConnected ?? (channels.whatsapp && whatsappNumber));

  return {
    companyId: data.companyId || existing?.companyId || '',
    name: String(data.name || existing?.name || '').trim(),
    department: data.department ?? existing?.department ?? '',
    role: data.role ?? existing?.role ?? 'customer_support',
    roleLabel: data.roleLabel ?? existing?.roleLabel ?? '',
    avatar: data.avatar ?? existing?.avatar ?? '🤖',
    avatarUrl: data.avatarUrl ?? existing?.avatarUrl ?? '',
    personality: data.personality ?? existing?.personality ?? 'professional',
    knowledgeSources,
    channels,
    model: data.model ?? existing?.model ?? 'gpt-4o-mini',
    temperature: Number(data.temperature ?? existing?.temperature ?? 0.7),
    maxTokens: Number(data.maxTokens ?? existing?.maxTokens ?? 1024),
    memory: Boolean(data.memory ?? existing?.memory ?? true),
    reasoningLevel: data.reasoningLevel ?? existing?.reasoningLevel ?? 'standard',
    greetingMessage: data.greetingMessage ?? existing?.greetingMessage ?? '',
    fallbackMessage: data.fallbackMessage ?? existing?.fallbackMessage ?? '',
    humanTakeover: Boolean(data.humanTakeover ?? existing?.humanTakeover ?? true),
    officeHours: data.officeHours ?? existing?.officeHours ?? 'Mon–Fri 08:00–17:00',
    escalationRules: data.escalationRules ?? existing?.escalationRules ?? '',
    systemPrompt: data.systemPrompt ?? existing?.systemPrompt ?? '',
    whatsappNumber,
    whatsappConnected,
    knowledgeBaseId: data.knowledgeBaseId ?? existing?.knowledgeBaseId ?? null,
    status: data.status ?? existing?.status ?? 'active',
    conversations: Number(data.conversations ?? existing?.conversations ?? 0),
  };
}

export async function listAgents(companyId) {
  if (companyId) {
    const apiResult = await fetchAiEmployeesFromApi(companyId);
    if (apiResult.data?.items?.length) {
      return { items: apiResult.data.items, isDemo: false };
    }
  }

  const options = { orderByField: 'updatedAt' };
  if (companyId) options.companyId = companyId;
  const result = await listDocuments(COLLECTION, options);
  if (!shouldUseDemo(result)) return result;
  // TEMP: demo fallback when Firestore empty/unavailable
  let items = loadDemoStore();
  if (companyId) items = items.filter((a) => a.companyId === companyId);
  return { items, isDemo: true };
}

export async function createAgent(data) {
  const payload = normalizePayload(data);
  if (!payload.name) return { error: 'Employee name is required' };
  if (!payload.companyId) return { error: 'Company is required' };

  const apiResult = await createAiEmployeeFromApi(payload.companyId, payload);
  if (apiResult.data?.agent) {
    return { id: apiResult.data.agent.id, item: apiResult.data.agent, isDemo: false };
  }

  const result = await createDocument(COLLECTION, payload);
  if (!result.error) return result;

  // TEMP: demo fallback when Firestore write fails
  const items = loadDemoStore();
  const id = `demo-agent-${Date.now()}`;
  const item = { id, ...payload, createdAt: new Date().toISOString() };
  items.unshift(item);
  saveDemoStore(items);
  return { id, item, isDemo: true };
}

export async function updateAgent(id, data) {
  const items = loadDemoStore();
  const existing = items.find((a) => a.id === id);
  const payload = normalizePayload(data, existing);

  if (payload.companyId) {
    const apiResult = await updateAiEmployeeFromApi(payload.companyId, id, payload);
    if (apiResult.data?.agent) return { success: true, isDemo: false };
  }

  const result = await updateDocument(COLLECTION, id, payload);
  if (!result.error) return result;

  // TEMP: demo fallback
  const idx = items.findIndex((a) => a.id === id);
  if (idx === -1) return { error: 'Employee not found' };
  items[idx] = { ...items[idx], ...payload, updatedAt: new Date().toISOString() };
  saveDemoStore(items);
  return { success: true, isDemo: true };
}

export async function deleteAgent(id) {
  const items = loadDemoStore();
  const existing = items.find((a) => a.id === id);
  if (existing?.companyId) {
    const apiResult = await deleteAiEmployeeFromApi(existing.companyId, id);
    if (apiResult.data?.success) return { success: true, isDemo: false };
  }

  const result = await removeDocument(COLLECTION, id);
  if (!result.error) return result;

  // TEMP: demo fallback
  const items = loadDemoStore().filter((a) => a.id !== id);
  if (items.length === loadDemoStore().length) return { error: 'Employee not found' };
  saveDemoStore(items);
  return { success: true, isDemo: true };
}

export async function duplicateAgent(id) {
  const items = loadDemoStore();
  const source = items.find((a) => a.id === id);
  if (!source) {
    const { items: firestoreItems } = await listDocuments(COLLECTION, {});
    const fromDb = firestoreItems.find((a) => a.id === id);
    if (!fromDb) return { error: 'Employee not found' };
    return createAgent({
      ...fromDb,
      name: `${fromDb.name} (Copy)`,
      status: 'inactive',
      conversations: 0,
    });
  }

  const { id: _id, createdAt, updatedAt, ...rest } = source;
  return createAgent({
    ...rest,
    name: `${rest.name} (Copy)`,
    status: 'inactive',
    conversations: 0,
  });
}
