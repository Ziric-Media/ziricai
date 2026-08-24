/**
 * Execute AI tools with tenant context.
 */
import { createHash } from "crypto";
import { getTool } from "./toolRegistry.js";
import { normalizeToSlotStart } from "./availability.js";

/**
 * @param {object} params
 * @param {string} params.companyId
 * @param {string} params.customerId
 * @param {string} [params.vehicleStockNumber]
 * @param {Date|string} params.scheduledAt
 * @param {string} [params.clientKey]
 */
export function buildIdempotencyKey({ companyId, customerId, vehicleStockNumber, scheduledAt, clientKey }) {
    if (clientKey) return String(clientKey).slice(0, 128);

    const slot = normalizeToSlotStart(scheduledAt).toISOString();
    const stock = (vehicleStockNumber || "").toUpperCase().trim();
    const raw = `${companyId}|${customerId}|${stock}|${slot}`;
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

    try {
        const result = await tool.execute(ctx, args);
        const ok = result.ok !== false && result.success !== false;
        return { success: ok, ok, tool: name, ...result };
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
