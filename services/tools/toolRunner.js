/**
 * Execute AI tools with tenant context.
 */
import { createHash } from "crypto";
import { getTool } from "./toolRegistry.js";
import { normalizeToSlotStart } from "./availability.js";
import {
    enrichToolArgsWithScheduling,
    isTestDriveAvailabilityQuery,
    schedulingUpdatesFromToolResult,
    saveSchedulingContext,
} from "../conversation/schedulingContext.js";
import { resolveVehicleReference } from "../conversation/vehicleReference.js";

/**
 * @param {object} params
 * @param {string} params.companyId
 * @param {string} params.customerId
 * @param {string} [params.vehicleId]
 * @param {string} [params.vehicleStockNumber]
 * @param {Date|string} params.scheduledAt
 * @param {string} [params.clientKey]
 */
export function buildIdempotencyKey({
    companyId,
    customerId,
    vehicleId,
    vehicleStockNumber,
    scheduledAt,
    clientKey,
}) {
    if (clientKey) return String(clientKey).slice(0, 128);

    const slot = normalizeToSlotStart(scheduledAt).toISOString();
    const vehicleKey = (vehicleId || vehicleStockNumber || "").toUpperCase().trim();
    const raw = `${companyId}|${customerId}|${vehicleKey}|${slot}`;
    return createHash("sha256").update(raw).digest("hex");
}

/**
 * @param {string} name
 * @param {import('./types.js').AiToolContext} ctx
 * @param {object} args
 */
export async function runTool(name, ctx, args = {}) {
    const tool = getTool(name);
    if (!tool) {
        return { success: false, ok: false, error: `Unknown tool: ${name}`, code: "UNKNOWN_TOOL" };
    }

    if (!ctx?.companyId) {
        return {
            success: false,
            ok: false,
            error: "companyId is required for tool execution",
            code: "MISSING_COMPANY",
        };
    }

    let enrichedCtx = ctx;
    if (ctx.customerPhone && !ctx.lastRecommendedVehicles) {
        try {
            const { getRecommendedVehicles } = await import("../conversation/recommendedVehicles.js");
            const recommended = await getRecommendedVehicles(
                ctx.companyId,
                ctx.customerPhone,
                ctx.channel || "whatsapp"
            );
            if (recommended.length) {
                enrichedCtx = { ...ctx, lastRecommendedVehicles: recommended };
            }
        } catch {
            /* conversation meta optional */
        }
    }

    if (name === "searchInventory" && isTestDriveAvailabilityQuery(ctx.inboundMessage)) {
        return {
            success: false,
            ok: false,
            tool: name,
            code: "WRONG_TOOL",
            error:
                "Customer is asking about test-drive slot availability on a date, not inventory stock. " +
                "Use checkTestDriveAvailability with date (and query/make/model if needed) instead of searchInventory.",
            suggestedTool: "checkTestDriveAvailability",
        };
    }

    const scheduling = ctx.schedulingContext || {};
    let enrichedArgs = enrichToolArgsWithScheduling(name, args, scheduling);

    if (
        (name === "checkTestDriveAvailability" || name === "bookTestDrive") &&
        !enrichedArgs.vehicleId &&
        !enrichedArgs.vehicleStockNumber
    ) {
        const resolved =
            enrichedCtx.resolvedVehicleReference ||
            resolveVehicleReference(
                ctx.inboundMessage,
                ctx.salesContext,
                enrichedCtx.lastRecommendedVehicles
            );
        if (resolved?.vehicleId) {
            enrichedArgs = { ...enrichedArgs, vehicleId: resolved.vehicleId };
        }
    }

    try {
        const result = await tool.execute(enrichedCtx, enrichedArgs);
        const ok = result.ok !== false && result.success !== false;
        const payload = { success: ok, ok, tool: name, ...result };

        if (ctx.customerPhone && (name === "checkTestDriveAvailability" || name === "bookTestDrive")) {
            const schedUpdates = schedulingUpdatesFromToolResult(name, enrichedArgs, result);
            if (Object.keys(schedUpdates).length) {
                try {
                    await saveSchedulingContext(
                        ctx.companyId,
                        ctx.customerPhone,
                        ctx.channel || "whatsapp",
                        schedUpdates
                    );
                } catch {
                    /* scheduling meta optional */
                }
            }
        }

        return payload;
    } catch (err) {
        console.error(`[tools] ${name} failed:`, err.message);
        return {
            success: false,
            ok: false,
            error: err.message || "Tool execution failed",
            code: err.code || "TOOL_ERROR",
        };
    }
}
