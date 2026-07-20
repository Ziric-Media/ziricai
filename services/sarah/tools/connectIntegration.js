import { createStubTool } from "./stubTool.js";

export default createStubTool(
    "connectIntegration",
    "Connect a third-party integration (CRM, calendar, ERP, etc.).",
    {
        requiredPermissions: ["canManageStaff"],
        parameters: {
            type: "object",
            properties: {
                provider: { type: "string", description: "Integration provider name" },
            },
            required: ["provider"],
        },
        stubMessage:
            "Open Settings → Integrations to connect providers. Tell me which system you use and I'll outline the setup steps.",
        uiHints: [{ navigate: "settings" }],
    }
);
