#!/usr/bin/env node
/**
 * BCS-04 — Babes automotive preset + recordSalesEnquiry (memory backend).
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.DATABASE_URL;

import assert from "node:assert/strict";
import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import {
    BABES_CAR_SALES_COMPANY_ID,
    activateAutomotiveDealershipPreset,
} from "../services/automotive/babesCarSalesBootstrap.js";
import { createCompany } from "../services/tenants/companyService.js";
import { initAiTools, runTool } from "../services/tools/index.js";
import { shouldRunAutomotiveSalesChat } from "../services/sarah/company/companyReceptionAutomotiveChat.js";
import { seedVehicles, _resetMemoryInventoryForTests } from "../services/inventory/inventoryService.js";

await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

resetMemoryTenantStore();
_resetMemoryInventoryForTests();
initAiTools();

await createCompany(BABES_CAR_SALES_COMPANY_ID, {
    id: BABES_CAR_SALES_COMPANY_ID,
    name: "Babes Car Sales CC",
    industry: "Automotive",
});
await activateAutomotiveDealershipPreset(BABES_CAR_SALES_COMPANY_ID);
await seedVehicles(BABES_CAR_SALES_COMPANY_ID, [
    {
        vehicleId: "babes-uat-1",
        stockNumber: "BCS-UAT-1",
        make: "Toyota",
        model: "Fortuner",
        year: 2020,
        price: 400000,
        availability: "available",
        title: "2020 Toyota Fortuner",
    },
]);

assert.equal(await shouldRunAutomotiveSalesChat(BABES_CAR_SALES_COMPANY_ID), true);

const enquiry = await runTool(
    "recordSalesEnquiry",
    { companyId: BABES_CAR_SALES_COMPANY_ID, customerPhone: "27820001122", channel: "test" },
    { enquiryType: "finance", summary: "Finance enquiry test" }
);
assert.equal(enquiry.ok, true);

console.log("babes-car-sales-bcs04: PASS");