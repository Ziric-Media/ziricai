/**
 * @typedef {object} AiToolContext
 * @property {string} companyId
 * @property {string} customerId — normalized phone / tenant customer doc id
 * @property {string} [customerPhone]
 * @property {string} [customerName]
 * @property {string} [agentId]
 * @property {string} [channel]
 * @property {object[]} [lastRecommendedVehicles] — from conversation meta / searchInventory
 */

/**
 * @typedef {object} AiToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {object} parameters JSON Schema for OpenAI function parameters
 * @property {(ctx: AiToolContext, args: object) => Promise<object>} execute
 */

export {};
