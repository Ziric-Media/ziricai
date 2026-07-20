import { createStubTool } from "./stubTool.js";

export default createStubTool(
    "connectFacebook",
    "Connect Facebook Messenger to receive and reply to Page messages.",
    {
        requiredPermissions: ["canManageStaff"],
        parameters: { type: "object", properties: {} },
        stubMessage:
            "Facebook Messenger connects via Meta Page subscription. Go to Settings → Channels → Facebook and link your Page.",
        uiHints: [{ navigate: "settings" }, { openWizard: "connectFacebook" }],
    }
);
