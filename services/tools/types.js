/**
 * @typedef {object} AiToolContext
 * @property {string} companyId
 * @property {string} customerId — normalized phone / tenant customer doc id
 * @property {string} [customerPhone]
 * @property {string} [customerName]
 * @property {string} [agentId]
 * @property {string} [channel]
 * @property {object[]} [lastRecommendedVehicles] — from conversation meta / searchInventory
 * @property {object} [salesContext] — persisted lead context including lastRecommendedVehicles
 * @property {object} [resolvedVehicleReference] — pre-resolved vehicle from messageWorker
 * @property {string} [inboundMessage] — current customer message (tool routing hints)
 * @property {{ pendingDate?: string, pendingTime?: boolean, lastMentionedDate?: string, lastMentionedTime?: string }} [schedulingContext]
 */

/**
 * @typedef {object} AiToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {object} parameters JSON Schema for OpenAI function parameters
 * @property {(ctx: AiToolContext, args: object) => Promise<object>} execute
 */

export {};
