#!/usr/bin/env node
/**
 * Phase 2B-2 — Unified Sarah test-drive appointments verification.
 *
 * Usage:
 *   node scripts/verify-phase-2b-2-appointments.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Johannesburg";
delete process.env.DATABASE_URL;

import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { CENTRAL_MOTORS_COMPANY_ID } from "../services/storage/seedDemoTenants.js";
import { TenantRepository } from "../services/database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../services/database/schema.js";
import { initAiTools, runTool } from "../services/tools/index.js";
import { futureSlotIso } from "./testHelpers/scheduling.js";
import { listAppointments } from "../services/tenants/appointmentService.js";
import { getTenantMissionMetrics } from "../services/operations/tenantMissionMetrics.js";
import { syncTestDriveBooked } from "../services/integrations/crmSyncService.js";
import { CANONICAL_APPOINTMENT_SOURCE } from "../services/integrations/appointmentCanonicalSync.js";

const RTB = CENTRAL_MOTORS_RTB_COMPANY_ID;
const DEMO = CENTRAL_MOTORS_COMPANY_ID;
const PHONE = "27849000526";
const appointmentRepo = new TenantRepository(TENANT_COLLECTIONS.APPOINTMENTS);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function seedInventory(companyId) {
    const { seedVehicles, _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
    _resetMemoryInventoryForTests();
    await seedVehicles(companyId, [
        {
            vehicleId: "veh-amaze-2b2",
            stockNumber: "CM-2B2-001",
            make: "Honda",
            model: "Amaze",
            year: 2024,
            availability: "available",
            title: "2024 Honda Amaze 1.2 Comfort Auto",
            location: "Central Motors Rustenburg",
        },
    ]);
}

async function main() {
    console.log("\nPhase 2B-2 unified appointment verification\n");

    resetMemoryTenantStore();
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    _resetMemoryAppointmentsForTests();
    initAiTools();
    await seedInventory(RTB);

    const scheduledAt = futureSlotIso(5, 9);
    const ctx = {
        companyId: RTB,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Spencer Gore",
        channel: "whatsapp",
    };

    /* 1. Sarah booking creates exactly one canonical appointment */
    const booking = await runTool(
        "bookTestDrive",
        ctx,
        {
            vehicleStockNumber: "CM-2B2-001",
            scheduledAt,
            customerName: "Spencer Gore",
        }
    );
    assert(booking.ok === true, `bookTestDrive should succeed: ${booking.error || booking.code || ""}`);
    const appointmentId = booking.appointment?.id || booking.booking?.id;
    assert(appointmentId, "Booking must return appointment id");

    const crmDoc = await appointmentRepo.get(RTB, appointmentId);
    assert(crmDoc, "CRM appointments collection must contain canonical record");
    assert(crmDoc.canonicalSource === CANONICAL_APPOINTMENT_SOURCE, "CRM doc must reference postgres canonical source");
    assert(crmDoc.id === appointmentId, "CRM doc id must match Postgres UUID");
    assert(crmDoc.status === "confirmed", "CRM appointment status should be confirmed");
    assert(crmDoc.bookedBy === "Sarah", "CRM should record Sarah as booker");
    console.log("✓ 1. Sarah booking creates one canonical appointment (Postgres UUID → CRM)");

    /* 2. Repeated sync / duplicate book does not duplicate */
    const dupBooking = await runTool(
        "bookTestDrive",
        ctx,
        {
            vehicleStockNumber: "CM-2B2-001",
            scheduledAt,
            customerName: "Spencer Gore",
        }
    );
    assert(dupBooking.duplicate === true, "Second book with same slot should be duplicate");
    const crmListed = await listAppointments(RTB);
    const sameIdRows = crmListed.filter((a) => a.id === appointmentId);
    assert(sameIdRows.length === 1, "CRM list must not duplicate canonical appointment");

    await syncTestDriveBooked(RTB, PHONE, {
        appointment: booking.appointment,
        vehicleLabel: "2024 Honda Amaze",
        duplicate: true,
    });
    const crmListedAfterSync = await listAppointments(RTB);
    assert(
        crmListedAfterSync.filter((a) => a.id === appointmentId).length === 1,
        "Repeated CRM sync must not duplicate appointment"
    );
    console.log("✓ 2. Repeated book/sync remains idempotent");

    /* 3. Portal CRM API list sees Sarah booking */
    assert(
        crmListed.some((a) => a.id === appointmentId && a.service === "test_drive"),
        "Portal listAppointments must include Sarah test drive"
    );
    console.log("✓ 3. CRM listAppointments sees Sarah booking");

    /* 4. Mission Control sees confirmed test drive */
    const mission = await getTenantMissionMetrics(RTB);
    assert(mission.counts.testDrivesBooked >= 1, "Mission Control should count confirmed test drive");
    assert(mission.storageReadOnly === true, "Mission Control must remain read-only");
    console.log("✓ 4. Mission Control counts canonical test drive");

    /* 5–6. Cancellation updates same appointment, history preserved */
    const cancel = await runTool("cancelTestDrive", ctx, { bookingId: appointmentId });
    assert(cancel.ok === true, "cancelTestDrive should succeed");
    const cancelledDoc = await appointmentRepo.get(RTB, appointmentId);
    assert(cancelledDoc?.status === "cancelled", "Same CRM doc should be cancelled");
    const allListed = await listAppointments(RTB);
    assert(allListed.some((a) => a.id === appointmentId), "Cancelled appointment remains in CRM history");
    console.log("✓ 5–6. Cancellation updates same appointment; history preserved");

    const missionAfterCancel = await getTenantMissionMetrics(RTB);
    assert(
        missionAfterCancel.counts.testDrivesBooked === 0,
        "Mission Control should not count cancelled test drives as booked"
    );
    console.log("✓ Mission Control excludes cancelled bookings from active count");

    /* 7. Failed slot booking creates no appointment */
    _resetMemoryAppointmentsForTests();
    resetMemoryTenantStore();
    await seedInventory(RTB);

    const failBook = await runTool("bookTestDrive", ctx, {
        vehicleStockNumber: "CM-2B2-001",
        scheduledAt: futureSlotIso(5, 8),
        customerName: "Spencer Gore",
    });
    assert(failBook.ok === false, "08:00 booking must fail outside business hours");
    const afterFailList = await listAppointments(RTB);
    assert(afterFailList.length === 0, "Failed booking must not create CRM appointment");
    console.log("✓ 7. Failed/out-of-hours booking creates no appointment");

    /* 8. Slot unavailable ≠ vehicle not in inventory */
    const badVehicle = await runTool("bookTestDrive", ctx, {
        vehicleStockNumber: "NONEXISTENT-STOCK",
        scheduledAt: futureSlotIso(5, 10),
    });
    assert(
        badVehicle.code === "VEHICLE_NOT_IN_INVENTORY" || badVehicle.error?.includes("inventory"),
        `Expected VEHICLE_NOT_IN_INVENTORY, got ${badVehicle.code || badVehicle.error}`
    );
    console.log("✓ 8. Vehicle-not-in-inventory remains distinct from slot errors");

    /* 9. Business hours preserved (delegates to availability module) */
    const availability = await import("../services/tools/availability.js");
    const weekday = (await import("./testHelpers/scheduling.js")).futureDateOnly(4);
    for (const [time, expected] of [
        ["09:00 AM", true],
        ["12:00 PM", true],
        ["4:30 PM", true],
        ["08:00 AM", false],
        ["6:00 PM", false],
    ]) {
        const parsed = availability.parseScheduledInput({ date: weekday, time });
        assert(
            availability.isWithinBusinessHours(parsed.dateTime) === expected,
            `${time} business hours check failed`
        );
    }
    console.log("✓ 9. Africa/Johannesburg business hours preserved (09:00, 12:00, 16:30 valid; 08:00, 18:00 invalid)");

    /* 10. Tenant isolation */
    await seedInventory(DEMO);
    const demoBooking = await runTool(
        "bookTestDrive",
        { ...ctx, companyId: DEMO, customerId: "27849000527", customerPhone: "27849000527" },
        {
            vehicleStockNumber: "CM-2B2-001",
            scheduledAt: futureSlotIso(6, 11),
            customerName: "Demo Tenant",
        }
    );
    assert(demoBooking.ok === true, "Demo tenant booking should succeed for isolation test");
    const rtbList = await listAppointments(RTB);
    const demoList = await listAppointments(DEMO);
    assert(!rtbList.some((a) => a.customerId === "27849000527"), "RTB must not see demo tenant appointments");
    assert(demoList.some((a) => a.customerId === "27849000527"), "Demo tenant sees its own appointment");
    console.log("✓ 10. Tenant isolation intact");

    console.log("\nAll Phase 2B-2 unified appointment checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
