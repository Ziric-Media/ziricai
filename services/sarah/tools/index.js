import { registerTool } from "../toolRegistry.js";

import viewAnalytics from "./viewAnalytics.js";
import viewConversations from "./viewConversations.js";
import searchCRM from "./searchCRM.js";
import createEmployee from "./createEmployee.js";
import describeAiEmployee from "./describeAiEmployee.js";
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
import searchCompanyKnowledge from "./searchCompanyKnowledge.js";
import diagnoseWhatsAppIntegration from "./diagnoseWhatsAppIntegration.js";
import viewPlatformIntegrationsBoard from "./viewPlatformIntegrationsBoard.js";
import viewPlatformExecutiveOverview from "./viewPlatformExecutiveOverview.js";
import viewPlatformBillingConsole from "./viewPlatformBillingConsole.js";
import viewPlatformSupportCases from "./viewPlatformSupportCases.js";
import viewPlatformAnalyticsOverview from "./viewPlatformAnalyticsOverview.js";
import viewTenantOperatorSummary from "./viewTenantOperatorSummary.js";
import navigateMissionControl from "./navigateMissionControl.js";
import viewWorkspaceOverview from "./viewWorkspaceOverview.js";
import navigatePortal from "./navigatePortal.js";
import viewRecentActivity from "./viewRecentActivity.js";
import viewPlatformCommunications from "./viewPlatformCommunications.js";
import viewPlatformUserNetwork from "./viewPlatformUserNetwork.js";
import viewOrganisationNetwork from "./viewOrganisationNetwork.js";
import viewSectorBreakdown from "./viewSectorBreakdown.js";
import comparePlatformPeriods from "./comparePlatformPeriods.js";
import generatePlatformOperationsReport from "./generatePlatformOperationsReport.js";
import viewWebhookStatus from "./viewWebhookStatus.js";
import viewAiEmployeeStatus from "./viewAiEmployeeStatus.js";
import viewKnowledgeBaseStatus from "./viewKnowledgeBaseStatus.js";
import viewRecentErrors from "./viewRecentErrors.js";
import viewRecentMessages from "./viewRecentMessages.js";
import viewSupportHistory from "./viewSupportHistory.js";
import investigateSupportIssue from "./investigateSupportIssue.js";
import recordSupportDiagnosis from "./recordSupportDiagnosisTool.js";
import appendRemediationAttempt from "./appendRemediationAttemptTool.js";
import escalateSupportCase from "./escalateSupportCaseTool.js";
import resolveSupportCaseWithVerification from "./resolveSupportCaseTool.js";
import retryFailedWebhook from "./retryFailedWebhook.js";
import restartStuckAgent from "./restartStuckAgent.js";
import refreshIntegrationState from "./refreshIntegrationState.js";
import viewPlatformSupportOperations from "./viewPlatformSupportOperations.js";
import viewPlatformSupportAttention from "./viewPlatformSupportAttention.js";
import listTasks from "./listTasks.js";
import createTask from "./createTask.js";
import viewOutstandingInvoices from "./viewOutstandingInvoices.js";
import viewInvoiceAging from "./viewInvoiceAging.js";
import viewInvoiceDetails from "./viewInvoiceDetails.js";
import viewFinanceTransactions from "./viewFinanceTransactions.js";
import {
    issueWorkforceInstruction,
    listWorkforceInstructionsTool,
    completeWorkforceInstructionTool,
} from "./workforceInstructions.js";

const ALL_TOOLS = [
    viewAnalytics,
    viewConversations,
    searchCRM,
    createEmployee,
    describeAiEmployee,
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
    searchCompanyKnowledge,
    diagnoseWhatsAppIntegration,
    viewPlatformIntegrationsBoard,
    viewPlatformExecutiveOverview,
    viewPlatformBillingConsole,
    viewPlatformSupportCases,
    viewPlatformAnalyticsOverview,
    viewTenantOperatorSummary,
    navigateMissionControl,
    viewWorkspaceOverview,
    navigatePortal,
    viewRecentActivity,
    viewPlatformCommunications,
    viewPlatformUserNetwork,
    viewOrganisationNetwork,
    viewSectorBreakdown,
    comparePlatformPeriods,
    generatePlatformOperationsReport,
    viewWebhookStatus,
    viewAiEmployeeStatus,
    viewKnowledgeBaseStatus,
    viewRecentErrors,
    viewRecentMessages,
    viewSupportHistory,
    investigateSupportIssue,
    recordSupportDiagnosis,
    appendRemediationAttempt,
    escalateSupportCase,
    resolveSupportCaseWithVerification,
    retryFailedWebhook,
    restartStuckAgent,
    refreshIntegrationState,
    viewPlatformSupportOperations,
    viewPlatformSupportAttention,
    listTasks,
    createTask,
    viewOutstandingInvoices,
    viewInvoiceAging,
    viewInvoiceDetails,
    viewFinanceTransactions,
    issueWorkforceInstruction,
    listWorkforceInstructionsTool,
    completeWorkforceInstructionTool,
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
