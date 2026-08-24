/**
 * Reusable AI employee tool registry — any tenant agent can invoke registered tools.
 */

/** @type {Map<string, import('./types.js').AiToolDefinition>} */
const registry = new Map();

/**
 * @param {import('./types.js').AiToolDefinition} tool
 */
export function registerTool(tool) {
    if (!tool?.name) throw new Error("Tool must have a name");
    registry.set(tool.name, tool);
}

export function getTool(name) {
    return registry.get(name) || null;
}

export function listTools() {
    return [...registry.values()];
}

/**
 * OpenAI function-calling schema for registered tools.
 * @param {{ toolNames?: string[] }} [filter]
 */
export function getOpenAIToolDefinitions(filter = {}) {
    let tools = listTools();
    if (filter.toolNames?.length) {
        const allowed = new Set(filter.toolNames);
        tools = tools.filter((t) => allowed.has(t.name));
    }

    return tools.map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: "object", properties: {} },
        },
    }));
}
