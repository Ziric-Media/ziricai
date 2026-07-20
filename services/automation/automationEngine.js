/**
 * Automation engine — evaluate triggers, execute actions, log runs.
 */
import { findMatchingWorkflows } from "./triggerMatcher.js";
import { executeWorkflowActions } from "./actionExecutor.js";
import { incrementWorkflowStats } from "./workflowRegistry.js";
import { publish } from "../events/eventBus.js";
import { EventTypes } from "../events/eventTypes.js";
import { TenantRepository } from "../database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

const runsRepo = new TenantRepository(TENANT_COLLECTIONS.AUTOMATION_RUNS);

/**
 * Handle an incoming event — match workflows and execute.
 * @param {import('../events/eventTypes.js').ZiricEvent} event
 */
export async function handleEvent(event) {
    if (!event?.companyId) return { matched: 0, runs: [] };
    if (event.type === EventTypes.AUTOMATION_EXECUTED) return { matched: 0, runs: [] };

    const workflows = await findMatchingWorkflows(event.companyId, event);
    const runs = [];

    for (const workflow of workflows) {
        const run = await runWorkflow(event.companyId, workflow, event, { source: "event" });
        runs.push(run);
    }

    return { matched: workflows.length, runs };
}

/**
 * Manually trigger a workflow.
 */
export async function runWorkflow(companyId, workflow, event, options = {}) {
    const startedAt = new Date().toISOString();
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let execution = { success: false, results: [] };
    let error = null;

    try {
        execution = await executeWorkflowActions(workflow, event);
    } catch (err) {
        error = err.message;
        execution = { success: false, results: [], error };
    }

    const runRecord = {
        id: runId,
        companyId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        eventType: event.type,
        eventId: event.id,
        source: options.source || "manual",
        success: execution.success,
        results: execution.results,
        error,
        startedAt,
        completedAt: new Date().toISOString(),
    };

    await runsRepo.set(companyId, runId, runRecord);
    await incrementWorkflowStats(companyId, workflow.id, execution.success);

    await publish(
        companyId,
        EventTypes.AUTOMATION_EXECUTED,
        {
            workflowId: workflow.id,
            runId,
            success: execution.success,
            eventType: event.type,
        },
        { actorId: options.actorId || null }
    );

    return runRecord;
}

export async function listAutomationRuns(companyId, { limit = 50 } = {}) {
    const items = await runsRepo.list(companyId, { max: limit, orderByField: "startedAt" });
    return items.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
}

export { runsRepo };
