import {
  fetchCustomersFromApi,
  fetchCustomerFromApi,
  patchCustomerFromApi,
  fetchCustomerTimelineFromApi,
} from '../api.js';
import {
  getDemoCustomer,
  getDemoCustomerListRows,
  normalizeCustomerPhone,
  DEMO_CUSTOMERS,
} from '../demo-data.js';

function demoPatchCustomer(phone, body) {
  const key = normalizeCustomerPhone(phone);
  const customer = getDemoCustomer(key);
  if (!customer) return { error: 'Customer not found' };

  if (body.note?.text) {
    const note = {
      id: `note-${Date.now()}`,
      text: body.note.text,
      author: body.note.author || 'Admin',
      createdAt: new Date().toISOString(),
    };
    customer.notesList = [...(customer.notesList || []), note];
    return { customer: { ...customer }, note };
  }

  if (body.deleteNoteId) {
    customer.notesList = (customer.notesList || []).filter((n) => n.id !== body.deleteNoteId);
    return { customer: { ...customer } };
  }

  if (body.task?.title) {
    const task = {
      id: `task-${Date.now()}`,
      title: body.task.title,
      deadline: body.task.deadline || null,
      priority: body.task.priority || 'medium',
      assignedTo: body.task.assignedTo || 'Unassigned',
      done: false,
      createdAt: new Date().toISOString(),
    };
    customer.tasks = [...(customer.tasks || []), task];
    return { customer: { ...customer }, task };
  }

  if (body.updateTask) {
    customer.tasks = (customer.tasks || []).map((t) =>
      t.id === body.updateTask.id ? { ...t, ...body.updateTask } : t
    );
    return { customer: { ...customer } };
  }

  if (body.tags) customer.tags = body.tags;
  if (body.aiSummary != null) customer.aiSummary = body.aiSummary;

  return { customer: { ...customer } };
}

export async function listCustomers(companyId) {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  const api = await fetchCustomersFromApi(qs);
  if (!api.error && api.data?.items?.length) {
    return { items: api.data.items, source: 'api' };
  }
  return { items: getDemoCustomerListRows(companyId), source: 'demo', error: api.error };
}

export async function getCustomerProfile(phoneOrId) {
  const key = normalizeCustomerPhone(phoneOrId);
  const api = await fetchCustomerFromApi(key);
  if (!api.error && api.data?.customer) {
    return { customer: api.data.customer, source: 'api' };
  }
  const demo = getDemoCustomer(key) || getDemoCustomer(phoneOrId);
  if (demo) return { customer: demo, source: 'demo' };
  return { error: api.error || 'Customer not found' };
}

export async function getCustomerTimeline(phone) {
  const key = normalizeCustomerPhone(phone);
  const api = await fetchCustomerTimelineFromApi(key);
  if (!api.error && api.data?.items) {
    return { items: api.data.items, source: 'api' };
  }
  const demo = getDemoCustomer(key);
  return { items: demo?.timeline || [], source: 'demo' };
}

export async function patchCustomer(phone, body) {
  const key = normalizeCustomerPhone(phone);
  const api = await patchCustomerFromApi(key, body);
  if (!api.error && api.data?.customer) {
    return { customer: api.data.customer, source: 'api' };
  }
  return demoPatchCustomer(key, body);
}

export async function getCustomerMessages(phoneOrId) {
  const profile = await getCustomerProfile(phoneOrId);
  if (profile.customer?.messages?.length) {
    return { items: profile.customer.messages };
  }
  return { items: [] };
}

export async function countCustomers(companyId) {
  const result = await listCustomers(companyId);
  return { count: result.items?.length || DEMO_CUSTOMERS.length };
}

/** Legacy Firestore CRUD stubs — list/detail uses API + demo. */
export async function createCustomer() {
  return { error: 'Use WhatsApp inbound or API to create customers' };
}

export async function updateCustomer() {
  return { error: 'Use patchCustomer(phone, body) instead' };
}

export async function deleteCustomer() {
  return { error: 'Delete not supported in CRM demo mode' };
}

export { normalizeCustomerPhone };
