#!/usr/bin/env node
/**
 * Verify authoritative business state — customer identity, booking recap, brand search.
 *
 * Usage:
 *   node scripts/verify-authoritative-state.js
 *   DATABASE_URL=postgres://... node scripts/verify-authoritative-state.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

import { futureSlotIso } from "./testHelpers/scheduling.js";

function pastSlotIso(daysAgo = 5, hour = 10) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    while (d.getDay() === 0) d.setDate(d.getDate() - 1);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
}

async function main() {
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { _resetMemoryAppointmentsForTests, _reinitAppointmentRepositoryForTests } = await import(
        "../services/database/appointmentRepository.js"
    );
    const { _resetMemoryInventoryForTests, seedVehicles, searchInventory } = await import(
        "../services/inventory/inventoryService.js"
    );
    const {
        _resetMemoryCustomersForTests,
        _reinitCustomerRepositoryForTests,
        getCustomerBackendName,
    } = await import("../services/database/customerRepository.js");
    const {
        parseExplicitCustomerName,
        persistExplicitCustomerName,
        getCustomer,
        getCustomerDisplayName,
    } = await import("../services/customerService.js");
    const { buildWhatsAppSystemPrompt } = await import("../services/ai-core/whatsappConversationPrompt.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const { isBookingRecapIntent, formatAuthoritativeBookingBlock } = await import(
        "../services/conversation/bookingRecapIntent.js"
    );

    resetMemoryTenantStore();
    _resetMemoryAppointmentsForTests();
    _resetMemoryInventoryForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-authoritative-co";
    const COMPANY_NAME = "Central Motors";
    const PHONE = "27810000666";
    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Spencer",
        agentId: "agent-auth",
        channel: "whatsapp",
    };

    console.log(`Customer backend: ${getCustomerBackendName()}\n`);

    await seedVehicles(COMPANY_ID, [
        {
            vehicleId: "veh-hlx-002",
            stockNumber: "CM-HLX-002",
            make: "Toyota",
            model: "Hilux 2.4 GD-6 Double Cab SRX",
            year: 2020,
            location: "Central Motors Sandton, 42 Main Road",
            availability: "available",
            title: "2020 Toyota Hilux 2.4 GD-6 Double Cab SRX",
        },
        {
            vehicleId: "veh-ftn-001",
            stockNumber: "CM-FTN-001",
            make: "Toyota",
            model: "Fortuner 2.4 GD-6",
            year: 2020,
            location: "Central Motors Sandton, 42 Main Road",
            availability: "available",
            title: "2020 Toyota Fortuner 2.4 GD-6",
        },
        {
            vehicleId: "veh-frd-001",
            stockNumber: "CM-FRD-001",
            make: "Ford",
            model: "Everest 2.0 Bi-Turbo XLT",
            year: 2021,
            location: "Central Motors Sandton, 42 Main Road",
            availability: "available",
            title: "2021 Ford Everest 2.0 Bi-Turbo XLT",
        },
        {
            vehicleId: "veh-bmw-001",
            stockNumber: "CM-BMW-001",
            make: "BMW",
            model: "X5 xDrive30d M Sport",
            year: 2019,
            location: "Central Motors Sandton, 42 Main Road",
            availability: "available",
            title: "2019 BMW X5 xDrive30d M Sport",
        },
    ]);

    /* 1. "My name is Spencer" → customer record has Spencer */
    assert(parseExplicitCustomerName("My name is Spencer") === "Spencer", "parse name");
    await persistExplicitCustomerName(PHONE, "Spencer", { companyId: COMPANY_ID, companyName: COMPANY_NAME });
    let customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer.displayName === "Spencer", `displayName Spencer, got ${customer.displayName}`);
    assert(customer.explicitName === "Spencer", `explicitName Spencer, got ${customer.explicitName}`);
    console.log("✓ 1. explicit name Spencer persisted");

    /* 2. Restart sim → customer still Spencer */
    _reinitCustomerRepositoryForTests();
    resetMemoryTenantStore();
    customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer?.displayName === "Spencer", "Spencer survives restart via durable store");
    assert(
        getCustomerDisplayName(customer, { contactName: "Ziric Media", companyName: COMPANY_NAME }) === "Spencer",
        "display name after restart"
    );
    console.log("✓ 2. Spencer survives simulated restart");

    /* 3. Book Hilux CM-HLX-002 → retrieve exact Hilux */
    const booked = await runTool("bookTestDrive", ctx, {
        vehicleStockNumber: "CM-HLX-002",
        scheduledAt: futureSlotIso(4, 12),
        customerName: "Spencer",
    });
    assert(booked.ok === true, `book Hilux: ${booked.error || ""}`);
    assert(booked.appointment?.stockNumber === "CM-HLX-002", "booked stock CM-HLX-002");
    assert(/hilux/i.test(booked.appointment?.vehicleDescription || ""), "vehicleDescription is Hilux");
    assert(booked.appointment?.vehicleMake === "Toyota", "vehicleMake Toyota");
    assert(booked.appointment?.location?.includes("Sandton"), "location Sandton");
    assert(booked.appointment?.status === "confirmed", "status confirmed");
    console.log("✓ 3. bookTestDrive stores enriched Hilux CM-HLX-002");

    /* 4. Booking recap after restart → exact booking from getCustomerBookings, NOT Fortuner */
    _reinitAppointmentRepositoryForTests();
    assert(isBookingRecapIntent("what test drive did I book?"), "recap intent detected");
    assert(isBookingRecapIntent("what am I test driving?"), "test driving intent");
    assert(isBookingRecapIntent("remind me about my appointment"), "remind me intent");

    const recap = await runTool("getCustomerBookings", ctx, { statusFilter: "all" });
    assert(recap.ok === true, "getCustomerBookings ok");
    assert(recap.upcoming.some((b) => b.stockNumber === "CM-HLX-002"), "upcoming has CM-HLX-002");
    assert(!recap.upcoming.some((b) => b.stockNumber === "CM-FTN-001"), "upcoming must NOT have Fortuner");
    assert(recap.message.includes("CM-HLX-002"), "message includes CM-HLX-002");
    assert(!recap.message.includes("CM-FTN-001"), "message must NOT include Fortuner stock");
    assert(/hilux/i.test(recap.message), "message mentions Hilux");

    const authBlock = formatAuthoritativeBookingBlock(recap);
    assert(authBlock.includes("AUTHORITATIVE BOOKING DATA"), "authoritative block header");
    assert(authBlock.includes("CM-HLX-002"), "authoritative block has Hilux stock");
    assert(!authBlock.includes("CM-FTN-001"), "authoritative block excludes Fortuner");
    console.log("✓ 4. booking recap returns Hilux from DB, not Fortuner from memory");

    /* 5. Multiple bookings listed correctly upcoming vs previous */
    await runTool("bookTestDrive", { ...ctx, customerId: PHONE }, {
        vehicleStockNumber: "CM-FTN-001",
        scheduledAt: pastSlotIso(7, 9),
        customerName: "Spencer",
    }).catch(() => {});

    const { createAppointmentRecord } = await import("../services/database/appointmentRepository.js");
    await createAppointmentRecord({
        companyId: COMPANY_ID,
        customerId: PHONE,
        vehicleStockNumber: "CM-FTN-001",
        appointmentType: "test_drive",
        scheduledAt: pastSlotIso(10, 11),
        status: "confirmed",
        idempotencyKey: `verify-past-ftn-${Date.now()}`,
        metadata: {
            vehicleId: "veh-ftn-001",
            vehicleMake: "Toyota",
            vehicleModel: "Fortuner",
            vehicleDescription: "2020 Toyota Fortuner 2.4 GD-6",
            location: "Central Motors Sandton, 42 Main Road",
        },
    });

    const split = await runTool("getCustomerBookings", ctx, { statusFilter: "all" });
    assert(split.upcoming.length >= 1, "has upcoming");
    assert(split.past.length >= 1, "has past");
    assert(split.upcoming.every((b) => b.status !== "cancelled"), "upcoming excludes cancelled");
    assert(/upcoming test drive/i.test(split.message), "upcoming section");
    assert(/previous bookings/i.test(split.message), "previous section");
    console.log("✓ 5. upcoming vs previous bookings split correctly");

    /* 6. Cancelled not reported as confirmed upcoming */
    const bookingId = recap.upcoming[0]?.bookingId || booked.appointment?.bookingId;
    const cancelled = await runTool("cancelTestDrive", ctx, { bookingId });
    assert(cancelled.ok === true, "cancel ok");
    const afterCancel = await runTool("getCustomerBookings", ctx, { statusFilter: "upcoming" });
    assert(afterCancel.count === 0, "cancelled not in upcoming");
    const allAfterCancel = await runTool("getCustomerBookings", ctx, { statusFilter: "all" });
    const cancelledRow = allAfterCancel.bookings.find((b) => b.bookingId === bookingId);
    assert(cancelledRow?.status === "cancelled", "cancelled status in all");
    console.log("✓ 6. cancelled booking excluded from upcoming");

    /* 7. "what am I test driving?" → vehicle from booking tool (re-book Hilux for test) */
    const rebook = await runTool("bookTestDrive", ctx, {
        vehicleStockNumber: "CM-HLX-002",
        scheduledAt: futureSlotIso(6, 14),
        customerName: "Spencer",
    });
    assert(rebook.ok === true, "rebook for recap test");
    const testDriveRecap = await runTool("getCustomerBookings", ctx, { statusFilter: "upcoming" });
    assert(/hilux/i.test(testDriveRecap.message), "test drive recap mentions Hilux");
    assert(testDriveRecap.message.includes("CM-HLX-002"), "test drive recap has stock");
    console.log("✓ 7. test drive recap uses booking tool data");

    /* 8. Brand search: Everest/X5 returns Ford/BMW not Toyota */
    const everestSearch = await searchInventory(COMPANY_ID, "Everest or X5");
    assert(everestSearch.length >= 2, "Everest/X5 search returns matches");
    assert(everestSearch.some((v) => v.make === "Ford"), "Everest search includes Ford");
    assert(everestSearch.some((v) => v.make === "BMW"), "X5 search includes BMW");
    assert(!everestSearch.every((v) => v.make === "Toyota"), "Everest/X5 not all Toyota");

    const excludeToyota = await searchInventory(COMPANY_ID, "different brands besides toyota");
    assert(excludeToyota.length >= 1, "exclude Toyota returns results");
    assert(excludeToyota.every((v) => v.make !== "Toyota"), "exclude Toyota filters Toyota out");
    assert(excludeToyota.some((v) => v.make === "Ford" || v.make === "BMW"), "non-Toyota brands present");
    console.log("✓ 8. brand-aware search: Everest→Ford, X5→BMW, exclude Toyota");

    /* 9. Regression: WhatsApp conversation flow prompt includes authoritative rules + Spencer */
    const prompt = buildWhatsAppSystemPrompt({
        companyId: COMPANY_ID,
        companyName: COMPANY_NAME,
        customer: await getCustomer(PHONE, { companyId: COMPANY_ID }),
        contactName: "Ziric Media",
        agent: { name: "Sarah", systemPrompt: "You are Sarah at Central Motors." },
    });
    assert(prompt.includes("AUTHORITATIVE DATA RULE"), "prompt has authoritative rule");
    assert(prompt.includes("must NOT invent authoritative business records"), "no invent rule");
    assert(prompt.includes("Customer name: Spencer"), "prompt has Spencer");
    assert(prompt.includes("getCustomerBookings"), "prompt references getCustomerBookings");
    console.log("✓ 9. WhatsApp prompt enforces authoritative data + Spencer name");

    console.log("\nAll authoritative state verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
