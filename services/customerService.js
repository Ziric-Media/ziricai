/**
 * Server-side Customer CRM — bridges legacy storageAdapter and tenant-scoped storage.
 * When companyId is provided, customer records are isolated per company (not global phone keys).
 */
import { getStorageAdapter } from "./storage/storageAdapter.js";
import {
    getTenantCustomer,
    upsertTenantCustomer,
    listTenantCustomers,
    updateTenantCustomer,
} from "./storage/tenantStorage.js";
import {
    parseExplicitCustomerName,
    parseOccupation,
    isLikelyCompanyName,
    getCustomerDisplayName,
    capitalizeCustomerName,
    isValidExplicitCustomerName,
} from "./customerIdentity.js";

export {
    parseExplicitCustomerName,
    parseOccupation,
    isLikelyCompanyName,
    getCustomerDisplayName,
    isValidExplicitCustomerName,
} from "./customerIdentity.js";
export { parseIntroducedPerson, parseRelationshipSpeaker, isThirdPartyIntroduction } from "./customerIdentity.js";

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

export async function updateCustomerProfile(phone, patch = {}, { companyId } = {}) {
    const key = normalizePhone(phone);
    if (companyId) {
        return upsertTenantCustomer(companyId, key, patch);
    }
    return updateCustomer(key, patch);
}

/**
 * Persist a customer-stated name (tenant-scoped). Explicit names beat WhatsApp contact names.
 */
export async function persistExplicitCustomerName(phone, name, { companyId, companyName } = {}) {
    const trimmed = capitalizeCustomerName(name);
    if (!trimmed || !isValidExplicitCustomerName(trimmed) || isLikelyCompanyName(trimmed, { companyName })) {
        return null;
    }

    await updateCustomerProfile(
        phone,
        {
            displayName: trimmed,
            explicitName: trimmed,
            name: trimmed,
        },
        { companyId }
    );
    return trimmed;
}

async function store() {
    return getStorageAdapter();
}

export async function getCustomer(phone, options = {}) {
    const { companyId } = options;
    if (companyId) {
        return getTenantCustomer(companyId, phone);
    }
    return (await store()).getCustomer(normalizePhone(phone));
}

export async function listCustomers(options = {}) {
    const { companyId } = options;
    if (companyId) {
        return listTenantCustomers(companyId, { limit: options.limit || 100 });
    }
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

export async function upsertCustomerFromWhatsApp(
    phone,
    { contactName, companyId, companyName, messagePreview, explicitName } = {}
) {
    const key = normalizePhone(phone);
    const resolvedCompanyId =
        companyId ||
        (process.env.NODE_ENV !== "production" ? process.env.DEFAULT_COMPANY_ID : null) ||
        null;

    if (resolvedCompanyId) {
        const existing = (await getTenantCustomer(resolvedCompanyId, key)) || {};
        const now = new Date().toISOString();
        const patch = {
            channel: "whatsapp",
            status: existing.status || "in_progress",
            mode: existing.mode || "ai",
            tags: existing.tags || [],
            leadScore: existing.leadScore ?? 50,
            notesList: existing.notesList || [],
            tasks: existing.tasks || [],
            timeline: existing.timeline || [],
            totalMessages: (existing.totalMessages || 0) + (messagePreview ? 1 : 0),
            lastSeen: now,
            online: true,
        };

        if (explicitName && !isLikelyCompanyName(explicitName, { companyName })) {
            patch.displayName = explicitName;
            patch.explicitName = explicitName;
            patch.name = explicitName;
        } else if (contactName) {
            patch.whatsappContactName = contactName;
            if (
                !existing.displayName &&
                !isLikelyCompanyName(contactName, { companyName })
            ) {
                patch.name = contactName;
            }
        } else if (!existing.displayName && !existing.name) {
            patch.name = formatPhoneDisplay(key);
        }

        if (messagePreview) patch.lastMessage = messagePreview;
        if (!existing.createdAt) {
            patch.createdAt = now;
            patch.customerSince = now;
        }
        return upsertTenantCustomer(resolvedCompanyId, key, patch);
    }

    const adapter = await store();
    const existing = (await adapter.getCustomer(key)) || {};
    const now = new Date().toISOString();

    const patch = {
        phone: key,
        id: existing.id || key,
        channel: "whatsapp",
        status: existing.status || "in_progress",
        mode: existing.mode || "ai",
        companyId: companyId || existing.companyId || null,
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

    if (explicitName && !isLikelyCompanyName(explicitName, { companyName })) {
        patch.displayName = explicitName;
        patch.explicitName = explicitName;
        patch.name = explicitName;
    } else if (contactName) {
        patch.whatsappContactName = contactName;
        if (!existing.displayName && !isLikelyCompanyName(contactName, { companyName })) {
            patch.name = contactName;
        }
    } else if (!existing.displayName && !existing.name) {
        patch.name = formatPhoneDisplay(key);
    }

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

export async function getCustomerProfile(phone, { companyId } = {}) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key, { companyId })) || null;
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

export async function updateAiSummary(phone, summary, { companyId } = {}) {
    const key = normalizePhone(phone);
    const patch = {
        aiSummary: String(summary || "").slice(0, 4000),
        updatedAt: new Date().toISOString(),
    };
    if (companyId) {
        return upsertTenantCustomer(companyId, key, patch);
    }
    return updateCustomer(key, patch);
}

export async function addNote(phone, { text, author = "Admin" } = {}, { companyId } = {}) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key, { companyId })) || {};
    const note = {
        id: uid("note"),
        text: String(text || "").trim(),
        author,
        createdAt: new Date().toISOString(),
    };
    const notesList = [...(customer.notesList || []), note];
    if (companyId) {
        await upsertTenantCustomer(companyId, key, { notesList });
    } else {
        await updateCustomer(key, { notesList });
    }
    return note;
}

export async function addTask(phone, { title, deadline, priority = "medium", assignedTo = "Unassigned" } = {}, { companyId } = {}) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key, { companyId })) || {};
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
    if (companyId) {
        await upsertTenantCustomer(companyId, key, { tasks });
    } else {
        await updateCustomer(key, { tasks });
    }
    return task;
}

export async function updateTask(phone, taskId, patch, { companyId } = {}) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key, { companyId })) || {};
    const tasks = (customer.tasks || []).map((t) => (t.id === taskId ? { ...t, ...patch } : t));
    if (companyId) {
        await upsertTenantCustomer(companyId, key, { tasks });
    } else {
        await updateCustomer(key, { tasks });
    }
    return tasks.find((t) => t.id === taskId) || null;
}

export async function deleteNote(phone, noteId, { companyId } = {}) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key, { companyId })) || {};
    const notesList = (customer.notesList || []).filter((n) => n.id !== noteId);
    if (companyId) {
        await upsertTenantCustomer(companyId, key, { notesList });
    } else {
        await updateCustomer(key, { notesList });
    }
    return notesList;
}

export async function addTimelineEvent(phone, event, { companyId, idempotent = false } = {}) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key, { companyId })) || {};
    const entry = {
        id: event.id || uid("tl"),
        type: event.type || "event",
        title: event.title || "Event",
        description: event.description || "",
        createdAt: event.createdAt || new Date().toISOString(),
        meta: event.meta || null,
    };
    const timeline = customer.timeline || [];
    if (idempotent && entry.id && timeline.some((item) => item.id === entry.id)) {
        return timeline.find((item) => item.id === entry.id) || entry;
    }
    const nextTimeline = [...timeline, entry];
    if (companyId) {
        await upsertTenantCustomer(companyId, key, { timeline: nextTimeline });
    } else {
        await updateCustomer(key, { timeline: nextTimeline });
    }
    return entry;
}

export async function getTimeline(phone, { companyId } = {}) {
    const profile = await getCustomerProfile(phone, { companyId });
    return profile?.timeline || [];
}

export async function applyIntelligence(phone, analysis, { companyId } = {}) {
    const key = normalizePhone(phone);
    const existing = companyId
        ? (await getTenantCustomer(companyId, key)) || {}
        : (await (await store()).getCustomer(key)) || {};
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

    if (companyId) {
        await upsertTenantCustomer(companyId, key, patch);
    } else {
        await (await store()).updateCustomer(key, patch);
    }

    await addTimelineEvent(
        key,
        {
            type: "ai_analysis",
            title: "AI Intelligence Updated",
            description: `${capitalize(analysis.sentiment)} sentiment · ${analysis.intent} intent · score ${patch.leadScore}`,
            meta: { analysis },
        },
        { companyId }
    );

    if (analysis.replyPreview) {
        await addTimelineEvent(
            key,
            {
                type: "ai_reply",
                title: "AI Replied",
                description: analysis.replyPreview,
            },
            { companyId }
        );
    }

    return patch;
}

export async function appendAiSummary(phone, line, { companyId } = {}) {
    const key = normalizePhone(phone);
    const customer = (await getCustomer(key, { companyId })) || {};
    const prev = customer.aiSummary || "";
    const stamp = new Date().toISOString().slice(0, 10);
    const next = prev ? `${prev}\n[${stamp}] ${line}` : `[${stamp}] ${line}`;
    const patch = { aiSummary: next.slice(-4000) };
    if (companyId) {
        return upsertTenantCustomer(companyId, key, patch);
    }
    return updateCustomer(key, patch);
}

function capitalize(value) {
    if (!value) return null;
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}
