#!/usr/bin/env node
/**
 * Verify customer identity — explicit names beat WhatsApp contact / company names.
 *
 * Usage:
 *   node scripts/verify-customer-identity.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import {
    parseExplicitCustomerName,
    getCustomerDisplayName,
    upsertCustomerFromWhatsApp,
    getCustomer,
    isLikelyCompanyName,
} from "../services/customerService.js";
import { buildWhatsAppSystemPrompt } from "../services/ai-core/whatsappConversationPrompt.js";
import { extractMemoryFacts } from "../services/intelligence/conversationIntelligence.js";
import { _resetMemoryAppointmentsForTests } from "../services/database/appointmentRepository.js";

const COMPANY_ID = "verify-customer-identity-co";
const COMPANY_NAME = "Central Motors";
const PHONE = "27810000999";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    resetMemoryTenantStore();
    _resetMemoryAppointmentsForTests();

    assert(parseExplicitCustomerName("My name is Spencer") === "Spencer", "parseExplicitCustomerName: My name is");
    assert(parseExplicitCustomerName("I'm Spencer") === "Spencer", "parseExplicitCustomerName: I'm");
    assert(parseExplicitCustomerName("Call me Spencer") === "Spencer", "parseExplicitCustomerName: Call me");
    assert(parseExplicitCustomerName("Hello there") === null, "parseExplicitCustomerName: no name");
    console.log("✓ parseExplicitCustomerName detects explicit introductions");

    assert(isLikelyCompanyName("Ziric Media"), "Ziric Media is company-like");
    assert(isLikelyCompanyName("Central Motors", { companyName: "Central Motors" }), "Central Motors matches tenant");
    assert(!isLikelyCompanyName("Spencer"), "Spencer is not company-like");
    console.log("✓ isLikelyCompanyName filters business names");

    await upsertCustomerFromWhatsApp(PHONE, {
        companyId: COMPANY_ID,
        contactName: "Ziric Media",
        messagePreview: "Hi",
    });

    let customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(
        getCustomerDisplayName(customer, { contactName: "Ziric Media", companyName: COMPANY_NAME }) === null,
        "WhatsApp contact Ziric Media must not become customer name"
    );
    console.log("✓ company-like WhatsApp contactName rejected as customer name");

    await upsertCustomerFromWhatsApp(PHONE, {
        companyId: COMPANY_ID,
        contactName: "Ziric Media",
        messagePreview: "My name is Spencer",
        explicitName: parseExplicitCustomerName("My name is Spencer"),
    });

    customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer.displayName === "Spencer", `displayName should be Spencer, got ${customer.displayName}`);
    assert(customer.name === "Spencer", `name should be Spencer, got ${customer.name}`);
    assert(
        getCustomerDisplayName(customer, { contactName: "Ziric Media", companyName: COMPANY_NAME }) === "Spencer",
        "getCustomerDisplayName should return Spencer"
    );
    console.log("✓ explicit name Spencer stored and takes precedence");

    const prompt = buildWhatsAppSystemPrompt({
        companyId: COMPANY_ID,
        companyName: COMPANY_NAME,
        customer,
        contactName: "Ziric Media",
        agent: {
            name: "Sarah",
            systemPrompt: "You are Sarah at Central Motors.",
        },
    });
    assert(prompt.includes("Customer name: Spencer"), "Prompt must include Spencer");
    assert(!prompt.includes("Customer name: Ziric Media"), "Prompt must not use Ziric Media as customer name");
    assert(!prompt.includes("Customer name: Central Motors"), "Prompt must not use Central Motors as customer name");
    console.log("✓ whatsappConversationPrompt uses Spencer, not company name");

    const memoryFacts = extractMemoryFacts("My name is Spencer");
    assert(memoryFacts.some((f) => f.includes("Spencer")), "extractMemoryFacts captures customer name");
    console.log("✓ extractMemoryFacts captures explicit customer name");

    resetMemoryTenantStore();
    await upsertCustomerFromWhatsApp(PHONE, {
        companyId: COMPANY_ID,
        contactName: "Ziric Media",
        messagePreview: "My name is Spencer",
        explicitName: "Spencer",
    });

    customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer.displayName === "Spencer", "Spencer persists after simulated restart");
    assert(
        getCustomerDisplayName(customer, { contactName: "Ziric Media", companyName: COMPANY_NAME }) === "Spencer",
        "After restart, name recall is still Spencer"
    );

    const recallPrompt = buildWhatsAppSystemPrompt({
        companyId: COMPANY_ID,
        companyName: COMPANY_NAME,
        customer,
        contactName: "Ziric Media",
        agent: { name: "Sarah", systemPrompt: "You are Sarah." },
    });
    assert(recallPrompt.includes("Customer name: Spencer"), "Recall prompt uses Spencer after restart");
    console.log("✓ customer name survives storage re-init (simulated restart)");

    console.log("\nAll customer identity verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
