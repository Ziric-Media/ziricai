/**
 * Workforce instructions — durable delegations from Admin (Sarah or human) to module Sarahs.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    INSTRUCTION_SOURCE,
    INSTRUCTION_STATUS,
    MODULE_LABELS,
    normalizeTargetModule,
    WORKFORCE_MODULES,
} from "./workforceInstructionModel.js";
import { moduleKeyFromPortalSurface } from "../sarah/portalSarahSurfaces.js";
import { publish, EventTypes } from "../events/index.js";

class WorkforceInstructionRepo extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.SARAH_WORKFORCE_INSTRUCTIONS);
    }
}

const repo = new WorkforceInstructionRepo();

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

function nowIso() {
    return new Date().toISOString();
}

export async function createWorkforceInstruction(companyId, actor, body = {}) {
    const targetModule = normalizeTargetModule(body.targetModule);
    const instruction = String(body.instruction || body.text || "").trim();
    if (!targetModule) {
        throw httpError("targetModule must be sales, finance, operations, or hr", 400, "BOS_INSTRUCTION_VALIDATION");
    }
    if (!instruction) {
        throw httpError("instruction text is required", 400, "BOS_INSTRUCTION_VALIDATION");
    }

    let source = INSTRUCTION_SOURCE.HUMAN;
    if (body.source === INSTRUCTION_SOURCE.ADMIN_SARAH) source = INSTRUCTION_SOURCE.ADMIN_SARAH;
    else if (body.source === INSTRUCTION_SOURCE.BOS_ORCHESTRATOR) source = INSTRUCTION_SOURCE.BOS_ORCHESTRATOR;
    else if (body.source === INSTRUCTION_SOURCE.MODULE_SARAH) source = INSTRUCTION_SOURCE.MODULE_SARAH;

    const automationKey = body.automationKey ? String(body.automationKey).trim() : null;
    if (automationKey) {
        const open = await findOpenInstructionByAutomationKey(companyId, automationKey);
        if (open) return open;
    }
    const priority = body.priority === "high" ? "high" : "normal";

    const row = await repo.create(companyId, {
        targetModule,
        targetModuleLabel: MODULE_LABELS[targetModule] || targetModule,
        instruction,
        status: INSTRUCTION_STATUS.PENDING,
        source,
        priority,
        createdByUid: actor.uid ?? null,
        createdByRole: actor.role ?? null,
        issuerModule: body.issuerModule || "admin",
        linkedRecordType: body.linkedRecordType || null,
        linkedRecordId: body.linkedRecordId || null,
        automationKey,
        resultSummary: null,
        completedAt: null,
        completedByUid: null,
        activityLog: [
            {
                type: "created",
                message: `Instruction issued to ${MODULE_LABELS[targetModule] || targetModule} Sarah.`,
                at: nowIso(),
                actorUid: actor.uid,
            },
        ],
    });

    await publish(companyId, EventTypes.WORKFORCE_INSTRUCTION_ISSUED, {
        instructionId: row.id,
        targetModule,
        targetModuleLabel: MODULE_LABELS[targetModule] || targetModule,
        instruction,
        source,
    });

    return row;
}

export async function findOpenInstructionByAutomationKey(companyId, automationKey) {
    const key = String(automationKey || "").trim();
    if (!key) return null;
    const items = await listWorkforceInstructions(companyId, { limit: 40 });
    return (
        items.find(
            (i) =>
                i.automationKey === key &&
                (i.status === INSTRUCTION_STATUS.PENDING || i.status === INSTRUCTION_STATUS.IN_PROGRESS)
        ) || null
    );
}

const BOS_SYSTEM_ACTOR = { uid: null, role: "owner" };

export function bosOrchestratorActor() {
    return { ...BOS_SYSTEM_ACTOR };
}

export async function listWorkforceInstructions(companyId, { targetModule, status, limit = 30 } = {}) {
    const max = Math.min(Number(limit) || 30, 100);
    let items = await repo.list(companyId, { max: max * 2, orderByField: "updatedAt", orderDirection: "desc" });
    if (targetModule) {
        const mod = normalizeTargetModule(targetModule);
        items = items.filter((i) => i.targetModule === mod);
    }
    if (status) {
        items = items.filter((i) => i.status === status);
    }
    return items.slice(0, max);
}

export async function listPendingInstructionsForModule(companyId, targetModule, { limit = 15 } = {}) {
    const mod = normalizeTargetModule(targetModule);
    if (!mod) return [];
    const items = await listWorkforceInstructions(companyId, {
        targetModule: mod,
        limit: limit * 2,
    });
    return items
        .filter((i) => i.status === INSTRUCTION_STATUS.PENDING || i.status === INSTRUCTION_STATUS.IN_PROGRESS)
        .slice(0, limit);
}

export async function getWorkforceInstruction(companyId, instructionId) {
    return repo.get(companyId, instructionId);
}

export async function startWorkforceInstruction(companyId, instructionId, actor) {
    const row = await getWorkforceInstruction(companyId, instructionId);
    if (!row) throw httpError("Instruction not found", 404, "BOS_INSTRUCTION_NOT_FOUND");
    if (row.status === INSTRUCTION_STATUS.COMPLETED || row.status === INSTRUCTION_STATUS.CANCELLED) {
        throw httpError("Instruction is already closed", 409, "BOS_INSTRUCTION_CLOSED");
    }
    return repo.update(companyId, instructionId, {
        status: INSTRUCTION_STATUS.IN_PROGRESS,
        startedAt: nowIso(),
        startedByUid: actor.uid ?? null,
        updatedAt: nowIso(),
    });
}

export async function completeWorkforceInstruction(companyId, instructionId, actor, { resultSummary, failed = false } = {}) {
    const row = await getWorkforceInstruction(companyId, instructionId);
    if (!row) throw httpError("Instruction not found", 404, "BOS_INSTRUCTION_NOT_FOUND");
    if (row.status === INSTRUCTION_STATUS.COMPLETED || row.status === INSTRUCTION_STATUS.CANCELLED) {
        throw httpError("Instruction is already closed", 409, "BOS_INSTRUCTION_CLOSED");
    }
    const summary = String(resultSummary || "").trim() || (failed ? "Could not complete." : "Done.");
    const status = failed ? INSTRUCTION_STATUS.FAILED : INSTRUCTION_STATUS.COMPLETED;
    const updated = await repo.update(companyId, instructionId, {
        status,
        resultSummary: summary,
        completedAt: nowIso(),
        completedByUid: actor.uid ?? null,
        updatedAt: nowIso(),
    });
    await publish(companyId, EventTypes.WORKFORCE_INSTRUCTION_COMPLETED, {
        instructionId,
        targetModule: row.targetModule,
        status,
    });
    return updated;
}

/** Resolve module key from Sarah chat surface for listing pending work. */
export function moduleFromSarahContext(ctx) {
    if (ctx?.pageContext?.module && Object.values(WORKFORCE_MODULES).includes(ctx.pageContext.module)) {
        return ctx.pageContext.module;
    }
    return moduleKeyFromPortalSurface(ctx?.surface);
}

export function assertModuleCanExecuteInstruction(instruction, moduleKey) {
    const mod = normalizeTargetModule(moduleKey);
    if (!instruction || instruction.targetModule !== mod) {
        throw httpError("This instruction is not assigned to your Sarah module", 403, "BOS_INSTRUCTION_FORBIDDEN");
    }
}
