import { DEMO_WORKFLOWS, DEMO_TEMPLATES } from '../demo-data.js';

const DEMO_STORE_KEY = 'ziricai-demo-workflows';
const DEMO_VERSION_KEY = 'ziricai-demo-workflows-version';
const DEMO_DATA_VERSION = '2025-07-automation-v1';

const API_BASE = '';

async function request(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `Request failed (${res.status})` };
    return { data };
  } catch (error) {
    return { error: error.message || 'Network error' };
  }
}

function loadDemoStore() {
  if (localStorage.getItem(DEMO_VERSION_KEY) !== DEMO_DATA_VERSION) {
    localStorage.removeItem(DEMO_STORE_KEY);
    localStorage.setItem(DEMO_VERSION_KEY, DEMO_DATA_VERSION);
    return DEMO_WORKFLOWS.map((w) => JSON.parse(JSON.stringify(w)));
  }
  try {
    const stored = localStorage.getItem(DEMO_STORE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  return DEMO_WORKFLOWS.map((w) => JSON.parse(JSON.stringify(w)));
}

function saveDemoStore(items) {
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(items));
}

function shouldUseDemo(result) {
  return Boolean(result?.error);
}

function toListItem(wf) {
  const nodes = wf.status === 'published' ? wf.publishedNodes : wf.nodes;
  const triggers = (nodes || []).filter((n) => n.type === 'trigger').map((n) => n.label);
  return {
    id: wf.id,
    name: wf.name,
    companyId: wf.companyId,
    companyName: wf.companyName,
    status: wf.status,
    currentVersion: wf.currentVersion,
    triggers,
    updatedAt: wf.updatedAt,
    createdAt: wf.createdAt,
    createdBy: wf.createdBy,
    nodeCount: (wf.nodes || []).length,
  };
}

export async function listWorkflows(companyId = null) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  const result = await request(`/api/workflows${qs}`);
  if (!shouldUseDemo(result)) return { items: result.data.items || [], isDemo: false };
  let items = loadDemoStore().map(toListItem);
  if (companyId) items = items.filter((w) => w.companyId === companyId);
  return { items, isDemo: true };
}

export async function getWorkflow(id) {
  const result = await request(`/api/workflows/${encodeURIComponent(id)}`);
  if (!shouldUseDemo(result)) return { item: result.data.item, isDemo: false };
  const item = loadDemoStore().find((w) => w.id === id);
  if (item) return { item: JSON.parse(JSON.stringify(item)), isDemo: true };
  return { error: 'Workflow not found' };
}

export async function createWorkflow(data) {
  const result = await request('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!shouldUseDemo(result)) return { item: result.data.item, id: result.data.id, isDemo: false };

  const items = loadDemoStore();
  const id = `demo-wf-${Date.now()}`;
  const item = {
    id,
    name: data.name,
    companyId: data.companyId,
    companyName: data.companyName || '',
    status: 'draft',
    currentVersion: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: data.createdBy || 'Admin',
    nodes: data.nodes?.length ? data.nodes : [{ id: 'n1', type: 'trigger', stepType: 'whatsapp_message', label: 'WhatsApp Message', icon: 'fa-brands fa-whatsapp', config: {} }],
    publishedNodes: [],
    versions: [],
  };
  items.unshift(item);
  saveDemoStore(items);
  return { id, item, isDemo: true };
}

export async function updateWorkflow(id, data) {
  const result = await request(`/api/workflows/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!shouldUseDemo(result)) return { item: result.data.item, isDemo: false };

  const items = loadDemoStore();
  const idx = items.findIndex((w) => w.id === id);
  if (idx === -1) return { error: 'Workflow not found' };
  items[idx] = { ...items[idx], ...data, updatedAt: new Date().toISOString() };
  saveDemoStore(items);
  return { item: items[idx], isDemo: true };
}

export async function deleteWorkflow(id) {
  const result = await request(`/api/workflows/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!shouldUseDemo(result)) return { success: true, isDemo: false };

  const items = loadDemoStore().filter((w) => w.id !== id);
  if (items.length === loadDemoStore().length) return { error: 'Workflow not found' };
  saveDemoStore(items);
  return { success: true, isDemo: true };
}

export async function duplicateWorkflow(id) {
  const result = await request(`/api/workflows/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
  if (!shouldUseDemo(result)) return { item: result.data.item, id: result.data.id, isDemo: false };

  const source = loadDemoStore().find((w) => w.id === id);
  if (!source) return { error: 'Workflow not found' };
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = `demo-wf-${Date.now()}`;
  copy.name = `${source.name} (Copy)`;
  copy.status = 'draft';
  copy.currentVersion = 0;
  copy.publishedNodes = [];
  copy.versions = [];
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = copy.createdAt;
  const items = loadDemoStore();
  items.unshift(copy);
  saveDemoStore(items);
  return { id: copy.id, item: copy, isDemo: true };
}

export async function publishWorkflow(id, createdBy = 'Admin') {
  const result = await request(`/api/workflows/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ createdBy }),
  });
  if (!shouldUseDemo(result)) return { item: result.data.item, version: result.data.version, isDemo: false };

  const items = loadDemoStore();
  const idx = items.findIndex((w) => w.id === id);
  if (idx === -1) return { error: 'Workflow not found' };
  const wf = items[idx];
  const nextVersion = (wf.currentVersion || 0) + 1;
  const publishedNodes = JSON.parse(JSON.stringify(wf.nodes));
  wf.versions.push({ version: nextVersion, nodes: publishedNodes, createdAt: new Date().toISOString(), publishedAt: new Date().toISOString(), createdBy });
  wf.currentVersion = nextVersion;
  wf.publishedNodes = publishedNodes;
  wf.status = 'published';
  wf.updatedAt = new Date().toISOString();
  saveDemoStore(items);
  return { item: wf, version: nextVersion, isDemo: true };
}

export async function rollbackWorkflow(id, targetVersion, publish = false) {
  const result = await request(`/api/workflows/${encodeURIComponent(id)}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetVersion, publish }),
  });
  if (!shouldUseDemo(result)) return { item: result.data.item, isDemo: false };

  const items = loadDemoStore();
  const idx = items.findIndex((w) => w.id === id);
  if (idx === -1) return { error: 'Workflow not found' };
  const wf = items[idx];
  const versionEntry = wf.versions.find((v) => v.version === targetVersion);
  if (!versionEntry) return { error: `Version ${targetVersion} not found` };
  wf.nodes = JSON.parse(JSON.stringify(versionEntry.nodes));
  wf.updatedAt = new Date().toISOString();
  if (publish) {
    const nextVersion = (wf.currentVersion || 0) + 1;
    wf.versions.push({ version: nextVersion, nodes: JSON.parse(JSON.stringify(versionEntry.nodes)), createdAt: new Date().toISOString(), publishedAt: new Date().toISOString(), createdBy: 'Admin', rolledBackFrom: targetVersion });
    wf.currentVersion = nextVersion;
    wf.publishedNodes = JSON.parse(JSON.stringify(versionEntry.nodes));
    wf.status = 'published';
  } else {
    wf.status = 'draft';
  }
  saveDemoStore(items);
  return { item: wf, isDemo: true };
}

export async function listTemplates() {
  const result = await request('/api/workflows/templates');
  if (!shouldUseDemo(result)) return { items: result.data.items || [], isDemo: false };
  return { items: DEMO_TEMPLATES, isDemo: true };
}

export async function installTemplate({ templateId, companyId, companyName, name }) {
  const result = await request('/api/workflows/from-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, companyId, companyName, name }),
  });
  if (!shouldUseDemo(result)) return { item: result.data.item, id: result.data.id, isDemo: false };
  return { error: 'Install requires server — start npm run dev' };
}
