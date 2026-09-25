#!/usr/bin/env node
/**
 * Step 7 — sales funnel turn guidance (stage-aware consultant flow).
 *
 * Usage:
 *   node scripts/verify-sales-funnel-turn.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const {
        deriveFunnelStep,
        buildSalesFunnelTurnGuidance,
        isReadyForInventorySearch,
        hasNeedSignals,
        SALES_FUNNEL_STEPS,
    } = await import("../services/conversation/salesFunnelTurn.js");
    const { extractSalesSignals, mergeSalesContext } = await import(
        "../services/conversation/salesContext.js"
    );
    const { buildWhatsAppSystemPrompt } = await import(
        "../services/ai-core/whatsappConversationPrompt.js"
    );

    console.log("\nSales funnel turn verification\n");

    /* 1. Funnel step vocabulary */
    assert(SALES_FUNNEL_STEPS.includes("GREETING"), "GREETING step");
    assert(SALES_FUNNEL_STEPS.includes("SEARCH_INVENTORY"), "SEARCH_INVENTORY step");
    assert(SALES_FUNNEL_STEPS.includes("TEST_DRIVE"), "TEST_DRIVE step");
    console.log("✓ 1. Funnel step vocabulary");

    /* 2. Greeting-only new thread → GREETING, no inventory search */
    const greetingStep = deriveFunnelStep({
        salesContext: { leadStage: "NEW" },
        isNewConversation: true,
        inboundMessage: "Hi",
    });
    assert(greetingStep === "GREETING", `greeting -> GREETING, got ${greetingStep}`);
    const greetingGuidance = buildSalesFunnelTurnGuidance({
        salesContext: { leadStage: "NEW" },
        isNewConversation: true,
        inboundMessage: "Hi",
    });
    assert(greetingGuidance.includes("Do NOT search inventory"), "greeting forbids inventory search");
    console.log("✓ 2. Greeting-only new thread");

    /* 3. Inventory browse → SEARCH_INVENTORY */
    const suvStep = deriveFunnelStep({
        salesContext: { leadStage: "NEW" },
        inboundMessage: "What SUVs do you have?",
        inventoryBrowseIntent: true,
    });
    assert(suvStep === "SEARCH_INVENTORY", `SUV browse -> SEARCH_INVENTORY, got ${suvStep}`);
    const suvGuidance = buildSalesFunnelTurnGuidance({
        salesContext: { leadStage: "VEHICLES_RECOMMENDED" },
        inboundMessage: "What SUVs do you have?",
        inventoryBrowseIntent: true,
        inventoryPreloaded: true,
    });
    assert(suvGuidance.includes("AUTHORITATIVE INVENTORY is pre-loaded"), "preloaded inventory guidance");
    assert(suvGuidance.includes("which vehicle interests them"), "gauge interest after inventory");
    console.log("✓ 3. Inventory browse intent");

    /* 4. Discovery without inventory intent — qualify first */
    assert(
        !isReadyForInventorySearch({ leadStage: "DISCOVERY" }),
        "empty discovery not ready for search"
    );
    assert(
        isReadyForInventorySearch({ leadStage: "DISCOVERY", familySize: 5 }),
        "family size qualifies for search"
    );
    assert(hasNeedSignals({ familySize: 4 }), "family size is need signal");
    const qualifyGuidance = buildSalesFunnelTurnGuidance({
        salesContext: { leadStage: "DISCOVERY" },
        inboundMessage: "I need something for my family",
    });
    assert(
        qualifyGuidance.includes("UNDERSTAND_NEED") || qualifyGuidance.includes("QUALIFY_BUDGET_TYPE"),
        "discovery guides qualification"
    );
    console.log("✓ 4. Discovery qualification gating");

    /* 5. Stage inference — inventory browse advances to VEHICLES_RECOMMENDED */
    const browseSignals = extractSalesSignals("What SUVs do you have?", {
        customer: { salesContext: { leadStage: "NEW" } },
    });
    assert(
        browseSignals.leadStage === "VEHICLES_RECOMMENDED",
        `inventory browse -> VEHICLES_RECOMMENDED, got ${browseSignals.leadStage}`
    );
    console.log("✓ 5. Inventory browse advances lead stage");

    /* 6. Test drive stage guidance */
    const tdGuidance = buildSalesFunnelTurnGuidance({
        salesContext: { leadStage: "VEHICLE_SELECTED", preferredVehicle: "Ford Everest" },
        inboundMessage: "I'd like to book a test drive",
    });
    assert(tdGuidance.includes("TEST_DRIVE"), "test drive funnel step");
    assert(tdGuidance.includes("earliest slot"), "proactive slot guidance");
    console.log("✓ 6. Test drive stage guidance");

    /* 7. System prompt includes funnel block */
    const ctx = mergeSalesContext(
        { leadStage: "VEHICLES_RECOMMENDED", familySize: 5 },
        {}
    );
    const systemPrompt = buildWhatsAppSystemPrompt({
        companyName: "Central Motors Rustenburg",
        customer: { salesContext: ctx },
        isNewConversation: false,
        inboundMessage: "Which one would you recommend?",
        historyLength: 4,
    });
    assert(systemPrompt.includes("THIS TURN — SALES FUNNEL"), "funnel block in system prompt");
    assert(systemPrompt.includes("Greeting → Understand need"), "funnel order in prompt");
    assert(systemPrompt.includes("RECOMMEND_VEHICLES"), "recommend stage in prompt");
    console.log("✓ 7. Funnel block in WhatsApp system prompt");

    console.log("\nAll sales funnel turn checks passed.\n");
}

main().catch((err) => {
    console.error("\nVerification failed:", err.message);
    process.exit(1);
});
