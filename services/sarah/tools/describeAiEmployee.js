import { findAiEmployeeByNameOrRole, getDefaultAiEmployee } from "../../tenants/aiEmployeeService.js";
import {
    describeEmployeeOperationalState,
    getWorkspaceWhatsAppChannelState,
} from "../../tenants/aiEmployeeEntitlement.js";

export default {
    name: "describeAiEmployee",
    description:
        "Read-only: describe what an AI employee is configured to do NOW (role, status, knowledge base, WhatsApp readiness). Use for “what can Lisa do?”, “is Lisa on WhatsApp?”. Do not invent capabilities — distinguish configured state vs potential after WhatsApp is connected.",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string", description: "Employee display name, e.g. Lisa" },
            role: { type: "string", description: "Optional role hint if name is ambiguous" },
        },
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const employee =
            (await findAiEmployeeByNameOrRole(ctx.companyId, {
                name: args.name,
                role: args.role,
            })) || (await getDefaultAiEmployee(ctx.companyId));

        if (!employee) {
            return {
                success: false,
                message: "I don't see any AI employees in this workspace yet.",
                completionType: "read_only",
                code: "NOT_FOUND",
            };
        }

        const whatsappState = await getWorkspaceWhatsAppChannelState(ctx.companyId);
        const state = describeEmployeeOperationalState(employee, whatsappState);
        const wa = state.channels.whatsapp;

        const configuredLines = [
            `${employee.name} is configured as a ${state.role} and is ${state.status}`,
            state.knowledgeBaseId ? `with knowledge base ${state.knowledgeBaseId}.` : ".",
        ].join(" ");

        let whatsappLine;
        if (!wa.workspaceConnected) {
            whatsappLine =
                `WhatsApp is not connected to this workspace, so ${employee.name} is not receiving WhatsApp customer conversations yet.`;
        } else if (!wa.employeeConfiguredForWhatsApp) {
            whatsappLine = `WhatsApp is connected for the workspace, but ${employee.name} is not set up for the WhatsApp channel.`;
        } else {
            whatsappLine = `${employee.name} can receive WhatsApp conversations (workspace WhatsApp is connected).`;
        }

        const potential =
            wa.receivingWhatsAppConversations
                ? `Typical ${state.role} tasks on WhatsApp: answer product questions, handle sales enquiries, qualify leads, and send automated replies using the knowledge base.`
                : `Once WhatsApp is connected and ${employee.name} is assigned to the channel, a ${state.role} can handle sales enquiries, answer product questions, qualify leads, and respond automatically using the knowledge base.`;

        return {
            message: `${configuredLines}\n\n${whatsappLine}\n\n${potential}`,
            data: { employee: state, whatsapp: whatsappState },
            completionType: "read_only",
            userFacingTruth: wa.receivingWhatsAppConversations
                ? `${employee.name} is active with WhatsApp receiving enabled.`
                : `${employee.name} is configured but not receiving WhatsApp conversations (workspace WhatsApp connected: ${wa.workspaceConnected}).`,
        };
    },
};
