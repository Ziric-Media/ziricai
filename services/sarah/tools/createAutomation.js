import { createStubTool } from "./stubTool.js";

export default createStubTool(
    "createAutomation",
    "Create a workflow automation — triggers, conditions, and actions for customer journeys.",
    {
        requiredPermissions: ["canEditAI"],
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "Automation name" },
                trigger: { type: "string", description: "Trigger event e.g. new_lead, missed_call" },
            },
        },
        stubMessage:
            "Automation builder is available in Automation. I can open it for you — describe the trigger and I'll help draft the workflow.",
        uiHints: [{ navigate: "automation" }, { openWizard: "createAutomation" }],
    }
);
