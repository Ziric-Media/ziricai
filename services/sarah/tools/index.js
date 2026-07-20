import { registerTool } from "../toolRegistry.js";

import viewAnalytics from "./viewAnalytics.js";
import viewConversations from "./viewConversations.js";
import searchCRM from "./searchCRM.js";
import createEmployee from "./createEmployee.js";
import uploadKnowledge from "./uploadKnowledge.js";
import createAutomation from "./createAutomation.js";
import connectIntegration from "./connectIntegration.js";
import bookAppointment from "./bookAppointment.js";
import generateQuote from "./generateQuote.js";
import viewBilling from "./viewBilling.js";
import manageTeam from "./manageTeam.js";
import inviteUser from "./inviteUser.js";
import generateReport from "./generateReport.js";
import platformHelp from "./platformHelp.js";
import trainAI from "./trainAI.js";
import connectWhatsApp from "./connectWhatsApp.js";
import connectFacebook from "./connectFacebook.js";
import connectInstagram from "./connectInstagram.js";

const ALL_TOOLS = [
    viewAnalytics,
    viewConversations,
    searchCRM,
    createEmployee,
    uploadKnowledge,
    createAutomation,
    connectIntegration,
    bookAppointment,
    generateQuote,
    viewBilling,
    manageTeam,
    inviteUser,
    generateReport,
    platformHelp,
    trainAI,
    connectWhatsApp,
    connectFacebook,
    connectInstagram,
];

let initialized = false;

export function initSarahTools() {
    if (initialized) return;
    for (const tool of ALL_TOOLS) {
        registerTool(tool);
    }
    initialized = true;
}

export { ALL_TOOLS };
