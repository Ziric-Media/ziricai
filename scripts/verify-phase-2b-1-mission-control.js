#!/usr/bin/env node
/**
 * Phase 2B-1 — Mission Control → Central Motors CRM integration verification.
 *
 * Usage:
 *   node scripts/verify-phase-2b-1-mission-control.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { CENTRAL_MOTORS_COMPANY_ID } from "../services/storage/seedDemoTenants.js";
import { upsertCustomerFromWhatsApp, getCustomer } from "../services/customerService.js";
import {
    extractSalesSignals,
    mergeSalesContext,
    persistSalesContext,
} from "../services/conversation/salesContext.js";
import { syncFromSalesTurn } from "../services/integrations/crmSyncService.js";
import { TenantRepository } from "../services/database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../services/database/schema.js";
import {
    getPlatformMetrics,
    getPlatformActivity,
} from "../services/operations/platformOperations.js";
import {
    getTenantMissionMetrics,
    getPrimaryTenantMissionMetrics,
    PRIMARY_MISSION_TENANT_ID,
} from "../services/operations/tenantMissionMetrics.js";

const RTB = CENTRAL_MOTORS_RTB_COMPANY_ID;
const DEMO = CENTRAL_MOTORS_COMPANY_ID;
const PHONE = "27849000524";
const leadRepo = new TenantRepository(TENANT_COLLECTIONS.LEADS);
const customerRepo = new TenantRepository(TENANT_COLLECTIONS.CUSTOMERS);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
}

async function seedRtbCrmData() {
    await upsertCustomerFromWhatsApp(PHONE, {
        companyId: RTB,
        contactName: "Mission Control Verify",
        messagePreview: "Looking for an SUV",
    });

    const signals = extractSalesSignals("Family SUV, budget R350000, test drive please", {
        customer: { salesContext: { leadStage: "NEW" } },
    });
    const salesContext = mergeSalesContext(null, signals);
    await persistSalesContext(RTB, PHONE, signals);

    await syncFromSalesTurn(RTB, PHONE, {
        contactName: "Mission Control Verify",
        channel: "whatsapp",
        leadScore: 78,
        topic: "sales",
        salesContext: {
            ...salesContext,
            leadStage: "TEST_DRIVE_BOOKED",
            preferredVehicle: "Ford Everest",
        },
        aiEmployeeName: "Sarah",
    });
}

async function testPlatformAuthentication() {
    const testKey = "verify-phase-2b1-platform-key";
    process.env.PLATFORM_API_KEY = testKey;
    const { requirePlatformAccess } = await import("../services/auth/platformAuth.js");
    const middleware = requirePlatformAccess();

    const unauthReq = { headers: {}, path: "/api/operations/metrics", method: "GET" };
    const unauthRes = mockRes();
    let unauthNext = false;
    await middleware(unauthReq, unauthRes, () => {
        unauthNext = true;
    });
    assert(!unauthNext, "Unauthenticated request must not pass middleware");
    assert(unauthRes.statusCode === 401, `Expected 401 without auth, got ${unauthRes.statusCode}`);
    assert(unauthRes.body?.code === "UNAUTHORIZED", "Expected UNAUTHORIZED code");

    const keyReq = {
        headers: { "x-platform-api-key": testKey },
        path: "/api/operations/metrics",
        method: "GET",
    };
    const keyRes = mockRes();
    let keyNext = false;
    await middleware(keyReq, keyRes, () => {
        keyNext = true;
    });
    assert(keyNext, "Valid platform API key should pass requirePlatformAccess");
    assert(keyReq.platformAuth?.via === "api_key", "Platform auth should record api_key path");

    console.log("✓ Super Admin / platform API key authentication gate works");
}

async function testPrimaryTenantConstant() {
    assert(PRIMARY_MISSION_TENANT_ID === RTB, `PRIMARY_MISSION_TENANT_ID must be ${RTB}`);
    assert(PRIMARY_MISSION_TENANT_ID !== DEMO, "Production tenant must not be demo-central-motors");
    console.log("✓ PRIMARY_MISSION_TENANT_ID is central-motors-rtb");
}

async function testTenantMetricsFromCrm() {
    const metrics = await getTenantMissionMetrics(RTB);

    assert(metrics.companyId === RTB, "Tenant metrics must be scoped to central-motors-rtb");
    assert(metrics.dataSource === "tenant_crm", "Metrics must come from tenant CRM APIs");
    assert(metrics.storageReadOnly === true, "Mission Control aggregation must be read-only");
    assert(metrics.isProductionTenant === true, "RTB must be flagged as production tenant");
    assert(metrics.counts.customers >= 1, "Expected at least one CRM customer");
    assert(metrics.counts.leads >= 1, "Expected at least one CRM lead");
    assert(metrics.metricAvailability.leads === "real", "Lead metrics should be real when CRM has data");
    assert(metrics.metricAvailability.estimatedRevenue === "unavailable", "Revenue must not be fabricated");
    assert(metrics.sarah?.name === "Sarah", "Sarah performance block should be present");

    console.log("✓ central-motors-rtb returns real CRM metrics (read-only)");
}

async function testPlatformMetricsAggregation() {
    const data = await getPlatformMetrics({ companyId: RTB });

    assert(data.primaryCompanyId === RTB, "Platform metrics must query central-motors-rtb");
    assert(data.dataSources?.demoCentralMotorsUsed === false, "Demo Central Motors must not be used");
    assert(data.dataSources?.primaryTenant === RTB, "Data source primary tenant must be RTB");
    assert(data.isDemo === false, "Mission Control should not be in demo mode when RTB CRM has data");
    assert(data.tenantMetrics?.companyId === RTB, "Embedded tenantMetrics must be RTB");
    assert(typeof data.metrics.crmLeads === "number", "CRM lead count should be a real number");
    assert(data.metricAvailability?.estimatedRevenue === "unavailable", "Revenue must remain unavailable");
    assert(data.metricAvailability?.hourlyConversations === "unavailable", "Hourly chart must remain unavailable");

    console.log("✓ getPlatformMetrics aggregates real central-motors-rtb CRM data");
}

async function testNoDemoTenantLeakage() {
    const rtbMetrics = await getTenantMissionMetrics(RTB);
    const demoMetrics = await getTenantMissionMetrics(DEMO);

    assert(rtbMetrics.counts.leads >= 1, "RTB should have seeded lead");
    assert(
        !(demoMetrics.counts.leads > 0 && demoMetrics.activity?.some((a) => a.detail?.includes("Everest"))),
        "Demo tenant must not inherit RTB vehicle interest in activity"
    );

    const rtbLead = await leadRepo.get(RTB, PHONE);
    const demoLead = await leadRepo.get(DEMO, PHONE);
    assert(rtbLead, "RTB lead must exist");
    assert(!demoLead || demoLead.vehicleInterest !== rtbLead.vehicleInterest, "Demo tenant lead isolated from RTB");

    const platformForRtb = await getPlatformMetrics({ companyId: RTB });
    assert(platformForRtb.primaryCompanyId !== DEMO, "Platform aggregation must not default to demo tenant");

    console.log("✓ No demo-central-motors data leaks into production Mission Control");
}

async function testMissionControlDoesNotWriteCrm() {
    const leadsBefore = (await leadRepo.list(RTB, { max: 500 })).length;
    const customersBefore = (await customerRepo.list(RTB, { max: 500 })).length;

    await getPrimaryTenantMissionMetrics();
    await getPlatformMetrics({ companyId: RTB });
    await getPlatformActivity({ companyId: RTB });

    const leadsAfter = (await leadRepo.list(RTB, { max: 500 })).length;
    const customersAfter = (await customerRepo.list(RTB, { max: 500 })).length;

    assert(leadsAfter === leadsBefore, "Mission Control reads must not create leads");
    assert(customersAfter === customersBefore, "Mission Control reads must not create customers");

    console.log("✓ Mission Control aggregation creates no CRM records");
}

async function testTenantIsolation() {
    const otherPhone = "27849000525";
    await syncFromSalesTurn(DEMO, otherPhone, {
        contactName: "Demo Only Lead",
        salesContext: { leadStage: "NEW" },
        aiEmployeeName: "Sarah",
    });

    const rtb = await getTenantMissionMetrics(RTB);
    const demo = await getTenantMissionMetrics(DEMO);

    assert(rtb.companyId === RTB, "RTB metrics remain tenant-scoped");
    assert(demo.companyId === DEMO, "Demo metrics remain tenant-scoped");
    assert(
        !rtb.activity.some((a) => a.text?.includes("Demo Only Lead")),
        "RTB activity must not include demo tenant customers"
    );

    const demoCustomer = await getCustomer(otherPhone, { companyId: DEMO });
    const rtbCustomer = await getCustomer(otherPhone, { companyId: RTB });
    assert(demoCustomer, "Demo tenant has its own customer");
    assert(!rtbCustomer, "RTB must not see demo-only customer");

    console.log("✓ Tenant isolation remains intact");
}

async function testOperationsServiceUsesApiRequest() {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const opsService = readFileSync(join(root, "admin/js/admin/services/operationsService.js"), "utf8");

    assert(opsService.includes("apiRequest"), "operationsService must use shared apiRequest");
    assert(opsService.includes("central-motors-rtb"), "operationsService must target central-motors-rtb");
    assert(!opsService.includes("demo-central-motors"), "operationsService must not query demo tenant");
    assert(!opsService.includes("DEMO_OPERATIONS"), "operationsService must not import DEMO_OPERATIONS fallback");

    console.log("✓ Admin operationsService uses authenticated apiRequest for central-motors-rtb");
}

async function testProductionMetricsNeverFabricateDemo() {
    const { getPlatformMetrics, getPlatformActivity } = await import("../services/operations/platformOperations.js");

    resetMemoryTenantStore();
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    _resetMemoryAppointmentsForTests();

    const metrics = await getPlatformMetrics({ companyId: RTB });
    assert(metrics.isDemo === false, "Empty RTB metrics must not be flagged as demo");
    assert(metrics.dataSource === "crm", "Empty RTB metrics must use crm dataSource");
    assert(metrics.metrics?.aiEmployeesOnline !== 427, "Must not fabricate demo aiEmployeesOnline 427");
    assert(metrics.metrics?.activeConversations !== 143, "Must not fabricate demo activeConversations 143");
    assert(metrics.metrics?.estimatedRevenue !== 245600, "Must not fabricate demo revenue");
    assert(metrics.dataSources?.demoCentralMotorsUsed === false, "Demo Central Motors must not be used");

    const activity = await getPlatformActivity({ companyId: RTB });
    assert(activity.isDemo === false, "Empty RTB activity must not be demo-flagged");
    assert(
        !activity.items.some((item) => item.text?.includes("John Smith at Central Motors")),
        "Must not inject demo Sarah/John Smith activity for production tenant"
    );

    console.log("✓ Production RTB metrics/activity never fall back to fabricated demo data");
}

async function testLiveCrmMetricsWhenDataExists() {
    resetMemoryTenantStore();
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    _resetMemoryAppointmentsForTests();
    await seedRtbCrmData();

    const { getPlatformMetrics } = await import("../services/operations/platformOperations.js");
    const metrics = await getPlatformMetrics({ companyId: RTB });

    assert(metrics.isDemo === false, "Live CRM metrics must not be demo");
    assert(metrics.dataSource === "crm", "Live CRM must expose crm dataSource");
    assert(metrics.tenantMetrics?.companyId === RTB, "tenantMetrics must be RTB");
    assert(typeof metrics.metrics.crmLeads === "number", "crmLeads must be a real number when CRM has data");
    assert(metrics.metrics.aiEmployeesOnline !== 427, "Live response must not include demo 427 count");

    console.log("✓ Live CRM response uses real tenant metrics without demo mixing");
}

async function main() {
    console.log("\nPhase 2B-1 Mission Control → CRM integration verification\n");

    resetMemoryTenantStore();
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    _resetMemoryAppointmentsForTests();

    await testPrimaryTenantConstant();
    await testPlatformAuthentication();
    await seedRtbCrmData();
    await testTenantMetricsFromCrm();
    await testPlatformMetricsAggregation();
    await testNoDemoTenantLeakage();
    await testMissionControlDoesNotWriteCrm();
    await testTenantIsolation();
    await testOperationsServiceUsesApiRequest();
    await testProductionMetricsNeverFabricateDemo();
    await testLiveCrmMetricsWhenDataExists();

    console.log("\nAll Phase 2B-1 Mission Control checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
