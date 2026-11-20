/**
 * Smile More Dentists (smilemore-demo) — Sarah agent, knowledge centre, and Discover profile.
 * Idempotent; safe on every API startup after ensureSmilemoreDentalProductionTenant().
 */
import { getCompany, updateCompany } from "../tenants/companyService.js";
import { createAiEmployee, listAiEmployees, updateAiEmployee } from "../tenants/aiEmployeeService.js";
import { saveKnowledgeDocument, listKnowledgeDocuments } from "../tenants/knowledgeService.js";
import {
    SMILEMORE_DEMO_COMPANY_ID,
    SMILEMORE_CONTACTS,
    SMILEMORE_LOCATIONS,
    SMILEMORE_SERVICES,
    SMILEMORE_PUBLIC_TEAM,
    SMILEMORE_PUBLIC_WEBSITE,
    smilemorePracticePrompt,
} from "../dental/smilemorePractice.js";
import {
    hydrateBusinessDirectory,
    getBusinessDirectoryEntry,
    saveBusinessDirectoryEntry,
} from "../users/businessDirectoryService.js";
import { buildSmilemorePilotDiscoverProfile } from "../network/pilotListings.js";

const KNOWLEDGE_BASE_ID = "kb-smilemore-demo";

const SMILEMORE_AGENT = {
    id: "smilemore-sarah-reception",
    name: "Sarah",
    role: "receptionist",
    roleLabel: "Reception",
    personality: "warm_professional",
    isDefault: true,
    companyName: "Smile More Dentists",
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    systemPrompt: `You are Sarah, the AI reception assistant for Smile More Dentists in Rustenburg, South Africa.
You help patients and visitors with practice information, appointment requests, and directions — using the company Knowledge Centre and published practice facts only.
Official website: ${SMILEMORE_PUBLIC_WEBSITE} — share it when someone wants to browse online.
You know the public team by name but do not promise which clinician will treat someone. You do not quote fees, diagnose, or prescribe.
For urgent symptoms, give the published phone and emergency contact and advise them to seek urgent care.`,
    greetingMessage:
        "Hello — I'm Sarah from Smile More Dentists. I can help with our locations, services, hours, and booking requests. How can I help you today?",
};

function locationLines() {
    return SMILEMORE_LOCATIONS.map((loc) => `- ${loc.label}`).join("\n");
}

function serviceLines() {
    return SMILEMORE_SERVICES.map((s) => `- ${s.label}`).join("\n");
}

export function buildSmilemoreKnowledgeDocs() {
    const practiceBlock = smilemorePracticePrompt();
    return [
        {
            id: "sm-kn-about",
            title: "About Smile More Dentists",
            type: "faq",
            content: `Smile More Dentists is a family-centred dental practice in Rustenburg, North West, with a family practice at City Square Mall and a paediatric practice at Senthadi Centre.

${practiceBlock}

Browse services and contact details on the official website: ${SMILEMORE_PUBLIC_WEBSITE}`,
        },
        {
            id: "sm-kn-website",
            title: "Official website",
            type: "faq",
            content: `The official Smile More Dentists website is ${SMILEMORE_PUBLIC_WEBSITE}. Share this link when patients want to read more online. Sarah App chat can still help with bookings and questions.`,
        },
        {
            id: "sm-kn-locations",
            title: "Practice locations",
            type: "faq",
            content: `Smile More Dentists locations:\n${locationLines()}\n\nEach location focuses on family or paediatric care respectively. Always confirm which site suits the visit.`,
        },
        {
            id: "sm-kn-hours",
            title: "Opening hours",
            type: "faq",
            content:
                "Published hours: Monday to Friday 09:00–17:00, Saturday 09:00–13:00 (Africa/Johannesburg). Closed Sunday. Hours are not live availability — use the booking diary for appointments.",
        },
        {
            id: "sm-kn-services",
            title: "Services we advertise",
            type: "faq",
            content: `Advertised visit types and services (not a price list):\n${serviceLines()}\n\nFees are confirmed at reception. Company Sarah does not quote amounts in chat.`,
        },
        {
            id: "sm-kn-team",
            title: "Our dentists and team",
            type: "faq",
            content: `Public team names: ${SMILEMORE_PUBLIC_TEAM.join(", ")}. These are public names only; a preference is not a promise of who will treat the patient.`,
        },
        {
            id: "sm-kn-contact",
            title: "Contact",
            type: "faq",
            content: `Phone: ${SMILEMORE_CONTACTS.phone}
Email: ${SMILEMORE_CONTACTS.email}
Emergency contact: ${SMILEMORE_CONTACTS.emergency}
Website: ${SMILEMORE_PUBLIC_WEBSITE}`,
        },
    ];
}

async function upsertSmilemoreKnowledgeDocs(companyId, knowledgeBaseId, agentId) {
    const existing = await listKnowledgeDocuments(companyId, { knowledgeBaseId });
    const byId = new Map(existing.filter((d) => d.id).map((d) => [d.id, d]));
    let upserted = 0;

    for (const doc of buildSmilemoreKnowledgeDocs()) {
        const prior = byId.get(doc.id);
        if (prior && prior.source !== "pilot-seed" && prior.source !== "smilemore-seed") continue;
        if (prior?.content === doc.content && prior?.title === doc.title) continue;
        await saveKnowledgeDocument({
            companyId,
            knowledgeBaseId,
            agentId,
            ...doc,
            source: "smilemore-seed",
        });
        upserted += 1;
    }
    return upserted;
}

async function ensureSmilemoreAgent(companyId) {
    const agents = await listAiEmployees(companyId);
    let agent = agents.find((a) => a.isDefault) || agents.find((a) => a.id === SMILEMORE_AGENT.id) || agents[0];

    if (!agent) {
        agent = await createAiEmployee(companyId, { ...SMILEMORE_AGENT });
        return { agent, created: true };
    }

    const knowledgeBaseId = agent.knowledgeBaseId || KNOWLEDGE_BASE_ID;
    const needsUpdate =
        !agent.isDefault ||
        agent.knowledgeBaseId !== KNOWLEDGE_BASE_ID ||
        !String(agent.systemPrompt || "").includes("smilemoredentists.co.za");

    if (needsUpdate) {
        agent = await updateAiEmployee(companyId, agent.id, {
            ...SMILEMORE_AGENT,
            knowledgeBaseId,
        });
    }
    return { agent, created: false };
}

async function ensureSmilemoreDiscoverProfile(companyId) {
    await hydrateBusinessDirectory({ force: true });
    const existing = getBusinessDirectoryEntry(companyId) || { companyId, discoverability: "public" };
    const profile = buildSmilemorePilotDiscoverProfile();
    const contact = { ...(existing.contact || {}), ...profile.contact };
    const needsWebsite = !contact.website || !String(contact.website).includes("smilemoredentists.co.za");
    const needsDesc = !existing.shortDescription || !String(existing.shortDescription).includes("smilemoredentists");

    if (
        existing.displayName === profile.displayName &&
        existing.address &&
        Array.isArray(existing.hours) &&
        existing.hours.length &&
        !needsWebsite &&
        !needsDesc &&
        Array.isArray(existing.products) &&
        existing.products.length
    ) {
        return { updated: false };
    }

    await saveBusinessDirectoryEntry(companyId, {
        discoverability: "public",
        ...profile,
        contact,
        verified: existing.verified ?? profile.verified,
        verificationSummary: existing.verificationSummary ?? profile.verificationSummary,
        seeded: existing.seeded ?? true,
    });
    return { updated: true };
}

/**
 * @returns {Promise<{ knowledgeUpserted: number, agentCreated: boolean, discoverUpdated: boolean }>}
 */
export async function seedSmilemoreDentalSarahPilot() {
    const companyId = SMILEMORE_DEMO_COMPANY_ID;
    const company = await getCompany(companyId);
    if (!company) {
        return { skipped: true, reason: "company missing" };
    }

    if (company.website !== SMILEMORE_PUBLIC_WEBSITE) {
        await updateCompany(companyId, { website: SMILEMORE_PUBLIC_WEBSITE });
    }

    const { agent, created } = await ensureSmilemoreAgent(companyId);
    const knowledgeBaseId = agent.knowledgeBaseId || KNOWLEDGE_BASE_ID;
    const knowledgeUpserted = await upsertSmilemoreKnowledgeDocs(companyId, knowledgeBaseId, agent.id);
    const { updated: discoverUpdated } = await ensureSmilemoreDiscoverProfile(companyId);

    return {
        knowledgeUpserted,
        agentCreated: created,
        discoverUpdated,
    };
}