#!/usr/bin/env node
/**
 * Verify bookTestDrive tool — booking, idempotency, availability conflicts.
 *
 * Usage:
 *   node scripts/verify-book-test-drive.js
 *   DATABASE_URL=postgres://... node scripts/verify-book-test-drive.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

import { futureSlotIso } from "./testHelpers/scheduling.js";

async function seedInventory(companyId) {
    const { seedVehicles } = await import("../services/inventory/inventoryService.js");
    await seedVehicles(companyId, [
        {
            vehicleId: "veh-verify-001",
            stockNumber: "TEST-STK-001",
            make: "Demo",
            model: "Vehicle",
            year: 2021,
            availability: "available",
            title: "2021 Demo Vehicle",
        },
    ]);
}

async function main() {
    const {
        _resetMemoryAppointmentsForTests,
        getAppointmentBackendName,
    } = await import("../services/database/appointmentRepository.js");
    const { _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const { getMaxConcurrentPerSlot } = await import("../services/tools/availability.js");

    _resetMemoryAppointmentsForTests();
    _resetMemoryInventoryForTests();
    initAiTools();

    const companyId = "verify-test-drive-co";
    const customerId = "27810000999";
    const stock = "TEST-STK-001";
    const scheduledAt = futureSlotIso(3, 11);

    await seedInventory(companyId);

    const ctx = {
        companyId,
        customerId,
        customerPhone: customerId,
        customerName: "Test Customer",
        agentId: "agent-verify",
        channel: "whatsapp",
    };

    console.log(`Backend: ${getAppointmentBackendName()}\n`);

    const first = await runTool("bookTestDrive", ctx, {
        vehicleStockNumber: stock,
        scheduledAt,
        customerName: "Test Customer",
    });
    assert(first.ok === true, `First booking should succeed: ${first.error || ""}`);
    assert(first.appointment?.id, "Appointment id returned");
    assert(first.duplicate !== true, "First booking is not a duplicate");
    console.log("✓ bookTestDrive creates appointment");

    const duplicate = await runTool("bookTestDrive", ctx, {
        vehicleStockNumber: stock,
        scheduledAt,
        customerName: "Test Customer",
    });
    assert(duplicate.ok === true, "Duplicate request should return existing appointment");
    assert(duplicate.duplicate === true, "Duplicate flag set");
    assert(duplicate.appointment?.id === first.appointment.id, "Same appointment id on duplicate");
    console.log("✓ Idempotent duplicate returns existing appointment");

    const max = getMaxConcurrentPerSlot();
    for (let i = 0; i < max - 1; i++) {
        const otherCustomer = `27810000${100 + i}`;
        const fill = await runTool("bookTestDrive", { ...ctx, customerId: otherCustomer }, {
            vehicleStockNumber: stock,
            scheduledAt,
            customerName: `Filler ${i}`,
        });
        assert(fill.ok === true, `Fill slot booking ${i} should succeed`);
    }

    const conflict = await runTool("bookTestDrive", { ...ctx, customerId: "27810000998" }, {
        vehicleStockNumber: stock,
        scheduledAt,
        customerName: "Conflict Customer",
    });
    assert(conflict.ok === false, "Slot conflict should fail");
    assert(conflict.code === "SLOT_UNAVAILABLE", `Expected SLOT_UNAVAILABLE, got ${conflict.code}`);
    console.log("✓ Availability conflict rejected when slot is full");

    const badStock = await runTool("bookTestDrive", ctx, {
        vehicleStockNumber: "NO-SUCH-STOCK",
        scheduledAt: futureSlotIso(4, 14),
    });
    assert(badStock.ok === false, "Invalid stock should fail");
    assert(badStock.code === "INVALID_VEHICLE", `Expected INVALID_VEHICLE, got ${badStock.code}`);
    console.log("✓ Invalid stock number rejected");

    const { getOpenAIToolDefinitions } = await import("../services/tools/index.js");
    const defs = getOpenAIToolDefinitions();
    assert(defs.some((d) => d.function.name === "bookTestDrive"), "OpenAI tool schema registered");
    console.log("✓ bookTestDrive exposed for OpenAI function calling");

    console.log("\nAll bookTestDrive verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
