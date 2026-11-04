/**
 * U2 — Personal Sarah tool implementations.
 */
import { createPersonalReminder } from "./personalSarahTaskStore.js";
import {
    getUserConversationByCompany,
    summarizeConversationForUser,
    syncMessagesFromTenant,
} from "../../users/userConversationService.js";

export const PERSONAL_SARAH_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "createPersonalReminder",
            description: "Schedule a personal reminder for the user (stored on their account; notification delivery in a later release).",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string", description: "Short reminder title" },
                    dueAt: { type: "string", description: "ISO datetime or human time e.g. tomorrow 9am" },
                    notes: { type: "string", description: "Optional extra detail" },
                },
                required: ["title"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "summarizeCompanyConversation",
            description:
                "Summarize the user's existing Sarah App chat thread with a business (requires they already chatted with that company).",
            parameters: {
                type: "object",
                properties: {
                    companyId: { type: "string", description: "Business company id e.g. smilemore-demo" },
                },
                required: ["companyId"],
            },
        },
    },
];

export async function executePersonalSarahTool(toolName, ctx, args = {}) {
    if (toolName === "createPersonalReminder") {
        try {
            const task = await createPersonalReminder(ctx.uid, args);
            return {
                success: true,
                tool: toolName,
                message: `Reminder saved: “${task.title}”${task.dueAt ? ` (due ${task.dueAt})` : ""}. I'll notify you when push reminders go live.`,
                data: { taskId: task.id },
            };
        } catch (err) {
            return {
                success: false,
                tool: toolName,
                error: err.message || "Could not save reminder",
            };
        }
    }
    if (toolName === "summarizeCompanyConversation") {
        const companyId = String(args.companyId || "").trim();
        if (!companyId) {
            return { success: false, tool: toolName, error: "companyId is required" };
        }
        const conv = getUserConversationByCompany(ctx.uid, companyId);
        if (!conv) {
            return {
                success: false,
                tool: toolName,
                error: "No conversation found with that business yet. Start a chat from Discover or Chats first.",
            };
        }
        await syncMessagesFromTenant(conv);
        const summary = summarizeConversationForUser(conv.id);
        return {
            success: true,
            tool: toolName,
            message: summary,
            data: { conversationId: conv.id, companyId },
        };
    }
    return { success: false, tool: toolName, error: `Unknown personal tool: ${toolName}` };
}
