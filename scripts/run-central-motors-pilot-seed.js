#!/usr/bin/env node
/**
 * Run Central Motors pilot seed against production Firestore (Railway env).
 * Uses tenant Admin path for knowledge docs (legacy knowledge collection is Web SDK-only).
 *
 * Usage:
 *   npx @railway/cli run node scripts/run-central-motors-pilot-seed.js
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

process.env.CENTRAL_MOTORS_PILOT = process.env.CENTRAL_MOTORS_PILOT || "true";

const PILOT_KNOWLEDGE = [
    {
        id: "rtb-kn-faq-hours",
        title: "Business Hours",
        content:
            "Central Motors Rustenburg operates Monday to Friday 8:00 AM–5:00 PM, and Saturdays 8:00 AM–1:00 PM. Closed Sundays and public holidays.",
        type: "faq",
    },
    {
        id: "rtb-kn-faq-location",
        title: "Visit Us",
        content:
            "Visit Central Motors Rustenburg at our dealership in Rustenburg, North West. Book a test drive via WhatsApp or call us. Bring a valid driver's licence.",
        type: "faq",
    },
    {
        id: "rtb-kn-faq-website",
        title: "Website",
        content: "Browse our full inventory at https://centralmotorsrtb.co.za",
        type: "faq",
    },
];

async function seedKnowledgeViaTenantPath(companyId, knowledgeBaseId, agentId) {
    const { ensureKnowledgeBase } = await import("../services/tenants/knowledgeService.js");
    const { ServiceBase } = await import("../services/core/serviceBase.js");
    const { TENANT_COLLECTIONS } = await import("../services/database/schema.js");

    class DocumentService extends ServiceBase {
        constructor() {
            super(TENANT_COLLECTIONS.DOCUMENTS);
        }
    }
    const docService = new DocumentService();

    await ensureKnowledgeBase(companyId, knowledgeBaseId);

    let upserted = 0;
    for (const doc of PILOT_KNOWLEDGE) {
        await docService.upsert(companyId, doc.id, {
            ...doc,
            companyId,
            knowledgeBaseId,
            agentId,
            source: "pilot-seed",
            status: "active",
        });
        upserted += 1;
    }
    return upserted;
}

async function ensureWhatsAppIntegration(companyId) {
    const { upsertWhatsAppIntegration, warmPhoneResolutionCache } = await import(
        "../services/tenants/integrationService.js"
    );
    const { CENTRAL_MOTORS_PHONE_NUMBER_ID } = await import("../services/storage/seedDemoTenants.js");

    const integration = await upsertWhatsAppIntegration(companyId, {
        channel: "whatsapp",
        provider: "whatsapp",
        phoneNumberId: CENTRAL_MOTORS_PHONE_NUMBER_ID,
        businessAccountId: process.env.WABA_ID || null,
        displayPhoneNumber: process.env.DISPLAY_PHONE_NUMBER || null,
        status: "active",
        credentialsSource: "env",
    });
    warmPhoneResolutionCache(CENTRAL_MOTORS_PHONE_NUMBER_ID, integration);
    return integration;
}

async function main() {
    const { bootstrapIntegrationConfig } = await import(
        "../services/integrations/types/integrationConfig.js"
    );
    const { seedCentralMotorsPilotIfEnabled } = await import(
        "../services/storage/seedCentralMotorsPilot.js"
    );
    const { TenantRepository } = await import("../services/database/tenantRepository.js");
    const { TENANT_COLLECTIONS } = await import("../services/database/schema.js");
    const { findActiveWhatsAppIntegrationByPhoneNumberId } = await import(
        "../services/tenants/integrationService.js"
    );
    const { getDefaultAiEmployee } = await import("../services/tenants/aiEmployeeService.js");
    const { getCompany } = await import("../services/tenants/companyService.js");
    const { CENTRAL_MOTORS_PHONE_NUMBER_ID } = await import("../services/storage/seedDemoTenants.js");
    const { CENTRAL_MOTORS_RTB_COMPANY_ID } = await import("../services/storage/centralMotorsPilot.js");

    bootstrapIntegrationConfig();

    console.log("Running Central Motors pilot seed...");
    console.log("CENTRAL_MOTORS_PILOT:", process.env.CENTRAL_MOTORS_PILOT);
    console.log("STORAGE_BACKEND:", process.env.STORAGE_BACKEND || "(default)");
    console.log("Company:", CENTRAL_MOTORS_RTB_COMPANY_ID);
    console.log("");

    let seedResult = { enabled: false };
    try {
        seedResult = await seedCentralMotorsPilotIfEnabled();
        console.log("Standard seed result:", JSON.stringify(seedResult, null, 2));
    } catch (err) {
        console.warn("Standard seed partial failure (expected for knowledge on Firestore):", err.message);
    }

    const companyId = CENTRAL_MOTORS_RTB_COMPANY_ID;
    const agent = await getDefaultAiEmployee(companyId);
    if (!agent) throw new Error("Sarah AI employee missing — seed company/agent first");

    const knowledgeBaseId = agent.knowledgeBaseId || "rtb-kb-1";
    const knowledgeCount = await seedKnowledgeViaTenantPath(companyId, knowledgeBaseId, agent.id);
    console.log(`✓ Seeded ${knowledgeCount} knowledge document(s) via tenant path`);

    const integration = await ensureWhatsAppIntegration(companyId);
    console.log(
        `✓ WhatsApp integration phoneNumberId=${integration.phoneNumberId} → ${integration.companyId}`
    );

    const company = await getCompany(companyId);
    console.log(company ? `✓ Company: ${company.name}` : "✗ Company missing");

    const persisted = await findActiveWhatsAppIntegrationByPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
    if (persisted?.companyId !== companyId) {
        throw new Error("WhatsApp integration lookup failed after seed");
    }
    console.log(`✓ Verified phone ${CENTRAL_MOTORS_PHONE_NUMBER_ID} → ${persisted.companyId}`);

    const repo = new TenantRepository(TENANT_COLLECTIONS.DOCUMENTS);
    const unfiltered = await repo.list(companyId, { max: 10 });
    const filtered = await repo.list(companyId, {
        max: 10,
        filters: { knowledgeBaseId },
    });
    console.log(`✓ Tenant documents unfiltered: ${unfiltered.length}`);
    console.log(`✓ Tenant documents filtered (${knowledgeBaseId}): ${filtered.length}`);

    if (filtered.length < PILOT_KNOWLEDGE.length) {
        throw new Error(`Expected at least ${PILOT_KNOWLEDGE.length} filtered docs, got ${filtered.length}`);
    }

    console.log("\nPilot seed complete.");
}

main().catch((err) => {
    console.error("\n✗ Pilot seed failed:", err.message);
    process.exit(1);
});
