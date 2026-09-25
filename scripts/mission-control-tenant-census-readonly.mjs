#!/usr/bin/env node
/**
 * MC-U-0.1 — Production tenant census (READ ONLY).
 *
 * Lists every Firestore companies/{companyId} root with factual enrichment.
 * Does NOT write Firestore, classify metadata, delete tenants, or mutate env.
 *
 * Run (production creds):
 *   npx @railway/cli run node scripts/mission-control-tenant-census-readonly.mjs
 *
 * Local (requires Admin SDK credentials in .env):
 *   node scripts/mission-control-tenant-census-readonly.mjs
 *
 * Optional:
 *   CENSUS_OUTPUT=test-results/mc-u-0.1-tenant-census.json
 *   CENSUS_CONCURRENCY=4
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { CENTRAL_MOTORS_COMPANY_ID } from "../services/storage/seedDemoTenants.js";
import { hasAdminCredentials, getAdminFirestore } from "../services/database/firestoreAdmin.js";
import { TENANT_COLLECTIONS } from "../services/database/schema.js";
import { getStorageAdapter } from "../services/storage/storageAdapter.js";
import { isCanonicalProvisioningComplete } from "../services/platform/provisioningService.js";
import { getProvisioningLinks } from "../services/tenants/companyService.js";
import { listAiEmployees, getDefaultAiEmployee } from "../services/tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../services/tenants/knowledgeService.js";
import { getTenantBilling } from "../services/payments/billingService.js";
import { getWhatsAppIntegration } from "../services/tenants/integrationService.js";
import { listInstalled } from "../services/platform/marketplaceInstallService.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const GATE = "MC-U-0.1";
const CLIENT2_ACCEPTANCE_ID = "client2-tp2c-accept-20260917";

/** Manual operator registry only — never inferred as REAL CUSTOMER. */
const OPERATOR_REAL_CUSTOMER_IDS = new Set(
    String(process.env.CENSUS_KNOWN_REAL_CUSTOMER_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
);

const KNOWN_PILOT = new Set([CENTRAL_MOTORS_RTB_COMPANY_ID]);
const KNOWN_DEMO = new Set([CENTRAL_MOTORS_COMPANY_ID, "demo-econo-funerals"]);
const KNOWN_ACCEPTANCE = new Set([CLIENT2_ACCEPTANCE_ID]);

function tsToIso(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (value.toDate) return value.toDate().toISOString();
    if (value._seconds != null) return new Date(value._seconds * 1000).toISOString();
    return null;
}

async function countSubcollection(db, companyId, sub) {
    try {
        const ref = db.collection("companies").doc(companyId).collection(sub);
        if (typeof ref.count === "function") {
            const snap = await ref.count().get();
            return snap.data().count ?? 0;
        }
        const snap = await ref.select().get();
        return snap.size;
    } catch {
        return null;
    }
}

async function listIntegrationSummary(db, companyId) {
    try {
        const snap = await db
            .collection("companies")
            .doc(companyId)
            .collection(TENANT_COLLECTIONS.INTEGRATIONS)
            .get();
        return snap.docs.map((d) => {
            const data = d.data() || {};
            return {
                id: d.id,
                provider: data.provider || data.channel || d.id,
                status: data.status || null,
            };
        });
    } catch {
        return [];
    }
}

async function recentActivityHint(db, companyId) {
    const hints = [];
    try {
        const eventsSnap = await db
            .collection("companies")
            .doc(companyId)
            .collection(TENANT_COLLECTIONS.EVENTS)
            .orderBy("recordedAt", "desc")
            .limit(1)
            .get();
        if (!eventsSnap.empty) {
            const e = eventsSnap.docs[0].data() || {};
            hints.push({
                source: "events",
                at: tsToIso(e.recordedAt || e.createdAt),
                type: e.event || e.type || eventsSnap.docs[0].id,
            });
        }
    } catch {
        /* index or empty */
    }
    try {
        const notifSnap = await db
            .collection("companies")
            .doc(companyId)
            .collection(TENANT_COLLECTIONS.NOTIFICATIONS)
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();
        if (!notifSnap.empty) {
            const n = notifSnap.docs[0].data() || {};
            hints.push({
                source: "notifications",
                at: tsToIso(n.createdAt),
                type: n.type || "notification",
            });
        }
    } catch {
        /* ignore */
    }
    hints.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    return hints[0] || null;
}

/**
 * Evidence-based classification — never infers REAL CUSTOMER from “not test”.
 * @returns {{ classification: string, evidence: string[] }}
 */
function classifyTenant(row) {
    const evidence = [];
    const { companyId, name, ownerEmail, settings } = row;
    const id = String(companyId || "").toLowerCase();
    const email = String(ownerEmail || "").toLowerCase();
    const displayName = String(name || "");

    const storedClass =
        settings?.tenantClass ||
        settings?.general?.tenantClass ||
        settings?.censusClass ||
        null;
    if (storedClass) {
        evidence.push(`company.settings carries tenantClass=${storedClass} (read only, not validated)`);
        return { classification: String(storedClass).toUpperCase(), evidence };
    }

    if (settings?.productionCustomer === true || settings?.isProductionCustomer === true) {
        evidence.push("company.settings.productionCustomer === true");
        return { classification: "REAL_CUSTOMER", evidence };
    }

    if (OPERATOR_REAL_CUSTOMER_IDS.has(companyId)) {
        evidence.push("companyId listed in CENSUS_KNOWN_REAL_CUSTOMER_IDS (operator registry)");
        return { classification: "REAL_CUSTOMER", evidence };
    }

    if (KNOWN_PILOT.has(companyId)) {
        evidence.push(`known pilot tenant id (${companyId})`);
        return { classification: "PILOT", evidence };
    }

    if (KNOWN_DEMO.has(companyId) || id.startsWith("demo-")) {
        if (KNOWN_DEMO.has(companyId)) evidence.push(`known demo tenant id (${companyId})`);
        if (id.startsWith("demo-")) evidence.push("companyId prefix demo-");
        return { classification: "DEMO/SHOWCASE", evidence };
    }

    if (KNOWN_ACCEPTANCE.has(companyId)) {
        evidence.push(`known acceptance tenant id (${companyId})`);
        return { classification: "ACCEPTANCE", evidence };
    }

    const acceptanceIdPatterns = [
        /^client2-tp/i,
        /^tp2c-/i,
        /-accept-/i,
        /acceptance/i,
    ];
    for (const re of acceptanceIdPatterns) {
        if (re.test(id) || re.test(displayName.toLowerCase())) {
            evidence.push(`id/name matches acceptance pattern ${re}`);
            return { classification: "ACCEPTANCE", evidence };
        }
    }

    const testIdPatterns = [
        /^portal-4/i,
        /^portal-/i,
        /-test-/i,
        /-lc-test-/i,
        /registry-test/i,
        /entitlement/i,
        /lifecycle-test/i,
        /smoke-/i,
        /harness/i,
    ];
    for (const re of testIdPatterns) {
        if (re.test(id)) {
            evidence.push(`companyId matches test harness pattern ${re}`);
            break;
        }
    }
    if (/portal-4b|portal-4c|portal-6c|portal-6e|6c6e|4c4b/i.test(id)) {
        evidence.push("companyId matches Portal gate prefix (4B/4C/6C/6E family)");
    }
    if (email.endsWith("@ziricai.com")) {
        evidence.push(`ownerEmail ${ownerEmail} is @ziricai.com (acceptance/harness domain)`);
    }
    if (evidence.length) {
        return { classification: "TEST", evidence };
    }

    evidence.push("no explicit tenantClass; no known pilot/demo/acceptance/test heuristics matched");
    return { classification: "UNKNOWN", evidence };
}

async function enrichCompany(db, companyId, rootData) {
    const [
        membershipCount,
        aiEmployeeCount,
        knowledgeDocumentCount,
        crmCustomerCount,
        defaultAgent,
        agents,
        knowledgeDocs,
        billing,
        whatsapp,
        provisioningRecord,
        marketplaceInstalls,
        integrations,
        recentActivity,
    ] = await Promise.all([
        countSubcollection(db, companyId, TENANT_COLLECTIONS.USERS),
        countSubcollection(db, companyId, TENANT_COLLECTIONS.AI_EMPLOYEES),
        countSubcollection(db, companyId, TENANT_COLLECTIONS.DOCUMENTS),
        countSubcollection(db, companyId, TENANT_COLLECTIONS.CUSTOMERS),
        getDefaultAiEmployee(companyId).catch(() => null),
        listAiEmployees(companyId).catch(() => []),
        listKnowledgeDocuments(companyId, { limit: 500 }).catch(() => []),
        getTenantBilling(companyId).catch(() => null),
        getWhatsAppIntegration(companyId).catch(() => null),
        getProvisioningLinks(companyId).catch(() => null),
        listInstalled(companyId).catch(() => []),
        listIntegrationSummary(db, companyId),
        recentActivityHint(db, companyId),
    ]);

    const kbFromAgent = defaultAgent?.knowledgeBaseId || null;
    const kbFromProv = provisioningRecord?.links?.knowledgeBaseId || null;
    const knowledgeBaseId = kbFromAgent || kbFromProv || rootData?.knowledgeBaseId || null;

    const whatsappStatus = whatsapp?.status || null;
    const whatsappActive = ["active", "connected"].includes(String(whatsappStatus || "").toLowerCase());

    const row = {
        companyId,
        name: rootData?.name || companyId,
        industry: rootData?.industry || null,
        status: rootData?.status || null,
        createdAt: tsToIso(rootData?.createdAt),
        updatedAt: tsToIso(rootData?.updatedAt),
        owner: rootData?.owner || null,
        ownerEmail: rootData?.ownerEmail || rootData?.email || null,
        ownerUid: rootData?.ownerUid || rootData?.ownerId || null,
        plan: rootData?.plan || null,
        settings: rootData?.settings || {},
        membershipCount,
        aiEmployeeCount: aiEmployeeCount ?? agents.length,
        defaultAiEmployee: defaultAgent
            ? { id: defaultAgent.id, name: defaultAgent.name, isDefault: Boolean(defaultAgent.isDefault) }
            : null,
        knowledgeBaseId,
        knowledgeDocumentCount:
            knowledgeDocumentCount != null ? knowledgeDocumentCount : knowledgeDocs.length,
        crmWorkspaceId: provisioningRecord?.links?.crmWorkspaceId || companyId,
        crmCustomerCount,
        billing: billing
            ? {
                  planId: billing.planId || billing.plan || null,
                  status: billing.status || null,
                  trialEndsAt: billing.trialEndsAt || null,
                  renewalDate: billing.renewalDate || null,
              }
            : null,
        marketplaceInstalls: marketplaceInstalls.map((m) => ({
            packId: m.packId || m.id,
            status: m.status || null,
            version: m.version || m.installedVersion || null,
        })),
        integrations,
        whatsapp: {
            status: whatsappStatus,
            runtimeReady: whatsappActive,
            displayPhoneNumber: whatsapp?.displayPhoneNumber || null,
        },
        provisioning: {
            provisionedAt: provisioningRecord?.provisionedAt || tsToIso(rootData?.provisionedAt),
            complete: isCanonicalProvisioningComplete(provisioningRecord),
            resources: provisioningRecord?.resources || [],
            links: provisioningRecord?.links || null,
        },
        recentActivity,
    };

    const { classification, evidence } = classifyTenant(row);
    row.classification = classification;
    row.evidence = evidence;

    return row;
}

async function mapPool(items, concurrency, fn) {
    const results = new Array(items.length);
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const i = index++;
            results[i] = await fn(items[i], i);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

async function main() {
    if (!hasAdminCredentials()) {
        console.log(JSON.stringify({ ok: false, gate: GATE, error: "NO_ADMIN_CREDENTIALS" }));
        process.exit(1);
    }

    getAdminFirestore();
    const adapter = await getStorageAdapter();
    const db = getAdminFirestore();

    const companiesSnap = await db.collection("companies").get();
    const docs = companiesSnap.docs.sort((a, b) => a.id.localeCompare(b.id));

    const concurrency = Math.max(1, Math.min(8, Number(process.env.CENSUS_CONCURRENCY) || 4));

    const tenants = await mapPool(docs, concurrency, async (doc) => {
        const data = doc.data() || {};
        try {
            return await enrichCompany(db, doc.id, data);
        } catch (err) {
            return {
                companyId: doc.id,
                name: data.name || doc.id,
                error: err.message || String(err),
                classification: "UNKNOWN",
                evidence: ["enrichment failed — partial row"],
            };
        }
    });

    const summary = {
        totalTenantRecords: tenants.length,
        byClassification: {},
    };
    for (const t of tenants) {
        const key = t.classification || "UNKNOWN";
        summary.byClassification[key] = (summary.byClassification[key] || 0) + 1;
    }

    const grouped = {};
    for (const t of tenants) {
        const key = t.classification || "UNKNOWN";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({
            companyId: t.companyId,
            name: t.name,
            status: t.status,
            plan: t.plan || t.billing?.planId,
            ownerEmail: t.ownerEmail,
        });
    }

    for (const key of Object.keys(grouped)) {
        grouped[key].sort((a, b) => a.companyId.localeCompare(b.companyId));
    }

    const payload = {
        ok: true,
        gate: GATE,
        generatedAt: new Date().toISOString(),
        readOnly: true,
        storage: adapter.name,
        summary,
        grouped,
        tenants,
        notes: [
            "REAL_CUSTOMER is never inferred from absence of test patterns.",
            "Operator may set CENSUS_KNOWN_REAL_CUSTOMER_IDS=id1,id2 for explicit registry only.",
            "Stored company.settings.tenantClass is reported as read fact if present.",
        ],
    };

    const defaultOut = path.join(
        ROOT,
        "test-results",
        `mc-u-0.1-tenant-census-${new Date().toISOString().slice(0, 10)}.json`
    );
    const outPath = process.env.CENSUS_OUTPUT
        ? path.isAbsolute(process.env.CENSUS_OUTPUT)
            ? process.env.CENSUS_OUTPUT
            : path.join(ROOT, process.env.CENSUS_OUTPUT)
        : defaultOut;

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

    console.log(JSON.stringify({ ok: true, gate: GATE, summary, outputFile: outPath }, null, 2));
    process.exit(0);
}

main().catch((err) => {
    console.log(JSON.stringify({ ok: false, gate: GATE, error: err.message || String(err) }));
    process.exit(1);
});
