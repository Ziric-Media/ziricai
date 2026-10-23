import { getPlatformIntegrationsBoard } from "../../operations/platformMissionControlService.js";

export default {
    name: "viewPlatformIntegrationsBoard",
    description:
        "Mission Control only: read-only platform-wide WhatsApp integration summary across tenants (counts, connection buckets). Use for operator questions about which clients have WhatsApp connected.",
    parameters: {
        type: "object",
        properties: {},
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute() {
        const board = await getPlatformIntegrationsBoard();
        const wa = board.platforms?.find((p) => p.id === "whatsapp");
        const message = wa
            ? `Platform WhatsApp: ${wa.connectedTenants} connected, ${wa.pendingTenants} pending, ${wa.errorTenants} error, ${wa.notConnectedTenants} not connected (${wa.status}).`
            : "Platform integration summary loaded.";

        return {
            message,
            data: {
                generatedAt: board.generatedAt,
                platforms: board.platforms,
                whatsappTenantBuckets: {
                    connected: board.whatsappTenants?.connected?.length ?? 0,
                    pending: board.whatsappTenants?.pending?.length ?? 0,
                    error: board.whatsappTenants?.error?.length ?? 0,
                    not_connected: board.whatsappTenants?.not_connected?.length ?? 0,
                },
                meta: board.meta,
            },
            uiHints: [{ navigate: "integrations" }],
        };
    },
};
