import { createStubTool } from "./stubTool.js";

export default createStubTool(
    "connectInstagram",
    "Connect Instagram DMs via Meta Business linked to your Instagram account.",
    {
        requiredPermissions: ["canManageStaff"],
        parameters: { type: "object", properties: {} },
        stubMessage:
            "Instagram DMs require a Business/Creator account linked to a Facebook Page. Settings → Channels → Instagram to connect.",
        uiHints: [{ navigate: "settings" }, { openWizard: "connectInstagram" }],
    }
);
