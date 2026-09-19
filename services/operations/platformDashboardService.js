/**
 * MC-U-2B — Platform dashboard read facade (Mission Control).
 * Read-only: tenant scope delegates to portal hub; platform scope uses registry + classifier.
 */
import {
    classifyTenant,
    summarizeByClassification,
} from "../../js/shared/tenantClassification.js";
import { getQueueStats } from "../queue/jobQueue.js";
import {
    getStorageAdapter,
    getConfiguredStorageBackend,
    getStorageFallbackReason,
    hasAdminCredentials,
} from "../storage/storageAdapter.js";
import { isWhatsAppDevMode } from "../integrations/metaWhatsAppErrors.js";
import { isFirebaseTokenVerificationReady } from "../auth/authService.js";
import {
    getPlatformRegistryActivity,
    getPlatformRegistryMetrics,
} from "../platform/platformRegistry.js";
import { getCompany, listAllCompaniesFromStorage } from "../tenants/companyService.js";
import { getPortalHub } from "../portal/portalDataHub.js";
import { PRIMARY_MISSION_TENANT_ID } from "./tenantMissionMetrics.js";

export class PlatformDashboardValidationError extends Error {
    constructor(message, code = "INVALID_QUERY") {
        super(message);
        this.name = "PlatformDashboardValidationError";
        this.code = code;
    }
}

/**
 * @param {Record<string, string|undefined>} query
 */
export function parsePlatformDashboardQuery(query = {}) {
    const rawScope = String(query.scope || "platform").toLowerCase();
    const scope = rawScope === "tenant" ? "tenant" : "platform";
    const companyId = query.companyId ? String(query.companyId).trim() : null;
    const from = query.from ? String(query.from).trim() : null;
    const to = query.to ? String(query.to).trim() : null;

    if (scope === "tenant" && !companyId) {
        throw new PlatformDashboardValidationError(
            "companyId is required when scope=tenant",
            "MISSING_COMPANY_ID"
        );
    }

    return { scope, companyId, from, to };
}

export async function getPlatformHealthSnapshot() {
    const adapter = await getStorageAdapter();
    const configured = process.env.STORAGE_BACKEND || getConfiguredStorageBackend();
    return {
        status: "ok",
        whatsapp: Boolean(process.env.PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN),
        verifyTokenSet: Boolean(
            process.env.VERIFY_TOKEN ||
                process.env.WHATSAPP_VERIFY_TOKEN ||
                process.env.WEBHOOK_VERIFY_TOKEN
        ),
        metaAppSecretSet: Boolean(process.env.META_APP_SECRET || process.env.APP_SECRET),
        whatsappDevMode: isWhatsAppDevMode(),
        defaultCompanyIdSet: Boolean(process.env.DEFAULT_COMPANY_ID),
        phoneNumberIdSuffix: process.env.PHONE_NUMBER_ID
            ? `***${String(process.env.PHONE_NUMBER_ID).slice(-4)}`
            : null,
        openai: Boolean(process.env.OPENAI_API_KEY),
        storage: adapter.name,
        storageConfigured: configured,
        firestoreAdmin: hasAdminCredentials(),
        firebaseTokenVerify: isFirebaseTokenVerificationReady(),
        firebaseDatabaseId: process.env.FIREBASE_DATABASE_ID || "default",
        storageFallback: getStorageFallbackReason() || null,
        firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "ziricai",
        queue: await getQueueStats(),
        tenantScopeEnforcement: (process.env.TENANT_SCOPE_ENFORCEMENT || "lax").toLowerCase(),
        timestamp: new Date().toISOString(),
    };
}

function buildTenantCensus(companies) {
    const byClass = summarizeByClassification(companies);
    const items = companies.map((company) => {
        const meta = classifyTenant(company);
        return {
            id: company.id || company.companyId,
            name: company.name || company.id,
            plan: company.plan || null,
            status: company.status || null,
            classification: meta.classification,
            classificationSource: meta.classificationSource,
            classificationConfidence: meta.classificationConfidence,
        };
    });
    return {
        total: byClass.total,
        byClass: {
            productionCustomer: byClass["PRODUCTION CUSTOMER"],
            pilot: byClass.PILOT,
            acceptance: byClass.ACCEPTANCE,
            demoShowcase: byClass["DEMO/SHOWCASE"],
            test: byClass.TEST,
            unknown: byClass.UNKNOWN,
        },
        items,
    };
}

function tenantKpisFromHub(hub) {
    if (!hub) return null;
    return {
        metrics: hub.metrics || null,
        ops: hub.ops || null,
        quickStats: hub.quickStats || null,
        usage: hub.usage || null,
        workspace: hub.workspace || null,
    };
}

function tenantActivityFromHub(hub) {
    const items = hub?.recentActivity || [];
    return { items, isDemo: Boolean(hub?.useDemoContent) };
}

/**
 * @param {{ scope: 'platform'|'tenant', companyId?: string|null, from?: string|null, to?: string|null }} query
 */
export async function getPlatformDashboard(query) {
    const generatedAt = new Date().toISOString();
    const dateRangeSupported = false;

    if (query.scope === "tenant") {
        const companyId = query.companyId;
        const company = await getCompany(companyId);
        if (!company) {
            const err = new PlatformDashboardValidationError("Company not found", "NOT_FOUND");
            err.statusCode = 404;
            throw err;
        }

        const classification = classifyTenant(company);
        const hub = await getPortalHub(companyId);

        return {
            scope: "tenant",
            tenantCensus: null,
            platformHealth: null,
            company: {
                id: company.id || companyId,
                name: company.name || companyId,
                plan: company.plan || null,
                status: company.status || null,
                classification: classification.classification,
                classificationSource: classification.classificationSource,
                classificationConfidence: classification.classificationConfidence,
            },
            kpis: tenantKpisFromHub(hub),
            pilotSpotlight: null,
            activity: tenantActivityFromHub(hub),
            meta: {
                dataSource: "portal_hub",
                partial: false,
                generatedAt,
                companyId,
                dateRangeSupported,
                dateRangeIgnored: Boolean(query.from || query.to),
            },
        };
    }

    const [companies, platformHealth, pilotHub] = await Promise.all([
        listAllCompaniesFromStorage(),
        getPlatformHealthSnapshot(),
        getPortalHub(PRIMARY_MISSION_TENANT_ID).catch(() => null),
    ]);

    const pilotCompany = companies.find(
        (c) => (c.id || c.companyId) === PRIMARY_MISSION_TENANT_ID
    );
    const pilotClassification = pilotCompany ? classifyTenant(pilotCompany) : null;
    const pilotName =
        pilotCompany?.name ||
        pilotHub?.company?.name ||
        PRIMARY_MISSION_TENANT_ID;

    return {
        scope: "platform",
        tenantCensus: buildTenantCensus(companies),
        platformHealth,
        company: null,
        kpis: {
            registry: {
                ...getPlatformRegistryMetrics(),
                companiesRegistered: companies.length,
            },
            operational: {
                aggregated: false,
                reason:
                    "Full cross-tenant KPI rollup deferred; use tenant scope or pilot spotlight for hub-aligned metrics.",
            },
        },
        pilotSpotlight: {
            companyId: PRIMARY_MISSION_TENANT_ID,
            name: pilotName,
            classification: pilotClassification?.classification || null,
            kpis: tenantKpisFromHub(pilotHub),
            inDirectory: Boolean(pilotCompany),
        },
        activity: {
            items: getPlatformRegistryActivity(15),
            isDemo: false,
        },
        meta: {
            dataSource: "platform_registry",
            partial: true,
            partialReason: "operational KPIs not summed across all tenants in MC-U-2B",
            generatedAt,
            companyId: null,
            dateRangeSupported,
            dateRangeIgnored: Boolean(query.from || query.to),
        },
    };
}
