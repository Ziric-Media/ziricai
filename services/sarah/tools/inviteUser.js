import { createStubTool } from "./stubTool.js";

export default createStubTool(
    "inviteUser",
    "Invite a new user to the company portal with a specific role.",
    {
        requiredPermissions: ["canManageStaff"],
        parameters: {
            type: "object",
            properties: {
                email: { type: "string", description: "Invitee email" },
                role: {
                    type: "string",
                    enum: ["manager", "sales", "support", "reception", "marketing", "finance"],
                },
            },
            required: ["email", "role"],
        },
        stubMessage:
            "User invites are sent from Team → Invite User. Share the email and role and I'll prepare the invite details.",
        uiHints: [{ navigate: "team" }, { openWizard: "inviteUser" }],
    }
);
