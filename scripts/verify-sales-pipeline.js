#!/usr/bin/env node
/**
 * Sales pipeline — lead stages, ranked recommendations, stage-appropriate closing.
 *
 * Usage:
 *   node scripts/verify-sales-pipeline.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const {
        LEAD_STAGES,
        normalizeLeadStage,
        advanceLeadStage,
        extractSalesSignals,
        mergeSalesContext,
        buildRankedRecommendations,
        formatRankedRecommendationsForPrompt,
        getLeadStageObjective,
        formatClosingSuggestion,
        formatSalesContextForPrompt,
    } = await import("../services/conversation/salesContext.js");
    const { buildWhatsAppSystemPrompt, WHATSAPP_ACTION_TOOL_RULES } = await import(
        "../services/ai-core/whatsappConversationPrompt.js"
    );

    console.log("\nSales pipeline verification\n");

    /* 1. Lead stage vocabulary */
    assert(LEAD_STAGES.includes("NEW"), "NEW stage");
    assert(LEAD_STAGES.includes("VEHICLES_RECOMMENDED"), "VEHICLES_RECOMMENDED stage");
    assert(LEAD_STAGES.includes("VEHICLE_SELECTED"), "VEHICLE_SELECTED stage");
    assert(LEAD_STAGES.includes("TEST_DRIVE_BOOKED"), "TEST_DRIVE_BOOKED stage");
    assert(LEAD_STAGES.includes("FINANCE_INTEREST"), "FINANCE_INTEREST stage");
    assert(LEAD_STAGES.includes("HUMAN_HANDOFF"), "HUMAN_HANDOFF stage");
    console.log("✓ 1. Lead stage vocabulary (P4)");

    /* 2. Legacy stage normalization */
    assert(normalizeLeadStage("OPTIONS_PRESENTED") === "VEHICLES_RECOMMENDED", "legacy OPTIONS_PRESENTED");
    assert(normalizeLeadStage("NEW_LEAD") === "NEW", "legacy NEW_LEAD");
    assert(advanceLeadStage("DISCOVERY", "VEHICLE_SELECTED") === "VEHICLE_SELECTED", "forward advance");
    assert(advanceLeadStage("VEHICLE_SELECTED", "DISCOVERY") === "VEHICLE_SELECTED", "no backward advance");
    console.log("✓ 2. Legacy stage normalization");

    /* 3. Stage inference from conversation signals */
    const bookSignals = extractSalesSignals("I'd like to book a test drive for Friday", {
        customer: { salesContext: { leadStage: "VEHICLE_SELECTED" } },
    });
    assert(bookSignals.leadStage === "TEST_DRIVE_REQUESTED", `book intent -> TEST_DRIVE_REQUESTED, got ${bookSignals.leadStage}`);

    const financeSignals = extractSalesSignals("What would the monthly payment be?", {
        customer: { salesContext: { leadStage: "TEST_DRIVE_COMPLETED" } },
    });
    assert(financeSignals.leadStage === "FINANCE_INTEREST", `finance intent -> FINANCE_INTEREST, got ${financeSignals.leadStage}`);
    console.log("✓ 3. Stage inference from conversation signals");

    /* 4. Ranked recommendations */
    const vehicles = [
        { vehicleId: "v1", title: "2024 Honda Amaze", price: 219950, mileage: 40205, seatingCapacity: 5, make: "Honda", model: "Amaze", year: 2024 },
        { vehicleId: "v2", title: "2020 Toyota Corolla", price: 199900, mileage: 80000, seatingCapacity: 5, make: "Toyota", model: "Corolla", year: 2020 },
        { vehicleId: "v3", title: "2021 Ford Everest", price: 449900, mileage: 55000, seatingCapacity: 7, make: "Ford", model: "Everest", year: 2021 },
        { vehicleId: "v4", title: "2019 BMW X3", price: 399900, mileage: 70000, seatingCapacity: 5, make: "BMW", model: "X3", year: 2019 },
    ];
    const profile = { familySize: 5, confirmedPurchaseBudget: 250000, bodyType: "sedan" };
    const ranked = buildRankedRecommendations(profile, vehicles);
    assert(ranked.length === 3, `top 3 ranked, got ${ranked.length}`);
    assert(ranked[0].rankLabel?.includes("Best Match #1"), "rank #1 badge");
    assert(ranked[1].rankLabel?.includes("Best Match #2"), "rank #2 badge");
    assert(ranked[2].rankLabel?.includes("Alternative #3"), "rank #3 badge");
    assert(ranked.every((v) => v.reason), "each ranked vehicle has a reason");
    const rankedPrompt = formatRankedRecommendationsForPrompt(ranked);
    assert(rankedPrompt.includes("🥇 Best Match #1"), "ranked prompt has #1");
    assert(rankedPrompt.includes("🥉 Alternative #3"), "ranked prompt has #3");
    console.log("✓ 4. Ranked recommendations (P2)");

    /* 5. Stage objective + closing in prompt context */
    const ctx = mergeSalesContext(
        { leadStage: "VEHICLE_SELECTED", preferredVehicle: "Honda Amaze" },
        { lastRecommendedVehicles: ranked }
    );
    const promptBlock = formatSalesContextForPrompt({ salesContext: ctx });
    assert(promptBlock.includes("Lead stage: VEHICLE_SELECTED"), "stage in prompt");
    assert(promptBlock.includes("Stage objective:"), "objective in prompt");
    assert(promptBlock.includes("RANKED RECOMMENDATIONS"), "ranked block in prompt");

    const vehicleSelectedClose = formatClosingSuggestion({ leadStage: "VEHICLE_SELECTED" });
    assert(vehicleSelectedClose.includes("Proactive slot close"), "VEHICLE_SELECTED close");
    assert(vehicleSelectedClose.includes("what time"), "discourages open-ended what time");

    const financeClose = formatClosingSuggestion({ leadStage: "FINANCE_INTEREST" });
    assert(financeClose.includes("monthly"), "FINANCE_INTEREST close mentions monthly");

    const systemPrompt = buildWhatsAppSystemPrompt({ companyName: "Central Motors", customer: { salesContext: ctx } });
    assert(systemPrompt.includes("anything else"), "prompt forbids anything else");
    assert(WHATSAPP_ACTION_TOOL_RULES.includes("09:00 opening is valid"), "prompt has opening time rule");
    console.log("✓ 5. Stage objective + closing in prompt (P5)");

    console.log("\nAll sales pipeline checks passed.\n");
}

main().catch((err) => {
    console.error("\nVerification failed:", err.message);
    process.exit(1);
});
