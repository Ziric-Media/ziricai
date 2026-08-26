#!/usr/bin/env node
/**
 * Phase 1.2 — Multi-vehicle test drive orchestration regression.
 *
 * Usage:
 *   node scripts/verify-multi-vehicle-test-drive.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Johannesburg";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

import { futureDateOnly, futureSlotIso } from "./testHelpers/scheduling.js";

const VEHICLE_A = "veh-wp-21758";
const VEHICLE_B = "veh-wp-19424";
const STOCK_A = "CM-WP-21758";
const STOCK_B = "CM-WP-19424";

async function seedEverestFleet(companyId) {
    const { seedVehicles } = await import("../services/inventory/inventoryService.js");
    return seedVehicles(companyId, [
        {
            vehicleId: VEHICLE_A,
            stockNumber: STOCK_A,
            make: "Ford",
            model: "Everest",
            year: 2019,
            price: 399900,
            mileage: 95000,
            location: "Centurion",
            availability: "available",
            title: "2019 Ford Everest 2.0SiT XLT",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
        },
        {
            vehicleId: VEHICLE_B,
            stockNumber: STOCK_B,
            make: "Ford",
            model: "Everest",
            year: 2019,
            price: 449900,
            mileage: 72000,
            location: "Centurion",
            availability: "available",
            title: "2019 Ford Everest 2.0Bi-Turbo 4WD Limited",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
        },
    ]);
}

async function main() {
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    const { _resetMemoryCustomersForTests } = await import("../services/database/customerRepository.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const {
        extractSchedulingFromText,
        enrichToolArgsWithScheduling,
        saveSchedulingContext,
        getSchedulingContext,
        resolveRelativeDateLabel,
        isSchedulingDelegationIntent,
    } = await import("../services/conversation/schedulingContext.js");
    const {
        getTestDrivePlan,
        saveTestDrivePlan,
        planUpdatesFromToolResult,
        mergePlanEntries,
        formatTestDrivePlanForPrompt,
        isPlanConfirmationIntent,
        finalizePendingPlanEntries,
        matchOfferedSlot,
    } = await import("../services/conversation/testDrivePlan.js");
    const { parseScheduledInput, isTimeOnlyInput } = await import("../services/tools/availability.js");
    const { getMaxConcurrentPerSlot } = await import("../services/tools/availability.js");

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    _resetMemoryAppointmentsForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-multi-vehicle-td-co";
    const PHONE = "27810002001";
    const weekday = futureDateOnly(2);
    const slot10 = futureSlotIso(2, 10);
    const slot11 = futureSlotIso(2, 11);

    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Sarah UAT Family",
        agentId: "agent-sales",
        channel: "whatsapp",
    };

    await seedEverestFleet(COMPANY_ID);

    console.log("Multi-vehicle test drive verification\n");

    /* 1. "this Friday" resolves to upcoming Friday in business TZ */
    const fridayResolved = resolveRelativeDateLabel("this Friday");
    assert(fridayResolved && /^\d{4}-\d{2}-\d{2}$/.test(fridayResolved), `this Friday -> ${fridayResolved}`);
    const fridayParsed = parseScheduledInput({ date: "this Friday" });
    assert(fridayParsed.ok && (fridayParsed.dateOnly || fridayParsed.dateTime), "parse this Friday ok");
    const fridayDow = new Date(`${fridayResolved}T12:00:00+02:00`).getUTCDay();
    assert(fridayDow === 5, `this Friday is Friday, dow=${fridayDow}`);
    console.log(`✓ 1. "this Friday" resolves to ${fridayResolved}`);

    /* 2. Time-only "11:00" preserves established date (not today) */
    await saveSchedulingContext(COMPANY_ID, PHONE, "whatsapp", {
        pendingDate: weekday,
        lastMentionedDate: weekday,
        lastOfferedDate: weekday,
        pendingTime: true,
    });
    const scheduling = await getSchedulingContext(COMPANY_ID, PHONE, "whatsapp");
    assert(isTimeOnlyInput("11:00"), "11:00 is time-only");
    const timeExtract = extractSchedulingFromText("11:00", scheduling);
    assert(timeExtract.pendingDate === weekday, `time-only keeps date ${weekday}, got ${timeExtract.pendingDate}`);
    const enriched = enrichToolArgsWithScheduling("bookTestDrive", { scheduledAt: "11:00" }, scheduling);
    assert(enriched.date === weekday, "enriched booking gets context date");
    const parsedTime = parseScheduledInput({
        date: enriched.date,
        time: enriched.time || "11:00",
        contextDate: weekday,
    });
    assert(parsedTime.ok && parsedTime.dateTime, "combined date+time parses");
    assert(
        parsedTime.dateTime.getTime() >= Date.now() - 60000,
        "offered slot 11:00 on future date is not in the past"
    );
    console.log("✓ 2. Time-only selection uses established date — not classified as past");

    /* 3. Vehicle A booked successfully at 10:00 */
    let plan = [];
    const bookA = await runTool(
        "bookTestDrive",
        { ...ctx, schedulingContext: scheduling, testDrivePlan: plan },
        { vehicleId: VEHICLE_A, scheduledAt: slot10, customerName: ctx.customerName }
    );
    assert(bookA.ok === true, `Vehicle A book failed: ${bookA.error}`);
    plan = planUpdatesFromToolResult("bookTestDrive", { vehicleId: VEHICLE_A }, bookA, plan);
    await saveTestDrivePlan(COMPANY_ID, PHONE, "whatsapp", plan);
    assert(plan.some((e) => e.vehicleId === VEHICLE_A && e.status === "CONFIRMED"), "Vehicle A CONFIRMED in plan");
    console.log("✓ 3. Vehicle A booked and CONFIRMED in test drive plan");

    /* 4. Vehicle B fails at same slot (customer conflict) — A stays CONFIRMED */
    const bookBConflict = await runTool(
        "bookTestDrive",
        { ...ctx, schedulingContext: scheduling, testDrivePlan: plan },
        { vehicleId: VEHICLE_B, scheduledAt: slot10, customerName: ctx.customerName }
    );
    assert(bookBConflict.ok === false, "Vehicle B same slot should fail");
    assert(
        bookBConflict.code === "CUSTOMER_SLOT_CONFLICT" || bookBConflict.slotIssue === true,
        `expected slot conflict, got ${bookBConflict.code}`
    );
    assert(bookBConflict.code !== "VEHICLE_NOT_IN_INVENTORY", "must not claim inventory failure");
    plan = planUpdatesFromToolResult("bookTestDrive", { vehicleId: VEHICLE_B }, bookBConflict, plan);
    const entryA = plan.find((e) => e.vehicleId === VEHICLE_A);
    assert(entryA?.status === "CONFIRMED", "Vehicle A still CONFIRMED after B fails");
    assert(entryA?.appointmentId, "Vehicle A appointmentId preserved");
    console.log("✓ 4. Vehicle B slot failure — Vehicle A CONFIRMED preserved");

    /* 5. Vehicle B gets alternative slot (+30 min stagger) */
    assert(bookBConflict.nextAlternative || bookBConflict.suggestedSlots?.length, "alternative slot offered");
    const altSlot =
        bookBConflict.nextAlternative?.slotStart ||
        bookBConflict.suggestedSlots?.[0]?.slotStart ||
        slot11;
    const bookBAlt = await runTool(
        "bookTestDrive",
        { ...ctx, schedulingContext: scheduling, testDrivePlan: plan },
        { vehicleId: VEHICLE_B, scheduledAt: altSlot, customerName: ctx.customerName }
    );
    assert(bookBAlt.ok === true, `Vehicle B alt book failed: ${bookBAlt.error}`);
    plan = planUpdatesFromToolResult("bookTestDrive", { vehicleId: VEHICLE_B }, bookBAlt, plan);
    assert(plan.filter((e) => e.status === "CONFIRMED").length === 2, "both vehicles CONFIRMED");
    console.log("✓ 5. Vehicle B booked at alternative slot after failure");

    /* 6. Offered slot matching — customer picks "11:00" from lastOfferedSlots */
    _resetMemoryAppointmentsForTests();
    plan = [];
    const avail = await runTool(
        "checkTestDriveAvailability",
        { ...ctx, schedulingContext: { pendingDate: weekday, lastOfferedDate: weekday } },
        { vehicleId: VEHICLE_A, date: weekday }
    );
    assert(avail.suggestedSlots?.length > 0, "availability returns suggested slots");
    await saveSchedulingContext(COMPANY_ID, PHONE, "whatsapp", {
        pendingDate: weekday,
        lastOfferedDate: weekday,
        lastOfferedSlots: avail.suggestedSlots,
        pendingTime: true,
    });
    const schedWithSlots = await getSchedulingContext(COMPANY_ID, PHONE, "whatsapp");
    const matched = matchOfferedSlot("11:00", schedWithSlots.lastOfferedSlots, weekday);
    assert(matched?.slotStart, "11:00 matches an offered slot");
    const pastCheck = await runTool(
        "checkTestDriveAvailability",
        { ...ctx, schedulingContext: schedWithSlots, inboundMessage: "11:00" },
        enrichToolArgsWithScheduling(
            "checkTestDriveAvailability",
            { vehicleId: VEHICLE_A, scheduledAt: "11:00" },
            schedWithSlots
        )
    );
    assert(pastCheck.code !== "PAST_SLOT", `offered 11:00 must not be PAST_SLOT, got ${pastCheck.code}`);
    console.log("✓ 6. Offered slot 11:00 not classified as past");

    /* 7. mergePlanEntries never downgrades CONFIRMED */
    const merged = mergePlanEntries(
        [{ vehicleId: VEHICLE_A, status: "CONFIRMED", appointmentId: "appt-1" }],
        [{ vehicleId: VEHICLE_A, status: "FAILED", failureReason: "fake" }]
    );
    assert(merged[0].status === "CONFIRMED", "CONFIRMED not downgraded to FAILED");
    console.log("✓ 7. CONFIRMED entries immutable in merge");

    /* 8. Auto-select first slot ("select a time for me") */
    assert(isSchedulingDelegationIntent("select a time for me"), "delegation intent");
    const autoSelect = await runTool(
        "checkTestDriveAvailability",
        { ...ctx, inboundMessage: "select a time for me" },
        { vehicleId: VEHICLE_B }
    );
    assert(autoSelect.code === "AUTO_SELECT" || autoSelect.available === true, `auto-select: ${autoSelect.code}`);
    assert(autoSelect.slotStart, "auto-select returns slotStart");
    console.log("✓ 8. Select a time for me — first available slot");

    /* 9. Finalize pending on plan confirmation */
    _resetMemoryAppointmentsForTests();
    plan = [
        {
            vehicleId: VEHICLE_A,
            stockNumber: STOCK_A,
            status: "CONFIRMED",
            appointmentId: "existing-a",
            slotLabel: "confirmed slot",
        },
        {
            vehicleId: VEHICLE_B,
            stockNumber: STOCK_B,
            status: "PENDING",
            date: weekday,
            slotStart: slot11,
        },
    ];
    assert(isPlanConfirmationIntent("I'm happy with this plan, let's go ahead"), "plan confirmation intent");
    const finalize = await finalizePendingPlanEntries({ ...ctx, testDrivePlan: plan }, plan);
    assert(finalize.results.length === 1, "only pending entry finalized");
    assert(finalize.results[0].vehicleId === VEHICLE_B, "pending Vehicle B finalized");
    assert(finalize.results[0].ok === true, `finalize book ok: ${finalize.results[0].error}`);
    const confirmedA = finalize.plan.find((e) => e.vehicleId === VEHICLE_A);
    assert(confirmedA?.status === "CONFIRMED" && confirmedA.appointmentId === "existing-a", "CONFIRMED A untouched");
    const confirmedB = finalize.plan.find((e) => e.vehicleId === VEHICLE_B);
    assert(confirmedB?.status === "CONFIRMED", "Vehicle B now CONFIRMED");
    console.log("✓ 9. Finalize pending on customer plan confirmation");

    /* 10. Plan prompt distinguishes partial success */
    const partialPlan = [
        { vehicleId: VEHICLE_A, stockNumber: STOCK_A, status: "CONFIRMED", slotLabel: "Fri 10:00" },
        { vehicleId: VEHICLE_B, stockNumber: STOCK_B, status: "FAILED", failureReason: "slot full" },
    ];
    const prompt = formatTestDrivePlanForPrompt(partialPlan);
    assert(prompt.includes("CONFIRMED"), "plan prompt shows CONFIRMED");
    assert(prompt.includes("Partial success"), "plan prompt mentions partial success");
    assert(/slot issue/i.test(prompt), "plan prompt distinguishes slot failure");
    console.log("✓ 10. Partial success reporting in plan prompt");

    console.log("\nAll multi-vehicle test drive checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
