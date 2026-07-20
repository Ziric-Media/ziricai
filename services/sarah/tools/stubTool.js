/**
 * Factory for registered stub tools that return helpful guidance.
 */

/**
 * @param {string} name
 * @param {string} description
 * @param {object} options
 */
export function createStubTool(name, description, options = {}) {
    const {
        requiredPermissions = [],
        parameters = { type: "object", properties: {} },
        stubMessage,
        uiHints = [],
    } = options;

    return {
        name,
        description,
        parameters,
        requiredPermissions,
        async execute(ctx, args) {
            return {
                message:
                    stubMessage ||
                    `"${name}" is registered but not fully wired yet. I can guide you through the manual steps in the portal.`,
                data: { stub: true, args, companyId: ctx.companyId },
                uiHints,
            };
        },
    };
}
