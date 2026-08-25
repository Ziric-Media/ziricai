#!/usr/bin/env node
/**
 * Verify Central Motors pilot wiring: sandbox phone → central-motors-rtb + Sarah agent.
 *
 * Usage:
 *   CENTRAL_MOTORS_PILOT=true STORAGE_BACKEND=memory node scripts/verify-central-motors-pilot.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.CENTRAL_MOTORS_PILOT = "true";

import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { clearPhoneResolutionCache } from "../services/tenants/integrationService.js";
import { bootstrapIntegrationConfig } from "../services/integrations/types/integrationConfig.js";
import { seedDemoTenantsIfMissing } from "../services/storage/seedDemoTenants.js";
import { seedCentralMotorsPilotIfEnabled } from "../services/storage/seedCentralMotorsPilot.js";
import {
    CENTRAL_MOTORS_PHONE_NUMBER_ID,
    CENTRAL_MOTORS_COMPANY_ID,
} from "../services/storage/seedDemoTenants.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/storage/centralMotorsPilot.js";
import { getDefaultAiEmployee } from "../services/tenants/aiEmployeeService.js";
import { getCompany } from "../services/tenants/companyService.js";
import { findActiveWhatsAppIntegrationByPhoneNumberId } from "../services/tenants/integrationService.js";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    console.log("\nCentral Motors pilot verification");
    console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}`);
    console.log(`CENTRAL_MOTORS_PILOT=${process.env.CENTRAL_MOTORS_PILOT}\n`);

    resetMemoryTenantStore();
    clearPhoneResolutionCache();
    bootstrapIntegrationConfig();

    await seedDemoTenantsIfMissing();
    const pilotResult = await seedCentralMotorsPilotIfEnabled();
    assert(pilotResult.enabled, "Pilot seed should run when CENTRAL_MOTORS_PILOT=true");
    console.log("✓ Pilot seed enabled for central-motors-rtb");

    const { resolveCompanyFromPhoneNumberId } = await import(
        "../services/integrations/types/integrationConfig.js"
    );

    const companyId = await resolveCompanyFromPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
    assert(
        companyId === CENTRAL_MOTORS_RTB_COMPANY_ID,
        `Expected ${CENTRAL_MOTORS_RTB_COMPANY_ID}, got ${companyId}`
    );
    console.log(`✓ ${CENTRAL_MOTORS_PHONE_NUMBER_ID} → central-motors-rtb`);

    const demoResolved = await resolveCompanyFromPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
    assert(
        demoResolved !== CENTRAL_MOTORS_COMPANY_ID,
        "Sandbox phone must not resolve to demo-central-motors in pilot mode"
    );
    console.log("✓ demo-central-motors is not mapped to sandbox phone");

    const integration = await findActiveWhatsAppIntegrationByPhoneNumberId(
        CENTRAL_MOTORS_PHONE_NUMBER_ID
    );
    assert(integration?.companyId === CENTRAL_MOTORS_RTB_COMPANY_ID, "Integration companyId mismatch");
    assert(integration?.status === "active", "Integration must be active");
    console.log("✓ Active WhatsApp integration record for central-motors-rtb");

    const agent = await getDefaultAiEmployee(CENTRAL_MOTORS_RTB_COMPANY_ID);
    assert(agent?.name === "Sarah", `Expected Sarah, got ${agent?.name || "null"}`);
    assert(
        String(agent?.systemPrompt || "").includes("Rustenburg"),
        "Sarah prompt should reference Rustenburg"
    );
    console.log("✓ Sarah is default AI employee for central-motors-rtb");

    const company = await getCompany(CENTRAL_MOTORS_RTB_COMPANY_ID);
    assert(company?.website?.includes("centralmotorsrtb.co.za"), "Company website mismatch");
    assert(company?.name?.includes("Rustenburg"), "Company name should include Rustenburg");
    console.log("✓ Company profile has Rustenburg branding");

    clearPhoneResolutionCache();
    const persisted = await resolveCompanyFromPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
    assert(
        persisted === CENTRAL_MOTORS_RTB_COMPANY_ID,
        `Expected persistence after cache clear, got ${persisted}`
    );
    console.log("✓ Integration persists across cache clear + re-resolve");

    console.log("\nAll Central Motors pilot checks passed.");
}

main().catch((err) => {
    console.error("\n✗", err.message);
    process.exit(1);
});
