/**
 * BCS-02 — Babes Car Sales: automotive preset activation, Sarah KB, and agent branding.
 * Does not import inventory or touch Central Motors.
 */
import { getIndustryPresetDocument, isPresetStatusActivatable } from "../platform/industryPresetRegistry.js";
import { AUTOMOTIVE_PRESET_ID } from "./automotiveIndustryPreset.js";
import { getCompany, updateCompany } from "../tenants/companyService.js";
import { listAiEmployees, updateAiEmployee } from "../tenants/aiEmployeeService.js";
import { saveKnowledgeDocument, listKnowledgeDocuments } from "../tenants/knowledgeService.js";

export const BABES_CAR_SALES_COMPANY_ID = "babes-car-sales-cc";
export const BABES_DISPLAY_NAME = "Babes Car Sales CC";

export const BABES_BUSINESS = Object.freeze({
    website: "https://babescarsales.co.za/",
    phone: "014 594 2985",
    email: "babescarsales43@gmail.com",
    address: "26 Heystek Street, Rustenburg, South Africa",
    salesContacts: ["Michelle", "Omar"],
});

const AUTOMOTIVE_VERSION = "1.0.0";

export const BABES_SARAH_AGENT = {
    name: "Sarah",
    role: "sales_consultant",
    roleLabel: "Sales Consultant",
    personality: "sales_driven",
    systemPrompt: `You are Sarah, a knowledgeable and friendly sales consultant at Babes Car Sales CC, a used and new vehicle dealership in Rustenburg, North West, South Africa. You help customers find vehicles from Babes' inventory, book test drives, and answer questions about finance assistance, trade-ins, vehicle sourcing and nationwide delivery. Our website is babescarsales.co.za. You know colleagues Michelle and Omar from company knowledge — introduce them when customers want a named sales contact; never invent staff.`,
    greetingMessage:
        "Hi! I'm Sarah from Babes Car Sales in Rustenburg. Looking for your next vehicle, finance, or a trade-in? I'd love to help.",
};

export const BABES_KNOWLEDGE_DOCS = [
    {
        id: "babes-kn-hours",
        title: "Business hours",
        type: "faq",
        content: `Babes Car Sales CC hours:
• Monday–Friday: 08:00–17:00
• Saturday: 08:00–13:00
• Sunday: closed
Visit us at ${BABES_BUSINESS.address}. Phone ${BABES_BUSINESS.phone}.`,
    },
    {
        id: "babes-kn-location",
        title: "Visit us",
        type: "faq",
        content: `Babes Car Sales CC — ${BABES_BUSINESS.address}. Call ${BABES_BUSINESS.phone} or email ${BABES_BUSINESS.email}. Website: ${BABES_BUSINESS.website}`,
    },
    {
        id: "babes-kn-services",
        title: "What we offer",
        type: "faq",
        content: `Babes Car Sales offers used vehicles, selected new vehicles, vehicle finance assistance, trade-ins, vehicle sourcing, and nationwide delivery. Finance and trade-in valuations are handled by our sales team — collect customer details and route to Michelle or Omar; do not quote final finance approvals or trade values without human confirmation.`,
    },
    {
        id: "babes-kn-team",
        title: "Sales team",
        type: "team",
        content: `Babes Car Sales sales contacts:
• Michelle — sales
• Omar — sales
Phone ${BABES_BUSINESS.phone}, email ${BABES_BUSINESS.email}.
Sarah (AI) handles discovery, stock search, test-drive booking, and initial finance/trade-in enquiries.`,
    },
    {
        id: "babes-kn-finance",
        title: "Vehicle finance process",
        type: "faq",
        content: `Babes Car Sales assists customers with vehicle finance through accredited finance partners — Sarah does not approve finance.

Process Sarah should explain:
1. Customer chooses a vehicle from live inventory (searchInventory).
2. Collect deposit (if any), purchase budget or monthly target, employment/business details at a high level.
3. Michelle or Omar completes the formal application and presents options.
4. Indicative monthly payments may be discussed only as estimates — final approval and rate are human-confirmed.

Never promise approved finance. After capturing name, phone, vehicle interest, and budget details, record the enquiry for the sales team.`,
    },
    {
        id: "babes-kn-trade-in",
        title: "Trade-in process",
        type: "faq",
        content: `Babes Car Sales accepts trade-ins. Final valuation requires inspection by Michelle or Omar — Sarah must not quote a trade-in value.

Collect for handoff:
• Trade-in vehicle year, make, model, mileage
• Overall condition (accident history, service history if known)
• Amount still owing on finance if applicable
• Vehicle the customer wants from Babes stock (if chosen)

Offer to book a test drive on the replacement vehicle while trade-in is assessed. Use recordSalesEnquiry (trade_in) once details are captured.`,
    },
    {
        id: "babes-kn-test-drive",
        title: "Test drive at Babes",
        type: "faq",
        content: `Test drives at Babes Car Sales CC, ${BABES_BUSINESS.address}.
• Book via checkTestDriveAvailability then bookTestDrive — confirm only after booking succeeds.
• Hours: Mon–Fri 08:00–17:00, Sat 08:00–13:00 (closed Sunday).
• Bring valid driver's licence. Sales consultants Michelle and Omar assist on site.
• After booking, encourage finance/trade-in conversation if relevant — keep momentum toward purchase.`,
    },
    {
        id: "babes-kn-uat-demo",
        title: "Presentation demo flows",
        type: "playbook",
        content: `BCS presentation phrases (use tools, not invented stock):
1. Discovery — "automatic SUV under R250,000" → searchInventory with maxPrice and body type.
2. Specific stock — "Toyota Fortuner?" → searchInventory for Fortuner.
3. Finance — explain finance process, collect budget/deposit, recordSalesEnquiry finance.
4. Trade-in — collect trade vehicle details, recordSalesEnquiry trade_in.
5. Test drive — pick vehicle from inventory, checkTestDriveAvailability, bookTestDrive.`,
    },
];

/**
 * Activate automotive-dealership preset using the same fields as production Central Motors (no new framework).
 * @param {string} companyId
 */
export async function activateAutomotiveDealershipPreset(companyId) {
    const preset = getIndustryPresetDocument(AUTOMOTIVE_PRESET_ID, AUTOMOTIVE_VERSION);
    if (!preset || !isPresetStatusActivatable(preset.status)) {
        throw Object.assign(new Error("Automotive dealership preset is not activatable"), {
            code: "AUTOMOTIVE_PRESET_UNAVAILABLE",
        });
    }
    const existing = await getCompany(companyId);
    if (!existing) {
        throw Object.assign(new Error("Company not found"), { status: 404, code: "COMPANY_NOT_FOUND" });
    }
    if (existing.industryPresetActivatedAt && existing.industryPresetId === AUTOMOTIVE_PRESET_ID) {
        return { alreadyActive: true, company: existing };
    }
    const activatedAt = new Date().toISOString();
    const updated = await updateCompany(companyId, {
        industry: "Automotive",
        industryPresetId: AUTOMOTIVE_PRESET_ID,
        industryPresetVersion: AUTOMOTIVE_VERSION,
        industryPresetActivatedAt: activatedAt,
    });
    return { alreadyActive: false, company: updated, activatedAt };
}

async function upsertBabesKnowledge(companyId, knowledgeBaseId, agentId) {
    const existing = await listKnowledgeDocuments(companyId, { knowledgeBaseId });
    const byId = new Map(existing.filter((d) => d.id).map((d) => [d.id, d]));
    let upserted = 0;
    for (const doc of BABES_KNOWLEDGE_DOCS) {
        const prior = byId.get(doc.id);
        if (prior?.source && prior.source !== "babes-bootstrap" && prior.content === doc.content) continue;
        await saveKnowledgeDocument({
            companyId,
            knowledgeBaseId,
            agentId,
            ...doc,
            source: "babes-bootstrap",
        });
        upserted += 1;
    }
    return upserted;
}

async function configureBabesSarahAgent(companyId) {
    const agents = await listAiEmployees(companyId);
    const agent = agents.find((a) => a.isDefault) || agents[0];
    if (!agent) {
        throw Object.assign(new Error("No Sarah AI employee on tenant"), { code: "NO_AGENT" });
    }
    const updated = await updateAiEmployee(companyId, agent.id, {
        name: BABES_SARAH_AGENT.name,
        role: BABES_SARAH_AGENT.role,
        roleLabel: BABES_SARAH_AGENT.roleLabel,
        personality: BABES_SARAH_AGENT.personality,
        systemPrompt: BABES_SARAH_AGENT.systemPrompt,
        greetingMessage: BABES_SARAH_AGENT.greetingMessage,
        companyName: BABES_DISPLAY_NAME,
    });
    return updated;
}

/**
 * Post-provision bootstrap: preset + KB + Sarah branding.
 * @param {string} [companyId]
 */
export async function bootstrapBabesCarSalesProfile(companyId = BABES_CAR_SALES_COMPANY_ID) {
    const preset = await activateAutomotiveDealershipPreset(companyId);
    const agent = await configureBabesSarahAgent(companyId);
    const knowledgeBaseId = agent.knowledgeBaseId || `kb-${companyId}`;
    const knowledgeUpserted = await upsertBabesKnowledge(companyId, knowledgeBaseId, agent.id);
    const company = await getCompany(companyId);
    return {
        companyId,
        preset,
        agentId: agent.id,
        knowledgeUpserted,
        industryPresetId: company?.industryPresetId,
        industryPresetActivatedAt: company?.industryPresetActivatedAt,
    };
}