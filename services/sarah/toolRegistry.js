/**
 * Sarah tool registry — central map of tool name → definition + handler.
 * Gate 1 baseline: a336ab0 + public persona tool restriction.
 */
import {
    PUBLIC_SARAH_TOOL_NAMES,
    SARAH_PERSONA,
    SARAH_TOOL_POLICY,
    resolvePersonaFromSurface,
} from "./sarahPersona.js";

/** @type {Map<string, import('./tools/types.js').SarahToolDefinition>} */
const registry = new Map();

function resolvePersona(ctx) {
    return ctx.persona || resolvePersonaFromSurface(ctx.surface);
}

function isPublicReception(ctx) {
    const persona = resolvePersona(ctx);
    return persona === SARAH_PERSONA.PUBLIC_RECEPTION || ctx.surface === "landing";
}

/**
 * Register a Sarah tool.
 * @param {import('./tools/types.js').SarahToolDefinition} tool
 */
export function registerTool(tool) {
    if (!tool?.name) throw new Error("Tool must have a name");
    registry.set(tool.name, tool);
}

/**
 * @param {string} name
 */
export function getTool(name) {
    return registry.get(name) || null;
}

export function listAllTools() {
    return [...registry.values()];
}

/**
 * Tools the user is allowed to invoke (also exposed to OpenAI).
 * @param {{ role?: string, isSuperAdmin?: boolean, canUseTool?: (t: object) => boolean, persona?: string, surface?: string }} ctx
 */
export function getToolsForContext(ctx) {
    const persona = resolvePersona(ctx);
    const toolPolicy =
        ctx.toolPolicy ||
        (persona === SARAH_PERSONA.PUBLIC_RECEPTION
            ? SARAH_TOOL_POLICY.PUBLIC
            : persona === SARAH_PERSONA.PLATFORM_OPERATOR
              ? SARAH_TOOL_POLICY.TENANT_AND_PLATFORM
              : SARAH_TOOL_POLICY.TENANT);

    return listAllTools().filter((tool) => {
        if (toolPolicy === SARAH_TOOL_POLICY.PUBLIC) {
            if (!PUBLIC_SARAH_TOOL_NAMES.has(tool.name)) return false;
        }
        if (ctx.canUseTool && !ctx.canUseTool(tool)) return false;
        return true;
    });
}

/**
 * OpenAI function-calling schema for available tools.
 * @param {object} ctx
 */
export function getOpenAIToolDefinitions(ctx) {
    return getToolsForContext(ctx).map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: "object", properties: {} },
        },
    }));
}

/**
 * Execute a tool with permission check.
 * @param {string} name
 * @param {object} ctx Sarah context
 * @param {object} args Parsed function arguments
 */
export async function executeTool(name, ctx, args = {}) {
    const tool = getTool(name);
    if (!tool) {
        return { success: false, error: `Unknown tool: ${name}` };
    }

    if (isPublicReception(ctx) && !PUBLIC_SARAH_TOOL_NAMES.has(name)) {
        return {
            success: false,
            error: `Public Sarah cannot use "${name}".`,
            code: "PUBLIC_TOOL_DENIED",
        };
    }

    if (ctx.canUseTool && !ctx.canUseTool(tool)) {
        return {
            success: false,
            error: `Permission denied for "${name}".`,
            code: "PERMISSION_DENIED",
        };
    }

    try {
        const result = await tool.execute(ctx, args);
        return { success: true, tool: name, ...result };
    } catch (err) {
        console.error(`[sarah/tool] ${name} failed:`, err.message);
        return {
            success: false,
            error: err.message || "Tool execution failed",
            code: err.code || "TOOL_ERROR",
        };
    }
}
