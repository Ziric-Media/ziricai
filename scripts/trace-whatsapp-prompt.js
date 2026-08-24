#!/usr/bin/env node
/**
 * Trace WhatsApp system prompt + knowledge retrieval for a sample message.
 *
 * Usage:
 *   node scripts/trace-whatsapp-prompt.js "What Hilux options are in my budget?"
 */
import {
    buildWhatsAppSystemPrompt,
    isGreetingMessage,
    WHATSAPP_INVENTORY_RULES,
} from "../services/ai-core/whatsappConversationPrompt.js";
import { searchKnowledgeForQuery } from "../services/tenants/knowledgeService.js";
import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { seedDemoTenantsIfMissing, CENTRAL_MOTORS_COMPANY_ID } from "../services/storage/seedDemoTenants.js";

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

await resetMemoryTenantStore();
await seedDemoTenantsIfMissing();

const customer = {
    phone: "27849000523",
    name: "John Smith",
    companyId: CENTRAL_MOTORS_COMPANY_ID,
    companyName: "Central Motors",
    aiSummary: "High-intent buyer interested in white Toyota Hilux, budget R450k.",
};

const agent = {
    name: "Sarah",
    systemPrompt:
        "You are Sarah, a knowledgeable and friendly sales consultant at Central Motors, a vehicle dealership in Gauteng, South Africa.",
    greetingMessage:
        "Hi there! I'm Sarah from Central Motors. Looking for your next vehicle? I'd love to help you find the perfect match.",
};

const text = process.argv[2] || "What Hilux options are in my budget around R450k?";
console.log("Message:", text);
console.log("isGreeting:", isGreetingMessage(text));

const kb = isGreetingMessage(text)
    ? { context: "", sources: [] }
    : await searchKnowledgeForQuery(CENTRAL_MOTORS_COMPANY_ID, text).catch(() => ({
          context: "",
          sources: [],
      }));

console.log("Knowledge sources:", kb.sources?.join(", ") || "(none)");
console.log("Knowledge context length:", kb.context?.length || 0);
if (kb.context) {
    console.log("\n--- KNOWLEDGE CONTEXT (preview) ---\n");
    console.log(kb.context.slice(0, 1200));
}

console.log("\n--- INVENTORY RULES IN PROMPT ---\n");
console.log(WHATSAPP_INVENTORY_RULES.includes("NEVER promise") ? "✓ Inventory rules present" : "✗ Missing");

console.log("\n--- SYSTEM PROMPT ---\n");
console.log(
    buildWhatsAppSystemPrompt({
        agent,
        companyId: CENTRAL_MOTORS_COMPANY_ID,
        companyName: "Central Motors",
        customer,
        contactName: "John",
    })
);
