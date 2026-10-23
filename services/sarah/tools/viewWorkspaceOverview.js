import { listAiEmployees } from "../../tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../../tenants/knowledgeService.js";
import { getWhatsAppIntegration, sanitizeIntegrationForPlatform } from "../../tenants/integrationService.js";
import { assessRuntimeReadiness } from "../../tenants/platformWhatsAppIntegrationService.js";
import { listTenantConversations } from "../../tenants/conversationService.js";
import { can } from "../permissions.js";

export default {
    name: "viewWorkspaceOverview",
    description:
        "Read-only snapshot of this company's workspace: AI employees (count and names), knowledge base documents, WhatsApp integration summary, conversation count, and plan. Use for “what is in my workspace?”, “how many AI employees?”, “do I have WhatsApp connected?”",
    parameters: {
        type: "object",
        properties: {},
    },
    requiredPermissions: [],
    async execute(ctx) {
        const companyId = ctx.companyId;
        const role = ctx.role || "viewer";

        const [agents, knowledgeDocs, waRaw, conversations] = await Promise.all([
            listAiEmployees(companyId).catch(() => []),
            listKnowledgeDocuments(companyId).catch(() => []),
            getWhatsAppIntegration(companyId).catch(() => null),
            can(role, "canViewInbox")
                ? listTenantConversations(companyId, { limit: 50 }).catch(() => [])
                : Promise.resolve(null),
        ]);

        const waSafe = waRaw ? sanitizeIntegrationForPlatform(waRaw) : null;
        const readiness = waRaw ? assessRuntimeReadiness(waRaw) : { runtimeReady: false, missing: ["integration_document"] };

        const overview = {
            companyId,
            companyName: ctx.companyName,
            plan: ctx.plan || ctx.workspace?.company?.plan || null,
            aiEmployees: {
                count: agents.length,
                names: agents.map((a) => ({
                    name: a.name,
                    role: a.roleLabel || a.role,
                    isDefault: Boolean(a.isDefault),
                })),
            },
            knowledge: {
                documentCount: knowledgeDocs.length,
                sampleTitles: knowledgeDocs.slice(0, 8).map((d) => d.title).filter(Boolean),
            },
            whatsapp: waSafe
                ? {
                      present: true,
                      status: waSafe.status || waRaw.status,
                      runtimeReady: readiness.runtimeReady,
                      missing: readiness.missing,
                      credentialsSource: waSafe.credentialsSource ?? waRaw.credentialsSource ?? null,
                      displayPhoneNumber: waSafe.displayPhoneNumber || null,
                  }
                : { present: false, status: "not_configured", runtimeReady: false },
            conversations: conversations
                ? { count: conversations.length, inboxAccessible: true }
                : { count: null, inboxAccessible: false, note: "Your role cannot view inbox counts." },
        };

        const lines = [
            `${ctx.companyName}: ${agents.length} AI employee(s), ${knowledgeDocs.length} knowledge document(s).`,
            overview.whatsapp.present
                ? `WhatsApp: ${overview.whatsapp.status}${overview.whatsapp.runtimeReady ? " (ready)" : " (not fully ready)"}.`
                : "WhatsApp: not connected yet.",
        ];
        if (overview.conversations.inboxAccessible) {
            lines.push(`${overview.conversations.count} recent conversation(s) in inbox sample.`);
        }

        return {
            message: lines.join(" "),
            data: overview,
            completionType: "read_only",
        };
    },
};
