#!/usr/bin/env node
/**
 * Regression: Spencer test-drive journey — locations, drive truth, multi-booking,
 * reschedule, authoritative bookings, name parsing, truth hierarchy prompts.
 *
 * Usage:
 *   node scripts/verify-spencer-test-drive-journey.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

import { futureSlotIso } from "./testHelpers/scheduling.js";

function futureAugust28() {
    const now = new Date();
    let year = now.getFullYear();
    let d = new Date(year, 7, 28, 10, 0, 0, 0);
    if (d.getTime() < now.getTime()) d = new Date(year + 1, 7, 28, 10, 0, 0, 0);
    return d;
}

async function main() {
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { _resetMemoryInventoryForTests, seedVehicles, normalizeDriveType } = await import(
        "../services/inventory/inventoryService.js"
    );
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    const { _resetMemoryCustomersForTests } = await import("../services/database/customerRepository.js");
    const { parseExplicitCustomerName } = await import("../services/customerIdentity.js");
    const {
        WHATSAPP_SALES_TRUTH_RULES,
        buildWhatsAppSystemPrompt,
    } = await import("../services/ai-core/whatsappConversationPrompt.js");
    const {
        compareRecommendedVehicleLocations,
        formatLocationComparisonForPrompt,
        buildInventoryRecommendationReason,
        getActivePurchaseBudgetFilter,
        extractSalesSignals,
        mergeSalesContext,
    } = await import("../services/conversation/salesContext.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const { parseScheduledInput } = await import("../services/tools/availability.js");
    const { formatAuthoritativeBookingBlock } = await import("../services/conversation/bookingRecapIntent.js");

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    _resetMemoryAppointmentsForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-spencer-td-co";
    const PHONE = "27810000888";
    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Spencer",
        agentId: "agent-sales",
        channel: "whatsapp",
    };

    await seedVehicles(COMPANY_ID, [
        {
            vehicleId: "veh-ft-2019",
            stockNumber: "CM-FT-2019",
            make: "Toyota",
            model: "Fortuner 2.4 GD-6",
            year: 2019,
            price: 379900,
            mileage: 82000,
            location: "Centurion",
            availability: "available",
            title: "2019 Toyota Fortuner 2.4 GD-6",
            metadata: { bodyType: "SUV", seatingCapacity: 7, driveType: "FrontWheelDrive" },
        },
        {
            vehicleId: "veh-ft-2020",
            stockNumber: "CM-FT-2020",
            make: "Toyota",
            model: "Fortuner 2.8 GD-6",
            year: 2020,
            price: 449900,
            mileage: 65000,
            location: "Sandton",
            availability: "available",
            title: "2020 Toyota Fortuner 2.8 GD-6",
            metadata: { bodyType: "SUV", seatingCapacity: 7, driveType: "4x4" },
        },
    ]);

    /* 1. Two Fortuners with correct locations */
    const search = await runTool("searchInventory", ctx, { query: "Fortuner", limit: 5 });
    assert(search.ok && search.count === 2, `expected 2 Fortuners, got ${search.count}`);
    const locs = search.vehicles.map((v) => v.location).sort();
    assert(locs.includes("Centurion") && locs.includes("Sandton"), `locations: ${locs.join(", ")}`);
    console.log("✓ 1. Two Fortuners found with Centurion + Sandton locations");

    /* 2. Location mismatch warning */
    const cmp = compareRecommendedVehicleLocations(search.vehicles);
    assert(cmp.sameLocation === false, "locations must differ");
    assert(/Centurion/.test(cmp.warning) && /Sandton/.test(cmp.warning), "warning mentions both branches");
    const promptLoc = formatLocationComparisonForPrompt(search.vehicles);
    assert(promptLoc.includes("different locations"), "prompt location block present");
    assert(search.locationComparison?.sameLocation === false, "searchInventory exposes locationComparison");
    console.log("✓ 2. Location mismatch warning when vehicles at different branches");

    /* 3. Drive type — no false 4x4 claim metadata */
    const fwd = search.vehicles.find((v) => v.stockNumber === "CM-FT-2019");
    const fourByFour = search.vehicles.find((v) => v.stockNumber === "CM-FT-2020");
    assert(fwd?.is4x4 === false, "2019 FWD must not be is4x4");
    assert(fwd?.canClaimOffRoad === false, "2019 FWD must not claim off-road");
    assert(fourByFour?.is4x4 === true, "2020 4x4 must be is4x4");
    const fwdNorm = normalizeDriveType("FrontWheelDrive");
    assert(fwdNorm.is4x4 === false && fwdNorm.canClaimOffRoad === false, "normalizeDriveType FWD");
    const awdNorm = normalizeDriveType("4x4");
    assert(awdNorm.is4x4 === true && awdNorm.canClaimOffRoad === true, "normalizeDriveType 4x4");
    console.log("✓ 3. Drive type mapped — FWD not 4x4, 4x4 confirmed from metadata");

    /* 4. Name not parsed from availability phrase */
    assert(parseExplicitCustomerName("I'm available on that day") === null, "availability phrase not a name");
    assert(parseExplicitCustomerName("im available on that day") === null, "lowercase availability not a name");
    console.log("✓ 4. 'Available on that day' not parsed as customer name");

    /* 5. Truth hierarchy prompt rules present */
    assert(/TRUTH HIERARCHY/i.test(WHATSAPP_SALES_TRUTH_RULES), "truth hierarchy in prompt");
    assert(/DRIVE TYPE \/ 4x4/i.test(WHATSAPP_SALES_TRUTH_RULES), "drive rules in prompt");
    assert(/LOCATION VERIFICATION/i.test(WHATSAPP_SALES_TRUTH_RULES), "location rules in prompt");
    assert(/NOVICE CUSTOMERS/i.test(WHATSAPP_SALES_TRUTH_RULES), "novice customer rules in prompt");
    const prompt = buildWhatsAppSystemPrompt({
        companyId: COMPANY_ID,
        companyName: "Central Motors",
        customer: { displayName: "Spencer" },
        agent: { systemPrompt: "You are Sarah at Central Motors." },
    });
    assert(prompt.includes("TRUTH HIERARCHY"), "assembled prompt includes truth hierarchy");
    console.log("✓ 5. Truth hierarchy + drive/location/novice prompt rules present");

    /* 6. Needs-based recommendation reason (not spec dump) */
    const reason = buildInventoryRecommendationReason(fourByFour, {
        familySize: 5,
        customerRequirements: ["family practicality", "capability"],
    });
    assert(reason && !/R449/.test(reason), `reason should not be price dump: ${reason}`);
    assert(/family|space|diesel|wear|option/i.test(reason), `needs-based reason: ${reason}`);
    console.log("✓ 6. Recommendation reason is needs-based, not spec dump");

    /* 7. Multi booking — second vehicle same slot triggers CUSTOMER_SLOT_CONFLICT */
    const slot1 = futureSlotIso(6, 10, 0);
    const book1 = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-ft-2019",
        scheduledAt: slot1,
        customerName: "Spencer",
    });
    assert(book1.ok === true, `first booking: ${book1.error || ""}`);

    const conflict = await runTool("checkTestDriveAvailability", ctx, {
        vehicleId: "veh-ft-2020",
        scheduledAt: slot1,
    });
    assert(conflict.code === "CUSTOMER_SLOT_CONFLICT", `expected CUSTOMER_SLOT_CONFLICT, got ${conflict.code}`);
    assert(conflict.suggestedSlots?.length >= 1, "staggered slot suggested");
    console.log("✓ 7. Multi-booking same slot — CUSTOMER_SLOT_CONFLICT with stagger suggestion");

    /* 8. Staggered second booking succeeds */
    const staggerTime = conflict.suggestedSlots[0].slotStart;
    const book2 = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-ft-2020",
        scheduledAt: staggerTime,
        customerName: "Spencer",
    });
    assert(book2.ok === true, `staggered booking: ${book2.error || ""}`);
    console.log("✓ 8. Staggered second booking succeeds");

    /* 9. getCustomerBookings returns exactly 2 active DB bookings */
    const bookings = await runTool("getCustomerBookings", ctx, { statusFilter: "upcoming" });
    assert(bookings.ok === true, "bookings lookup ok");
    assert(bookings.count === 2, `expected 2 upcoming bookings, got ${bookings.count}`);
    assert(bookings.upcoming.length === 2, "upcoming array has 2");
    assert(!bookings.upcoming.some((b) => b.status === "cancelled"), "no cancelled in upcoming");
    console.log("✓ 9. getCustomerBookings returns exactly 2 DB bookings (no phantom third)");

    /* 10. Authoritative booking block excludes cancelled, no invented extras */
    const authBlock = formatAuthoritativeBookingBlock(bookings);
    assert(/do NOT invent extra bookings/i.test(authBlock), "authoritative block warns against invention");
    const bookingLines = authBlock.split("\n").filter((l) => l.startsWith("- bookingId:"));
    assert(bookingLines.length === 2, `structured block has 2 lines, got ${bookingLines.length}`);
    console.log("✓ 10. Authoritative booking block lists only active DB records");

    /* 11. Reschedule flow — cancel + rebook same vehicleId */
    const bookingToMove = bookings.upcoming.find((b) => b.vehicleId === "veh-ft-2019");
    assert(bookingToMove?.bookingId, "booking id for reschedule");
    const cancel = await runTool("cancelTestDrive", ctx, { bookingId: bookingToMove.bookingId });
    assert(cancel.ok === true, `cancel: ${cancel.error || ""}`);

    const newSlot = futureSlotIso(7, 11, 30);
    const rebook = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-ft-2019",
        scheduledAt: newSlot,
        customerName: "Spencer",
    });
    assert(rebook.ok === true, `rebook: ${rebook.error || ""}`);
    assert(rebook.vehicleId === "veh-ft-2019", "same vehicleId on rebook");

    const afterReschedule = await runTool("getCustomerBookings", ctx, { statusFilter: "upcoming" });
    assert(afterReschedule.count === 2, "still 2 upcoming after reschedule");
    const moved = afterReschedule.upcoming.find((b) => b.vehicleId === "veh-ft-2019");
    assert(moved?.bookingId !== bookingToMove.bookingId, "new booking id after reschedule");
    console.log("✓ 11. Reschedule via cancel + rebook with same vehicleId");

    /* 12. Date parsing — August 28 resolves to future date, not wrong year */
    const aug28 = parseScheduledInput({ scheduledAt: "August 28 11am" });
    assert(aug28.ok === true && aug28.hasExplicitTime, "August 28 11am parses");
    assert(aug28.dateTime.getMonth() === 7, "month is August (0-indexed 7)");
    assert(aug28.dateTime.getDate() === 28, "day is 28");
    assert(aug28.dateTime.getTime() >= Date.now() - 60000, "August 28 is in the future");
    const expectedAug = futureAugust28();
    assert(aug28.dateTime.getFullYear() === expectedAug.getFullYear(), "correct year for August 28");
    console.log("✓ 12. August 28 datetime parsing uses correct future year");

    /* 13. Filter preservation — any price + body type (Spencer b3f4673 regression) */
    let salesContext = mergeSalesContext({}, extractSalesSignals("My budget is R350,000"));
    assert(getActivePurchaseBudgetFilter(salesContext).maxPrice === 350000, "budget filter set");
    salesContext = mergeSalesContext(salesContext, extractSalesSignals("Actually any price is fine"));
    assert(salesContext.budgetOpen === true, "any price clears budget");
    assert(getActivePurchaseBudgetFilter(salesContext).open === true, "filter open");
    salesContext = mergeSalesContext(salesContext, extractSalesSignals("Show me SUVs"));
    assert(salesContext.bodyType === "SUV", "SUV body type active");
    const suvSearch = await runTool("searchInventory", { ...ctx, salesContext }, { query: "SUV", limit: 5 });
    assert(suvSearch.ok && suvSearch.count >= 1, "SUV search still works after any price");
    console.log("✓ 13. Any-price + body type filter preservation (no regression)");

    console.log("\nAll Spencer test-drive journey verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
