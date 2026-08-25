/**
 * Seed Central Motors Rustenburg pilot tenant (central-motors-rtb):
 * - Company profile (Rustenburg, centralmotorsrtb.co.za)
 * - Sarah AI employee (real inventory via searchInventory / Postgres)
 * - WhatsApp sandbox phone → central-motors-rtb when CENTRAL_MOTORS_PILOT=true
 *
 * Does not import inventory — use scripts/import-central-motors-inventory.js.
 * Does not remove demo-central-motors — demo stays available for local dev without pilot flag.
 */
import { getCompany, createCompany } from "../tenants/companyService.js";
import { createAiEmployee, listAiEmployees } from "../tenants/aiEmployeeService.js";
import { saveKnowledgeDocument, listKnowledgeDocuments } from "../tenants/knowledgeService.js";
import {
    CENTRAL_MOTORS_RTB_COMPANY_ID,
    CENTRAL_MOTORS_DEFAULT_LOCATION,
} from "../inventory/adapters/centralMotorsRtbAdapter.js";
import {
    CENTRAL_MOTORS_PHONE_NUMBER_ID,
    CENTRAL_MOTORS_COMPANY_ID,
} from "./seedDemoTenants.js";
import { isCentralMotorsPilotMode } from "./centralMotorsPilot.js";
import {
    findActiveWhatsAppIntegrationByPhoneNumberId,
    upsertWhatsAppIntegration,
    warmPhoneResolutionCache,
    disconnectIntegration,
    clearPhoneResolutionCache,
} from "../tenants/integrationService.js";

const PILOT_COMPANY = {
    name: "Central Motors Rustenburg",
    industry: "Automotive",
    plan: "business",
    status: "active",
    email: "info@centralmotorsrtb.co.za",
    phone: "+27 14 000 0000",
    website: "https://centralmotorsrtb.co.za",
    whatsappConnected: true,
};

const PILOT_AGENT = {
    id: "rtb-agent-sarah",
    name: "Sarah",
    role: "sales_consultant",
    roleLabel: "Sales Consultant",
    personality: "sales_driven",
    isDefault: true,
    companyName: "Central Motors Rustenburg",
    systemPrompt:
        "You are Sarah, a knowledgeable and friendly sales consultant at Central Motors Rustenburg, a vehicle dealership in Rustenburg, North West, South Africa. You help customers find vehicles from our live inventory, book test drives, and answer questions about finance and trade-ins. Our website is centralmotorsrtb.co.za.",
    greetingMessage:
        "Hi there! I'm Sarah from Central Motors Rustenburg. Looking for your next vehicle? I'd love to help you find the perfect match.",
    knowledgeBaseId: "rtb-kb-1",
};

const PILOT_KNOWLEDGE = [
    {
        id: "rtb-kn-faq-hours",
        title: "Business Hours",
        content:
            "Central Motors Rustenburg operates Monday to Friday 8:00 AM–5:00 PM, and Saturdays 8:00 AM–1:00 PM. Closed Sundays and public holidays.",
        type: "faq",
    },
    {
        id: "rtb-kn-faq-location",
        title: "Visit Us",
        content: `Visit Central Motors Rustenburg at our dealership in ${CENTRAL_MOTORS_DEFAULT_LOCATION}. Book a test drive via WhatsApp or call us. Bring a valid driver's licence.`,
        type: "faq",
    },
    {
        id: "rtb-kn-faq-website",
        title: "Website",
        content: "Browse our full inventory at https://centralmotorsrtb.co.za",
        type: "faq",
    },
];

async function upsertPilotKnowledgeDocs(companyId, knowledgeBaseId, agentId) {
    const existing = await listKnowledgeDocuments(companyId, { knowledgeBaseId });
    const existingById = new Map(existing.filter((d) => d.id).map((d) => [d.id, d]));
    let upserted = 0;

    for (const doc of PILOT_KNOWLEDGE) {
        const prior = doc.id ? existingById.get(doc.id) : null;
        if (prior && prior.source !== "pilot-seed") continue;

        await saveKnowledgeDocument({
            companyId,
            knowledgeBaseId,
            agentId,
            ...doc,
            source: "pilot-seed",
        });
        upserted += 1;
    }

    return upserted;
}

async function reassignSandboxPhoneFromDemo() {
    const existing = await findActiveWhatsAppIntegrationByPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
    if (!existing?.companyId || existing.companyId === CENTRAL_MOTORS_RTB_COMPANY_ID) {
        return false;
    }

    if (existing.companyId === CENTRAL_MOTORS_COMPANY_ID && existing.id) {
        await disconnectIntegration(CENTRAL_MOTORS_COMPANY_ID, existing.id);
        clearPhoneResolutionCache();
        console.log(
            "[seed] Pilot mode: disconnected demo-central-motors WhatsApp integration for sandbox phone"
        );
        return true;
    }

    return false;
}

async function ensurePilotWhatsAppIntegration(companyId) {
    await reassignSandboxPhoneFromDemo();

    const existingIntegration = await findActiveWhatsAppIntegrationByPhoneNumberId(
        CENTRAL_MOTORS_PHONE_NUMBER_ID
    );
    if (existingIntegration?.companyId === companyId) {
        warmPhoneResolutionCache(CENTRAL_MOTORS_PHONE_NUMBER_ID, existingIntegration);
        return false;
    }

    const integration = await upsertWhatsAppIntegration(companyId, {
        channel: "whatsapp",
        provider: "whatsapp",
        phoneNumberId: CENTRAL_MOTORS_PHONE_NUMBER_ID,
        businessAccountId: process.env.WABA_ID || null,
        displayPhoneNumber: process.env.DISPLAY_PHONE_NUMBER || null,
        status: "active",
        credentialsSource: "env",
    });
    warmPhoneResolutionCache(CENTRAL_MOTORS_PHONE_NUMBER_ID, integration);
    console.log(
        "[seed] Pilot mode: WhatsApp integration",
        CENTRAL_MOTORS_PHONE_NUMBER_ID,
        "→",
        companyId
    );
    return true;
}

/**
 * Seed central-motors-rtb tenant when pilot mode is enabled.
 * @returns {Promise<{ enabled: boolean, companyId?: string, seeded?: object }>}
 */
export async function seedCentralMotorsPilotIfEnabled() {
    if (!isCentralMotorsPilotMode()) {
        return { enabled: false };
    }

    const companyId = CENTRAL_MOTORS_RTB_COMPANY_ID;
    const seeded = { company: false, agent: false, integration: false, knowledge: 0 };

    if (!(await getCompany(companyId))) {
        await createCompany(companyId, PILOT_COMPANY);
        seeded.company = true;
    }

    const existingAgents = await listAiEmployees(companyId);
    let agentRecord = existingAgents.find((a) => a.isDefault) || existingAgents[0] || null;

    if (!agentRecord) {
        agentRecord = await createAiEmployee(companyId, PILOT_AGENT);
        seeded.agent = true;
        console.log("[seed] Loaded Sarah (central-motors-rtb) AI employee");
    }

    const knowledgeBaseId = agentRecord.knowledgeBaseId || PILOT_AGENT.knowledgeBaseId;
    seeded.knowledge = await upsertPilotKnowledgeDocs(companyId, knowledgeBaseId, agentRecord.id);
    seeded.integration = await ensurePilotWhatsAppIntegration(companyId);

    return { enabled: true, companyId, seeded };
}
