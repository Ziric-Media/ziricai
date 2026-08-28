#!/usr/bin/env node
/**
 * P1.2 — Sales execution & test-drive completion verification.
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const {
        stripVehicleListingProseFromText,
        buildVehicleOutboundPlan,
    } = await import("../services/conversation/vehicleOutboundPlan.js");
    const { buildInventoryRecommendationReason } = await import("../services/conversation/salesContext.js");
    const {
        isSchedulingDelegationIntent,
        isSchedulingDateIntent,
    } = await import("../services/conversation/schedulingContext.js");
    const { resolveSchedulingVehicleReference } = await import("../services/conversation/vehicleReference.js");
    const { evaluateTestDriveAvailability } = await import("../services/tools/testDriveAvailability.js");

    console.log("\nP1.2 — sales execution verification\n");

    const sampleVehicles = [
        {
            vehicleId: "veh-1",
            title: "2024 Honda Amaze 1.2 Comfort Auto",
            price: 219950,
            mileage: 40205,
            transmission: "Automatic",
            fuel: "Petrol",
            bodyType: "Sedan",
            location: "Rustenburg, North West",
            images: ["https://centralmotorsrtb.co.za/wp-content/uploads/a.jpg"],
            rank: 1,
            rankLabel: "🥇 Best Match #1",
            reason: "A practical choice for a small family without stepping into a larger SUV.",
        },
    ];

    /* 1. Strip duplicate LLM spec lists */
    const llmDup = `I found some great options for you:

   - Price: R219,950
   - Mileage: 40,205 km
   - Location: Rustenburg, North West

Would you like to schedule a test drive?`;
    const stripped = stripVehicleListingProseFromText(llmDup, sampleVehicles);
    assert(!/Price:\s*R219/i.test(stripped), "bare price bullets stripped");
    assert(!/Mileage:/i.test(stripped), "bare mileage bullets stripped");
    console.log("✓ 1. Duplicate LLM spec lists stripped");

    /* 2. Single outbound pipeline — card then image without caption */
    const plan = buildVehicleOutboundPlan({
        toolResults: [{ tool: "searchInventory", ok: true, vehicles: sampleVehicles }],
        llmReply: llmDup,
        channel: "whatsapp",
    });
    assert(plan?.messages?.length >= 2, "plan has intro/card/image");
    const cardMsg = plan.messages.find((m) => m.type === "text" && m.text.includes("Honda Amaze"));
    const imageMsg = plan.messages.find((m) => m.type === "image");
    assert(cardMsg, "vehicle card present");
    assert(imageMsg && !imageMsg.caption, "hero image has no duplicate caption");
    assert(cardMsg.text.includes("Why I recommend it:") || cardMsg.text.includes("🚗 1."), "card has title");
    console.log("✓ 2. Canonical card + hero image (no caption duplicate)");

    /* 3. Needs-based recommendation */
    const reason = buildInventoryRecommendationReason(sampleVehicles[0], {
        familySize: 4,
        customerRequirements: ["small family", "modest budget", "practicality"],
        bodyType: "sedan",
    });
    assert(reason && /family|practical|modest|automatic/i.test(reason), `needs-based reason: ${reason}`);
    assert(!/R219/i.test(reason), "reason is not a spec dump");
    console.log("✓ 3. Needs-based recommendation reasoning");

    /* 4. Delegation intent */
    assert(isSchedulingDelegationIntent("choose a day and time for me"), "day and time delegation");
    assert(isSchedulingDelegationIntent("find a slot for me"), "find slot delegation");
    assert(isSchedulingDateIntent("next week wednesday"), "date intent");
    console.log("✓ 4. Delegation and date intents");

    /* 5. Scheduling vehicle resolution */
    const resolved = resolveSchedulingVehicleReference(
        { preferredVehicle: "Honda Amaze", lastRecommendedVehicles: sampleVehicles },
        sampleVehicles,
        null
    );
    assert(resolved?.vehicleId === "veh-1", "resolves preferred vehicle for scheduling");
    console.log("✓ 5. Scheduling vehicle resolution");

    /* 6. Auto-select earliest slot */
    const { seedVehicles, _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    _resetMemoryInventoryForTests();
    _resetMemoryAppointmentsForTests();
    const COMPANY_ID = "verify-sales-execution-co";
    await seedVehicles(COMPANY_ID, [
        {
            vehicleId: "veh-exec-1",
            stockNumber: "CM-EXEC-1",
            title: "2024 Honda Amaze 1.2 Comfort Auto",
            make: "Honda",
            model: "Amaze",
            year: 2024,
            price: 219950,
            availability: "available",
            images: ["https://centralmotorsrtb.co.za/wp-content/uploads/a.jpg"],
        },
    ]);

    const nextAvail = await evaluateTestDriveAvailability(COMPANY_ID, {
        vehicleId: "veh-exec-1",
        autoSelectNext: true,
    });
    assert(
        nextAvail.code === "AUTO_SELECT" || nextAvail.available === true,
        `auto-select: ${nextAvail.code}`
    );
    console.log("✓ 6. Auto-select earliest slot (delegation path)");

    console.log("\nAll P1.2 sales execution checks passed.\n");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
