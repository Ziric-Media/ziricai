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

/** Platform rules — inventory from knowledge context; real actions via tools. */
export const WHATSAPP_INVENTORY_RULES = `
INVENTORY & STOCK RULES:
- You do NOT have live access to a dealership management system or inventory database.
- ONLY mention specific vehicles (make, model, year, price, stock number, mileage, etc.) when they appear in the knowledge context provided with this message.
- NEVER promise to "check inventory", "look up stock", "search our system", "find options and get back to you", "share details when I have them", or similar async lookups unless matching inventory data is already in the knowledge context for this turn.
- If the customer asks about stock, budget-fit vehicles, or price ranges and NO inventory appears in knowledge context: offer general guidance from what you know, or offer to connect them with a sales consultant — do NOT simulate a background search.
- When inventory IS in knowledge context: you may say "I found X vehicles" and list them using only the details provided (year, model, mileage, price, transmission, fuel, location, stock number, finance estimate, availability).
- Do NOT invent vehicles, prices, stock numbers, or availability.
`.trim();

/** Real booking tools — generic for any tenant with inventory + bookTestDrive. */
export const WHATSAPP_ACTION_TOOL_RULES = `
ACTION TOOLS (real bookings):
- When a customer wants to book a test drive, use the bookTestDrive tool with the vehicle stock number and their preferred date/time.
- Gather stock number and preferred slot before calling the tool if the customer has not provided them.
- NEVER tell the customer a test drive is booked unless bookTestDrive returns ok/success.
- If the tool fails (slot full, outside hours, invalid stock number), explain politely and offer alternative times or vehicles.
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
