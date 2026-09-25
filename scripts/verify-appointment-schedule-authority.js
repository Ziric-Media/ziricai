#!/usr/bin/env node
/**
 * Phase B1 — appointment schedule authority (reschedule + confirmation guard).
 *
 * Usage:
 *   node scripts/verify-appointment-schedule-authority.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Johannesburg";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

import { futureDateOnly, futureSlotIso } from "./testHelpers/scheduling.js";

const VEHICLE_EVEREST = "veh-audit-everest";
const VEHICLE_CIAZ = "veh-audit-ciaz";
const STOCK_EVEREST = "CM-AUDIT-EV";
const STOCK_CIAZ = "CM-AUDIT-CZ";

async function seedVehicles(companyId) {
    const { seedVehicles } = await import("../services/inventory/inventoryService.js");
    return seedVehicles(companyId, [
        {
            vehicleId: VEHICLE_EVEREST,
            stockNumber: STOCK_EVEREST,
            make: "Ford",
            model: "Everest",
            year: 2019,
            price: 399900,
            mileage: 95000,
            location: "Rustenburg, North West",
            availability: "available",
            title: "2019 Ford Everest 2.0SiT XLT",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
        },
        {
            vehicleId: VEHICLE_CIAZ,
            stockNumber: STOCK_CIAZ,
            make: "Suzuki",
            model: "Ciaz",
            year: 2023,
            price: 226700,
            mileage: 38750,
            location: "Rustenburg, North West",
            availability: "available",
            title: "2023 Suzuki Ciaz 1.5 GL Auto",
            metadata: { bodyType: "sedan", seatingCapacity: 5 },
        },
    ]);
}

async function main() {
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const {
        rescheduleTestDriveBooking,
        guardBookingConfirmationReply,
        bookingMatchesSlot,
        replyClaimsFullBookingSuccess,
        analyzeBookingToolResults,
    } = await import("../services/conversation/appointmentScheduleAuthority.js");
    const { listAppointmentsByCustomer } = await import("../services/database/appointmentRepository.js");

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    _resetMemoryAppointmentsForTests();
    initAiTools();

    const COMPANY_ID = "verify-appt-authority-co";
    const PHONE = "27810003001";
    const dayA = futureDateOnly(3);
    const dayB = futureDateOnly(4);
    const slotA10 = futureSlotIso(3, 10);
    const slotA12 = futureSlotIso(3, 12);
    const slotB12 = futureSlotIso(4, 12);

    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Audit Tester",
        agentId: "agent-sales",
        channel: "whatsapp",
    };

    await seedVehicles(COMPANY_ID);

    console.log("\nAppointment schedule authority verification\n");

    /* 1. Successful single booking */
    const book1 = await runTool("bookTestDrive", ctx, {
        vehicleId: VEHICLE_CIAZ,
        scheduledAt: slotA10,
        customerName: ctx.customerName,
    });
    assert(book1.ok && book1.code === "BOOKING_SUCCESS", "single book succeeds");
    console.log("✓ 1. Successful single booking");

    /* 2. Failed booking must not produce confirmation via guard */
    const badBook = await runTool(
        "bookTestDrive",
        { ...ctx, schedulingContext: {} },
        { vehicleId: VEHICLE_EVEREST, scheduledAt: "not-a-real-date", customerName: ctx.customerName }
    );
    assert(!badBook.ok, "invalid date book fails");
    const falseClaim = await guardBookingConfirmationReply({
        reply: "Your test drives have been successfully scheduled for all three vehicles!",
        toolResults: [badBook],
        ctx,
    });
    assert(falseClaim.overridden, "guard overrides false full success claim");
    assert(!/successfully scheduled/i.test(falseClaim.reply), "guard removes false success wording");
    console.log("✓ 2. Failed booking blocks false confirmation");

    /* 3. Successful reschedule — book new then cancel old */
    const bookEverestOld = await runTool("bookTestDrive", ctx, {
        vehicleId: VEHICLE_EVEREST,
        scheduledAt: slotA12,
        customerName: ctx.customerName,
    });
    assert(bookEverestOld.ok, "everest initial book");
    const oldId = bookEverestOld.appointment.id;

    const reschedule = await rescheduleTestDriveBooking(ctx, {
        vehicleId: VEHICLE_EVEREST,
        scheduledAt: slotB12,
        cancelBookingId: oldId,
    });
    assert(reschedule.ok && reschedule.code === "RESCHEDULE_SUCCESS", `reschedule ok: ${reschedule.code}`);
    assert(reschedule.cancelledBookingId === oldId, "old booking cancelled");

    const all = await listAppointmentsByCustomer({
        companyId: COMPANY_ID,
        customerId: PHONE,
        statusFilter: "all",
    });
    const oldRow = all.find((b) => b.id === oldId);
    const newRow = all.find((b) => b.id === reschedule.appointment.id);
    assert(oldRow?.status === "cancelled", "old appointment cancelled in postgres");
    assert(newRow?.status === "confirmed", "new appointment confirmed");
    assert(bookingMatchesSlot(newRow, { vehicleId: VEHICLE_EVEREST }), "new row matches vehicle");
    console.log("✓ 3. Successful reschedule (book → cancel old)");

    /* 4. Reschedule to same slot — no duplicate */
    const dup = await rescheduleTestDriveBooking(ctx, {
        vehicleId: VEHICLE_EVEREST,
        scheduledAt: slotB12,
        cancelBookingId: oldId,
    });
    assert(dup.ok && dup.code === "ALREADY_SCHEDULED", `duplicate slot: ${dup.code}`);
    const afterDup = await listAppointmentsByCustomer({
        companyId: COMPANY_ID,
        customerId: PHONE,
        statusFilter: "all",
    });
    const everestUpcoming = afterDup.filter(
        (b) => b.vehicleId === VEHICLE_EVEREST && b.status !== "cancelled"
    );
    assert(everestUpcoming.length === 1, "only one active everest booking");
    console.log("✓ 4. Existing appointment not duplicated (ALREADY_SCHEDULED)");

    /* 5. Multi-vehicle — one fails, guard overrides */
    const multiFailTools = [
        { tool: "bookTestDrive", ok: true, code: "BOOKING_SUCCESS" },
        { tool: "bookTestDrive", ok: false, code: "SLOT_UNAVAILABLE", error: "12:00 unavailable" },
    ];
    const multiGuard = await guardBookingConfirmationReply({
        reply: "All your test drives are all set for Monday!",
        toolResults: multiFailTools,
        ctx,
    });
    assert(multiGuard.overridden, "multi partial failure triggers guard");
    console.log("✓ 5. Multi-vehicle partial failure blocks full confirmation");

    /* 6. Schedule mismatch detection (Everest claimed but not in DB) */
    const mismatchGuard = await guardBookingConfirmationReply({
        reply:
            "Your test drives have been successfully scheduled for Monday, 7 September 2026: Ford Everest at 12:00, Changan at 12:30, Suzuki Ciaz at 1:00 pm.",
        toolResults: [{ tool: "bookTestDrive", ok: true, code: "BOOKING_SUCCESS" }],
        ctx,
    });
    assert(mismatchGuard.overridden, "everest-on-date mismatch triggers guard");
    assert(/actually confirmed|confirmed upcoming/i.test(mismatchGuard.reply), "guard gives postgres truth");
    console.log("✓ 6. Final confirmation corrected when reply mismatches Postgres");

    /* 7. analyzeBookingToolResults */
    const analysis = analyzeBookingToolResults([
        { tool: "rescheduleTestDrive", ok: true, code: "RESCHEDULE_SUCCESS" },
        { tool: "bookTestDrive", ok: false, code: "SLOT_UNAVAILABLE" },
    ]);
    assert(analysis.bookSuccesses === 1 && analysis.bookFailures === 1, "analysis counts");
    assert(replyClaimsFullBookingSuccess("Your test drives are all set!"), "detects success phrases");
    console.log("✓ 7. Tool result analysis helpers");

    console.log("\nAll appointment schedule authority checks passed.\n");
}

main().catch((err) => {
    console.error("\nVerification failed:", err.message);
    process.exit(1);
});
