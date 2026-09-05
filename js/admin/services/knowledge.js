import {
  createDocument,
  listDocuments,
  removeDocument,
  updateDocument,
} from './firestore-base.js';
import { DEMO_KNOWLEDGE_ITEMS, DEMO_TRAINING_HISTORY } from '../demo-data.js';
import { isDemoDataAllowed, shouldUseDemoForEmptyOrError } from './dataMode.js';
import { listKnowledgeDocumentsFromApi } from '../api.js';
import {
  createKnowledgeDocumentFromApi,
  updateKnowledgeDocumentFromApi,
  deleteKnowledgeDocumentFromApi,
  fetchAiEmployeesFromApi,
} from '../api.js';
import {
  enrichKnowledgeForDisplay,
  computeKnowledgeDisplayStats,
  resolveAuthoritativeKnowledgeBaseId,
} from './knowledgeDisplay.js';

export {
  enrichKnowledgeForDisplay,
  resolveDefaultKnowledgeSection,
  resolveKnowledgeBaseLabel,
  resolveAuthoritativeKnowledgeBaseId,
  computeKnowledgeDisplayStats,
  PRIMARY_PILOT_KB_ID,
} from './knowledgeDisplay.js';

const COLLECTION = 'knowledge';
const DEMO_STORE_KEY = 'ziricai-demo-knowledge';
const DEMO_HISTORY_KEY = 'ziricai-demo-training-history';
const DEMO_QUEUE_KEY = 'ziricai-demo-training-queue';
const DEMO_DATA_VERSION = '2025-07-knowledge-v1';
const DEMO_VERSION_KEY = 'ziricai-demo-knowledge-version';

const TRAINING_STEPS = ['uploading', 'extracting', 'chunking', 'embedding', 'training', 'completed'];

function loadDemoStore() {
  if (localStorage.getItem(DEMO_VERSION_KEY) !== DEMO_DATA_VERSION) {
    localStorage.removeItem(DEMO_STORE_KEY);
    localStorage.removeItem(DEMO_HISTORY_KEY);
    localStorage.removeItem(DEMO_QUEUE_KEY);
    localStorage.setItem(DEMO_VERSION_KEY, DEMO_DATA_VERSION);
    return DEMO_KNOWLEDGE_ITEMS.map((item) => ({ ...item }));
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
  return DEMO_KNOWLEDGE_ITEMS.map((item) => ({ ...item }));
}

function saveDemoStore(items) {
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(items));
}

function loadDemoHistory() {
  try {
    const stored = localStorage.getItem(DEMO_HISTORY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEMO_TRAINING_HISTORY.map((h) => ({ ...h }));
}

function saveDemoHistory(items) {
  localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(items));
}

export function loadTrainingQueue() {
  if (!isDemoDataAllowed()) return [];
  try {
    const stored = localStorage.getItem(DEMO_QUEUE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return [];
}

export function saveTrainingQueue(jobs) {
  localStorage.setItem(DEMO_QUEUE_KEY, JSON.stringify(jobs));
}

function shouldUseDemo(result) {
  return shouldUseDemoForEmptyOrError(result);
}

function newId(prefix = 'demo-kn') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toTenantStatus(status) {
  const normalized = String(status || 'active').toLowerCase();
  if (['trained', 'active', 'completed'].includes(normalized)) return 'active';
  return status || 'active';
}

function toTenantWritePayload(data, knowledgeBaseId) {
  const payload = normalizeItem(data);
  const content = payload.content || payload.answer || '';
  return {
    companyId: payload.companyId,
    knowledgeBaseId,
    type: payload.type,
    title: payload.title,
    content,
    question: payload.question || (payload.type === 'faq' ? payload.title : ''),
    answer: payload.answer || content,
    url: payload.url || '',
    fileName: payload.fileName || '',
    status: toTenantStatus(payload.status),
    uploadedBy: payload.uploadedBy || null,
    source: 'mission-control',
  };
}

/** Resolve tenant KB for writes — matches Sarah's authoritative KB when possible. */
export async function resolveKnowledgeBaseIdForWrite(companyId, { company = null, agents = [], existingItems = [] } = {}) {
  let kb = resolveAuthoritativeKnowledgeBaseId({ company, agents, existingItems });
  if (kb) return kb;

  if (!isDemoDataAllowed() && companyId) {
    const res = await fetchAiEmployeesFromApi(companyId);
    if (!res.error) {
      const fetched = res.data?.items || res.data?.agents || [];
      kb = resolveAuthoritativeKnowledgeBaseId({ company, agents: fetched, existingItems });
      if (kb) return kb;
    }
    return null;
  }

  return company?.knowledgeBaseId || agents[0]?.knowledgeBaseId || `kb-${companyId}`;
}

function normalizeItem(data, existing = null) {
  return {
    companyId: data.companyId || existing?.companyId || '',
    type: data.type || existing?.type || 'manual',
    title: String(data.title || existing?.title || '').trim(),
    status: data.status || existing?.status || 'pending',
    content: data.content ?? existing?.content ?? '',
    url: data.url ?? existing?.url ?? '',
    fileName: data.fileName ?? existing?.fileName ?? '',
    pages: Number(data.pages ?? existing?.pages ?? 0),
    chunks: Number(data.chunks ?? existing?.chunks ?? 0),
    uploadedBy: data.uploadedBy ?? existing?.uploadedBy ?? 'Admin',
    lastTrained: data.lastTrained ?? existing?.lastTrained ?? null,
    question: data.question ?? existing?.question ?? '',
    answer: data.answer ?? existing?.answer ?? '',
    name: data.name ?? existing?.name ?? '',
    price: data.price ?? existing?.price ?? '',
    priceNumeric: data.priceNumeric ?? existing?.priceNumeric ?? 0,
    specifications: data.specifications ?? existing?.specifications ?? '',
    imageUrl: data.imageUrl ?? existing?.imageUrl ?? '',
    features: data.features ?? existing?.features ?? '',
    warranty: data.warranty ?? existing?.warranty ?? '',
    description: data.description ?? existing?.description ?? '',
    requirements: data.requirements ?? existing?.requirements ?? '',
    waitingTime: data.waitingTime ?? existing?.waitingTime ?? '',
    policyType: data.policyType ?? existing?.policyType ?? '',
    preview: data.preview ?? existing?.preview ?? '',
    pagesScraped: Number(data.pagesScraped ?? existing?.pagesScraped ?? 0),
    knowledgeBaseId: data.knowledgeBaseId ?? existing?.knowledgeBaseId ?? null,
  };
}

export async function listKnowledge(companyId, options = {}) {
  if (!isDemoDataAllowed() && !companyId) {
    return { items: [], source: 'api', loadState: 'scope_required', knowledgeBaseId: null };
  }

  if (companyId) {
    const api = await listKnowledgeDocumentsFromApi(companyId, {
      knowledgeBaseId: options.knowledgeBaseId || null,
    });
    if (!isDemoDataAllowed()) {
      if (api.error) {
        return {
          items: [],
          source: 'api',
          error: api.error,
          loadState: 'error',
          knowledgeBaseId: options.knowledgeBaseId || null,
        };
      }
      const items = enrichKnowledgeForDisplay(api.data?.items || []);
      return {
        items,
        source: 'api',
        loadState: items.length ? 'ok' : 'empty',
        knowledgeBaseId: api.data?.knowledgeBaseId || options.knowledgeBaseId || null,
      };
    }
    if (!api.error && api.data?.items?.length) {
      return {
        items: enrichKnowledgeForDisplay(api.data.items),
        source: 'api',
        loadState: 'ok',
        isDemo: false,
        knowledgeBaseId: api.data?.knowledgeBaseId || options.knowledgeBaseId || null,
      };
    }
  }

  const result = await listDocuments(COLLECTION, {
    companyId,
    orderByField: 'createdAt',
  });
  if (shouldUseDemo(result)) {
    const items = loadDemoStore().filter((item) => !companyId || item.companyId === companyId);
    return { items, isDemo: true, source: 'demo', loadState: 'demo' };
  }
  return {
    items: result.items || [],
    isDemo: false,
    error: result.error,
    loadState: result.error ? 'error' : 'empty',
  };
}

export async function createKnowledge(data, options = {}) {
  const payload = normalizeItem(data);
  const knowledgeBaseId = options.knowledgeBaseId || payload.knowledgeBaseId;

  if (!isDemoDataAllowed()) {
    if (!payload.companyId) return { error: 'companyId is required' };
    if (!knowledgeBaseId) {
      return { error: 'Knowledge base not configured for this tenant — select a company with an AI employee KB' };
    }
    const api = await createKnowledgeDocumentFromApi(
      payload.companyId,
      toTenantWritePayload(payload, knowledgeBaseId)
    );
    if (api.error) return api;
    const item = api.data?.item || api.data;
    return { id: item?.id, item, success: true };
  }

  const result = await createDocument(COLLECTION, payload);
  if (!result.error) return result;

  const items = loadDemoStore();
  const item = {
    id: newId(),
    ...payload,
    knowledgeBaseId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.unshift(item);
  saveDemoStore(items);
  return { id: item.id, item, isDemo: true };
}

export async function updateKnowledge(id, data, options = {}) {
  const payload = normalizeItem(data);
  const knowledgeBaseId = options.knowledgeBaseId || payload.knowledgeBaseId;

  if (!isDemoDataAllowed()) {
    if (!payload.companyId) return { error: 'companyId is required' };
    if (!knowledgeBaseId) {
      return { error: 'Knowledge base not configured for this tenant' };
    }
    const api = await updateKnowledgeDocumentFromApi(
      payload.companyId,
      id,
      toTenantWritePayload(payload, knowledgeBaseId)
    );
    if (api.error) return api;
    const item = api.data?.item || api.data;
    return { success: true, item };
  }

  const result = await updateDocument(COLLECTION, id, payload);
  if (!result.error) return result;

  const items = loadDemoStore();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return { error: 'Item not found' };
  items[idx] = { ...items[idx], ...payload, updatedAt: new Date().toISOString() };
  saveDemoStore(items);
  return { success: true, item: items[idx], isDemo: true };
}

export async function deleteKnowledge(id, options = {}) {
  const { companyId } = options;

  if (!isDemoDataAllowed()) {
    if (!companyId) return { error: 'companyId is required' };
    const api = await deleteKnowledgeDocumentFromApi(companyId, id);
    if (api.error) return api;
    return { success: true };
  }

  const result = await removeDocument(COLLECTION, id);
  if (!result.error) return result;

  const items = loadDemoStore().filter((i) => i.id !== id);
  saveDemoStore(items);
  return { success: true, isDemo: true };
}

export async function listTrainingHistory(companyId) {
  if (!isDemoDataAllowed()) {
    return { items: [], isDemo: false, source: 'api', loadState: 'empty' };
  }
  const items = loadDemoHistory().filter((h) => !companyId || h.companyId === companyId);
  return { items, isDemo: true, source: 'demo', loadState: items.length ? 'ok' : 'empty' };
}

export function computeKnowledgeStats(items) {
  return computeKnowledgeDisplayStats(items);
}

export function createTrainingJob({ companyId, title, type }) {
  if (!isDemoDataAllowed()) {
    return {
      id: newId('job'),
      companyId,
      title,
      type,
      status: 'completed',
      currentStep: TRAINING_STEPS.length - 1,
      steps: [...TRAINING_STEPS],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  }
  const job = {
    id: newId('job'),
    companyId,
    title,
    type,
    status: 'uploading',
    currentStep: 0,
    steps: [...TRAINING_STEPS],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  const queue = loadTrainingQueue();
  queue.unshift(job);
  saveTrainingQueue(queue);
  return job;
}

export function advanceTrainingJob(jobId) {
  const queue = loadTrainingQueue();
  const job = queue.find((j) => j.id === jobId);
  if (!job || job.status === 'completed') return job;
  job.currentStep = Math.min(job.currentStep + 1, TRAINING_STEPS.length - 1);
  job.status = TRAINING_STEPS[job.currentStep];
  if (job.status === 'completed') {
    job.completedAt = new Date().toISOString();
    const history = loadDemoHistory();
    history.unshift({
      id: newId('th'),
      companyId: job.companyId,
      title: job.title,
      type: job.type,
      status: 'completed',
      steps: [...TRAINING_STEPS],
      chunksCreated: Math.floor(Math.random() * 80) + 10,
      durationSec: Math.floor(Math.random() * 60) + 20,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
    saveDemoHistory(history);
  }
  saveTrainingQueue(queue);
  return job;
}

export { TRAINING_STEPS };
