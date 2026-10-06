/**
 * PI-4F-2 — Read-only tenant diagnostic evidence (shared by Sarah tools + workflow).
 */
import { getWhatsAppIntegration, sanitizeIntegrationForPlatform } from "../../tenants/integrationService.js";
import { assessRuntimeReadiness } from "../../tenants/platformWhatsAppIntegrationService.js";
import { listAiEmployees } from "../../tenants/aiEmployeeService.js";
import {
    describeEmployeeOperationalState,
    getAiEmployeeUsage,
    getWorkspaceWhatsAppChannelState,
} from "../../tenants/aiEmployeeEntitlement.js";
import { listKnowledgeDocuments } from "../../tenants/knowledgeService.js";
import { listTenantConversations } from "../../tenants/conversationService.js";
import { listSupportCasesPage } from "../../tenants/supportCaseService.js";
import { getPortalActivityAsync } from "../../portal/portalDemo.js";
import { getQueueBackend } from "../../queue/jobQueue.js";
import { JOB_STATES } from "../../queue/jobStates.js";
import { AFFECTED_SERVICES } from "../supportCaseModel.js";

const SECRET_KEYS = [
    "accessToken",
    "whatsappToken",
    "token",
    "webhookVerifyToken",
    "verifyToken",
    "appSecret",
    "credentials",
    "privateKey",
];

export function assertDiagnosticPayloadSafe(payload) {
    const json = JSON.stringify(payload || {});
    for (const key of SECRET_KEYS) {
        if (json.includes(`"${key}"`)) {
            throw new Error("Diagnostic payload attempted to expose sensitive fields");
        }
    }
}

export function inferAffectedServiceFromText(message) {
    const lower = String(message || "").toLowerCase();
    if (/\bwhatsapp\b/.test(lower)) return "whatsapp";
    if (/\b(messenger|facebook)\b/.test(lower)) return "messenger";
    if (/\b(email|inbox mail)\b/.test(lower)) return "email";
    if (/\b(web chat|webchat|website chat)\b/.test(lower)) return "web_chat";
    if (/\b(knowledge|faq|document)\b/.test(lower)) return "knowledge";
    if (/\b(ai employee|ai agent|assistant)\b/.test(lower)) return "ai_employee";
    if (/\b(billing|invoice|payment)\b/.test(lower)) return "billing";
    return "platform";
}

export function normalizeAffectedService(service) {
    const s = String(service || "platform").toLowerCase();
    return AFFECTED_SERVICES.includes(s) ? s : "other";
}

export async function gatherWhatsAppConnectionState(companyId) {
    const raw = await getWhatsAppIntegration(companyId).catch(() => null);
    if (!raw) {
        return {
            present: false,
            status: "not_configured",
            runtimeReady: false,
            missing: ["integration_document"],
        };
    }
    const safe = sanitizeIntegrationForPlatform(raw);
    const { runtimeReady, missing } = assessRuntimeReadiness(raw);
    return {
        present: true,
        status: safe?.status || raw.status || "unknown",
        runtimeReady,
        missing,
        credentialsSource: safe?.credentialsSource ?? raw.credentialsSource ?? null,
        displayPhoneNumber: safe?.displayPhoneNumber || raw.displayPhoneNumber || null,
        phoneNumberIdMasked: safe?.phoneNumberId || null,
        lastError: safe?.lastError || raw.lastError || null,
        embeddedSignupCompletedAt: raw.embeddedSignupCompletedAt || null,
        updatedAt: raw.updatedAt || null,
    };
}

export async function gatherWebhookStatus(companyId) {
    const wa = await gatherWhatsAppConnectionState(companyId);
    if (!wa.present) {
        return {
            channel: "whatsapp",
            subscribed: false,
            runtimeReady: false,
            assessment: "not_configured",
            notes: ["No WhatsApp integration document — webhooks cannot receive events."],
        };
    }
    const notes = [];
    let assessment = "unknown";
    if (wa.runtimeReady) {
        assessment = wa.lastError ? "degraded" : "likely_active";
        notes.push("Integration passes runtime readiness checks (phone + credentials source).");
        notes.push("Webhook delivery is expected when Meta app subscription is active.");
    } else {
        assessment = "not_ready";
        notes.push(`Runtime not ready: ${(wa.missing || []).join(", ") || "configuration incomplete"}.`);
    }
    if (wa.lastError) {
        notes.push(`Integration lastError recorded: ${String(wa.lastError).slice(0, 200)}`);
    }
    return {
        channel: "whatsapp",
        subscribed: wa.runtimeReady && !wa.lastError,
        runtimeReady: wa.runtimeReady,
        assessment,
        lastError: wa.lastError,
        notes,
    };
}

export async function gatherAiEmployeeStatus(companyId, planFallback = "starter") {
    const [agents, whatsappState, usage] = await Promise.all([
        listAiEmployees(companyId).catch(() => []),
        getWorkspaceWhatsAppChannelState(companyId),
        getAiEmployeeUsage(companyId, planFallback).catch(() => null),
    ]);
    const employees = agents.map((e) => describeEmployeeOperationalState(e, whatsappState)).filter(Boolean);
    const receiving = employees.filter((e) => e.channels?.whatsapp?.receivingWhatsAppConversations);
    return {
        count: employees.length,
        planLimit: usage?.limit ?? null,
        whatsappWorkspaceReady: Boolean(whatsappState?.runtimeReady),
        receivingWhatsAppCount: receiving.length,
        employees,
    };
}

export async function gatherKnowledgeBaseStatus(companyId) {
    const docs = await listKnowledgeDocuments(companyId).catch(() => []);
    return {
        documentCount: docs.length,
        hasDocuments: docs.length > 0,
        sampleTitles: docs.slice(0, 8).map((d) => d.title).filter(Boolean),
        indexStatus: docs.length ? "documents_present" : "empty",
    };
}

export async function gatherRecentMessageActivity(companyId, { limit = 15 } = {}) {
    const conversations = await listTenantConversations(companyId, { limit: Math.min(limit, 25) }).catch(() => []);
    const whatsapp = conversations.filter((c) => (c.channel || "whatsapp") === "whatsapp");
    const recentInboundHint = whatsapp.filter((c) => {
        const preview = String(c.lastMessage || c.preview || "").trim();
        return preview.length > 0;
    });
    return {
        conversationSampleSize: conversations.length,
        whatsappConversations: whatsapp.length,
        recentActivityDetected: recentInboundHint.length > 0,
        samples: whatsapp.slice(0, 5).map((c) => ({
            id: c.id,
            preview: String(c.lastMessage || c.preview || "").slice(0, 120),
            updatedAt: c.updatedAt || c.lastMessageAt || null,
            channel: c.channel || "whatsapp",
        })),
    };
}

export async function gatherRecentErrors(companyId, { limit = 10 } = {}) {
    const errors = [];
    const wa = await gatherWhatsAppConnectionState(companyId);
    if (wa.lastError) {
        errors.push({
            source: "whatsapp_integration",
            message: String(wa.lastError).slice(0, 300),
            severity: "high",
        });
    }

    try {
        const backend = await getQueueBackend();
        if (typeof backend.listJobs === "function") {
            const jobs = backend.listJobs(200).filter((j) => j.companyId === companyId);
            for (const job of jobs) {
                if (job.status === JOB_STATES.FAILED || job.lastError) {
                    errors.push({
                        source: "message_queue",
                        message: String(job.lastError || job.status).slice(0, 300),
                        jobType: job.type,
                        severity: "medium",
                        at: job.updatedAt || job.enqueuedAt || null,
                    });
                }
            }
        }
    } catch {
        /* queue optional */
    }

    const activity = (await getPortalActivityAsync(companyId).catch(() => [])).slice(0, 20);
    for (const entry of activity) {
        const text = String(entry.summary || entry.message || "").toLowerCase();
        if (text.includes("fail") || text.includes("error")) {
            errors.push({
                source: "portal_activity",
                message: String(entry.summary || entry.message).slice(0, 200),
                severity: "low",
            });
        }
    }

    return {
        count: errors.length,
        processingFailuresDetected: errors.some((e) => e.source === "message_queue"),
        items: errors.slice(0, limit),
    };
}

export async function gatherSupportHistory(companyId, { limit = 10 } = {}) {
    const page = await listSupportCasesPage(companyId, { limit: Math.min(limit, 25) });
    return {
        count: page.items.length,
        cases: page.items.map((c) => ({
            id: c.id,
            issue: c.issue || c.subject,
            status: c.status,
            severity: c.severity,
            affectedService: c.affectedService,
            updatedAt: c.updatedAt,
        })),
    };
}

/**
 * Bundle evidence for an affected service investigation.
 */
export async function gatherServiceDiagnosticBundle(companyId, affectedService, ctx = {}) {
    const service = normalizeAffectedService(affectedService);
    const bundle = {
        affectedService: service,
        gatheredAt: new Date().toISOString(),
        whatsapp: null,
        webhook: null,
        aiEmployees: null,
        knowledge: null,
        messages: null,
        errors: null,
        supportHistory: null,
        workspace: null,
    };

    if (service === "whatsapp" || service === "platform" || service === "other") {
        bundle.whatsapp = await gatherWhatsAppConnectionState(companyId);
        bundle.webhook = await gatherWebhookStatus(companyId);
        bundle.messages = await gatherRecentMessageActivity(companyId);
    }
    if (service === "ai_employee" || service === "whatsapp" || service === "platform") {
        bundle.aiEmployees = await gatherAiEmployeeStatus(companyId, ctx.plan);
    }
    if (service === "knowledge" || service === "ai_employee" || service === "platform") {
        bundle.knowledge = await gatherKnowledgeBaseStatus(companyId);
    }
    bundle.errors = await gatherRecentErrors(companyId);
    bundle.supportHistory = await gatherSupportHistory(companyId);

    assertDiagnosticPayloadSafe(bundle);
    return bundle;
}
