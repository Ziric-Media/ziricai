import { classifyTenant } from "../../../js/shared/tenantClassification.js";
import { getCompany, enrichCompanyIntegrationStatus } from "../../tenants/companyService.js";
import { listAiEmployees } from "../../tenants/aiEmployeeService.js";
import { getTenantBilling, getPlan } from "../../payments/billingService.js";
import { getAiEmployeeUsage } from "../../tenants/aiEmployeeEntitlement.js";
import { assessRuntimeReadiness } from "../../tenants/platformWhatsAppIntegrationService.js";
import { sanitizeIntegrationForPlatform } from "../../tenants/integrationService.js";

export default {
    name: "viewTenantOperatorSummary",
    description:
        "Mission Control only: read-only operator summary for one ZiricAI client company (tenant) — classification, plan/billing, AI employees, WhatsApp integration status, entitlements. Use for “show me Client 0.1’s status”, tenant investigation. Requires companyId (tenant id).",
    parameters: {
        type: "object",
        properties: {
            companyId: {
                type: "string",
                description: "Tenant company id, e.g. client-0-1, ziricai, demo-central-motors",
            },
        },
        required: ["companyId"],
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute(ctx, args) {
        const companyId = String(args.companyId || ctx.companyId || "").trim();
        if (!companyId) {
            return {
                success: false,
                message: "companyId is required for tenant operator summary.",
                code: "MISSING_COMPANY_ID",
            };
        }

        const company = await getCompany(companyId).catch(() => null);
        if (!company) {
            return {
                success: false,
                message: `No tenant found with id "${companyId}".`,
                code: "TENANT_NOT_FOUND",
            };
        }

        const enriched = await enrichCompanyIntegrationStatus(company);
        const classification = classifyTenant(enriched);
        const [agents, billing, usage] = await Promise.all([
            listAiEmployees(companyId).catch(() => []),
            getTenantBilling(companyId).catch(() => null),
            getAiEmployeeUsage(companyId, enriched.plan || billing?.planId || "starter").catch(() => null),
        ]);

        const waRaw = enriched.whatsappIntegration || null;
        const waSafe = waRaw ? sanitizeIntegrationForPlatform(waRaw) : null;
        const readiness = waRaw
            ? assessRuntimeReadiness(waRaw)
            : { runtimeReady: false, missing: ["integration_document"] };

        const planId = billing?.planId || enriched.plan || company.plan || "starter";
        const plan = getPlan(planId);

        const summary = {
            companyId,
            companyName: enriched.name || companyId,
            classification: classification.classification,
            status: enriched.status || company.status || "unknown",
            plan: {
                planId,
                planName: plan?.name || planId,
                billingStatus: billing?.status || null,
                trialEndsAt: billing?.trialEndsAt || null,
            },
            aiEmployees: {
                count: agents.length,
                names: agents.map((a) => a.name).filter(Boolean),
                usage,
            },
            whatsapp: {
                status: waSafe?.status || "not_configured",
                runtimeReady: readiness.runtimeReady,
                missing: readiness.missing,
                displayPhoneNumber: waSafe?.displayPhoneNumber || null,
            },
            meta: { readOnly: true, dataSource: "tenant_operator_summary" },
        };

        const message =
            `Tenant ${summary.companyName} (${companyId}): ${summary.classification}, plan ${summary.plan.planName}` +
            ` (${summary.plan.billingStatus || "—"}). ` +
            `${summary.aiEmployees.count} AI employee(s)` +
            (summary.aiEmployees.names.length ? `: ${summary.aiEmployees.names.join(", ")}` : "") +
            `. WhatsApp: ${summary.whatsapp.status}` +
            (summary.whatsapp.runtimeReady ? " (runtime ready)." : " (not runtime ready).");

        return {
            message,
            data: summary,
            completionType: "read",
        };
    },
};
