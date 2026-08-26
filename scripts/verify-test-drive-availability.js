#!/usr/bin/env node
/**
 * Verify test-drive availability separation — inventory vs slot vs scheduling.
 *
 * Usage:
 *   node scripts/verify-test-drive-availability.js
 *   DATABASE_URL=postgres://... node scripts/verify-test-drive-availability.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

import { futureSlotIso, futureDateOnly, nextWeekdayName } from "./testHelpers/scheduling.js";

async function seedFleet(companyId) {
    const { seedVehicles } = await import("../services/inventory/inventoryService.js");
    return seedVehicles(companyId, [
        {
            vehicleId: "veh-td-hlx-2021",
            stockNumber: "TD-HLX-2021",
            make: "Toyota",
            model: "Hilux 2.4 GD-6",
            year: 2021,
            availability: "available",
            title: "2021 Toyota Hilux 2.4 GD-6",
        },
        {
            vehicleId: "veh-td-hlx-2020",
            stockNumber: "TD-HLX-2020",
            make: "Toyota",
            model: "Hilux 2.4 GD-6",
            year: 2020,
            availability: "available",
            title: "2020 Toyota Hilux 2.4 GD-6",
        },
        {
            vehicleId: "veh-td-hlx-2019",
            stockNumber: "TD-HLX-2019",
            make: "Toyota",
            model: "Hilux 2.4 GD-6",
            year: 2019,
            availability: "available",
            title: "2019 Toyota Hilux 2.4 GD-6",
        },
        {
            vehicleId: "veh-td-hlx-sold",
            stockNumber: "TD-HLX-SOLD",
            make: "Toyota",
            model: "Hilux 2.8 GD-6",
            year: 2019,
            availability: "sold",
            title: "2019 Toyota Hilux 2.8 GD-6 (sold)",
        },
    ]);
}

async function countAppointments(companyId) {
    const { _resetMemoryAppointmentsForTests, countAppointmentsInSlot } = await import(
        "../services/database/appointmentRepository.js"
    );
    void _resetMemoryAppointmentsForTests;
    const { getMaxConcurrentPerSlot } = await import("../services/tools/availability.js");
    const start = new Date(futureSlotIso(30, 9));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    let total = 0;
    for (let h = 9; h < 17; h++) {
        for (let m = 0; m < 60; m += 30) {
            const slot = new Date(start);
            slot.setHours(h, m, 0, 0);
            total += await countAppointmentsInSlot(companyId, slot, new Date(slot.getTime() + 30 * 60000));
        }
    }
    return total;
}

async function main() {
    const { _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
    const {
        _resetMemoryAppointmentsForTests,
        countAppointmentsInSlot,
    } = await import("../services/database/appointmentRepository.js");
    const { initAiTools, runTool, getOpenAIToolDefinitions } = await import("../services/tools/index.js");
    const { getMaxConcurrentPerSlot, slotEnd, normalizeToSlotStart } = await import(
        "../services/tools/availability.js"
    );

    _resetMemoryInventoryForTests();
    _resetMemoryAppointmentsForTests();
    initAiTools();

    const companyId = "verify-td-availability-co";
    const companyB = "verify-td-availability-co-b";
    const customerId = "27810000888";
    const ctx = {
        companyId,
        customerId,
        customerPhone: customerId,
        customerName: "TD Availability Test",
        agentId: "agent-verify",
        channel: "whatsapp",
    };

    await seedFleet(companyId);
    const { seedVehicles } = await import("../services/inventory/inventoryService.js");
    await seedVehicles(companyB, [
        {
            vehicleId: "veh-b-only",
            stockNumber: "COB-STK-001",
            make: "Other",
            model: "Brand",
            year: 2020,
            availability: "available",
            title: "2020 Other Brand",
        },
    ]);

    console.log("Test-drive availability verification\n");

    /* 1. vehicle available in inventory but test-drive slot unavailable (slot full) */
    const slotTime = futureSlotIso(3, 11);
    const slotStart = normalizeToSlotStart(new Date(slotTime));
    const max = getMaxConcurrentPerSlot();
    for (let i = 0; i < max; i++) {
        await runTool("bookTestDrive", { ...ctx, customerId: `27810000${200 + i}` }, {
            vehicleId: "veh-td-hlx-2021",
            scheduledAt: slotTime,
        });
    }
    const slotFullCheck = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId: "veh-td-hlx-2020",
        scheduledAt: slotTime,
    });
    assert(slotFullCheck.available === false, "slot full should not be available");
    assert(slotFullCheck.code === "SLOT_UNAVAILABLE", `Expected SLOT_UNAVAILABLE, got ${slotFullCheck.code}`);
    console.log("✓ 1. inventory available, test-drive slot full");

    _resetMemoryAppointmentsForTests();

    /* 2. vehicle available and test-drive available */
    const openCheck = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId: "veh-td-hlx-2020",
        scheduledAt: futureSlotIso(4, 14),
    });
    assert(openCheck.available === true, `expected available: ${openCheck.reason}`);
    assert(openCheck.code === "AVAILABLE", `Expected AVAILABLE, got ${openCheck.code}`);
    console.log("✓ 2. vehicle and test-drive slot both available");

    /* 3. multiple vehicles, only one available for date/time */
    _resetMemoryAppointmentsForTests();
    const narrowSlot = futureSlotIso(5, 10);
    for (let i = 0; i < max; i++) {
        await runTool("bookTestDrive", { ...ctx, customerId: `27810000${300 + i}` }, {
            vehicleId: "veh-td-hlx-2021",
            scheduledAt: narrowSlot,
        });
    }
    const multiCheck = await runTool("checkTestDriveAvailability", ctx, {
        query: "Hilux",
        scheduledAt: narrowSlot,
    });
    assert(multiCheck.available === false, "no vehicle should have slot at full time");
    assert(multiCheck.code === "NO_SLOTS", `Expected NO_SLOTS, got ${multiCheck.code}`);
    console.log("✓ 3. multiple vehicles — none available when slot full");

    _resetMemoryAppointmentsForTests();

    /* 4. customer asks AI to choose available vehicle on a date */
    const weekday = nextWeekdayName(4);
    const anyVehicle = await runTool("checkTestDriveAvailability", ctx, {
        query: "Hilux",
        date: weekday,
    });
    assert(anyVehicle.code === "NEED_TIME", `Expected NEED_TIME, got ${anyVehicle.code}`);
    assert(anyVehicle.vehicles?.length >= 2, "should list vehicles with open slots on date");
    assert(anyVehicle.needsTime === true, "needsTime flag set");
    console.log("✓ 4. choose any vehicle on date — returns vehicles with open slots, prompts for time");

    /* 5. date without time — should prompt, not book */
    const noTimeCheck = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId: "veh-td-hlx-2019",
        date: futureDateOnly(6),
    });
    assert(noTimeCheck.code === "NEED_TIME", `Expected NEED_TIME, got ${noTimeCheck.code}`);
    assert(noTimeCheck.needsTime === true, "needsTime for date-only");
    const noTimeBook = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-td-hlx-2019",
        scheduledAt: futureDateOnly(6),
    });
    assert(noTimeBook.ok === false, "book without time must fail");
    assert(noTimeBook.code === "INVALID_DATETIME", `Expected INVALID_DATETIME, got ${noTimeBook.code}`);
    console.log("✓ 5. date without time prompts — does not book");

    /* 6. date + time success */
    const successBook = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-td-hlx-2019",
        scheduledAt: futureSlotIso(7, 15),
        customerName: "TD Availability Test",
    });
    assert(successBook.ok === true, `booking failed: ${successBook.error}`);
    assert(successBook.appointment?.id, "appointment persisted");
    console.log("✓ 6. date + time booking succeeds");

    /* 7. duplicate booking idempotency */
    const dup = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-td-hlx-2019",
        scheduledAt: futureSlotIso(7, 15),
    });
    assert(dup.ok === true && dup.duplicate === true, "duplicate should return existing");
    assert(dup.appointment?.id === successBook.appointment.id, "same appointment id");
    console.log("✓ 7. idempotent duplicate returns existing appointment");

    /* 8. conflicting appointment (slot full) */
    _resetMemoryAppointmentsForTests();
    const conflictSlot = futureSlotIso(8, 11);
    for (let i = 0; i < max; i++) {
        await runTool("bookTestDrive", { ...ctx, customerId: `27810000${400 + i}` }, {
            vehicleId: "veh-td-hlx-2021",
            scheduledAt: conflictSlot,
        });
    }
    const conflict = await runTool("bookTestDrive", { ...ctx, customerId: "27810000499" }, {
        vehicleId: "veh-td-hlx-2020",
        scheduledAt: conflictSlot,
    });
    assert(conflict.ok === false, "conflicting slot should fail");
    assert(conflict.code === "SLOT_UNAVAILABLE", `Expected SLOT_UNAVAILABLE, got ${conflict.code}`);
    console.log("✓ 8. conflicting appointment rejected");

    /* 9. unavailable vehicle (inventory sold) */
    const soldCheck = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId: "veh-td-hlx-sold",
        scheduledAt: futureSlotIso(9, 10),
    });
    assert(soldCheck.available === false, "sold vehicle not available");
    assert(soldCheck.code === "VEHICLE_NOT_IN_INVENTORY", `Expected VEHICLE_NOT_IN_INVENTORY, got ${soldCheck.code}`);
    const soldBook = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-td-hlx-sold",
        scheduledAt: futureSlotIso(9, 10),
    });
    assert(soldBook.ok === false, "sold vehicle booking must fail");
    assert(soldBook.code === "VEHICLE_NOT_IN_INVENTORY", `Expected VEHICLE_NOT_IN_INVENTORY, got ${soldBook.code}`);
    console.log("✓ 9. sold vehicle rejected (inventory unavailable)");

    /* 10. cross-tenant access fail */
    const cross = await runTool("checkTestDriveAvailability", { ...ctx, companyId: companyB }, {
        vehicleId: "veh-td-hlx-2020",
        scheduledAt: futureSlotIso(10, 10),
    });
    assert(cross.available === false, "cross-tenant must fail");
    assert(cross.code === "INVALID_VEHICLE", `Expected INVALID_VEHICLE, got ${cross.code}`);
    console.log("✓ 10. cross-tenant access rejected");

    /* 11. successful booking persistence */
    _resetMemoryAppointmentsForTests();
    const persistSlot = futureSlotIso(11, 13);
    const persist = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-td-hlx-2021",
        scheduledAt: persistSlot,
    });
    assert(persist.ok === true, "persistence booking should succeed");
    const slot = normalizeToSlotStart(new Date(persistSlot));
    const count = await countAppointmentsInSlot(companyId, slot, slotEnd(slot));
    assert(count >= 1, "appointment counted in slot");
    console.log("✓ 11. successful booking persisted in appointments");

    /* 12. booking failure must not create appointment */
    _resetMemoryAppointmentsForTests();
    const beforeFail = await countAppointmentsInSlot(
        companyId,
        normalizeToSlotStart(new Date(futureSlotIso(12, 10))),
        slotEnd(normalizeToSlotStart(new Date(futureSlotIso(12, 10))))
    );
    const failBook = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-td-hlx-sold",
        scheduledAt: futureSlotIso(12, 10),
    });
    assert(failBook.ok === false, "failed booking");
    const afterFail = await countAppointmentsInSlot(
        companyId,
        normalizeToSlotStart(new Date(futureSlotIso(12, 10))),
        slotEnd(normalizeToSlotStart(new Date(futureSlotIso(12, 10))))
    );
    assert(afterFail === beforeFail, "failed booking must not insert appointment");
    console.log("✓ 12. failed booking does not create appointment");

    const defs = getOpenAIToolDefinitions();
    assert(defs.some((d) => d.function.name === "checkTestDriveAvailability"), "tool registered for OpenAI");
    assert(defs.some((d) => d.function.name === "bookTestDrive"), "bookTestDrive still registered");
    assert(defs.some((d) => d.function.name === "searchInventory"), "searchInventory still registered");
    console.log("✓ checkTestDriveAvailability exposed for OpenAI function calling");

    /* 13. "available Friday" must not use searchInventory (wrong tool guard) */
    const { isTestDriveAvailabilityQuery } = await import("../services/conversation/schedulingContext.js");
    assert(isTestDriveAvailabilityQuery("which vehicles can I test-drive on Friday"), "Friday test-drive query detected");
    const wrongTool = await runTool("searchInventory", { ...ctx, inboundMessage: "which Hilux are available on Friday?" }, {
        query: "Hilux",
    });
    assert(wrongTool.code === "WRONG_TOOL", `Expected WRONG_TOOL, got ${wrongTool.code}`);
    assert(wrongTool.suggestedTool === "checkTestDriveAvailability", "suggests checkTestDriveAvailability");
    const slotCheckFriday = await runTool("checkTestDriveAvailability", ctx, {
        query: "Hilux",
        date: nextWeekdayName(4),
    });
    assert(slotCheckFriday.code === "NEED_TIME", "Friday slot check returns NEED_TIME not inventory count");
    console.log("✓ 13. available Friday uses slot check, not searchInventory");

    /* 14. scheduling context preserves Friday across turns */
    const {
        extractSchedulingFromText,
        getSchedulingContext,
        saveSchedulingContext,
        enrichToolArgsWithScheduling,
    } = await import("../services/conversation/schedulingContext.js");
    const fridayLabel = nextWeekdayName(4);
    const fridayExtract = extractSchedulingFromText(`lets work on ${fridayLabel.toLowerCase()}`);
    assert(fridayExtract.pendingDate, "Friday extracted from customer message");
    await saveSchedulingContext(companyId, customerId, "whatsapp", fridayExtract);
    const followUpCtx = {
        ...ctx,
        inboundMessage: "choose for me for any that can be available on that day",
        schedulingContext: await getSchedulingContext(companyId, customerId, "whatsapp"),
    };
    const enriched = enrichToolArgsWithScheduling(
        "checkTestDriveAvailability",
        { query: "Hilux" },
        followUpCtx.schedulingContext
    );
    assert(enriched.date, "Friday date injected from conversation context");
    const contextCheck = await runTool("checkTestDriveAvailability", followUpCtx, enriched);
    assert(contextCheck.code === "NEED_TIME", `context Friday check NEED_TIME, got ${contextCheck.code}`);
    assert(contextCheck.needsTime === true, "asks for time, does not assume 10 AM");
    console.log("✓ 14. Friday from context preserved — NEED_TIME without default time");

    console.log("\nAll test-drive availability checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
