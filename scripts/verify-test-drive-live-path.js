#!/usr/bin/env node
/**
 * Live-path test-drive semantics — business TZ time storage, noon/9am, UTC server.
 *
 * Usage:
 *   node scripts/verify-test-drive-live-path.js
 *   TZ=UTC node scripts/verify-test-drive-live-path.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Johannesburg";
delete process.env.DATABASE_URL;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

import { futureDateOnly as nextWeekdayDateString, futureSlotIso } from "./testHelpers/scheduling.js";

async function main() {
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { _resetMemoryInventoryForTests, seedVehicles } = await import("../services/inventory/inventoryService.js");
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const {
        parseScheduledInput,
        isWithinBusinessHours,
        toBusinessTimeString,
    } = await import("../services/tools/availability.js");
    const {
        extractSchedulingFromText,
        enrichToolArgsWithScheduling,
        formatAuthoritativeAvailabilityBlock,
    } = await import("../services/conversation/schedulingContext.js");

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    _resetMemoryAppointmentsForTests();
    initAiTools();

    const COMPANY_ID = "verify-td-live-path-co";
    const PHONE = "27810002001";
    const vehicleId = "veh-live-tiguan";
    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Live Path Test",
        agentId: "agent-verify",
        channel: "whatsapp",
    };

    await seedVehicles(COMPANY_ID, [
        {
            vehicleId,
            stockNumber: "CM-LIVE-1",
            make: "Volkswagen",
            model: "Tiguan",
            year: 2020,
            availability: "available",
            title: "2020 Volkswagen Tiguan",
        },
    ]);

    const weekday = nextWeekdayDateString(3);
    console.log(`\nTest-drive live-path verification (TZ=${process.env.TZ || "local"})\n`);

    /* 1. 12:00 noon valid */
    for (const timeExpr of ["12:00 PM", "12 noon", "noon"]) {
        const parsed = parseScheduledInput({ date: weekday, time: timeExpr });
        assert(parsed.ok && parsed.dateTime, `parse ${timeExpr}`);
        assert(isWithinBusinessHours(parsed.dateTime), `${timeExpr} within business hours`);
        const check = await runTool("checkTestDriveAvailability", ctx, {
            vehicleId,
            date: weekday,
            time: timeExpr,
        });
        assert(check.code !== "OUTSIDE_BUSINESS_HOURS", `${timeExpr} must not be OUTSIDE_BUSINESS_HOURS, got ${check.code}`);
        assert(check.available === true, `${timeExpr} should be available: ${check.reason}`);
    }
    console.log("✓ 1. 12:00 noon / midday valid within 09:00–17:00 SAST");

    /* 2. 09:00 opening time valid */
    for (const timeExpr of ["9:00 AM", "09:00", "9am"]) {
        const parsed = parseScheduledInput({ date: weekday, time: timeExpr });
        assert(parsed.ok && parsed.dateTime, `parse ${timeExpr}`);
        assert(isWithinBusinessHours(parsed.dateTime), `${timeExpr} within business hours`);
        const check = await runTool("checkTestDriveAvailability", ctx, {
            vehicleId,
            date: weekday,
            time: timeExpr,
        });
        assert(check.code !== "OUTSIDE_BUSINESS_HOURS", `${timeExpr} must not be OUTSIDE_BUSINESS_HOURS, got ${check.code}`);
        assert(check.available === true, `${timeExpr} should be available: ${check.reason}`);
    }
    console.log("✓ 2. 09:00 opening time valid");

    /* 3. Scheduling context stores business TZ time (not server getHours) */
    const slot9 = futureSlotIso(3, 9, 0);
    const schedulingFromSlot = extractSchedulingFromText("9:00 AM", {
        pendingDate: weekday,
        lastMentionedDate: weekday,
    });
    assert(schedulingFromSlot.lastMentionedTime === "09:00", `time-only 9am -> 09:00 SAST, got ${schedulingFromSlot.lastMentionedTime}`);

    const schedulingFromOffer = extractSchedulingFromText("09:00", {
        pendingDate: weekday,
        lastOfferedSlots: [{ slotStart: slot9, label: "Fri, 09:00" }],
    });
    assert(
        schedulingFromOffer.lastMentionedTime === "09:00",
        `offered slot 9am stored as 09:00 SAST, got ${schedulingFromOffer.lastMentionedTime}`
    );

    const enriched = enrichToolArgsWithScheduling(
        "checkTestDriveAvailability",
        { vehicleId },
        { pendingDate: weekday, lastMentionedTime: "09:00", pendingTime: null }
    );
    assert(enriched.date === weekday, "enriched date from scheduling context");
    assert(enriched.time === "09:00", "enriched time preserved");
    const enrichedCheck = await runTool("checkTestDriveAvailability", { ...ctx, schedulingContext: { pendingDate: weekday, lastMentionedTime: "09:00" } }, enriched);
    assert(enrichedCheck.available === true, `enriched 09:00 check available: ${enrichedCheck.code}`);
    console.log("✓ 3. Scheduling context uses business TZ (live-path round-trip)");

    /* 4. Tool-offered slot not rejected — authoritative block present */
    const noonCheck = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId,
        date: weekday,
        time: "12:00 PM",
    });
    const block = formatAuthoritativeAvailabilityBlock(noonCheck);
    assert(block.includes("AUTHORITATIVE AVAILABILITY"), "authoritative block generated");
    assert(block.includes("AVAILABLE") || noonCheck.available === true, "noon slot marked available");
    assert(!block.includes("outside business hours"), "block must not claim outside hours for valid slot");
    console.log("✓ 4. Tool-offered slot authoritative — not rejected in prose guidance");

    /* 5. toBusinessTimeString matches parse for noon on UTC server */
    const noonParsed = parseScheduledInput({ date: weekday, time: "12 noon" });
    const bizTime = toBusinessTimeString(noonParsed.dateTime);
    assert(bizTime === "12:00", `noon -> 12:00 SAST, got ${bizTime}`);
    console.log("✓ 5. Noon parses to 12:00 SAST wall clock");

    console.log("\nAll test-drive live-path checks passed.\n");
}

main().catch((err) => {
    console.error("\nVerification failed:", err.message);
    process.exit(1);
});
