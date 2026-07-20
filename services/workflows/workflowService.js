/**
 * Visual workflow studio — in-memory demo store for Automation Builder UI.
 * @deprecated For production automations use services/automation/workflowRegistry.js
 *   (tenant path: companies/{companyId}/automations).
 */
import { WORKFLOW_TEMPLATES, getTemplateById, cloneTemplateNodes } from './workflowTemplates.js';

const workflows = new Map();
let seeded = false;

function now() {
    return new Date().toISOString();
}

function cloneNodes(nodes) {
    return JSON.parse(JSON.stringify(nodes || []));
}

function generateId(prefix = 'wf') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deepCloneWorkflow(wf) {
    return JSON.parse(JSON.stringify(wf));
}

/** Demo seed — Central Motors workflows */
function seedDemoWorkflows() {
    if (seeded) return;
    seeded = true;

    const financeNodes = [
        { id: 'n1', type: 'trigger', stepType: 'whatsapp_message', label: 'WhatsApp Message', icon: 'fa-brands fa-whatsapp', config: {} },
        { id: 'n2', type: 'condition', stepType: 'contains_keyword', label: 'Contains "finance"', icon: 'fa-solid fa-filter', config: { keyword: 'finance', matchMode: 'any' } },
        { id: 'n3', type: 'ai_action', stepType: 'generate_proposal', label: 'AI Generate Proposal', icon: 'fa-solid fa-wand-magic-sparkles', config: { template: 'vehicle_finance' } },
        { id: 'n4', type: 'action', stepType: 'create_task', label: 'Create CRM Task', icon: 'fa-solid fa-list-check', config: { title: 'Finance enquiry follow-up', priority: 'high' } },
        { id: 'n5', type: 'action', stepType: 'assign_human', label: 'Assign Sales', icon: 'fa-solid fa-user-tie', config: { department: 'Sales' } },
        { id: 'n6', type: 'action', stepType: 'delay', label: 'Follow up 24h', icon: 'fa-solid fa-clock', config: { hours: 24 } },
    ];

    const testDriveNodes = [
        { id: 'n1', type: 'trigger', stepType: 'whatsapp_message', label: 'WhatsApp Message', icon: 'fa-brands fa-whatsapp', config: {} },
        { id: 'n2', type: 'condition', stepType: 'contains_keyword', label: 'Contains "test drive"', icon: 'fa-solid fa-filter', config: { keyword: 'test drive' } },
        { id: 'n3', type: 'condition', stepType: 'business_hours', label: 'Business Hours', icon: 'fa-solid fa-clock', config: { start: '08:00', end: '17:00' }, branch: { yes: [], no: [{ id: 'n3a', type: 'action', stepType: 'reply', label: 'After-hours Reply', icon: 'fa-solid fa-reply', config: { template: 'after_hours' } }] } },
        { id: 'n4', type: 'ai_action', stepType: 'extract_entities', label: 'Extract Vehicle & Date', icon: 'fa-solid fa-tags', config: { entities: ['vehicle', 'date'] } },
        { id: 'n5', type: 'action', stepType: 'reply', label: 'Send Booking Confirmation', icon: 'fa-solid fa-reply', config: { template: 'test_drive_confirmation' } },
        { id: 'n6', type: 'action', stepType: 'update_crm', label: 'Update CRM Lead', icon: 'fa-solid fa-address-book', config: { stage: 'test_drive_scheduled' } },
    ];

    const serviceNodes = [
        { id: 'n1', type: 'trigger', stepType: 'scheduled', label: 'Scheduled Trigger', icon: 'fa-solid fa-calendar-days', config: { cron: '0 9 * * 1' } },
        { id: 'n2', type: 'condition', stepType: 'lead_score', label: 'Due for Service', icon: 'fa-solid fa-gauge-high', config: { field: 'daysSinceService', operator: 'gte', value: 180 } },
        { id: 'n3', type: 'action', stepType: 'reply', label: 'WhatsApp Reminder', icon: 'fa-solid fa-reply', config: { template: 'service_reminder' } },
        { id: 'n4', type: 'action', stepType: 'create_task', label: 'Create Service Task', icon: 'fa-solid fa-list-check', config: { title: 'Service booking outreach' } },
    ];

    const financePublished = cloneNodes(financeNodes);
    const testDrivePublished = cloneNodes(testDriveNodes);

    const wf1 = {
        id: 'demo-wf-finance-enquiry',
        name: 'Finance Enquiry',
        companyId: 'demo-central-motors',
        companyName: 'Central Motors',
        status: 'published',
        currentVersion: 3,
        createdAt: '2025-07-01T08:00:00.000Z',
        updatedAt: '2025-07-15T14:30:00.000Z',
        createdBy: 'John Smith',
        nodes: cloneNodes(financeNodes),
        publishedNodes: financePublished,
        versions: [
            { version: 1, nodes: cloneNodes(financeNodes.slice(0, 4)), createdAt: '2025-07-01T08:00:00.000Z', publishedAt: '2025-07-01T09:00:00.000Z', createdBy: 'John Smith' },
            { version: 2, nodes: cloneNodes(financeNodes.slice(0, 5)), createdAt: '2025-07-08T10:00:00.000Z', publishedAt: '2025-07-08T11:00:00.000Z', createdBy: 'Sarah van Wyk' },
            { version: 3, nodes: financePublished, createdAt: '2025-07-15T14:00:00.000Z', publishedAt: '2025-07-15T14:30:00.000Z', createdBy: 'John Smith' },
        ],
    };

    const wf2 = {
        id: 'demo-wf-test-drive',
        name: 'Test Drive Booking',
        companyId: 'demo-central-motors',
        companyName: 'Central Motors',
        status: 'published',
        currentVersion: 2,
        createdAt: '2025-06-20T09:00:00.000Z',
        updatedAt: '2025-07-10T16:00:00.000Z',
        createdBy: 'Sarah van Wyk',
        nodes: cloneNodes(testDriveNodes),
        publishedNodes: testDrivePublished,
        versions: [
            { version: 1, nodes: cloneNodes(testDriveNodes.slice(0, 4)), createdAt: '2025-06-20T09:00:00.000Z', publishedAt: '2025-06-21T08:00:00.000Z', createdBy: 'Sarah van Wyk' },
            { version: 2, nodes: testDrivePublished, createdAt: '2025-07-10T15:30:00.000Z', publishedAt: '2025-07-10T16:00:00.000Z', createdBy: 'Sarah van Wyk' },
        ],
    };

    const wf3 = {
        id: 'demo-wf-service-reminder',
        name: 'Service Reminder',
        companyId: 'demo-central-motors',
        companyName: 'Central Motors',
        status: 'draft',
        currentVersion: 1,
        createdAt: '2025-07-16T11:00:00.000Z',
        updatedAt: '2025-07-17T09:00:00.000Z',
        createdBy: 'John Smith',
        nodes: cloneNodes(serviceNodes),
        publishedNodes: [],
        versions: [],
    };

    [wf1, wf2, wf3].forEach((wf) => workflows.set(wf.id, wf));
}

function ensureSeeded() {
    seedDemoWorkflows();
}

function summarizeTriggers(nodes = []) {
    return nodes.filter((n) => n.type === 'trigger').map((n) => n.label || n.stepType);
}

function toListItem(wf) {
    const triggers = summarizeTriggers(wf.status === 'published' ? wf.publishedNodes : wf.nodes);
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

export async function listWorkflows({ companyId = null } = {}) {
    ensureSeeded();
    let items = [...workflows.values()].map(toListItem);
    if (companyId) items = items.filter((w) => w.companyId === companyId);
    items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    return { items };
}

export async function getWorkflow(id) {
    ensureSeeded();
    const wf = workflows.get(id);
    if (!wf) return { error: 'Workflow not found' };
    return { item: deepCloneWorkflow(wf) };
}

export async function createWorkflow(data) {
    ensureSeeded();
    const name = String(data.name || '').trim();
    if (!name) return { error: 'Workflow name is required' };
    if (!data.companyId) return { error: 'companyId is required' };

    const id = generateId('wf');
    const defaultNodes = data.nodes?.length
        ? cloneNodes(data.nodes)
        : [{ id: 'n1', type: 'trigger', stepType: 'whatsapp_message', label: 'WhatsApp Message', icon: 'fa-brands fa-whatsapp', config: {} }];

    const wf = {
        id,
        name,
        companyId: data.companyId,
        companyName: data.companyName || '',
        status: 'draft',
        currentVersion: 0,
        createdAt: now(),
        updatedAt: now(),
        createdBy: data.createdBy || 'Admin',
        nodes: defaultNodes,
        publishedNodes: [],
        versions: [],
    };

    workflows.set(id, wf);
    return { id, item: deepCloneWorkflow(wf) };
}

export async function updateWorkflow(id, data) {
    ensureSeeded();
    const wf = workflows.get(id);
    if (!wf) return { error: 'Workflow not found' };

    if (data.name != null) wf.name = String(data.name).trim();
    if (data.companyId != null) wf.companyId = data.companyId;
    if (data.companyName != null) wf.companyName = data.companyName;
    if (data.nodes != null) wf.nodes = cloneNodes(data.nodes);
    wf.updatedAt = now();

    workflows.set(id, wf);
    return { success: true, item: deepCloneWorkflow(wf) };
}

export async function deleteWorkflow(id) {
    ensureSeeded();
    if (!workflows.has(id)) return { error: 'Workflow not found' };
    workflows.delete(id);
    return { success: true };
}

export async function duplicateWorkflow(id, { createdBy = 'Admin' } = {}) {
    ensureSeeded();
    const source = workflows.get(id);
    if (!source) return { error: 'Workflow not found' };

    const newId = generateId('wf');
    const copy = deepCloneWorkflow(source);
    copy.id = newId;
    copy.name = `${source.name} (Copy)`;
    copy.status = 'draft';
    copy.currentVersion = 0;
    copy.publishedNodes = [];
    copy.versions = [];
    copy.createdAt = now();
    copy.updatedAt = now();
    copy.createdBy = createdBy;

    workflows.set(newId, copy);
    return { id: newId, item: deepCloneWorkflow(copy) };
}

export async function publishWorkflow(id, { createdBy = 'Admin' } = {}) {
    ensureSeeded();
    const wf = workflows.get(id);
    if (!wf) return { error: 'Workflow not found' };
    if (!wf.nodes?.length) return { error: 'Workflow must have at least one step' };

    const nextVersion = (wf.currentVersion || 0) + 1;
    const publishedNodes = cloneNodes(wf.nodes);

    wf.versions.push({
        version: nextVersion,
        nodes: publishedNodes,
        createdAt: now(),
        publishedAt: now(),
        createdBy,
    });

    wf.currentVersion = nextVersion;
    wf.publishedNodes = publishedNodes;
    wf.status = 'published';
    wf.updatedAt = now();

    workflows.set(id, wf);
    return { success: true, item: deepCloneWorkflow(wf), version: nextVersion };
}

export async function rollbackWorkflow(id, { targetVersion, publish = false, createdBy = 'Admin' } = {}) {
    ensureSeeded();
    const wf = workflows.get(id);
    if (!wf) return { error: 'Workflow not found' };

    const versionEntry = wf.versions.find((v) => v.version === targetVersion);
    if (!versionEntry) return { error: `Version ${targetVersion} not found` };

    wf.nodes = cloneNodes(versionEntry.nodes);
    wf.updatedAt = now();

    if (publish) {
        const nextVersion = (wf.currentVersion || 0) + 1;
        wf.versions.push({
            version: nextVersion,
            nodes: cloneNodes(versionEntry.nodes),
            createdAt: now(),
            publishedAt: now(),
            createdBy,
            rolledBackFrom: targetVersion,
        });
        wf.currentVersion = nextVersion;
        wf.publishedNodes = cloneNodes(versionEntry.nodes);
        wf.status = 'published';
    } else {
        wf.status = 'draft';
    }

    workflows.set(id, wf);
    return { success: true, item: deepCloneWorkflow(wf), restoredVersion: targetVersion };
}

export async function listTemplates() {
    return { items: WORKFLOW_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        industry: t.industry,
        category: t.category,
        description: t.description,
        icon: t.icon,
        companyHint: t.companyHint,
        stepCount: t.nodes.length,
    })) };
}

export async function installTemplate({ templateId, companyId, companyName, name, createdBy = 'Admin' }) {
    ensureSeeded();
    const template = getTemplateById(templateId);
    if (!template) return { error: 'Template not found' };
    if (!companyId) return { error: 'companyId is required' };

    const nodes = cloneTemplateNodes(template.nodes);
    return createWorkflow({
        name: name || template.name,
        companyId,
        companyName: companyName || template.companyHint || '',
        nodes,
        createdBy,
    });
}

/** Expose for memory adapter extension */
export const workflowStore = {
    list: listWorkflows,
    get: getWorkflow,
    create: createWorkflow,
    update: updateWorkflow,
    remove: deleteWorkflow,
};
