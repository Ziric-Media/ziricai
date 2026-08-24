#!/usr/bin/env node
/**
 * Verify getCustomerBookings tool — persistence, tenant isolation, cancel flow.
 *
 * Usage:
 *   node scripts/verify-get-customer-bookings.js
 *   DATABASE_URL=postgres://... node scripts/verify-get-customer-bookings.js
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

async function seedInventory(companyId) {
    const { seedVehicles } = await import("../services/inventory/inventoryService.js");
    await seedVehicles(companyId, [
        {
            vehicleId: "veh-gcb-001",
            stockNumber: "GCB-STK-001",
            make: "Demo",
            model: "Bookings",
            year: 2022,
            availability: "available",
            title: "2022 Demo Bookings",
            location: "Sandton Showroom",
        },
    ]);
}

async function main() {
    const {
        _resetMemoryAppointmentsForTests,
        _reinitAppointmentRepositoryForTests,
        getAppointmentBackendName,
    } = await import("../services/database/appointmentRepository.js");
    const { _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
    const { initAiTools, runTool, getOpenAIToolDefinitions } = await import("../services/tools/index.js");

    _resetMemoryAppointmentsForTests();
    _resetMemoryInventoryForTests();
    initAiTools();

    const companyA = "verify-gcb-co-a";
    const companyB = "verify-gcb-co-b";
    const customerId = "27810000777";
    const scheduledAt = futureSlotIso(5, 14);

    await seedInventory(companyA);
    await seedInventory(companyB);

    const ctx = {
        companyId: companyA,
        customerId,
        customerPhone: customerId,
        customerName: "Bookings Customer",
        agentId: "agent-gcb",
        channel: "whatsapp",
    };

    console.log(`Backend: ${getAppointmentBackendName()}\n`);

    const empty = await runTool("getCustomerBookings", ctx, { statusFilter: "all" });
    assert(empty.ok === true, "Empty lookup should succeed");
    assert(empty.count === 0, "No bookings before create");
    assert(/no .*bookings found/i.test(empty.message), "Explicit empty message");
    console.log("✓ getCustomerBookings returns empty list with explicit message");

    const booked = await runTool("bookTestDrive", ctx, {
        vehicleStockNumber: "GCB-STK-001",
        scheduledAt,
        customerName: "Bookings Customer",
    });
    assert(booked.ok === true, `bookTestDrive should succeed: ${booked.error || ""}`);
    assert(booked.appointment?.id, "Appointment id returned");
    const bookingId = booked.appointment.id;
    console.log("✓ bookTestDrive creates appointment for lookup");

    _reinitAppointmentRepositoryForTests();
    const afterRestart = await runTool("getCustomerBookings", ctx, { statusFilter: "upcoming" });
    assert(afterRestart.ok === true, "Lookup after re-init should succeed");
    assert(afterRestart.count === 1, "One booking after restart simulation");
    assert(afterRestart.bookings[0].bookingId === bookingId, "Same bookingId after restart");
    assert(afterRestart.bookings[0].stockNumber === "GCB-STK-001", "Stock number enriched");
    assert(afterRestart.bookings[0].vehicleDescription, "Vehicle description present");
    assert(afterRestart.bookings[0].location === "Sandton Showroom", "Location from inventory");
    console.log("✓ getCustomerBookings survives repository re-init (persistence)");

    const wrongCompany = await runTool("getCustomerBookings", { ...ctx, companyId: companyB }, {
        statusFilter: "all",
    });
    assert(wrongCompany.ok === true, "Cross-tenant lookup returns ok");
    assert(wrongCompany.count === 0, "Wrong companyId returns no bookings");
    console.log("✓ cross-tenant companyId isolation — empty for other tenant");

    const otherCustomerBook = await runTool("bookTestDrive", { ...ctx, companyId: companyB, customerId: "27810000888" }, {
        vehicleStockNumber: "GCB-STK-001",
        scheduledAt: futureSlotIso(6, 11),
    });
    assert(otherCustomerBook.ok === true, "Other tenant booking succeeds");

    const samePhoneOtherCompany = await runTool("getCustomerBookings", {
        ...ctx,
        companyId: companyB,
        customerId,
        customerPhone: customerId,
    });
    assert(samePhoneOtherCompany.count === 0, "Same phone on company B has no booking for company A's customer");
    console.log("✓ same phone different company isolation");

    const byPhone = await runTool("getCustomerBookings", { ...ctx, customerId: undefined }, {
        statusFilter: "all",
    });
    assert(byPhone.count === 1, "Lookup by customerPhone works");
    console.log("✓ getCustomerBookings resolves via customerPhone");

    const cancelled = await runTool("cancelTestDrive", ctx, { bookingId });
    assert(cancelled.ok === true, "cancelTestDrive should succeed");
    assert(cancelled.cancelled === true, "cancelled flag set");

    const afterCancel = await runTool("getCustomerBookings", ctx, { statusFilter: "upcoming" });
    assert(afterCancel.count === 0, "Cancelled booking not in upcoming");

    const pastAll = await runTool("getCustomerBookings", ctx, { statusFilter: "all" });
    assert(pastAll.count >= 1, "Cancelled booking visible in all filter");
    assert(pastAll.bookings.some((b) => b.bookingId === bookingId && b.status === "cancelled"), "Cancelled status");
    console.log("✓ cancelTestDrive marks booking cancelled");

    const wrongCancel = await runTool("cancelTestDrive", { ...ctx, companyId: companyB }, { bookingId });
    assert(wrongCancel.ok === false, "Cancel on wrong tenant must fail");
    assert(wrongCancel.code === "NOT_FOUND", "NOT_FOUND for cross-tenant cancel");
    console.log("✓ cancelTestDrive tenant-scoped");

    const defs = getOpenAIToolDefinitions();
    assert(defs.some((d) => d.function.name === "getCustomerBookings"), "getCustomerBookings registered");
    assert(defs.some((d) => d.function.name === "cancelTestDrive"), "cancelTestDrive registered");
    assert(defs.some((d) => d.function.name === "bookTestDrive"), "bookTestDrive still registered");
    console.log("✓ tools exposed for OpenAI function calling");

    console.log("\nAll getCustomerBookings verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
