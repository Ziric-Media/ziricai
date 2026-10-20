/**
 * Sarah BOS — commercial cycle tools (quote → verified pay → mobilise).
 */
import {
    listCommercialCycles,
    getCommercialCycle,
    createCommercialCycle,
    applyCommercialCycleAction,
} from "../../bos/commercialCycleService.js";
import { CYCLE_STAGES, STAGE_LABELS } from "../../bos/commercialCycleModel.js";
import { moduleKeyFromPortalSurface } from "../portalSarahSurfaces.js";

function requireCompany(ctx) {
    const companyId = ctx?.companyId;
    if (!companyId) {
        throw Object.assign(new Error("Company context is required."), { status: 400, code: "MISSING_COMPANY" });
    }
    return companyId;
}

function actorFromCtx(ctx) {
    return { role: ctx.role || "owner", uid: ctx.uid ?? null };
}

function moduleKey(ctx) {
    if (ctx.pageContext?.module) return ctx.pageContext.module;
    return moduleKeyFromPortalSurface(ctx.surface);
}

export const listBosCommercialCycles = {
    name: "listBosCommercialCycles",
    description:
        "List Sarah BOS commercial cycles (customer quote → verified payment → mobilisation). Use to find cycle ids and current stages.",
    parameters: {
        type: "object",
        properties: {
            limit: { type: "number", description: "Max cycles (default 10)" },
        },
    },
    requiredPermissions: [],
    async execute(ctx, args = {}) {
        const companyId = requireCompany(ctx);
        const items = await listCommercialCycles(companyId, { seedIfEmpty: true });
        const limit = Math.min(Number(args.limit) || 10, 20);
        const slice = items.slice(0, limit);
        return {
            message: slice.length
                ? `${slice.length} commercial cycle(s). Stages: ${slice.map((c) => `${c.id}: ${c.stageLabel || c.stage}`).join("; ")}`
                : "No commercial cycles yet.",
            data: { items: slice, companyId },
        };
    },
};

export const openBosCommercialCycle = {
    name: "openBosCommercialCycle",
    description:
        "Open a new BOS commercial cycle when a customer wants a quotation (Sales Sarah — after customer confirms they want a quote).",
    parameters: {
        type: "object",
        properties: {
            customerName: { type: "string" },
            customerPhone: { type: "string" },
            title: { type: "string", description: "Short description of product/service" },
            leadId: { type: "string" },
        },
        required: ["customerName", "title"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const companyId = requireCompany(ctx);
        const mod = moduleKey(ctx);
        if (mod !== "sales" && mod !== "admin") {
            throw Object.assign(new Error("Sales or Admin Sarah opens commercial cycles from customer requests."), {
                status: 403,
                code: "BOS_SALES_ONLY",
            });
        }
        const cycle = await createCommercialCycle(companyId, actorFromCtx(ctx), {
            customerName: args.customerName,
            customerPhone: args.customerPhone,
            title: args.title,
            leadId: args.leadId,
        });
        return {
            message: `Commercial cycle opened for ${cycle.customerName} at stage “${cycle.stageLabel}”. Sarah Admin will coordinate Finance for the quotation.`,
            data: { cycle },
        };
    },
};

export const applyBosCommercialCycleAction = {
    name: "applyBosCommercialCycleAction",
    description:
        "Advance a BOS commercial cycle (e.g. request-quotation, prepare-quotation, send-quotation, accept-quotation, submit-payment-proof, verify-payment, authorise-work, mobilise). Respect stage gates — Finance must verify payment before work is authorised.",
    parameters: {
        type: "object",
        properties: {
            cycleId: { type: "string" },
            action: {
                type: "string",
                enum: [
                    "request-quotation",
                    "prepare-quotation",
                    "send-quotation",
                    "accept-quotation",
                    "submit-payment-proof",
                    "verify-payment",
                    "authorise-work",
                    "mobilise",
                ],
            },
            note: { type: "string" },
            lineItems: { type: "array", items: { type: "object" } },
            unitPrice: { type: "number" },
            description: { type: "string" },
            reference: { type: "string", description: "Payment reference for proof or verify" },
            proofUrl: { type: "string" },
            amount: { type: "number" },
        },
        required: ["cycleId", "action"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const companyId = requireCompany(ctx);
        const cycleId = String(args.cycleId || "").trim();
        const action = String(args.action || "").trim();
        if (!cycleId || !action) {
            throw Object.assign(new Error("cycleId and action are required"), { status: 400, code: "VALIDATION" });
        }
        const before = await getCommercialCycle(companyId, cycleId);
        const updated = await applyCommercialCycleAction(companyId, cycleId, action, actorFromCtx(ctx), {
            note: args.note,
            lineItems: args.lineItems,
            unitPrice: args.unitPrice,
            description: args.description,
            reference: args.reference,
            proofUrl: args.proofUrl,
            amount: args.amount,
        });
        return {
            message: `Cycle ${cycleId}: ${action} → ${updated.stageLabel || STAGE_LABELS[updated.stage] || updated.stage}${before?.stage !== updated.stage ? "" : " (stage unchanged)"}`,
            data: { cycle: updated, previousStage: before?.stage || null },
        };
    },
};
