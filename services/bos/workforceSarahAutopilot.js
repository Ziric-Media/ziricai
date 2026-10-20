/**
 * Background Sarah execution for workforce instructions (BOS pilot tenants).
 */
import { isBosPilotTenant } from "./bosPilot.js";
import { handleSarahChat } from "../sarah/sarahOrchestrator.js";
import { PORTAL_SARAH_SURFACES } from "../sarah/portalSarahSurfaces.js";
import { getPermissions, canUseTool } from "../sarah/permissions.js";
import { enqueue, JOB_TYPES } from "../queue/jobQueue.js";

const MODULE_SURFACE = {
    admin: PORTAL_SARAH_SURFACES.ADMIN,
    finance: PORTAL_SARAH_SURFACES.FINANCE,
    operations: PORTAL_SARAH_SURFACES.OPERATIONS,
    hr: PORTAL_SARAH_SURFACES.HR,
    sales: PORTAL_SARAH_SURFACES.SALES,
};

const MODULE_ROLE = {
    admin: "owner",
    finance: "finance",
    operations: "owner",
    hr: "owner",
    sales: "owner",
};

export function isSarahAutopilotEnabled(companyId) {
    if (process.env.BOS_SARAH_AUTOPILOT === "false") return false;
    return isBosPilotTenant(companyId);
}

function buildAutopilotContext(companyId, targetModule) {
    const mod = String(targetModule || "admin").toLowerCase();
    const role = MODULE_ROLE[mod] || "owner";
    const surface = MODULE_SURFACE[mod] || PORTAL_SARAH_SURFACES.ADMIN;
    const permissions = getPermissions(role);
    const ctx = {
        companyId,
        uid: null,
        role,
        surface,
        pageContext: { module: mod },
        permissions,
    };
    ctx.canUseTool = (tool) => canUseTool(ctx, tool);
    return ctx;
}

/**
 * @param {{ companyId: string, targetModule: string, instructionId?: string, instructionText?: string }} params
 */
export async function runWorkforceSarahAutopilot(params) {
    const companyId = params.companyId;
    const targetModule = String(params.targetModule || "").toLowerCase();
    if (!companyId || !targetModule) {
        throw new Error("runWorkforceSarahAutopilot requires companyId and targetModule");
    }

    const ctx = buildAutopilotContext(companyId, targetModule);
    const idHint = params.instructionId ? ` (id ${params.instructionId})` : "";
    const textHint = params.instructionText ? `\n\nInstruction summary: ${params.instructionText}` : "";
    const message = `[BOS autonomous run] Execute your pending workforce instruction${idHint}. Use listWorkforceInstructions, applyBosCommercialCycleAction when the cycle is linked, issueWorkforceInstruction if you are Sarah Admin coordinating another module, then completeWorkforceInstruction with a clear result.${textHint}`;

    return handleSarahChat(ctx, { message });
}

export async function enqueueWorkforceSarahAutopilot(payload) {
    if (!isSarahAutopilotEnabled(payload.companyId)) return null;
    return enqueue({
        type: JOB_TYPES.EXECUTE_SARAH_WORKFORCE,
        companyId: payload.companyId,
        targetModule: payload.targetModule,
        instructionId: payload.instructionId || null,
        instructionText: payload.instructionText || null,
    });
}
