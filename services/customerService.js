/**
 * Server-side Customer CRM — backed by storageAdapter (legacy flat collections).
 * @deprecated Use services/tenants/crmService.js for new tenant-scoped CRM writes.
 * WhatsApp webhook and /api/customers still route here during Phase 2 migration.
 */
import { getStorageAdapter } from "./storage/storageAdapter.js";

const DEFAULT_FIELDS = {
    tags: [],
    leadScore: 50,
    leadScoreBreakdown: null,
    notesList: [],
    tasks: [],
    timeline: [],
    documents: [],
    orders: [],
    analytics: {},
    assignedEmployee: null,
    assignedAiEmployee: null,
    assignedHumanAgent: null,
    aiSummary: "",
    recommendedAction: null,
    totalConversations: 0,
    totalMessages: 0,
    averageSentiment: null,
    sentimentLabel: null,
    aiConfidence: null,
    lifetimeValue: null,
    lastPurchase: null,
    interests: {},
    online: false,
};

function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function store() {
    return getStorageAdapter();
}

export async function getCustomer(phone) {
    return (await store()).getCustomer(normalizePhone(phone));
}

export async function listCustomers(options = {}) {
    const adapter = await store();
    if (adapter.listCustomers) {
        return adapter.listCustomers(options);
    }
    return [];
}

export async function upsertCustomer(phone, data = {}) {
    const adapter = await store();
    const key = normalizePhone(phone);
    const existing = (await adapter.getCustomer(key)) || {};
    return adapter.upsertCustomer(key, {
        ...DEFAULT_FIELDS,
        ...existing,
        ...data,
        phone: key,
        id: data.id || existing.id || key,
    });
}

export async function updateCustomer(phone, patch) {
    return (await store()).updateCustomer(normalizePhone(phone), patch);
}

export function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "");
}

export function formatPhoneDisplay(phone) {
    const digits = normalizePhone(phone);
    if (digits.startsWith("27") && digits.length === 11) {
        return `+27 ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }
    return phone ? `+${digits}` : "—";
}

export function calculateLeadScore(customer = {}, analysis = {}) {
    const breakdown = {
        conversationFrequency: Math.min(20, Math.round((customer.totalConversations || 0) * 4)),
        questionsAsked: Math.min(20, Math.round((customer.totalMessages || 0) * 0.6)),
        productsViewed: /\b(hilux|corolla|swift|vehicle|model|catalogue)\b/i.test(customer.aiSummary || "")
            ? 15
            : analysis.topic === "sales"
              ? 12
              : 6,
        positiveSentiment:
            (customer.averageSentiment || analysis.sentiment) === "positive"
                ? 16
                : (customer.averageSentiment || analysis.sentiment) === "negative"
                  ? 4
                  : 10,
        purchaseIntent:
            analysis.intent === "purchase" || analysis.category === "sales"
                ? 18
                : analysis.topic === "pricing"
                  ? 14
                  : 8,
        responseSpeed: customer.analytics?.avgResponseTimeMs
            ? customer.analytics.avgResponseTimeMs < 1500
                ? 14
                : 10
            : 12,
    };

    const score = Math.max(
        0,
        Math.min(
            100,
            Object.values(breakdown).reduce((sum, v) => sum + v, 0)
        )
    );

    return { score, breakdown };
}

export async function upsertCustomerFromWhatsApp(phone, { contactName, companyId, messagePreview } = {}) {
    const adapter = await store();
    const key = normalizePhone(phone);
    const existing = (await adapter.getCustomer(key)) || {};
    const now = new Date().toISOString();

    const patch = {
        phone: key,
        id: existing.id || key,
        channel: "whatsapp",
        status: existing.status || "in_progress",
        mode: existing.mode || "ai",
        companyId: companyId || existing.companyId || process.env.DEFAULT_COMPANY_ID || null,
        tags: existing.tags || [],
        leadScore: existing.leadScore ?? 50,
        notesList: existing.notesList || [],
        tasks: existing.tasks || [],
        timeline: existing.timeline || [],
        documents: existing.documents || [],
        orders: existing.orders || [],
        analytics: existing.analytics || {},
        assignedEmployee: existing.assignedEmployee || null,
        assignedAiEmployee: existing.assignedAiEmployee || null,
        aiSummary: existing.aiSummary || "",
        recommendedAction: existing.recommendedAction || null,
        totalConversations: existing.totalConversations || 0,
        totalMessages: (existing.totalMessages || 0) + (messagePreview ? 1 : 0),
        averageSentiment: existing.averageSentiment ?? null,
        lifetimeValue: existing.lifetimeValue ?? null,
        lastPurchase: existing.lastPurchase || null,
        lastSeen: now,
        online: true,
    };

    if (contactName) patch.name = contactName;
    else if (!existing.name) patch.name = formatPhoneDisplay(key);

    if (messagePreview) patch.lastMessage = messagePreview;

    if (!existing.createdAt) {
        patch.createdAt = now;
        patch.customerSince = now;
        await addTimelineEvent(key, {
            type: "created",
            title: "Customer Created",
            description: "Profile created from WhatsApp inbound.",
            createdAt: now,
        });
    }

    return adapter.upsertCustomer(key, patch);
}

/** @deprecated alias */
export const upsertFromWhatsApp = upsertCustomerFromWhatsApp;

export async function getCustomerProfile(phone) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key)) || null;
    if (!customer) return null;

    const companyName = customer.companyName || null;
    const lead = customer.leadScoreBreakdown
        ? { score: customer.leadScore, breakdown: customer.leadScoreBreakdown }
        : calculateLeadScore(customer, customer.lastAnalysis || {});

    return {
        ...customer,
        phone: key,
        phoneDisplay: formatPhoneDisplay(key),
        companyName,
        leadScore: lead.score,
        leadScoreBreakdown: lead.breakdown,
        timeline: [...(customer.timeline || [])].sort(
            (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        ),
        notesList: customer.notesList || [],
        tasks: customer.tasks || [],
    };
}

export async function updateAiSummary(phone, summary) {
    return updateCustomer(normalizePhone(phone), {
        aiSummary: String(summary || "").slice(0, 4000),
        updatedAt: new Date().toISOString(),
    });
}

export async function addNote(phone, { text, author = "Admin" } = {}) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key)) || {};
    const note = {
        id: uid("note"),
        text: String(text || "").trim(),
        author,
        createdAt: new Date().toISOString(),
    };
    const notesList = [...(customer.notesList || []), note];
    await updateCustomer(key, { notesList });
    return note;
}

export async function addTask(phone, { title, deadline, priority = "medium", assignedTo = "Unassigned" } = {}) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key)) || {};
    const task = {
        id: uid("task"),
        title: String(title || "").trim(),
        deadline: deadline || null,
        priority,
        assignedTo,
        done: false,
        createdAt: new Date().toISOString(),
    };
    const tasks = [...(customer.tasks || []), task];
    await updateCustomer(key, { tasks });
    return task;
}

export async function updateTask(phone, taskId, patch) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key)) || {};
    const tasks = (customer.tasks || []).map((t) => (t.id === taskId ? { ...t, ...patch } : t));
    await updateCustomer(key, { tasks });
    return tasks.find((t) => t.id === taskId) || null;
}

export async function deleteNote(phone, noteId) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key)) || {};
    const notesList = (customer.notesList || []).filter((n) => n.id !== noteId);
    await updateCustomer(key, { notesList });
    return notesList;
}

export async function addTimelineEvent(phone, event) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key)) || {};
    const entry = {
        id: event.id || uid("tl"),
        type: event.type || "event",
        title: event.title || "Event",
        description: event.description || "",
        createdAt: event.createdAt || new Date().toISOString(),
        meta: event.meta || null,
    };
    const timeline = [...(customer.timeline || []), entry];
    await updateCustomer(key, { timeline });
    return entry;
}

export async function getTimeline(phone) {
    const profile = await getCustomerProfile(phone);
    return profile?.timeline || [];
}

export async function applyIntelligence(phone, analysis) {
    const key = normalizePhone(phone);
    const adapter = await store();
    const existing = (await adapter.getCustomer(key)) || {};
    const lead = calculateLeadScore(existing, analysis);

    const patch = {
        leadScore: analysis.leadQuality ?? lead.score,
        leadScoreBreakdown: lead.breakdown,
        averageSentiment: analysis.sentiment ?? existing.averageSentiment,
        sentimentLabel: capitalize(analysis.sentiment) || existing.sentimentLabel,
        aiConfidence: analysis.confidence ?? existing.aiConfidence ?? 85,
        lastAnalysis: analysis,
        recommendedAction: analysis.recommendedAction
            ? {
                  action: analysis.recommendedAction,
                  reason: analysis.recommendedReason || "",
                  confidence: analysis.confidence ?? 80,
              }
            : existing.recommendedAction,
    };

    if (analysis.escalationNeeded) {
        patch.status = "needs_attention";
        patch.tags = [...new Set([...(existing.tags || []), "escalation"])];
    }
    if (analysis.category && analysis.category !== "general") {
        patch.tags = [...new Set([...(existing.tags || []), analysis.category])].slice(0, 10);
    }

    const analytics = {
        ...(existing.analytics || {}),
        topTopic: analysis.category || analysis.topic || existing.analytics?.topTopic,
        purchaseProbability: analysis.leadQuality ?? existing.analytics?.purchaseProbability ?? lead.score,
        messages: (existing.analytics?.messages || existing.totalMessages || 0) + 1,
        aiReplies: (existing.analytics?.aiReplies || 0) + 1,
    };
    patch.analytics = analytics;

    await adapter.updateCustomer(key, patch);

    await addTimelineEvent(key, {
        type: "ai_analysis",
        title: "AI Intelligence Updated",
        description: `${capitalize(analysis.sentiment)} sentiment · ${analysis.intent} intent · score ${patch.leadScore}`,
        meta: { analysis },
    });

    if (analysis.replyPreview) {
        await addTimelineEvent(key, {
            type: "ai_reply",
            title: "AI Replied",
            description: analysis.replyPreview,
        });
    }

    return patch;
}

export async function appendAiSummary(phone, line) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key)) || {};
    const prev = customer.aiSummary || "";
    const stamp = new Date().toISOString().slice(0, 10);
    const next = prev ? `${prev}\n[${stamp}] ${line}` : `[${stamp}] ${line}`;
    return updateCustomer(key, { aiSummary: next.slice(-4000) });
}

function capitalize(value) {
    if (!value) return null;
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}
