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
- Use the searchInventory tool to find vehicles in this company's inventory. Do NOT invent vehicles, prices, stock numbers, or availability.
- When searchInventory returns results, cite details from the tool response only (year, model, mileage, price, transmission, fuel, location, stock number, finance estimate, availability).
- Preserve each vehicle's vehicleId internally — pass vehicleId to bookTestDrive when booking (customers see stock number, not vehicleId).
- NEVER promise to "check inventory", "look up stock", or "search our system" without calling searchInventory first.
- If searchInventory returns no matches, offer general guidance or connect the customer with a sales consultant — do NOT simulate a background search.
- Do NOT use knowledge context alone for specific vehicle listings when searchInventory is available.
`.trim();

/** Real booking tools — generic for any tenant with inventory + bookTestDrive. */
export const WHATSAPP_ACTION_TOOL_RULES = `
ACTION TOOLS (real bookings):
- When a customer asks about vehicles, call searchInventory first.
- When a customer wants to book a test drive, use bookTestDrive with vehicleId from searchInventory (preferred) or stock number, plus their preferred date/time.
- If the customer refers to a vehicle you recommended earlier ("book the Hilux"), use vehicleId from the prior search or vehicleHint to match conversation context.
- NEVER tell the customer a test drive is booked unless bookTestDrive returns ok/success.
- If the tool fails (slot full, outside hours, unavailable vehicle, invalid vehicle), explain politely and offer alternative times or vehicles from tool results.
- Do not simulate or pretend a booking was made — only confirm after a successful tool result.
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
