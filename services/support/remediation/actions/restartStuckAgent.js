/**
 * PI-4F-3 — restartStuckAgent remediation.
 */
import { getAiEmployee, listAiEmployees, saveAiEmployee } from "../../../tenants/aiEmployeeService.js";
import {
    gatherAiEmployeeStatus,
    gatherRecentErrors,
} from "../../diagnostics/gatherTenantDiagnostics.js";
import { REMEDIATION_ACTIONS, getRemediationLimits } from "../remediationConfig.js";
import { executeApprovedRemediation } from "../executeApprovedRemediation.js";
import { assertTenantScope, rateLimitExceeded } from "../remediationGuards.js";
import { listRemediationAuditsForCase } from "../remediationAuditService.js";

const DISABLED_STATUSES = new Set(["disabled", "paused", "archived"]);

function agentLooksStuck(employee, bundle) {
    if (!employee || DISABLED_STATUSES.has(String(employee.status || "").toLowerCase())) {
        return false;
    }
    if (employee.supportOperationalState?.unhealthy === true) return true;
    if (bundle?.errors?.processingFailuresDetected) return true;
    return false;
}

async function resolveAgent(companyId, agentId) {
    if (agentId) {
        const one = await getAiEmployee(companyId, agentId);
        if (one) return one;
    }
    const list = await listAiEmployees(companyId);
    return list[0] || null;
}

async function checkPreconditions(ctx) {
    const { companyId, supportCase, actionArgs, ctx: sarahCtx } = ctx;
    const tenant = assertTenantScope(companyId, sarahCtx);
    if (!tenant.ok) return { ok: false, reason: tenant.reason };

    const rate = rateLimitExceeded(supportCase, REMEDIATION_ACTIONS.RESTART_STUCK_AGENT);
    if (rate.exceeded) return { ok: false, reason: rate.reason };

    const agent = await resolveAgent(companyId, actionArgs.agentId);
    if (!agent) return { ok: false, reason: "No AI employee found for this tenant." };
    if (agent.companyId && agent.companyId !== companyId) {
        return { ok: false, reason: "AI employee does not belong to this tenant." };
    }
    if (DISABLED_STATUSES.has(String(agent.status || "").toLowerCase())) {
        return { ok: false, reason: "AI employee is intentionally disabled." };
    }

    const bundle = {
        aiEmployees: await gatherAiEmployeeStatus(companyId),
        errors: await gatherRecentErrors(companyId),
    };
    if (!agentLooksStuck(agent, bundle)) {
        return { ok: false, reason: "AI employee does not appear stuck or unhealthy." };
    }

    const limits = getRemediationLimits()[REMEDIATION_ACTIONS.RESTART_STUCK_AGENT];
    const lastRestart = agent.supportOperationalState?.lastRestartAt
        ? Date.parse(agent.supportOperationalState.lastRestartAt)
        : 0;
    if (lastRestart && Date.now() - lastRestart < limits.cooldownPerAgentMs) {
        return { ok: false, reason: "Restart cooldown active for this AI employee." };
    }

    const audits = await listRemediationAuditsForCase(companyId, supportCase.id, { limit: 10 });
    const recentRestart = audits.find(
        (a) =>
            a.action === REMEDIATION_ACTIONS.RESTART_STUCK_AGENT &&
            a.success &&
            Date.parse(a.timestamp) > Date.now() - limits.cooldownPerAgentMs
    );
    if (recentRestart) {
        return { ok: false, reason: "Recent restart already recorded for this case." };
    }

    return {
        ok: true,
        previousState: {
            agentId: agent.id,
            agentName: agent.name,
            status: agent.status,
            supportOperationalState: agent.supportOperationalState || null,
        },
        agent,
    };
}

async function runAction(ctx) {
    const agent = await resolveAgent(ctx.companyId, ctx.actionArgs.agentId);
    if (!agent) throw new Error("AI employee not found");
    const now = new Date().toISOString();
    const generation = (agent.supportOperationalState?.restartGeneration || 0) + 1;
    const nextState = {
        ...agent,
        supportOperationalState: {
            ...(agent.supportOperationalState || {}),
            lastRestartAt: now,
            restartGeneration: generation,
            unhealthy: false,
            lastRestartBy: ctx.ctx?.uid || "sarah",
        },
    };
    await saveAiEmployee(ctx.companyId, agent.id, nextState);
    return {
        actionResult: { agentId: agent.id, restartedAt: now, generation },
        newState: nextState.supportOperationalState,
    };
}

async function verifyOutcome(ctx, actionResult) {
    const agent = await getAiEmployee(ctx.companyId, actionResult.agentId);
    const bundle = await gatherAiEmployeeStatus(ctx.companyId);
    const errors = await gatherRecentErrors(ctx.companyId);
    const healthy =
        agent &&
        agent.supportOperationalState?.unhealthy !== true &&
        !DISABLED_STATUSES.has(String(agent.status || "").toLowerCase());
    const noFailures = !errors.processingFailuresDetected;
    const verified = healthy && noFailures;
    return {
        verified,
        postVerification: {
            agentStatus: agent?.status,
            operationalState: agent?.supportOperationalState,
            aiEmployeeCount: bundle.count,
            processingFailuresDetected: errors.processingFailuresDetected,
        },
        reasons: verified ? [] : ["AI employee or message processing still appears unhealthy after restart."],
    };
}

export async function runRestartStuckAgentRemediation(companyId, supportCaseId, ctx = {}, actionArgs = {}) {
    return executeApprovedRemediation({
        action: REMEDIATION_ACTIONS.RESTART_STUCK_AGENT,
        companyId,
        supportCaseId,
        ctx,
        actionArgs,
        checkPreconditions,
        runAction,
        verifyOutcome,
    });
}
