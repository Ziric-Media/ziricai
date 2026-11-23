#!/usr/bin/env node
/**
 * BCS-04 verification — Babes automotive routing, enquiry CRM tool, playbook KB (memory + optional Postgres).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import assert from "node:assert/strict";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });
process.env.STORAGE_BACKEND = "memory";
delete process.env.DATABASE_URL;

const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
const {
    BABES_CAR_SALES_COMPANY_ID,
    BABES_KNOWLEDGE_DOCS,
    activateAutomotiveDealershipPreset,
} = await import("../services/automotive/babesCarSalesBootstrap.js");
const { createCompany } = await import("../services/tenants/companyService.js");
const { initAiTools, runTool, listTools } = await import("../services/tools/index.js");
const { shouldRunAutomotiveSalesChat } = await import("../services/sarah/company/companyReceptionAutomotiveChat.js");
const { seedVehicles, _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
const { TenantRepository } = await import("../services/database/tenantRepository.js");
const { TENANT_COLLECTIONS } = await import("../services/database/schema.js");
const { getTimeline } = await import("../services/customerService.js");

await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

const PHONE = "27825550199";
const leadRepo = new TenantRepository(TENANT_COLLECTIONS.LEADS);

async function memoryBootstrap() {
    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    await createCompany(BABES_CAR_SALES_COMPANY_ID, {
        id: BABES_CAR_SALES_COMPANY_ID,
        name: "Babes Car Sales CC",
        industry: "Automotive",
        ownerUid: "owner-babes",
    });
    await activateAutomotiveDealershipPreset(BABES_CAR_SALES_COMPANY_ID);
    await seedVehicles(BABES_CAR_SALES_COMPANY_ID, [
        {
            vehicleId: "babes-fortuner-1",
            stockNumber: "BCS-FT-001",
            make: "Toyota",
            model: "Fortuner",
            year: 2019,
            price: 389000,
            availability: "available",
            title: "2019 Toyota Fortuner",
            transmission: "Automatic",
            bodyType: "SUV",
        },
        {
            vehicleId: "babes-xtrail-1",
            stockNumber: "BCS-XT-002",
            make: "Nissan",
            model: "X-Trail",
            year: 2018,
            price: 219000,
            availability: "available",
            title: "2018 Nissan X-Trail",
            transmission: "Automatic",
            bodyType: "SUV",
        },
    ]);
}

async function main() {
    console.log("\nBCS-04 Babes verification\n");
    initAiTools();

    const toolNames = listTools().map((t) => t.name);
    assert.ok(toolNames.includes("recordSalesEnquiry"), "recordSalesEnquiry registered");

    const playbookIds = ["babes-kn-finance", "babes-kn-trade-in", "babes-kn-test-drive", "babes-kn-uat-demo"];
    for (const id of playbookIds) {
        assert.ok(BABES_KNOWLEDGE_DOCS.some((d) => d.id === id), `bootstrap doc ${id}`);
    }

    await memoryBootstrap();
    assert.equal(await shouldRunAutomotiveSalesChat(BABES_CAR_SALES_COMPANY_ID), true);

    const search = await runTool(
        "searchInventory",
        { companyId: BABES_CAR_SALES_COMPANY_ID, customerPhone: PHONE, channel: "sarah_app" },
        { query: "automatic SUV", maxPrice: 250000, limit: 5 }
    );
    assert.equal(search.ok, true);
    assert.ok(search.vehicles?.length >= 1, "SUV under 250k search");

    const fortuner = await runTool(
        "searchInventory",
        { companyId: BABES_CAR_SALES_COMPANY_ID, customerPhone: PHONE, channel: "sarah_app" },
        { query: "Toyota Fortuner", limit: 3 }
    );
    assert.equal(fortuner.ok, true);
    assert.ok(
        fortuner.vehicles?.some((v) => /fortuner/i.test(v.title || v.model || "")),
        "Fortuner in inventory"
    );

    const finance = await runTool(
        "recordSalesEnquiry",
        {
            companyId: BABES_CAR_SALES_COMPANY_ID,
            customerPhone: PHONE,
            customerName: "Demo Customer",
            channel: "sarah_app",
        },
        {
            enquiryType: "finance",
            summary: "Customer wants finance on Fortuner — deposit R50k, target R6,500/month",
            vehicleInterest: "2019 Toyota Fortuner",
            vehicleId: "babes-fortuner-1",
            depositAmount: 50000,
            monthlyBudget: 6500,
        }
    );
    assert.equal(finance.ok, true, finance.error || finance.code);

    const trade = await runTool(
        "recordSalesEnquiry",
        {
            companyId: BABES_CAR_SALES_COMPANY_ID,
            customerPhone: PHONE,
            customerName: "Demo Customer",
            channel: "sarah_app",
        },
        {
            enquiryType: "trade_in",
            summary: "Trade 2015 VW Polo 120,000 km good condition toward SUV purchase",
            tradeInVehicle: "2015 VW Polo 120000km",
            vehicleInterest: "2018 Nissan X-Trail",
        }
    );
    assert.equal(trade.ok, true);

    const lead = await leadRepo.get(BABES_CAR_SALES_COMPANY_ID, PHONE);
    assert.ok(lead, "CRM lead persisted");
    assert.ok((lead.leadScore ?? 0) >= 70, "lead score reflects enquiry");

    const timeline = await getTimeline(PHONE, { companyId: BABES_CAR_SALES_COMPANY_ID });
    const enquiries = (timeline || []).filter(
        (e) => e.type === "sales_enquiry" || e.meta?.source === "recordSalesEnquiry"
    );
    assert.ok(enquiries.length >= 1, "timeline sales_enquiry events");

    let liveInventory = null;
    if (process.env.DATABASE_URL) {
        try {
            const { searchInventory } = await import("../services/inventory/inventoryService.js");
            const suv = await searchInventory(BABES_CAR_SALES_COMPANY_ID, "automatic SUV", {
                maxPrice: 250_000,
                availabilityOnly: true,
                limit: 3,
            });
            liveInventory = { availableMatches: suv?.length ?? 0 };
        } catch (err) {
            liveInventory = { error: err.message };
        }
    }

    console.log(
        JSON.stringify(
            {
                gate: "BCS-04",
                status: "pass",
                companyId: BABES_CAR_SALES_COMPANY_ID,
                tools: toolNames.filter((n) =>
                    ["searchInventory", "bookTestDrive", "recordSalesEnquiry"].includes(n)
                ),
                leadId: lead?.id,
                leadTopic: lead?.topic,
                timelineEnquiries: enquiries.length,
                livePostgres: liveInventory,
            },
            null,
            2
        )
    );
}

main().catch((err) => {
    console.error("FAIL:", err.message || err);
    process.exit(1);
});