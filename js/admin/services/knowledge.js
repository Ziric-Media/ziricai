import {
  createDocument,
  listDocuments,
  removeDocument,
  updateDocument,
} from './firestore-base.js';
import { DEMO_KNOWLEDGE_ITEMS, DEMO_TRAINING_HISTORY } from '../demo-data.js';

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
  return Boolean(result?.error) || !result?.items?.length;
}

function newId(prefix = 'demo-kn') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
  };
}

export async function listKnowledge(companyId) {
  const result = await listDocuments(COLLECTION, {
    companyId,
    orderByField: 'createdAt',
  });
  if (shouldUseDemo(result)) {
    const items = loadDemoStore().filter((item) => !companyId || item.companyId === companyId);
    return { items, isDemo: true };
  }
  return { items: result.items, isDemo: false };
}

export async function createKnowledge(data) {
  const payload = normalizeItem(data);
  const result = await createDocument(COLLECTION, payload);
  if (result.error) {
    const items = loadDemoStore();
    const item = {
      id: newId(),
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    items.unshift(item);
    saveDemoStore(items);
    return { id: item.id, item, isDemo: true };
  }
  return result;
}

export async function updateKnowledge(id, data) {
  const result = await updateDocument(COLLECTION, id, normalizeItem(data));
  if (result.error) {
    const items = loadDemoStore();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return { error: 'Item not found' };
    items[idx] = { ...items[idx], ...normalizeItem(data, items[idx]), updatedAt: new Date().toISOString() };
    saveDemoStore(items);
    return { success: true, item: items[idx], isDemo: true };
  }
  return result;
}

export async function deleteKnowledge(id) {
  const result = await removeDocument(COLLECTION, id);
  if (result.error) {
    const items = loadDemoStore().filter((i) => i.id !== id);
    saveDemoStore(items);
    return { success: true, isDemo: true };
  }
  return result;
}

export async function listTrainingHistory(companyId) {
  const items = loadDemoHistory().filter((h) => !companyId || h.companyId === companyId);
  return { items, isDemo: true };
}

export function computeKnowledgeStats(items) {
  const documents = items.filter((i) => i.type === 'document').length;
  const faqs = items.filter((i) => i.type === 'faq').length;
  const webPages = items.reduce((sum, i) => {
    if (i.type === 'website') return sum + (i.pagesScraped || 0);
    return sum;
  }, 0);
  const chunks = items.reduce((sum, i) => sum + (i.chunks || 0), 0);
  const trainedDates = items
    .map((i) => i.lastTrained)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  const lastTrainingDate = trainedDates.length ? new Date(Math.max(...trainedDates)).toISOString() : null;
  return { documents, faqs, webPages, chunks, lastTrainingDate };
}

export function createTrainingJob({ companyId, title, type }) {
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
