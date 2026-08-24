#!/usr/bin/env node
/**
 * Verify multi-tenant in-memory isolation: customers, conversations, memories, integrations.
 *
 * Usage:
 *   STORAGE_BACKEND=memory node scripts/verify-tenant-isolation.js
 *
 * LIMITATIONS: In-memory storage is lost on server restart. This script documents that behavior.
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { clearPhoneResolutionCache } from "../services/tenants/integrationService.js";
import { bootstrapIntegrationConfig } from "../services/integrations/types/integrationConfig.js";
import {
    seedDemoTenantsIfMissing,
    CENTRAL_MOTORS_PHONE_NUMBER_ID,
    CENTRAL_MOTORS_COMPANY_ID,
    ECONO_FUNERALS_PHONE_NUMBER_ID,
    ECONO_FUNERALS_COMPANY_ID,
} from "../services/storage/seedDemoTenants.js";
import { resolveCompanyFromPhoneNumberId } from "../services/integrations/types/integrationConfig.js";
import { getDefaultAiEmployee } from "../services/tenants/aiEmployeeService.js";
import { upsertCustomerFromWhatsApp, getCustomer } from "../services/customerService.js";
import {
    saveInboundMessage,
    saveOutboundMessage,
    getConversation,
} from "../services/conversationService.js";
import { storeMemory, getMemoryContext } from "../services/memory/aiMemoryService.js";
import { buildWhatsAppSystemPrompt, WHATSAPP_INVENTORY_RULES } from "../services/ai-core/whatsappConversationPrompt.js";
import { extractMemoryFacts } from "../services/intelligence/conversationIntelligence.js";
import { executeAction } from "../services/automation/actionExecutor.js";
import { EventTypes } from "../services/events/eventTypes.js";
import { searchKnowledgeForQuery, listKnowledgeDocuments } from "../services/tenants/knowledgeService.js";
import { CENTRAL_MOTORS_INVENTORY_DOCS } from "../services/storage/demoCentralMotorsInventory.js";

const TEST_PHONE = "27821234567";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    console.log("\nMulti-tenant isolation verification");
    console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}`);
    console.log("NOTE: In-memory data is lost on server restart.\n");

    resetMemoryTenantStore();
    clearPhoneResolutionCache();
    bootstrapIntegrationConfig();
    await seedDemoTenantsIfMissing();

    /* ── Integration registry routing ── */
    const centralCompany = await resolveCompanyFromPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
    assert(centralCompany === CENTRAL_MOTORS_COMPANY_ID, `Central Motors routing failed: ${centralCompany}`);
    console.log("✓ WhatsApp registry: Central Motors phone → demo-central-motors");

    const econoCompany = await resolveCompanyFromPhoneNumberId(ECONO_FUNERALS_PHONE_NUMBER_ID);
    assert(econoCompany === ECONO_FUNERALS_COMPANY_ID, `Econo Funerals routing failed: ${econoCompany}`);
    console.log("✓ WhatsApp registry: Econo Funerals phone → demo-econo-funerals");

    process.env.NODE_ENV = "production";
    clearPhoneResolutionCache();
    const unknownProd = await resolveCompanyFromPhoneNumberId("9999999999999");
    assert(unknownProd === null, `Production must not fallback-route unknown phone: ${unknownProd}`);
    console.log("✓ Production: unknown phone_number_id → null (no hard-coded fallback)");
    process.env.NODE_ENV = "development";

    /* ── AI employee isolation ── */
    const sarah = await getDefaultAiEmployee(CENTRAL_MOTORS_COMPANY_ID);
    const grace = await getDefaultAiEmployee(ECONO_FUNERALS_COMPANY_ID);
    assert(sarah?.name === "Sarah", `Expected Sarah, got ${sarah?.name}`);
    assert(grace?.name === "Grace", `Expected Grace, got ${grace?.name}`);
    console.log("✓ Company A → Sarah, Company B → Grace (AI employee isolation)");

    /* ── Tenant-scoped customers (same phone, different companies) ── */
    await upsertCustomerFromWhatsApp(TEST_PHONE, {
        companyId: CENTRAL_MOTORS_COMPANY_ID,
        contactName: "Thabo Motors",
        messagePreview: "Looking for a Hilux",
    });
    await upsertCustomerFromWhatsApp(TEST_PHONE, {
        companyId: ECONO_FUNERALS_COMPANY_ID,
        contactName: "Thabo Funerals",
        messagePreview: "Funeral packages enquiry",
    });

    const motorsCustomer = await getCustomer(TEST_PHONE, { companyId: CENTRAL_MOTORS_COMPANY_ID });
    const funeralsCustomer = await getCustomer(TEST_PHONE, { companyId: ECONO_FUNERALS_COMPANY_ID });
    assert(motorsCustomer?.name === "Thabo Motors", `Motors customer name wrong: ${motorsCustomer?.name}`);
    assert(funeralsCustomer?.name === "Thabo Funerals", `Funerals customer name wrong: ${funeralsCustomer?.name}`);
    console.log("✓ Same phone creates isolated customers per company");

    /* ── Repeat recognition ── */
    await upsertCustomerFromWhatsApp(TEST_PHONE, {
        companyId: CENTRAL_MOTORS_COMPANY_ID,
        contactName: "Thabo Motors",
        messagePreview: "Follow-up on Hilux",
    });
    const repeatCustomer = await getCustomer(TEST_PHONE, { companyId: CENTRAL_MOTORS_COMPANY_ID });
    assert(repeatCustomer?.name === "Thabo Motors", "Repeat customer not recognized");
    assert((repeatCustomer?.totalMessages || 0) >= 2, "Message count should increment");
    console.log("✓ Repeat customer recognized within same company");

    /* ── Conversation persistence ── */
    await saveInboundMessage(TEST_PHONE, "Hi, I need a test drive", {
        companyId: CENTRAL_MOTORS_COMPANY_ID,
        channel: "whatsapp",
    });
    await saveOutboundMessage(TEST_PHONE, "Sure! Which model interests you?", {
        companyId: CENTRAL_MOTORS_COMPANY_ID,
        channel: "whatsapp",
    });
    const history = await getConversation(TEST_PHONE, 20, {
        companyId: CENTRAL_MOTORS_COMPANY_ID,
        channel: "whatsapp",
    });
    assert(history.length >= 2, `Expected conversation history, got ${history.length}`);
    assert(history.some((m) => m.role === "user"), "Missing user message");
    assert(history.some((m) => m.role === "assistant"), "Missing assistant message");
    console.log("✓ Conversation messages persist per tenant");

    /* ── Memory retrieval ── */
    await storeMemory(TEST_PHONE, sarah.id, "Customer interested in Toyota Hilux", {
        companyId: CENTRAL_MOTORS_COMPANY_ID,
    });
    await storeMemory(TEST_PHONE, grace.id, "Customer asking about funeral packages", {
        companyId: ECONO_FUNERALS_COMPANY_ID,
    });

    const motorsMemory = await getMemoryContext(TEST_PHONE, sarah.id, {
        companyId: CENTRAL_MOTORS_COMPANY_ID,
    });
    const funeralsMemory = await getMemoryContext(TEST_PHONE, grace.id, {
        companyId: ECONO_FUNERALS_COMPANY_ID,
    });
    assert(motorsMemory.includes("Hilux"), `Motors memory missing: ${motorsMemory}`);
    assert(funeralsMemory.includes("funeral"), `Funerals memory missing: ${funeralsMemory}`);
    assert(!motorsMemory.includes("funeral packages"), "Memory leaked across tenants");
    console.log("✓ Memory retrieval is tenant-scoped");

    /* ── Budget memory extraction ── */
    const budgetFacts = extractMemoryFacts("I'm working with a budget of R500,000");
    assert(
        budgetFacts.some((f) => /R500,?000/i.test(f)),
        `Budget amount not captured: ${budgetFacts.join(", ")}`
    );
    const followUpFacts = extractMemoryFacts("Ok so that budget can get me a great vehicle?");
    assert(
        followUpFacts.some((f) => /budget/i.test(f)),
        `Follow-up budget reference not captured: ${followUpFacts.join(", ")}`
    );
    console.log("✓ extractMemoryFacts captures budget amounts");

    /* ── Automation auto-reply gating ── */
    const skipped = await executeAction(
        { type: "send_message", config: { template: "quotation_followup" } },
        {
            companyId: CENTRAL_MOTORS_COMPANY_ID,
            type: EventTypes.MESSAGE_RECEIVED,
            payload: { phone: TEST_PHONE, text: "What price range are the Fortuners?", aiReplyPending: true },
        },
        { id: "tpl-pricing-quotation", name: "Pricing enquiry → Send quotation" }
    );
    assert(skipped.skipped === true, "Automation must skip send_message when AI reply is pending");
    console.log("✓ Pricing automation skips duplicate WhatsApp auto-reply");

    /* ── Production prompt gating ── */
    process.env.NODE_ENV = "production";
    const prodPrompt = buildWhatsAppSystemPrompt({
        companyId: CENTRAL_MOTORS_COMPANY_ID,
        companyName: "Central Motors",
        agent: null,
    });
    assert(!prodPrompt.includes("Sarah from Central Motors"), "Production must not use DEMO_TENANT_AGENTS fallback");
    process.env.NODE_ENV = "development";
    const devPrompt = buildWhatsAppSystemPrompt({
        companyId: CENTRAL_MOTORS_COMPANY_ID,
        agent: null,
    });
    assert(devPrompt.includes("Sarah"), "Dev fallback should include Sarah when no agent");
    assert(devPrompt.includes("NEVER promise"), "Dev prompt must include inventory honesty rules");
    console.log("✓ DEMO_TENANT_AGENTS gated to non-production");
    assert(WHATSAPP_INVENTORY_RULES.includes("searchInventory"), "Platform inventory rules must reference searchInventory tool");
    console.log("✓ WhatsApp inventory rules require searchInventory tool");

    /* ── Demo inventory knowledge seeded ── */
    const kbDocs = await listKnowledgeDocuments(CENTRAL_MOTORS_COMPANY_ID);
    const inventoryDocs = kbDocs.filter((d) => d.type === "inventory");
    assert(
        inventoryDocs.length >= CENTRAL_MOTORS_INVENTORY_DOCS.length,
        `Expected ${CENTRAL_MOTORS_INVENTORY_DOCS.length} inventory docs, got ${inventoryDocs.length}`
    );
    assert(
        inventoryDocs.some((d) => /hilux/i.test(`${d.title} ${d.content}`)),
        "Inventory must include Hilux listings"
    );
    console.log(`✓ Central Motors inventory seeded (${inventoryDocs.length} docs)`);

    const hiluxKb = await searchKnowledgeForQuery(CENTRAL_MOTORS_COMPANY_ID, "Hilux in my budget R450k");
    assert(hiluxKb.context.length > 0, "Hilux budget query must retrieve inventory context");
    assert(
        hiluxKb.sources.some((s) => /hilux/i.test(s)),
        `Hilux sources missing: ${hiluxKb.sources.join(", ")}`
    );
    console.log("✓ Knowledge retrieval: Hilux budget query returns inventory");

    const fortunerKb = await searchKnowledgeForQuery(
        CENTRAL_MOTORS_COMPANY_ID,
        "What price range are the Fortuners?"
    );
    assert(fortunerKb.context.length > 0, "Fortuner price query must retrieve inventory context");
    assert(
        fortunerKb.sources.some((s) => /fortuner/i.test(s)),
        `Fortuner sources missing: ${fortunerKb.sources.join(", ")}`
    );
    console.log("✓ Knowledge retrieval: Fortuner price query returns inventory");

    const { searchInventory, getVehicleByStockNumber } = await import("../services/inventory/inventoryService.js");
    const canonical = await searchInventory(CENTRAL_MOTORS_COMPANY_ID, "Hilux");
    assert(canonical.length >= 1, "Canonical inventory must include Hilux vehicles");
    const hlx003 = await getVehicleByStockNumber(CENTRAL_MOTORS_COMPANY_ID, "CM-HLX-003");
    assert(hlx003?.vehicleId, "CM-HLX-003 must resolve in canonical inventory");
    assert(hlx003?.stockNumber === "CM-HLX-003", "Stock number normalized consistently");
    console.log(`✓ Canonical inventory seeded (${canonical.length}+ Hilux matches, CM-HLX-003 resolvable)`);

    console.log("\nAll tenant isolation checks passed.");
    console.log("\nRestart limitation: STORAGE_BACKEND=memory loses all tenant data on process exit.");
    console.log("Set STORAGE_BACKEND=firestore when Firebase billing is enabled for persistence.\n");
}

main().catch((err) => {
    console.error("\n✗", err.message);
    process.exit(1);
});
