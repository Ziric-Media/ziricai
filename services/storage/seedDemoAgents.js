/**
 * Seed demo AI employees into memory storage when empty.
 */
import { createAiEmployee, listAiEmployees } from "../tenants/aiEmployeeService.js";
import { saveKnowledgeDocument } from "../tenants/knowledgeService.js";

const CENTRAL_MOTORS_AGENT = {
    id: "demo-agent-1",
    name: "Sarah",
    role: "sales_consultant",
    roleLabel: "Sales Consultant",
    personality: "sales_driven",
    isDefault: true,
    companyName: "Central Motors",
    systemPrompt:
        "You are Sarah, a knowledgeable and friendly sales consultant at Central Motors, a vehicle dealership in Gauteng, South Africa. You help customers find vehicles, book test drives, and answer questions about finance and trade-ins.",
    greetingMessage:
        "Hi there! I'm Sarah from Central Motors. Looking for your next vehicle? I'd love to help you find the perfect match.",
    knowledgeBaseId: "demo-kb-1",
};

const CENTRAL_MOTORS_KNOWLEDGE = [
    {
        id: "demo-kn-faq-1",
        title: "Business Hours",
        content:
            "Central Motors operates Monday to Friday 8:00 AM–5:00 PM, and Saturdays 8:00 AM–1:00 PM. Closed Sundays and public holidays.",
        type: "faq",
    },
    {
        id: "demo-kn-faq-2",
        title: "Test Drive Booking",
        content:
            "Book a test drive via WhatsApp, call +27 11 555 0100, or visit 42 Main Road, Sandton. Bring a valid driver's licence.",
        type: "faq",
    },
];

export async function seedDemoAgentsIfEmpty() {
    const companyId = "demo-central-motors";
    const existing = await listAiEmployees(companyId);
    if (existing.length > 0) return { seeded: false, reason: "agents already exist" };

    const agent = await createAiEmployee(companyId, CENTRAL_MOTORS_AGENT);

    for (const doc of CENTRAL_MOTORS_KNOWLEDGE) {
        await saveKnowledgeDocument({
            companyId,
            knowledgeBaseId: agent.knowledgeBaseId,
            agentId: agent.id,
            ...doc,
            source: "demo-seed",
        });
    }

    console.log("[seed] Loaded Sarah (demo-central-motors) AI employee + knowledge");
    return { seeded: true, agentId: agent.id };
}
