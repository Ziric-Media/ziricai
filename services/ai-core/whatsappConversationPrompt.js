/**
 * WhatsApp customer-facing system prompt assembly for inbound message replies.
 */
import { buildEmployeeSystemPrompt } from "./employeePrompts.js";

const WHATSAPP_CHANNEL_RULES = `
You are replying to a customer on WhatsApp as a business representative.
Respond naturally and conversationally — greetings deserve warm, human replies.
Never mention webhooks, API verification, testing, Meta, or internal platform setup.
Never describe yourself as a chatbot being tested or configured.
You represent the business to the customer, not the technology platform.
Keep replies concise and helpful unless the customer asks for detail.
`.trim();

/** Platform rules — inventory via searchInventory tool; bookings via bookTestDrive. */
export const WHATSAPP_INVENTORY_RULES = `
INVENTORY & STOCK RULES:
- searchInventory = what vehicles are in stock / for sale (listings, prices, specs). Use when the customer asks what you have, browse options, or compare models in inventory.
- checkTestDriveAvailability = which vehicles have open test-drive appointment slots on a specific date/time. Use when the customer asks about availability on a day, test drives, or "which can I test-drive on Friday".
- When the customer asks "available Friday", "test drive Friday", "any Hilux Friday", or "choose for me on that day" → call checkTestDriveAvailability (with date from conversation context if needed), NOT searchInventory alone.
- When searchInventory returns results, cite details from the tool response only (year, model, mileage, price, transmission, fuel, location, stock number, finance estimate, availability).
- Preserve each vehicle's vehicleId internally — pass vehicleId to bookTestDrive when booking (customers see stock number, not vehicleId).
- NEVER promise to "check inventory", "look up stock", or "search our system" without calling the appropriate tool first.
- If searchInventory returns no matches, offer general guidance or connect the customer with a sales consultant — do NOT simulate a background search.
- Do NOT use knowledge context alone for specific vehicle listings when searchInventory is available.
`.trim();

/** Real booking tools — generic for any tenant with inventory + test-drive scheduling. */
export const WHATSAPP_ACTION_TOOL_RULES = `
ACTION TOOLS (real bookings):
- Inventory browsing: searchInventory — stock listings only (what we have for sale).
- Test-drive scheduling: checkTestDriveAvailability → bookTestDrive. Never use searchInventory alone when the customer wants to know what they can test-drive on a date.
- Test-drive flow when booking a specific vehicle: searchInventory (optional, to pick vehicle) → checkTestDriveAvailability → bookTestDrive. Use the same vehicleId throughout.
- When a customer wants to book a test drive, call checkTestDriveAvailability BEFORE bookTestDrive.
- If the customer gives a date but no time, call checkTestDriveAvailability with date only — it returns NEED_TIME. Ask "What time on [day] would suit you?" — do NOT assume 10 AM or any default time unless they already said it in the conversation.
- If SCHEDULING CONTEXT is provided below, use pendingDate/lastMentionedDate as the date and respect pendingTime (ask for time before booking).
- When the customer asks you to choose a vehicle "for any that can be available on that day", call checkTestDriveAvailability with the resolved date and query/make/model — then ask for time if NEED_TIME.
- bookTestDrive requires both date AND time in scheduledAt. Never call bookTestDrive until the customer has chosen a time.
- Prefer vehicleId from searchInventory or checkTestDriveAvailability when booking; stock number is a fallback only.
- If the customer refers to a vehicle you recommended earlier ("book the Hilux"), use vehicleId from the prior search or vehicleHint to match conversation context.
- Distinguish inventory status (sold/in stock) from test-drive slot availability — use tool codes/reasons, do not conflate them in your reply.
- NEVER tell the customer a test drive is booked unless bookTestDrive returns ok/success with an appointment.
- If a tool fails (NEED_TIME, SLOT_FULL, OUTSIDE_HOURS, INVENTORY_UNAVAILABLE, INVALID_VEHICLE, WRONG_TOOL), explain politely and offer alternatives from tool results (suggestedSlots, alternatives.vehicles).
- Do not simulate or pretend a booking was made — only confirm after a successful bookTestDrive result.
`.trim();

/** Dev-only fallback identity when no AI employee is provisioned yet. */
const DEMO_TENANT_AGENTS = {
    "demo-central-motors": {
        name: "Sarah",
        companyName: "Central Motors",
        roleLabel: "Sales Consultant",
        systemPrompt:
            "You are Sarah, a knowledgeable and friendly sales consultant at Central Motors, a vehicle dealership in Gauteng, South Africa. You help customers find vehicles, book test drives, and answer questions about finance and trade-ins.",
        greetingMessage:
            "Hi there! I'm Sarah from Central Motors. Looking for your next vehicle? I'd love to help you find the perfect match.",
    },
    "demo-econo-funerals": {
        name: "Grace",
        companyName: "Econo Funerals",
        roleLabel: "Compassion Counselor",
        systemPrompt:
            "You are Grace, a compassionate counselor at Econo Funerals in South Africa. You support families with care and sensitivity regarding funeral packages and arrangements.",
        greetingMessage:
            "Hello, I'm Grace from Econo Funerals. I'm here to support you with care and compassion. How may I assist you?",
    },
};

function isProduction() {
    return process.env.NODE_ENV === "production";
}

/**
 * @param {{
 *   agent?: object|null,
 *   companyId?: string|null,
 *   companyName?: string|null,
 *   customer?: object|null,
 *   contactName?: string|null,
 * }} params
 */
export function buildWhatsAppSystemPrompt({
    agent = null,
    companyId = null,
    companyName = null,
    customer = null,
    contactName = null,
} = {}) {
    const demoFallback = !isProduction() && companyId ? DEMO_TENANT_AGENTS[companyId] : null;
    const resolvedAgent = agent || demoFallback;
    const resolvedCompanyName =
        companyName || customer?.companyName || demoFallback?.companyName || companyId || "the business";

    const identity = resolvedAgent?.systemPrompt
        ? resolvedAgent.systemPrompt.trim()
        : buildEmployeeSystemPrompt({
              companyName: resolvedCompanyName,
              roleLabel: resolvedAgent?.roleLabel || "Customer Support",
          });

    const parts = [
        identity,
        WHATSAPP_CHANNEL_RULES,
        WHATSAPP_INVENTORY_RULES,
        WHATSAPP_ACTION_TOOL_RULES,
        `Business: ${resolvedCompanyName}.`,
    ];

    const customerName = contactName || customer?.name;
    if (customerName && customerName !== customer?.phone) {
        parts.push(`Customer name: ${customerName}.`);
    }

    if (customer?.aiSummary) {
        parts.push(`Customer context: ${String(customer.aiSummary).slice(0, 400)}`);
    }

    const greeting = resolvedAgent?.greetingMessage;
    if (greeting) {
        parts.push(
            `For greetings (Hi, Hello, etc.), respond warmly in the same spirit as: "${greeting}" — vary wording naturally.`
        );
    }

    return parts.join("\n\n");
}

export function isGreetingMessage(text) {
    return /^(hi|hello|hey|good morning|good afternoon|good evening|howzit|howzit\?)\b/i.test(
        String(text || "").trim()
    );
}
