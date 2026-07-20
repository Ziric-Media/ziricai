/**
 * @typedef {object} SarahToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {object} parameters JSON Schema for OpenAI function parameters
 * @property {string[]} [requiredPermissions]
 * @property {boolean} [platformOnly] Superadmin-only platform tools
 * @property {(ctx: object, args: object) => Promise<{ message?: string, data?: object, uiHints?: object[] }>} execute
 */

export {};
