/**
 * Sarah BOS workforce instruction tools — Admin issues; module Sarahs execute.
 */
import { PORTAL_SARAH_SURFACES } from "../portalSarahSurfaces.js";
import {
    createWorkforceInstruction,
    listWorkforceInstructions,
    listPendingInstructionsForModule,
    completeWorkforceInstruction,
    startWorkforceInstruction,
    moduleFromSarahContext,
    assertModuleCanExecuteInstruction,
    getWorkforceInstruction,
} from "../../bos/workforceInstructionService.js";
import { INSTRUCTION_SOURCE, portalPageForModule, normalizeTargetModule } from "../../bos/workforceInstructionModel.js";

function requireCompany(ctx) {
    const companyId = ctx?.companyId;
    if (!companyId) {
        throw Object.assign(new Error("Company context is required."), { status: 400, code: "MISSING_COMPANY" });
    }
    return companyId;
}

function sarahActor(ctx) {
    return { role: ctx.role, uid: ctx.uid ?? null };
}

function isAdminCoordinatorSurface(ctx) {
    const s = String(ctx.surface || "").toLowerCase();
    return s === PORTAL_SARAH_SURFACES.ADMIN || s === "portal" || ctx.pageContext?.module === "admin";
}

export const issueWorkforceInstruction = {
    name: "issueWorkforceInstruction",
    description:
        "Issue a durable instruction from Sarah Admin to a specialist Sarah module (sales, finance, operations, or hr). The target module Sarah will see this in their workspace and must execute it using their tools. Use when the owner asked you to delegate work across the Sarah team.",
    parameters: {
        type: "object",
        properties: {
            targetModule: {
                type: "string",
                enum: ["sales", "finance", "operations", "hr"],
                description: "Which Sarah module should execute this",
            },
            instruction: { type: "string", description: "Clear, actionable instruction text" },
            priority: { type: "string", enum: ["normal", "high"] },
            linkedRecordType: { type: "string", description: "Optional linked record type (e.g. commercialCycle)" },
            linkedRecordId: { type: "string", description: "Optional linked record id" },
        },
        required: ["targetModule", "instruction"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        if (!isAdminCoordinatorSurface(ctx)) {
            throw Object.assign(new Error("Only Sarah Admin may issue workforce instructions."), {
                status: 403,
                code: "BOS_ADMIN_ONLY",
            });
        }
        const companyId = requireCompany(ctx);
        const item = await createWorkforceInstruction(companyId, sarahActor(ctx), {
            targetModule: args.targetModule,
            instruction: args.instruction,
            priority: args.priority,
            linkedRecordType: args.linkedRecordType,
            linkedRecordId: args.linkedRecordId,
            source: INSTRUCTION_SOURCE.ADMIN_SARAH,
            issuerModule: "admin",
        });
        const mod = normalizeTargetModule(args.targetModule);
        return {
            message: `Instruction sent to Sarah ${item.targetModuleLabel || mod}. They will pick it up in their module chat.`,
            data: { instruction: item },
            uiHints: mod ? [{ navigate: portalPageForModule(mod) }] : [],
        };
    },
};

export const listWorkforceInstructionsTool = {
    name: "listWorkforceInstructions",
    description:
        "List workforce instructions for this Sarah module (pending and in-progress from Sarah Admin or humans). Execute each using appropriate tools, then mark complete.",
    parameters: {
        type: "object",
        properties: {
            status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "all"],
                description: "Filter by status (default: open items)",
            },
            limit: { type: "number", description: "Max items (default 10)" },
        },
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const companyId = requireCompany(ctx);
        const moduleKey = moduleFromSarahContext(ctx);
        if (moduleKey === "admin") {
            const items = await listWorkforceInstructions(companyId, {
                status: args.status === "all" ? undefined : args.status || undefined,
                limit: args.limit || 15,
            });
            return {
                message: items.length
                    ? `There are ${items.length} workforce instruction(s) for the company.`
                    : "No workforce instructions found.",
                data: { items, companyId },
            };
        }
        let items = await listPendingInstructionsForModule(companyId, moduleKey, { limit: args.limit || 10 });
        if (args.status === "completed") {
            items = await listWorkforceInstructions(companyId, {
                targetModule: moduleKey,
                status: "completed",
                limit: args.limit || 10,
            });
        }
        return {
            message: items.length
                ? `${items.length} instruction(s) for Sarah ${moduleKey}.`
                : `No open instructions for Sarah ${moduleKey}.`,
            data: { items, module: moduleKey, companyId },
        };
    },
};

export const completeWorkforceInstructionTool = {
    name: "completeWorkforceInstruction",
    description:
        "Mark a workforce instruction as completed (or failed) after executing it with your module tools. Required when finishing work assigned by Sarah Admin or a human.",
    parameters: {
        type: "object",
        properties: {
            instructionId: { type: "string", description: "Instruction document id" },
            resultSummary: { type: "string", description: "What was done — be specific" },
            failed: { type: "boolean", description: "Set true if the instruction could not be completed" },
        },
        required: ["instructionId", "resultSummary"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        const companyId = requireCompany(ctx);
        const instructionId = String(args.instructionId || "").trim();
        if (!instructionId) {
            throw Object.assign(new Error("instructionId is required"), { status: 400, code: "VALIDATION" });
        }
        const row = await getWorkforceInstruction(companyId, instructionId);
        const moduleKey = moduleFromSarahContext(ctx);
        if (moduleKey !== "admin") {
            assertModuleCanExecuteInstruction(row, moduleKey);
        }
        if (row?.status === "pending") {
            await startWorkforceInstruction(companyId, instructionId, sarahActor(ctx));
        }
        const updated = await completeWorkforceInstruction(companyId, instructionId, sarahActor(ctx), {
            resultSummary: args.resultSummary,
            failed: Boolean(args.failed),
        });
        const failed = updated.status === "failed";
        return {
            message: failed
                ? `Instruction marked failed: ${updated.resultSummary}`
                : `Instruction completed: ${updated.resultSummary}`,
            data: { instruction: updated },
        };
    },
};
