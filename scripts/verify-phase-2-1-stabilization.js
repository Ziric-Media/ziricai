#!/usr/bin/env node
/**
 * Phase 2.1 — Sarah sales & conversion stabilization regression.
 *
 * Usage:
 *   node scripts/verify-phase-2-1-stabilization.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const ANCHOR_FRIDAY = "2026-08-28";

async function main() {
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { _resetMemoryInventoryForTests, seedVehicles } = await import("../services/inventory/inventoryService.js");
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    const { getMaxConcurrentPerSlot } = await import("../services/tools/availability.js");
    const { _resetMemoryCustomersForTests } = await import("../services/database/customerRepository.js");
    const {
        parseExplicitCustomerName,
        isValidExplicitCustomerName,
    } = await import("../services/customerIdentity.js");
    const { persistExplicitCustomerName, getCustomer } = await import("../services/customerService.js");
    const { resolveRelativeDateLabel } = await import("../services/conversation/schedulingContext.js");
    const { parseScheduledInput, toBusinessDateString, dateFromBusinessLocal } = await import(
        "../services/tools/availability.js"
    );
    const {
        formatVehicleCustomerCard,
        formatRecommendationLine,
    } = await import("../services/conversation/vehiclePresentation.js");
    const { buildGalleryOutboundPlan } = await import("../services/conversation/vehicleOutboundPlan.js");
    const { buildWhatsAppSystemPrompt, WHATSAPP_ACTION_TOOL_RULES } = await import(
        "../services/ai-core/whatsappConversationPrompt.js"
    );
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const { futureSlotIso } = await import("./testHelpers/scheduling.js");

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    _resetMemoryAppointmentsForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-phase-2-1-co";
    const PHONE = "27810000777";

    console.log("\nPhase 2.1 — sales stabilization verification\n");

    /* 1. Name never from "still waiting" */
    assert(parseExplicitCustomerName("im still waiting") === null, "im still waiting must not become a name");
    assert(parseExplicitCustomerName("I'm still waiting") === null, "I'm still waiting must not become a name");
    assert(!isValidExplicitCustomerName("Still Waiting"), "Still Waiting is not a valid explicit name");
    console.log("✓ 1. Name never derived from 'still waiting'");

    /* 2. Explicit name from introduction */
    assert(parseExplicitCustomerName("My name is Spencer") === "Spencer", "My name is Spencer");
    assert(parseExplicitCustomerName("I'm Spencer") === "Spencer", "I'm Spencer");
    assert(parseExplicitCustomerName("Spencer here") === "Spencer", "Spencer here");
    await persistExplicitCustomerName(PHONE, "Spencer", { companyId: COMPANY_ID });
    const customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer.displayName === "Spencer", "Spencer persisted");
    const prompt = buildWhatsAppSystemPrompt({
        companyId: COMPANY_ID,
        companyName: "Central Motors",
        customer,
        agent: { name: "Sarah", systemPrompt: "You are Sarah." },
    });
    assert(prompt.includes("Customer name: Spencer"), "prompt uses Spencer");
    assert(prompt.includes("NEVER derive customerName"), "prompt forbids phrase-based names");
    console.log("✓ 2. Explicit name from 'My name is Spencer'");

    /* 3–5. Booking semantics + auto-recover + inventory check on slot failure */
    await seedVehicles(COMPANY_ID, [
        {
            vehicleId: "veh-everest-21",
            stockNumber: "CM-EV-21",
            make: "Ford",
            model: "Everest",
            year: 2021,
            availability: "available",
            title: "2021 Ford Everest",
        },
    ]);

    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Spencer",
        agentId: "agent-sales",
        channel: "whatsapp",
    };

    const slot12 = futureSlotIso(3, 12);
    const max = getMaxConcurrentPerSlot();
    for (let i = 0; i < max; i++) {
        const fillerId = `27810000${200 + i}`;
        const fill = await runTool(
            "bookTestDrive",
            { ...ctx, customerId: fillerId },
            { vehicleId: "veh-everest-21", scheduledAt: slot12, customerName: "Filler" }
        );
        assert(fill.ok === true, `fill slot ${i}: ${fill.error}`);
    }

    const slotFail = await runTool("bookTestDrive", { ...ctx, customerId: "27810000299" }, {
        vehicleId: "veh-everest-21",
        scheduledAt: slot12,
        customerName: "Spencer",
    });
    assert(slotFail.ok === false, "full slot must fail booking");
    assert(slotFail.code === "SLOT_UNAVAILABLE", `expected SLOT_UNAVAILABLE, got ${slotFail.code}`);
    assert(slotFail.code !== "VEHICLE_NOT_IN_INVENTORY", "slot failure must not be inventory failure");
    assert(slotFail.inventoryVerified === true, "inventory verified on slot failure");
    assert(
        slotFail.nextAlternative?.slotLabel || slotFail.suggestedSlots?.length,
        "auto-recover offers next slot or alternatives"
    );
    assert(
        WHATSAPP_ACTION_TOOL_RULES.includes("inventoryVerified"),
        "prompt distinguishes booking failure from inventory"
    );
    console.log("✓ 3. SLOT_UNAVAILABLE ≠ VEHICLE_NOT_IN_INVENTORY");
    console.log("✓ 4. Auto-recover next slot on booking failure");
    console.log("✓ 5. Inventory verified on slot-only booking failure");

    const soldVehicle = await runTool("bookTestDrive", ctx, {
        vehicleId: "veh-no-such",
        scheduledAt: futureSlotIso(4, 10),
    });
    assert(soldVehicle.code === "INVALID_VEHICLE", "missing vehicle is not slot issue");

    /* 6. Relative dates — next Tuesday from Aug 28 = Sep 1 */
    const dateCases = [
        ["today", "2026-08-28"],
        ["tomorrow", "2026-08-29"],
        ["this Friday", "2026-08-28"],
        ["next Friday", "2026-09-04"],
        ["this Tuesday", "2026-09-01"],
        ["next Tuesday", "2026-09-01"],
        ["next Wednesday", "2026-09-02"],
        ["next week", "2026-08-31"],
        ["this coming Friday", "2026-08-28"],
    ];
    for (const [label, expected] of dateCases) {
        const resolved = resolveRelativeDateLabel(label, ANCHOR_FRIDAY);
        assert(resolved === expected, `${label} from ${ANCHOR_FRIDAY} -> ${expected}, got ${resolved}`);
    }
    const conflicting = resolveRelativeDateLabel("next Tuesday, September 8th", ANCHOR_FRIDAY);
    assert(conflicting === "2026-09-01", `weekday wins over wrong calendar date: ${conflicting}`);
    const parsedTuesday = parseScheduledInput({ date: "next Tuesday", contextDate: ANCHOR_FRIDAY });
    assert(
        toBusinessDateString(parsedTuesday.dateOnly || parsedTuesday.dateTime) === "2026-09-01",
        "parseScheduledInput stores Sep 1 for next Tuesday"
    );
    console.log("✓ 6. Relative dates resolve in Africa/Johannesburg (next Tuesday = Sep 1)");

    /* 7. Gallery sends images, not duplicate titles */
    const galleryPlan = buildGalleryOutboundPlan({
        vehicles: [
            {
                vehicleId: "veh-everest-21",
                title: "2021 Ford Everest",
                images: [
                    "https://example.com/e1.jpg",
                    "https://example.com/e2.jpg",
                    "https://example.com/e3.jpg",
                ],
            },
        ],
        llmReply: "Here are photos of the Everest you asked for.",
        channel: "whatsapp",
    });
    assert(galleryPlan != null, "gallery plan expected");
    const images = galleryPlan.messages.filter((m) => m.type === "image");
    assert(images.length === 3, `3 gallery images, got ${images.length}`);
    assert(images.every((m) => !m.caption), "gallery images must not duplicate vehicle title captions");
    const galleryIntro = galleryPlan.messages.find((m) => m.type === "text");
    assert(galleryIntro?.text.includes("Everest"), "gallery intro names the vehicle");
    assert(
        galleryPlan.messages.filter((m) => m.type === "text" && m.text.includes("💰")).length === 0,
        "no duplicate vehicle spec cards in gallery plan"
    );
    console.log("✓ 7. Gallery sends native images without duplicate titles");

    /* 8. Vehicle card recommendation reason */
    const reason = "7-seat capacity fits your family of 5";
    const card = formatVehicleCustomerCard(
        {
            title: "2021 Ford Everest",
            price: 449900,
            mileage: 55000,
            seatingCapacity: 7,
            reason,
            financeEstimate: "From R9,800/month",
        },
        0
    );
    assert(formatRecommendationLine({ reason }).includes("Why Sarah recommends it"), "recommendation line format");
    assert(card.includes("🚗"), "vehicle emoji in title");
    assert(card.includes("Why Sarah recommends it"), "card includes recommendation reason");
    assert(card.includes("Finance Estimate"), "card includes finance when present");
    console.log("✓ 8. Vehicle card has recommendation reason field");

    console.log("\nAll Phase 2.1 stabilization checks passed.\n");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
