import { createStubTool } from "./stubTool.js";

export default createStubTool(
    "manageTeam",
    "Manage team members — roles, permissions, and access levels.",
    {
        requiredPermissions: ["canManageStaff"],
        parameters: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["list", "update_role", "remove"] },
                email: { type: "string" },
            },
        },
        stubMessage: "Team management is in the Team module. I can open it and walk you through role changes.",
        uiHints: [{ navigate: "team" }],
    }
);
