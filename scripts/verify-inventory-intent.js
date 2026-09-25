#!/usr/bin/env node
/**
 * Step 6 — deterministic inventory browse intent verification.
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const {
        isInventoryBrowseIntent,
        shouldPreloadInventorySearch,
        buildInventorySearchArgs,
        formatAuthoritativeInventoryBlock,
    } = await import("../services/conversation/inventoryIntent.js");

    console.log("\nInventory intent verification\n");

    assert(isInventoryBrowseIntent("What SUVs do you have?"), "SUV browse intent");
    assert(isInventoryBrowseIntent("What cars do you have in stock?"), "cars in stock intent");
    assert(isInventoryBrowseIntent("Show me your inventory"), "show inventory intent");
    assert(!isInventoryBrowseIntent("Book a test drive for Friday"), "not booking intent");
    console.log("✓ isInventoryBrowseIntent detects stock browse phrases");

    assert(
        shouldPreloadInventorySearch("What SUVs do you have?"),
        "should preload SUV browse"
    );
    assert(
        !shouldPreloadInventorySearch("Hi", { isGreeting: true }),
        "skip preload on greeting"
    );
    assert(
        !shouldPreloadInventorySearch("What did I book?"),
        "skip preload on booking recap"
    );
    assert(
        !shouldPreloadInventorySearch("Show me pictures of the Fortuner"),
        "skip preload on gallery intent"
    );
    assert(
        !shouldPreloadInventorySearch("Any Hilux available for test drive on Friday?"),
        "skip preload on test-drive availability"
    );
    console.log("✓ shouldPreloadInventorySearch excludes non-browse intents");

    const args = buildInventorySearchArgs("What SUVs do you have?", { familySize: 5 });
    assert(args.bodyType === "SUV", `expected SUV bodyType, got ${args.bodyType}`);
    assert(args.query.includes("SUVs"), "query preserved");
    assert(args.minSeats === 5, "family size flows to minSeats");
    console.log("✓ buildInventorySearchArgs extracts bodyType and context");

    const block = formatAuthoritativeInventoryBlock({
        ok: true,
        message: "Found 2 vehicles.",
        vehicles: [
            { vehicleId: "veh-1", title: "2022 Toyota Fortuner" },
            { vehicleId: "veh-2", title: "2021 Ford Everest" },
        ],
    });
    assert(block.includes("AUTHORITATIVE INVENTORY"), "inventory block header");
    assert(block.includes("vehicle cards automatically"), "reminds LLM not to duplicate cards");
    assert(block.includes("veh-1"), "includes vehicle ids");
    console.log("✓ formatAuthoritativeInventoryBlock for prompt injection");

    const { _resetMemoryInventoryForTests, seedVehicles } = await import(
        "../services/inventory/inventoryService.js"
    );
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { runTool } = await import("../services/tools/toolRunner.js");
    const { initAiTools } = await import("../services/tools/index.js");

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    initAiTools();

    const COMPANY_ID = "verify-inventory-intent-co";
    await seedVehicles(COMPANY_ID, [
        {
            vehicleId: "suv-intent-1",
            stockNumber: "CM-SUV-1",
            title: "2022 Toyota Fortuner 2.8",
            make: "Toyota",
            model: "Fortuner",
            year: 2022,
            bodyType: "SUV",
            price: 549900,
            availability: "available",
            images: ["https://centralmotorsrtb.co.za/wp-content/uploads/fortuner.jpg"],
        },
    ]);

    const result = await runTool(
        "searchInventory",
        {
            companyId: COMPANY_ID,
            customerPhone: "27810000777",
            channel: "whatsapp",
            inboundMessage: "What SUVs do you have?",
            salesContext: {},
        },
        buildInventorySearchArgs("What SUVs do you have?")
    );
    assert(result.ok !== false, `searchInventory should succeed, got ${result.code || result.error}`);
    assert(result.vehicles?.length >= 1, "returns SUV inventory");
    console.log("✓ searchInventory executes for preloaded SUV browse args");

    console.log("\nAll inventory intent checks passed.\n");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
