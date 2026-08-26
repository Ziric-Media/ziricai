#!/usr/bin/env node
/**
 * Verify test-drive booking flow — timezone, slot consistency, auto-select, recheck.
 *
 * Usage:
 *   node scripts/verify-test-drive-booking-flow.js
 *   TZ=UTC node scripts/verify-test-drive-booking-flow.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Johannesburg";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

import { futureDateOnly as nextWeekdayDateString } from "./testHelpers/scheduling.js";

async function seedTiguanFleet(companyId) {
    const { seedVehicles } = await import("../services/inventory/inventoryService.js");
    return seedVehicles(companyId, [
        {
            vehicleId: "veh-wp-tiguan-16810",
            stockNumber: "CM-WP-16810",
            make: "Volkswagen",
            model: "Tiguan",
            year: 2020,
            availability: "available",
            title: "2020 Volkswagen Tiguan 1.4 TSI Comfortline DSG",
        },
    ]);
}

async function main() {
    const availability = await import("../services/tools/availability.js");

    const { _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const { isSchedulingDelegationIntent } = await import("../services/conversation/schedulingContext.js");

    _resetMemoryInventoryForTests();
    _resetMemoryAppointmentsForTests();
    initAiTools();

    const companyId = "verify-td-booking-flow-co";
    const customerId = "27810001001";
    const vehicleId = "veh-wp-tiguan-16810";
    const ctx = {
        companyId,
        customerId,
        customerPhone: customerId,
        customerName: "Booking Flow Test",
        agentId: "agent-verify",
        channel: "whatsapp",
    };

    await seedTiguanFleet(companyId);

    console.log(`Test-drive booking flow verification (TZ=${process.env.TZ || "local"}, business=${process.env.BUSINESS_TIMEZONE})\n`);

    /* 1. Business hours — 10:00, 12:00, 16:30 IN; 08:00, 18:00 OUT (Johannesburg) */
    const weekday = nextWeekdayDateString(4);
    const { isWithinBusinessHours, parseScheduledInput } = availability;

    for (const [time, expected] of [
        ["10:00 AM", true],
        ["12:00 PM", true],
        ["4:30 PM", true],
        ["08:00 AM", false],
        ["6:00 PM", false],
    ]) {
        const parsed = parseScheduledInput({ date: weekday, time });
        assert(parsed.ok && parsed.dateTime, `parse ${time}`);
        assert(
            isWithinBusinessHours(parsed.dateTime) === expected,
            `${time} on ${weekday}: expected inHours=${expected}, got ${isWithinBusinessHours(parsed.dateTime)}`
        );
    }
    console.log("✓ 1. Business hours — 10:00/12:00/16:30 in, 08:00/18:00 out (Johannesburg)");

    /* 2. 12:00 PM not outside business hours via checkTestDriveAvailability (UTC server simulation) */
    const noonCheck = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId,
        date: weekday,
        time: "12:00 PM",
    });
    assert(noonCheck.code !== "OUTSIDE_BUSINESS_HOURS", `12:00 PM should not be OUTSIDE_BUSINESS_HOURS, got ${noonCheck.code}`);
    assert(noonCheck.available === true, `12:00 PM should be available: ${noonCheck.reason}`);
    console.log("✓ 2. 12:00 PM accepted within 09:00–17:00 SAST");

    /* 3. Slots offered by availability are bookable (same code path) */
    const dateOnlyCheck = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId,
        date: weekday,
    });
    assert(dateOnlyCheck.code === "NEED_TIME", `Expected NEED_TIME, got ${dateOnlyCheck.code}`);
    assert(dateOnlyCheck.suggestedSlots?.length > 0, "Should return suggested slots");
    const firstSlot = dateOnlyCheck.suggestedSlots[0];
    const bookFromSlot = await runTool("bookTestDrive", ctx, {
        vehicleId,
        scheduledAt: firstSlot.slotStart,
        customerName: "Booking Flow Test",
    });
    assert(bookFromSlot.ok === true, `Book suggested slot failed: ${bookFromSlot.error}`);
    assert(bookFromSlot.appointment?.id, "Appointment persisted");
    console.log("✓ 3. Slots from availability are bookable");

    _resetMemoryAppointmentsForTests();

    /* 4. Slot failure does NOT return VEHICLE_NOT_IN_INVENTORY */
    const { getMaxConcurrentPerSlot } = availability;
    const max = getMaxConcurrentPerSlot();
    const fillTime = `${weekday} 11:00 AM`;
    for (let i = 0; i < max; i++) {
        await runTool("bookTestDrive", { ...ctx, customerId: `27810001${100 + i}` }, {
            vehicleId,
            scheduledAt: fillTime,
        });
    }
    const slotFail = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId,
        scheduledAt: fillTime,
    });
    assert(slotFail.available === false, "Full slot should not be available");
    assert(slotFail.code === "SLOT_UNAVAILABLE", `Expected SLOT_UNAVAILABLE, got ${slotFail.code}`);
    assert(slotFail.code !== "VEHICLE_NOT_IN_INVENTORY", "Slot failure must not mean vehicle sold");
    const slotBookFail = await runTool("bookTestDrive", { ...ctx, customerId: "27810001999" }, {
        vehicleId,
        scheduledAt: fillTime,
    });
    assert(slotBookFail.ok === false, "bookTestDrive should fail when slot full");
    assert(slotBookFail.code === "SLOT_UNAVAILABLE", `book code SLOT_UNAVAILABLE, got ${slotBookFail.code}`);
    assert(slotBookFail.code !== "VEHICLE_NOT_IN_INVENTORY", "bookTestDrive must not claim inventory gone on slot fail");
    console.log("✓ 4. Slot failure ≠ VEHICLE_NOT_IN_INVENTORY");

    _resetMemoryAppointmentsForTests();

    /* 5. Auto-select next slot ("select the time and date for me") */
    assert(isSchedulingDelegationIntent("select the time and date for me"), "delegation intent detected");
    const autoSelect = await runTool(
        "checkTestDriveAvailability",
        { ...ctx, inboundMessage: "select the time and date for me" },
        { vehicleId }
    );
    assert(autoSelect.code === "AUTO_SELECT" || autoSelect.available === true, `auto-select failed: ${autoSelect.code}`);
    assert(autoSelect.slotStart, "auto-select returns slotStart");
    assert(autoSelect.slotLabel, "auto-select returns slotLabel");
    console.log("✓ 5. Auto-select next slot works");

    /* 6. bookTestDrive rechecks availability before DB write */
    const availabilityCheck = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId,
        date: nextWeekdayDateString(5),
        time: "2:00 PM",
    });
    assert(availabilityCheck.available === true, "precheck slot open");
    const booked = await runTool("bookTestDrive", ctx, {
        vehicleId,
        scheduledAt: `${nextWeekdayDateString(5)} 2:00 PM`,
        customerName: "Recheck Test",
    });
    assert(booked.ok === true, `booking with recheck: ${booked.error}`);
    assert(booked.appointment?.id, "appointment written after recheck");

    /* Fill the slot — second book should fail recheck */
    for (let i = 0; i < max - 1; i++) {
        await runTool("bookTestDrive", { ...ctx, customerId: `27810002${100 + i}` }, {
            vehicleId,
            scheduledAt: `${nextWeekdayDateString(5)} 2:00 PM`,
        });
    }
    const recheckFail = await runTool("bookTestDrive", { ...ctx, customerId: "27810002999" }, {
        vehicleId,
        scheduledAt: `${nextWeekdayDateString(5)} 2:00 PM`,
    });
    assert(recheckFail.ok === false, "recheck should reject full slot");
    assert(recheckFail.code === "SLOT_UNAVAILABLE", `recheck code SLOT_UNAVAILABLE, got ${recheckFail.code}`);
    console.log("✓ 6. bookTestDrive recheck before write");

    console.log("\nAll test-drive booking flow checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
