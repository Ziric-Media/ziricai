#!/usr/bin/env node
/**
 * Phase 2A Step 1 — Sarah ↔ CRM synchronization verification.
 *
 * Usage:
 *   node scripts/verify-phase-2a-crm-integration.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { CENTRAL_MOTORS_COMPANY_ID } from "../services/storage/seedDemoTenants.js";
import {
    upsertCustomerFromWhatsApp,
    getCustomer,
    getTimeline,
} from "../services/customerService.js";
import {
    extractSalesSignals,
    mergeSalesContext,
    persistSalesContext,
} from "../services/conversation/salesContext.js";
import { syncFromSalesTurn, syncTestDriveBooked } from "../services/integrations/crmSyncService.js";
import { mapSarahStageToCrmStage } from "../services/integrations/leadStageMapping.js";
import { TenantRepository } from "../services/database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../services/database/schema.js";
import { initAiTools, runTool } from "../services/tools/index.js";
import { futureSlotIso } from "./testHelpers/scheduling.js";

const RTB = CENTRAL_MOTORS_RTB_COMPANY_ID;
const DEMO = CENTRAL_MOTORS_COMPANY_ID;
const PHONE = "27849000523";
const leadRepo = new TenantRepository(TENANT_COLLECTIONS.LEADS);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function seedInventory(companyId) {
    const { seedVehicles, _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
    _resetMemoryInventoryForTests();
    await seedVehicles(companyId, [
        {
            vehicleId: "veh-amaze-uat",
            stockNumber: "CRM-STK-001",
            make: "Honda",
            model: "Amaze",
            year: 2024,
            availability: "available",
            title: "2024 Honda Amaze",
        },
    ]);
}

async function main() {
    console.log("\nPhase 2A CRM integration verification\n");

    resetMemoryTenantStore();
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    _resetMemoryAppointmentsForTests();
    initAiTools();
    await seedInventory(RTB);

    /* A. New WhatsApp customer → CRM customer */
    await upsertCustomerFromWhatsApp(PHONE, {
        companyId: RTB,
        contactName: "Spencer",
        messagePreview: "Hi, I need a family car",
    });

    const signals = extractSalesSignals("Family of 5, budget around R250000, looking for a sedan", {
        customer: { salesContext: { leadStage: "NEW" } },
    });
    const salesContext = mergeSalesContext(null, signals);
    await persistSalesContext(RTB, PHONE, signals);

    await syncFromSalesTurn(RTB, PHONE, {
        contactName: "Spencer",
        channel: "whatsapp",
        leadScore: 72,
        topic: "sales",
        salesContext,
        aiEmployeeName: "Sarah",
    });

    const customer = await getCustomer(PHONE, { companyId: RTB });
    assert(customer?.phone === PHONE, "CRM customer should exist under central-motors-rtb");
    assert(customer?.assignedAiEmployee === "Sarah", "Sarah should be assigned on CRM customer");
    console.log("✓ A. New WhatsApp customer → tenant CRM customer");

    /* B. Existing customer → no duplicate */
    await syncFromSalesTurn(RTB, PHONE, {
        contactName: "Spencer",
        channel: "whatsapp",
        leadScore: 72,
        topic: "sales",
        salesContext,
        aiEmployeeName: "Sarah",
    });
    const leadsAfterDupCustomer = await leadRepo.list(RTB, { max: 100 });
    const customerAfterDup = await getCustomer(PHONE, { companyId: RTB });
    assert(customerAfterDup?.phone === PHONE, "Customer identity remains stable");
    assert(leadsAfterDupCustomer.filter((l) => l.phone === PHONE).length === 1, "No duplicate lead rows");
    console.log("✓ B. Existing WhatsApp customer → same CRM customer, no duplicate lead");

    /* C. Lead creation/update */
    const lead = await leadRepo.get(RTB, PHONE);
    assert(lead, "Lead record should exist after qualification sync");
    assert(lead.leadScore >= 72, "Lead score should reflect pipeline score");
    assert(lead.source === "whatsapp", "Lead source should be whatsapp");
    console.log("✓ C. Lead created/updated from Sarah sync");

    /* D. Sarah leadStage → CRM stage mapping */
    const qualifiedSignals = extractSalesSignals("I like the Honda Amaze, let's book a test drive", {
        customer: { salesContext: salesContext },
    });
    const bookedContext = mergeSalesContext(salesContext, {
        ...qualifiedSignals,
        leadStage: "TEST_DRIVE_BOOKED",
        preferredVehicle: "Honda Amaze",
        lastRecommendedVehicles: [
            {
                vehicleId: "veh-amaze-uat",
                stockNumber: "CRM-STK-001",
                make: "Honda",
                model: "Amaze",
                year: 2024,
            },
        ],
    });
    await syncFromSalesTurn(RTB, PHONE, {
        contactName: "Spencer",
        channel: "whatsapp",
        leadScore: 85,
        topic: "sales",
        salesContext: bookedContext,
        aiEmployeeName: "Sarah",
    });
    const mappedLead = await leadRepo.get(RTB, PHONE);
    assert(
        mapSarahStageToCrmStage("TEST_DRIVE_BOOKED") === "proposal",
        "Sarah TEST_DRIVE_BOOKED maps to CRM proposal"
    );
    assert(mappedLead.stage === "proposal", `Lead stage should be proposal, got ${mappedLead.stage}`);
    assert(mappedLead.sarahLeadStage === "TEST_DRIVE_BOOKED", "Sarah stage stored on lead");
    assert(mappedLead.vehicleInterest?.includes("Honda"), "Vehicle interest recorded on lead");
    console.log("✓ D. Sarah leadStage → CRM stage mapping + vehicle interest");

    /* E. Repeated message processing → no duplicate timeline events */
    const timelineBefore = await getTimeline(PHONE, { companyId: RTB });
    const stageEventsBefore = timelineBefore.filter((e) => e.id === "sarah-stage-TEST_DRIVE_BOOKED").length;
    await syncFromSalesTurn(RTB, PHONE, {
        contactName: "Spencer",
        salesContext: bookedContext,
        aiEmployeeName: "Sarah",
    });
    const timelineAfter = await getTimeline(PHONE, { companyId: RTB });
    const stageEventsAfter = timelineAfter.filter((e) => e.id === "sarah-stage-TEST_DRIVE_BOOKED").length;
    assert(stageEventsAfter === stageEventsBefore, "Repeated sync must not duplicate stage timeline events");
    console.log("✓ E. Repeated sync → no duplicate timeline events");

    /* F. Timeline event is tenant-scoped */
    const demoTimeline = await getTimeline(PHONE, { companyId: DEMO });
    assert(demoTimeline.length === 0, "Demo tenant must not see Central Motors RTB timeline");
    assert(timelineAfter.length > 0, "RTB tenant timeline should contain Sarah events");
    console.log("✓ F. Timeline events are tenant-scoped");

    /* G. Test-drive success → tenant CRM/timeline event */
    const scheduledAt = futureSlotIso(5, 9);
    const booking = await runTool(
        "bookTestDrive",
        {
            companyId: RTB,
            customerId: PHONE,
            customerPhone: PHONE,
            customerName: "Spencer",
            channel: "whatsapp",
        },
        {
            vehicleStockNumber: "CRM-STK-001",
            scheduledAt,
            customerName: "Spencer",
        }
    );
    assert(booking.ok === true, `bookTestDrive should succeed: ${booking.error || booking.code || ""}`);
    const bookingTimeline = await getTimeline(PHONE, { companyId: RTB });
    assert(
        bookingTimeline.some((e) => e.id === `appointment-${booking.appointment.id}`),
        "Test drive booking should create tenant-scoped timeline event"
    );
    const bookingLead = await leadRepo.get(RTB, PHONE);
    assert(bookingLead.stage === "proposal", "Lead remains at proposal after test drive booking");
    console.log("✓ G. Test-drive success → tenant CRM/timeline event");

    /* H. demo-central-motors cannot receive Central Motors RTB records */
    await syncFromSalesTurn(DEMO, PHONE, {
        contactName: "Other Tenant Person",
        salesContext: { leadStage: "NEW" },
        aiEmployeeName: "Sarah",
    });
    const demoLead = await leadRepo.get(DEMO, PHONE);
    const rtbLead = await leadRepo.get(RTB, PHONE);
    assert(rtbLead?.vehicleInterest?.includes("Honda"), "RTB lead retains vehicle interest");
    assert(!demoLead?.vehicleInterest?.includes("Honda"), "Demo tenant lead must not inherit RTB vehicle interest");
    const demoCustomer = await getCustomer(PHONE, { companyId: DEMO });
    assert(demoCustomer?.assignedAiEmployee === "Sarah", "Demo tenant may have its own Sarah-assigned customer");
    assert(
        !(demoCustomer?.interests?.vehicleInterest || "").includes("Honda"),
        "Demo tenant customer must not receive RTB vehicle interest"
    );
    console.log("✓ H. demo-central-motors isolated from central-motors-rtb records");

    /* Idempotent test-drive sync */
    await syncTestDriveBooked(RTB, PHONE, {
        appointment: booking.appointment,
        vehicleLabel: "2024 Honda Amaze",
        duplicate: true,
    });
    const timelineAfterDupBooking = await getTimeline(PHONE, { companyId: RTB });
    assert(
        timelineAfterDupBooking.filter((e) => e.id === `appointment-${booking.appointment.id}`).length === 1,
        "Duplicate booking sync must not add another appointment timeline event"
    );
    console.log("✓ Idempotent duplicate test-drive sync skipped");

    console.log("\nAll Phase 2A CRM integration checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
