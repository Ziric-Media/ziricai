#!/usr/bin/env node
/**
 * Verify inventory ↔ booking integration — searchInventory, bookTestDrive, conversation context.
 *
 * Usage:
 *   node scripts/verify-inventory-booking.js
 *   DATABASE_URL=postgres://... node scripts/verify-inventory-booking.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function futureSlotIso(daysAhead = 2, hour = 10) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    while (d.getDay() === 0) d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
}

async function seedTestInventory(companyId) {
    const { seedVehicles } = await import("../services/inventory/inventoryService.js");
    return seedVehicles(companyId, [
        {
            vehicleId: "veh-test-hlx-001",
            stockNumber: "TEST-STK-001",
            make: "Toyota",
            model: "Hilux 2.4 GD-6",
            year: 2021,
            mileage: 68400,
            price: 389900,
            transmission: "Manual",
            fuel: "Diesel",
            location: "Test Motors Sandton",
            availability: "available",
            title: "2021 Toyota Hilux 2.4 GD-6 Double Cab SR",
        },
        {
            vehicleId: "veh-test-hlx-sold",
            stockNumber: "TEST-STK-SOLD",
            make: "Toyota",
            model: "Hilux 2.8 GD-6",
            year: 2019,
            mileage: 95000,
            price: 365000,
            transmission: "Manual",
            fuel: "Diesel",
            location: "Test Motors Centurion",
            availability: "sold",
            title: "2019 Toyota Hilux 2.8 GD-6 Double Cab",
        },
        {
            vehicleId: "veh-test-hlx-alt",
            stockNumber: "TEST-STK-ALT",
            make: "Toyota",
            model: "Hilux 2.4 GD-6",
            year: 2020,
            mileage: 82100,
            price: 425000,
            transmission: "Automatic",
            fuel: "Diesel",
            location: "Test Motors Sandton",
            availability: "available",
            title: "2020 Toyota Hilux 2.4 GD-6 Double Cab SRX",
        },
    ]);
}

async function main() {
    const {
        _resetMemoryInventoryForTests,
        getInventoryBackendName,
    } = await import("../services/inventory/inventoryService.js");
    const {
        _resetMemoryAppointmentsForTests,
    } = await import("../services/database/appointmentRepository.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const { storeRecommendedVehicles, getRecommendedVehicles } = await import(
        "../services/conversation/recommendedVehicles.js"
    );
    const { getOrCreateConversation } = await import("../services/storage/tenantStorage.js");

    _resetMemoryInventoryForTests();
    _resetMemoryAppointmentsForTests();
    initAiTools();

    const companyA = "verify-inv-co-a";
    const companyB = "verify-inv-co-b";
    const customerPhone = "27810000777";
    const customerId = customerPhone;
    const scheduledAt = futureSlotIso(3, 11);

    await seedTestInventory(companyA);
    // Company B gets a different fleet — no access to company A vehicle IDs
    const { seedVehicles } = await import("../services/inventory/inventoryService.js");
    await seedVehicles(companyB, [
        {
            vehicleId: "veh-b-only",
            stockNumber: "COB-STK-001",
            make: "Other",
            model: "Brand Model",
            year: 2020,
            availability: "available",
            title: "2020 Other Brand Model",
        },
    ]);

    const ctx = {
        companyId: companyA,
        customerId,
        customerPhone,
        customerName: "Inventory Test",
        agentId: "agent-verify",
        channel: "whatsapp",
    };

    console.log(`Inventory backend: ${getInventoryBackendName()}\n`);

    /* 1. search → select → book test drive */
    const search = await runTool("searchInventory", ctx, { query: "Hilux diesel" });
    assert(search.ok === true, `searchInventory failed: ${search.error || ""}`);
    assert(search.vehicles?.length >= 1, "searchInventory should return Hilux matches");
    const selected = search.vehicles[0];
    assert(selected.vehicleId, "search result must include vehicleId");
    assert(selected.stockNumber, "search result must include stockNumber");
    console.log("✓ searchInventory returns vehicleId + stockNumber");

    const booked = await runTool("bookTestDrive", ctx, {
        vehicleId: selected.vehicleId,
        scheduledAt,
        customerName: "Inventory Test",
    });
    assert(booked.ok === true, `book by vehicleId failed: ${booked.error || ""}`);
    assert(booked.appointment?.id, "appointment created from search result");
    console.log("✓ search → book by vehicleId");

    /* 2. book by vehicleId (direct) */
    _resetMemoryAppointmentsForTests();
    const byId = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-test-hlx-001",
        scheduledAt: futureSlotIso(4, 10),
    });
    assert(byId.ok === true, `direct vehicleId booking failed: ${byId.error || ""}`);
    console.log("✓ book by vehicleId");

    /* 3. book by stockNumber */
    _resetMemoryAppointmentsForTests();
    const byStock = await runTool("bookTestDrive", ctx, {
        vehicleStockNumber: "test-stk-001",
        scheduledAt: futureSlotIso(5, 14),
    });
    assert(byStock.ok === true, `stock booking failed: ${byStock.error || ""}`);
    console.log("✓ book by stockNumber (normalized)");

    /* 4. book from previous conversation context */
    _resetMemoryAppointmentsForTests();
    await getOrCreateConversation(companyA, customerPhone, "whatsapp");
    await storeRecommendedVehicles(companyA, customerPhone, "whatsapp", search.vehicles);

    const fromContext = await runTool("bookTestDrive", ctx, {
        vehicleHint: "Hilux",
        scheduledAt: futureSlotIso(6, 15),
    });
    assert(fromContext.ok === true, `context booking failed: ${fromContext.error || ""}`);
    const stored = await getRecommendedVehicles(companyA, customerPhone, "whatsapp");
    assert(stored.length >= 1, "recommended vehicles stored in conversation meta");
    console.log("✓ book from conversation context (vehicleHint)");

    /* 5. unavailable vehicle */
    const unavailable = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-test-hlx-sold",
        scheduledAt: futureSlotIso(7, 11),
    });
    assert(unavailable.ok === false, "sold vehicle should fail");
    assert(unavailable.code === "INVENTORY_UNAVAILABLE", `Expected INVENTORY_UNAVAILABLE, got ${unavailable.code}`);
    assert(Array.isArray(unavailable.alternatives?.vehicles), "alternatives offered for unavailable vehicle");
    console.log("✓ unavailable vehicle rejected with alternatives");

    /* 6. invalid vehicle */
    const invalid = await runTool("bookTestDrive", ctx, {
        vehicleId: "no-such-vehicle-id",
        scheduledAt: futureSlotIso(8, 11),
    });
    assert(invalid.ok === false, "invalid vehicle should fail");
    assert(invalid.code === "INVALID_VEHICLE", `Expected INVALID_VEHICLE, got ${invalid.code}`);
    console.log("✓ invalid vehicle rejected");

    /* 7. duplicate / idempotency */
    _resetMemoryAppointmentsForTests();
    const first = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-test-hlx-001",
        scheduledAt: futureSlotIso(9, 10),
    });
    const dup = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-test-hlx-001",
        scheduledAt: futureSlotIso(9, 10),
    });
    assert(first.ok === true && dup.ok === true, "duplicate should succeed");
    assert(dup.duplicate === true, "duplicate flag set");
    assert(dup.appointment?.id === first.appointment?.id, "same appointment on duplicate");
    console.log("✓ idempotent duplicate returns existing appointment");

    /* 8. cross-tenant access must fail */
    const crossTenant = await runTool("bookTestDrive", { ...ctx, companyId: companyB }, {
        vehicleId: "veh-test-hlx-001",
        scheduledAt: futureSlotIso(10, 10),
    });
    assert(crossTenant.ok === false, "cross-tenant vehicle lookup must fail");
    assert(crossTenant.code === "INVALID_VEHICLE", `Expected INVALID_VEHICLE, got ${crossTenant.code}`);
    console.log("✓ cross-tenant vehicle access rejected");

    const { getOpenAIToolDefinitions } = await import("../services/tools/index.js");
    const defs = getOpenAIToolDefinitions();
    assert(defs.some((d) => d.function.name === "searchInventory"), "searchInventory registered");
    assert(defs.some((d) => d.function.name === "bookTestDrive"), "bookTestDrive registered");
    assert(defs.some((d) => d.function.name === "checkTestDriveAvailability"), "checkTestDriveAvailability registered");
    console.log("✓ inventory + scheduling tools exposed for OpenAI function calling");

    console.log("\nAll inventory ↔ booking verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
