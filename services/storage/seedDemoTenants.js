/**
 * Seed demo tenants into in-memory (or Firestore) storage:
 * - Central Motors + Sarah + WhatsApp integration
 * - Econo Funerals + Grace + WhatsApp integration
 *
 * Integration registry resolves phone_number_id → companyId (no hard-coded routing in business logic).
 */
import { getCompany, createCompany } from "../tenants/companyService.js";
import { createAiEmployee, listAiEmployees } from "../tenants/aiEmployeeService.js";
import { saveKnowledgeDocument, listKnowledgeDocuments } from "../tenants/knowledgeService.js";
import { CENTRAL_MOTORS_INVENTORY_DOCS } from "./demoCentralMotorsInventory.js";
import { seedDemoInventoryFromDocs } from "../inventory/demoInventorySeed.js";
import {
    findActiveWhatsAppIntegrationByPhoneNumberId,
    upsertWhatsAppIntegration,
    warmPhoneResolutionCache,
} from "../tenants/integrationService.js";
import { isCentralMotorsPilotMode } from "./centralMotorsPilot.js";

export const CENTRAL_MOTORS_PHONE_NUMBER_ID = "1209265748933699";
export const CENTRAL_MOTORS_COMPANY_ID = "demo-central-motors";

export const ECONO_FUNERALS_PHONE_NUMBER_ID = "1209265748933700";
export const ECONO_FUNERALS_COMPANY_ID = "demo-econo-funerals";

const DEMO_TENANTS = [
    {
        companyId: CENTRAL_MOTORS_COMPANY_ID,
        phoneNumberId: CENTRAL_MOTORS_PHONE_NUMBER_ID,
        company: {
            name: "Central Motors",
            industry: "Automotive",
            plan: "business",
            status: "active",
            email: "info@centralmotors.co.za",
            phone: "+27 11 555 0100",
            whatsappConnected: true,
        },
        agent: {
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
        },
        knowledge: [
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
            ...CENTRAL_MOTORS_INVENTORY_DOCS,
        ],
    },
    {
        companyId: ECONO_FUNERALS_COMPANY_ID,
        phoneNumberId: ECONO_FUNERALS_PHONE_NUMBER_ID,
        company: {
            name: "Econo Funerals",
            industry: "Funeral Services",
            plan: "starter",
            status: "active",
            email: "info@ecnfunerals.co.za",
            phone: "+27 31 555 0300",
            whatsappConnected: true,
        },
        agent: {
            id: "demo-agent-3",
            name: "Grace",
            role: "compassion_counselor",
            roleLabel: "Compassion Counselor",
            personality: "empathetic",
            isDefault: true,
            companyName: "Econo Funerals",
            systemPrompt:
                "You are Grace, a compassionate counselor at Econo Funerals in South Africa. You support families with care and sensitivity regarding funeral packages, arrangements, and grief support.",
            greetingMessage:
                "Hello, I'm Grace from Econo Funerals. I'm here to support you with care and compassion. How may I assist you?",
            knowledgeBaseId: "demo-kb-3",
        },
        knowledge: [
            {
                id: "demo-kn-ef-1",
                title: "Funeral Packages",
                content:
                    "Econo Funerals offers Basic, Standard, and Premium packages. All include dignified care, chapel service, and transport. Premium adds floral arrangements and extended viewing hours.",
                type: "faq",
            },
            {
                id: "demo-kn-ef-2",
                title: "Office Hours",
                content:
                    "Econo Funerals is available Monday to Sunday 6:00 AM–10:00 PM. Emergency arrangements are handled 24/7.",
                type: "faq",
            },
        ],
    },
];

async function upsertDemoKnowledgeDocs(companyId, knowledgeBaseId, agentId, knowledge) {
    const existing = await listKnowledgeDocuments(companyId, { knowledgeBaseId });
    const existingById = new Map(existing.filter((d) => d.id).map((d) => [d.id, d]));
    let upserted = 0;

    for (const doc of knowledge) {
        const prior = doc.id ? existingById.get(doc.id) : null;
        if (prior && prior.source !== "demo-seed") continue;

        await saveKnowledgeDocument({
            companyId,
            knowledgeBaseId,
            agentId,
            ...doc,
            source: "demo-seed",
        });
        upserted += 1;
    }

    return upserted;
}

async function seedTenant(tenant) {
    const { companyId, phoneNumberId, company, agent, knowledge } = tenant;
    let seeded = { company: false, agent: false, integration: false, knowledge: 0 };

    const existingCompanyRecord = await getCompany(companyId);
    if (!existingCompanyRecord) {
        await createCompany(companyId, company);
        seeded.company = true;
    }

    const existingAgents = await listAiEmployees(companyId);
    let agentRecord = existingAgents.find((a) => a.isDefault) || existingAgents[0] || null;

    if (!agentRecord) {
        agentRecord = await createAiEmployee(companyId, agent);
        seeded.agent = true;
    }

    const knowledgeBaseId = agentRecord.knowledgeBaseId || agent.knowledgeBaseId;
    seeded.knowledge = await upsertDemoKnowledgeDocs(
        companyId,
        knowledgeBaseId,
        agentRecord.id,
        knowledge
    );

    const inventoryDocs = knowledge.filter((d) => d.type === "inventory" && String(d.content || "").includes("Stock Number:"));
    if (inventoryDocs.length) {
        await seedDemoInventoryFromDocs(companyId, inventoryDocs);
    }

    const skipWhatsAppForPilotDemo =
        isCentralMotorsPilotMode() && companyId === CENTRAL_MOTORS_COMPANY_ID;

    if (skipWhatsAppForPilotDemo) {
        console.log(
            "[seed] Pilot mode: skipping demo-central-motors WhatsApp integration (sandbox phone → central-motors-rtb)"
        );
    } else {
        const existingIntegration = await findActiveWhatsAppIntegrationByPhoneNumberId(phoneNumberId);
        if (existingIntegration?.companyId !== companyId) {
            const integration = await upsertWhatsAppIntegration(companyId, {
                channel: "whatsapp",
                provider: "whatsapp",
                phoneNumberId,
                businessAccountId: process.env.WABA_ID || null,
                displayPhoneNumber: process.env.DISPLAY_PHONE_NUMBER || null,
                status: "active",
                credentialsSource: "env",
            });
            warmPhoneResolutionCache(phoneNumberId, integration);
            seeded.integration = true;
            console.log("[seed] Loaded WhatsApp integration", phoneNumberId, "→", companyId);
        } else {
            warmPhoneResolutionCache(phoneNumberId, existingIntegration);
        }
    }

    return seeded;
}

export async function seedDemoTenantsIfMissing() {
    const results = {};
    for (const tenant of DEMO_TENANTS) {
        results[tenant.companyId] = await seedTenant(tenant);
    }
    return results;
}

/** @deprecated Use seedDemoTenantsIfMissing — kept for backward compatibility. */
export async function seedDemoWhatsAppIntegrationIfMissing() {
    const results = await seedDemoTenantsIfMissing();
    return {
        seeded: Boolean(results[CENTRAL_MOTORS_COMPANY_ID]?.integration),
        reason: results[CENTRAL_MOTORS_COMPANY_ID]?.integration ? "seeded" : "integration already exists",
        integrationId: CENTRAL_MOTORS_PHONE_NUMBER_ID,
    };
}

/** @deprecated Use seedDemoTenantsIfMissing — kept for backward compatibility. */
export async function seedDemoAgentsIfEmpty() {
    const results = await seedDemoTenantsIfMissing();
    const central = results[CENTRAL_MOTORS_COMPANY_ID];
    if (central?.agent) {
        console.log("[seed] Loaded Sarah (demo-central-motors) AI employee + knowledge");
        return { seeded: true, agentId: "demo-agent-1" };
    }
    return { seeded: false, reason: "agents already exist" };
}
