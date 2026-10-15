/**
 * Executes AI-assigned Operations tasks (system caller — no portal session).
 * v1: durable plan + outcome on the task; no external consequential tools.
 */
import { getTask, updateTask } from "../tenants/taskService.js";
import { getAiEmployee } from "../tenants/aiEmployeeService.js";
import { appendTaskActivity } from "../tenants/taskActivity.js";
import { shouldSimulateTransientFailure } from "./aiTaskReliabilityTest.js";

function buildExecutionPlan(task, agent) {
    const specialist = agent.roleLabel || agent.role || agent.name || "AI Employee";
    const lines = [
        `Specialist: ${specialist} (${agent.name || agent.id})`,
        `Task: ${task.title}`,
        task.description ? `Brief: ${task.description}` : null,
        task.aiInstructions ? `Success criteria: ${task.aiInstructions}` : null,
        task.dueAt ? `Due: ${task.dueAt}` : null,
        `Priority: ${task.priority || "medium"}`,
        "",
        "Planned steps (v1 — no external actions until approval gates):",
        "1. Review task context and tenant knowledge scope",
        "2. Prepare recommended actions for human confirmation",
        "3. Record outcome on this task for Operations review",
    ].filter(Boolean);
    return {
        summary: lines.join("\n"),
        specialist,
        agentId: agent.id,
        autonomous: false,
        note: "Execution recorded; task status unchanged until a human marks it complete.",
    };
}

/**
 * @param {{ companyId: string, taskId: string, jobId?: string, attempt?: number }} params
 */
export async function executeAiAssignedTask({ companyId, taskId, jobId, attempt = 1 }) {
    const task = await getTask(companyId, taskId);
    if (!task) {
        throw Object.assign(new Error("Task not found"), { code: "TASK_NOT_FOUND" });
    }
    if (task.assigneeType !== "ai" && !task.aiEmployeeId) {
        const failedAt = new Date().toISOString();
        await updateTask(companyId, taskId, {
            executionStatus: "failed",
            executionError: "Task is not assigned to an AI employee",
            executionCompletedAt: failedAt,
        });
        await appendTaskActivity(companyId, taskId, {
            type: "execution_failed",
            message: "Execution refused: not an AI-assigned task.",
            at: failedAt,
            jobId: jobId || null,
        });
        return { ok: false, reason: "not_ai_task" };
    }
    if (task.executionStatus === "completed") {
        return { skipped: true, reason: "already_completed" };
    }
    if (task.executionStatus === "in_progress" && jobId && task.executionJobId && task.executionJobId !== jobId) {
        return { skipped: true, reason: "another_job_in_progress" };
    }

    const agent = await getAiEmployee(companyId, task.aiEmployeeId);
    if (!agent) {
        const failedAt = new Date().toISOString();
        await updateTask(companyId, taskId, {
            executionStatus: "failed",
            executionError: "AI employee not found in this workspace",
            executionCompletedAt: failedAt,
        });
        await appendTaskActivity(companyId, taskId, {
            type: "execution_failed",
            message: "Execution failed: AI employee not found in this workspace.",
            at: failedAt,
            jobId: jobId || null,
        });
        return { ok: false, reason: "ai_employee_not_found" };
    }

    const now = new Date().toISOString();
    await updateTask(companyId, taskId, {
        executionStatus: "in_progress",
        executionStartedAt: task.executionStartedAt || now,
        executionJobId: jobId || task.executionJobId || null,
        executionAttempts: Number(task.executionAttempts || 0) + 1,
        executionRetryAt: null,
    });
    await appendTaskActivity(companyId, taskId, {
        type: "execution_started",
        message: `${agent.name || agent.id} started work (attempt ${attempt}).`,
        at: now,
        jobId: jobId || null,
    });

    try {
        if (shouldSimulateTransientFailure({ task, attempt })) {
            throw Object.assign(new Error(`simulated transient failure (attempt ${attempt})`), {
                code: "SIMULATED_TRANSIENT",
                retryable: true,
            });
        }
        const plan = buildExecutionPlan(task, agent);
        const completedAt = new Date().toISOString();
        await updateTask(companyId, taskId, {
            executionStatus: "completed",
            executionCompletedAt: completedAt,
            executionResult: plan.summary,
            executionError: null,
        });
        await appendTaskActivity(companyId, taskId, {
            type: "execution_completed",
            message: "AI execution finished — review outcome before closing the task.",
            at: completedAt,
            jobId: jobId || null,
        });
        return { ok: true, plan };
    } catch (err) {
        const message = err?.message || String(err);
        const retryable = err?.retryable === true || err?.code === "SIMULATED_TRANSIENT";
        if (retryable) {
            await updateTask(companyId, taskId, {
                executionStatus: "retrying",
                executionError: message.slice(0, 500),
            });
            await appendTaskActivity(companyId, taskId, {
                type: "execution_retry_pending",
                message: `Attempt failed; queue will retry. ${message.slice(0, 200)}`,
                at: new Date().toISOString(),
                jobId: jobId || null,
            });
            throw err;
        }
        const failedAt = new Date().toISOString();
        await updateTask(companyId, taskId, {
            executionStatus: "failed",
            executionError: message.slice(0, 500),
            executionCompletedAt: failedAt,
        });
        await appendTaskActivity(companyId, taskId, {
            type: "execution_failed",
            message,
            at: failedAt,
            jobId: jobId || null,
        });
        throw err;
    }
}
