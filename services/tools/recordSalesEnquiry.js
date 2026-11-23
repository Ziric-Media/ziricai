/**
 * recordSalesEnquiry — persist finance, trade-in, and callback requests to tenant CRM.
 */
import { createHash } from "crypto";
import { normalizePhone } from "../customerService.js";
import { syncFromSalesTurn, addTenantTimelineEventIfNew } from "../integrations/crmSyncService.js";

const ENQUIRY_TYPES = new Set(["finance", "trade_in", "sourcing", "callback", "general"]);

const LEAD_SCORE_BY_TYPE = {
    finance: 78,
    trade_in: 76,
    sourcing: 68,
    callback: 62,
    general: 58,
};

const SARAH_STAGE_BY_TYPE = {
    finance: "FINANCE_INTEREST",
    trade_in: "QUALIFIED",
    sourcing: "QUALIFIED",
    callback: "QUALIFIED",
    general: "QUALIFIED",
};

function enquiryEventId(companyId, phone, enquiryType, summary) {
    const day = new Date().toISOString().slice(0, 10);
    const raw = `${companyId}|${phone}|${enquiryType}|${summary.slice(0, 240)}|${day}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 20);
}

export default {
    name: "recordSalesEnquiry",
    description:
        "Record a finance, trade-in, vehicle-sourcing, or callback enquiry for the sales team. " +
        "Call when the customer wants finance assistance, a trade-in valuation, a human callback, or has given enough details to hand off to Michelle/Omar. " +
        "Do not quote approved finance rates or final trade-in values — capture details and confirm the team will follow up.",
    parameters: {
        type: "object",
        properties: {
            enquiryType: {
                type: "string",
                enum: ["finance", "trade_in", "sourcing", "callback", "general"],
                description: "Kind of sales enquiry",
            },
            summary: {
                type: "string",
                description:
                    "Concise summary for the sales team (vehicle interest, budget/deposit, trade-in vehicle details, preferred contact time)",
            },
            customerName: {
                type: "string",
                description: "Customer full name if known",
            },
            customerPhone: {
                type: "string",
                description: "Customer phone if different from chat identity",
            },
            vehicleInterest: {
                type: "string",
                description: "Vehicle the customer is interested in (make/model or stock title)",
            },
            vehicleId: {
                type: "string",
                description: "vehicleId from searchInventory when known",
            },
            purchaseBudget: {
                type: "number",
                description: "Confirmed cash purchase budget in ZAR when stated",
            },
            monthlyBudget: {
                type: "number",
                description: "Target monthly instalment in ZAR when stated",
            },
            depositAmount: {
                type: "number",
                description: "Deposit amount in ZAR when stated",
            },
            tradeInVehicle: {
                type: "string",
                description: "Customer trade-in vehicle description (year, make, model, km)",
            },
            preferredContact: {
                type: "string",
                description: "Preferred call-back time or channel",
            },
            assignToTeamMember: {
                type: "string",
                description: "Named sales contact if customer requested (e.g. Michelle, Omar)",
            },
        },
        required: ["enquiryType", "summary"],
    },
    async execute(ctx, args) {
        const companyId = ctx?.companyId;
        if (!companyId) {
            return { ok: false, success: false, code: "MISSING_COMPANY", error: "companyId is required" };
        }

        const enquiryType = String(args.enquiryType || "general").toLowerCase();
        if (!ENQUIRY_TYPES.has(enquiryType)) {
            return {
                ok: false,
                success: false,
                code: "INVALID_TYPE",
                error: `enquiryType must be one of: ${[...ENQUIRY_TYPES].join(", ")}`,
            };
        }

        const summary = String(args.summary || "").trim();
        if (!summary) {
            return { ok: false, success: false, code: "NEED_SUMMARY", error: "summary is required" };
        }

        const phoneRaw = args.customerPhone || ctx.customerPhone || ctx.customerId;
        const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
        if (!phone) {
            return {
                ok: false,
                success: false,
                code: "NEED_PHONE",
                error: "Customer phone is required to record the enquiry in CRM",
            };
        }

        const contactName = String(args.customerName || ctx.customerName || "").trim() || null;
        const leadScore = LEAD_SCORE_BY_TYPE[enquiryType] ?? 65;
        const leadStage = SARAH_STAGE_BY_TYPE[enquiryType] || "QUALIFIED";

        const salesContext = {
            leadStage,
            selectedVehicle: args.vehicleInterest || null,
            preferredVehicle: args.vehicleInterest || null,
            budget: args.purchaseBudget ?? null,
            lastRecommendedVehicles: args.vehicleId
                ? [{ vehicleId: args.vehicleId, title: args.vehicleInterest || args.vehicleId }]
                : undefined,
        };

        const topic =
            enquiryType === "trade_in" ? "trade_in" : enquiryType === "finance" ? "finance" : enquiryType;

        const sync = await syncFromSalesTurn(companyId, phone, {
            contactName,
            channel: ctx.channel || "whatsapp",
            leadScore,
            topic,
            salesContext,
            aiEmployeeName: "Sarah",
        });

        const eventId = enquiryEventId(companyId, phone, enquiryType, summary);
        await addTenantTimelineEventIfNew(companyId, phone, {
            id: `sales-enquiry-${eventId}`,
            type: "sales_enquiry",
            title: `Sales enquiry (${enquiryType.replace("_", " ")})`,
            description: summary,
            meta: {
                enquiryType,
                vehicleInterest: args.vehicleInterest || null,
                vehicleId: args.vehicleId || null,
                purchaseBudget: args.purchaseBudget ?? null,
                monthlyBudget: args.monthlyBudget ?? null,
                depositAmount: args.depositAmount ?? null,
                tradeInVehicle: args.tradeInVehicle || null,
                preferredContact: args.preferredContact || null,
                assignToTeamMember: args.assignToTeamMember || null,
                source: "recordSalesEnquiry",
            },
        });

        return {
            ok: true,
            success: true,
            code: "ENQUIRY_RECORDED",
            enquiryType,
            leadId: sync?.lead?.id || phone,
            message:
                "Enquiry saved for the sales team. Confirm the customer that a consultant will follow up (use company knowledge for names) — do not promise approved finance or final trade-in value.",
            handoffSuggested: args.assignToTeamMember || null,
            summary,
        };
    },
};