#!/usr/bin/env node
/**
 * Verify Firestore-backed WhatsApp phone_number_id → company resolution.
 *
 * Usage:
 *   STORAGE_BACKEND=memory node scripts/verify-whatsapp-integration.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { clearPhoneResolutionCache } from "../services/tenants/integrationService.js";
import { bootstrapIntegrationConfig } from "../services/integrations/types/integrationConfig.js";
import { seedDemoAgentsIfEmpty } from "../services/storage/seedDemoAgents.js";
import {
    seedDemoWhatsAppIntegrationIfMissing,
    CENTRAL_MOTORS_PHONE_NUMBER_ID,
    CENTRAL_MOTORS_COMPANY_ID,
} from "../services/storage/seedDemoWhatsAppIntegration.js";
import { getDefaultAiEmployee } from "../services/tenants/aiEmployeeService.js";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    console.log("\nWhatsApp integration resolution verification");
    console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}\n`);

    resetMemoryTenantStore();
    clearPhoneResolutionCache();
    bootstrapIntegrationConfig();

    await seedDemoAgentsIfEmpty();
    const seedResult = await seedDemoWhatsAppIntegrationIfMissing();
    console.log("Seed:", seedResult);

    const { resolveCompanyFromPhoneNumberId } = await import(
        "../services/integrations/types/integrationConfig.js"
    );

    const companyId = await resolveCompanyFromPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
    assert(
        companyId === CENTRAL_MOTORS_COMPANY_ID,
        `Expected ${CENTRAL_MOTORS_COMPANY_ID}, got ${companyId}`
    );
    console.log("✓ 1209265748933699 → demo-central-motors");

    const agent = await getDefaultAiEmployee(companyId);
    assert(agent?.name === "Sarah", `Expected Sarah, got ${agent?.name || "null"}`);
    console.log("✓ Sarah is default AI employee for demo-central-motors");

    const prevDefault = process.env.DEFAULT_COMPANY_ID;
    delete process.env.DEFAULT_COMPANY_ID;
    clearPhoneResolutionCache();
    process.env.NODE_ENV = "production";

    const unknownProd = await resolveCompanyFromPhoneNumberId("9999999999999");
    assert(unknownProd === null, `Unknown phone must not route in production, got ${unknownProd}`);
    console.log("✓ Unknown phone_number_id → null (no Central Motors fallback in production)");

    process.env.NODE_ENV = "development";
    if (prevDefault !== undefined) process.env.DEFAULT_COMPANY_ID = prevDefault;

    clearPhoneResolutionCache();
    await seedDemoWhatsAppIntegrationIfMissing();
    const persisted = await resolveCompanyFromPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
    assert(
        persisted === CENTRAL_MOTORS_COMPANY_ID,
        `Expected persistence after re-seed check, got ${persisted}`
    );
    console.log("✓ Integration persists across cache clear + re-resolve");

    console.log("\nAll WhatsApp integration checks passed.");
}

main().catch((err) => {
    console.error("\n✗", err.message);
    process.exit(1);
});
