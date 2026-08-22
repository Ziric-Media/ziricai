#!/usr/bin/env node
import { buildWhatsAppSystemPrompt, isGreetingMessage } from "../services/ai-core/whatsappConversationPrompt.js";
import { searchKnowledgeForQuery } from "../services/tenants/knowledgeService.js";

const customer = {
    phone: "27849000523",
    name: "John Smith",
    companyId: "demo-central-motors",
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

const text = "Hi";
console.log("Message:", text);
console.log("isGreeting:", isGreetingMessage(text));

const kb = isGreetingMessage(text)
    ? { context: "", sources: [] }
    : await searchKnowledgeForQuery("demo-central-motors", text).catch(() => ({ context: "", sources: [] }));

console.log("Knowledge context length:", kb.context?.length || 0);
console.log("\n--- SYSTEM PROMPT ---\n");
console.log(
    buildWhatsAppSystemPrompt({
        agent,
        companyId: "demo-central-motors",
        companyName: "Central Motors",
        customer,
        contactName: "John",
    })
);
