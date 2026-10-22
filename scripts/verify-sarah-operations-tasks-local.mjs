#!/usr/bin/env node
/**
 * Sarah Operations — listTasks / createTask (memory backend, no deploy).
 */
import assert from "node:assert/strict";

process.env.OPS_SMOKE_MEMORY_ISOLATED = "1";
process.env.STORAGE_BACKEND = "memory";

const COMPANY = "sarah-ops-task-co";
const MGR = { role: "manager", uid: "sarah-ops-mgr" };
const SALES = { role: "sales", uid: "sarah-ops-sales" };
const VIEWER = { role: "viewer", uid: "sarah-ops-viewer" };

const { initSarahTools } = await import("../services/sarah/tools/index.js");
const { executeTool, getToolsForContext } = await import("../services/sarah/toolRegistry.js");
const { canUseTool } = await import("../services/sarah/permissions.js");
const listTasksTool = (await import("../services/sarah/tools/listTasks.js")).default;
const createTaskTool = (await import("../services/sarah/tools/createTask.js")).default;
const { createTaskForAccess } = await import("../services/tenants/taskService.js");
const { MC_TENANT_READ_TOOLS, PLATFORM_OPERATOR_BLOCKED_TOOLS } = await import(
    "../services/sarah/mcToolPolicy.js"
);
const { SARAH_PERSONA, SARAH_TOOL_POLICY } = await import("../services/sarah/sarahPersona.js");

initSarahTools();

function portalCtx(role, uid) {
    const base = { role, uid, companyId: COMPANY, persona: SARAH_PERSONA.CLIENT_OPERATOR };
    return {
        ...base,
        canUseTool: (tool) => canUseTool({ role, isSuperAdmin: false }, tool),
    };
}

async function main() {
    const checks = [];

    const run = async (name, fn) => {
        try {
            await fn();
            checks.push({ name, ok: true });
            console.log(`PASS ${name}`);
        } catch (err) {
            checks.push({ name, ok: false, error: err.message });
            console.error(`FAIL ${name}: ${err.message}`);
        }
    };

    console.log("\nSarah Operations task tools (local)\n");

    await run("tools registered", () => {
        assert.equal(listTasksTool.name, "listTasks");
        assert.equal(createTaskTool.name, "createTask");
        assert.ok(MC_TENANT_READ_TOOLS.has("listTasks"));
        assert.ok(PLATFORM_OPERATOR_BLOCKED_TOOLS.has("createTask"));
    });

    await run("permission matrix", () => {
        assert.ok(canUseTool({ role: "owner" }, listTasksTool));
        assert.ok(canUseTool({ role: "owner" }, createTaskTool));
        assert.ok(canUseTool({ role: "viewer" }, listTasksTool));
        assert.ok(!canUseTool({ role: "viewer" }, createTaskTool));
        assert.ok(canUseTool({ role: "sales" }, listTasksTool));
        assert.ok(!canUseTool({ role: "sales" }, createTaskTool));
    });

    await run("manager create + list via executeTool", async () => {
        const ctx = portalCtx(MGR.role, MGR.uid);
        const created = await executeTool("createTask", ctx, {
            title: "Sarah smoke task",
            priority: "high",
        });
        assert.equal(created.success, true, created.error);
        assert.ok(created.data?.task?.id, "task id");
        assert.match(created.message || "", /Created task/i);

        const listed = await executeTool("listTasks", ctx, { status: "open" });
        assert.equal(listed.success, true, listed.error);
        const ids = (listed.data?.tasks || []).map((t) => t.id);
        assert.ok(ids.includes(created.data.task.id), "listed task includes created id");
    });

    await run("sales create denied at tool gate", async () => {
        const ctx = portalCtx(SALES.role, SALES.uid);
        const result = await executeTool("createTask", ctx, { title: "nope" });
        assert.equal(result.success, false);
        assert.equal(result.code, "PERMISSION_DENIED");
    });

    await run("viewer sees assignee-only tasks", async () => {
        await createTaskForAccess(COMPANY, MGR, {
            title: "for viewer",
            assigneeUid: VIEWER.uid,
        });
        await createTaskForAccess(COMPANY, MGR, {
            title: "not for viewer",
            assigneeUid: MGR.uid,
        });
        const ctx = portalCtx(VIEWER.role, VIEWER.uid);
        const listed = await executeTool("listTasks", ctx, { status: "all", limit: 50 });
        assert.equal(listed.success, true, listed.error);
        const titles = (listed.data?.tasks || []).map((t) => t.title);
        assert.ok(titles.includes("for viewer"));
        assert.ok(!titles.includes("not for viewer"));
    });

    await run("portal owner exposes task tools", () => {
        const ctx = portalCtx("owner", "owner-uid");
        const names = getToolsForContext(ctx).map((t) => t.name);
        assert.ok(names.includes("listTasks"));
        assert.ok(names.includes("createTask"));
        assert.ok(names.includes("updateTask"));
    });

    await run("manager updateTask status via executeTool", async () => {
        const ctx = portalCtx(MGR.role, MGR.uid);
        const created = await executeTool("createTask", ctx, {
            title: "update-me",
            priority: "medium",
        });
        assert.equal(created.success, true, created.error);
        const taskId = created.data.task.id;
        const updated = await executeTool("updateTask", ctx, {
            taskId,
            status: "in_progress",
            notes: "Recorded blocker: waiting on supplier",
        });
        assert.equal(updated.success, true, updated.error);
        assert.equal(updated.data.task.status, "in_progress");
        assert.match(updated.data.task.notes || "", /supplier/i);
    });

    await run("sales updateTask denied", async () => {
        const ctx = portalCtx(SALES.role, SALES.uid);
        const result = await executeTool("updateTask", ctx, {
            taskId: "any-id",
            status: "done",
        });
        assert.equal(result.success, false);
    });

    await run("MC tenant scope: list yes, create blocked", () => {
        const mcCtx = {
            persona: SARAH_PERSONA.PLATFORM_OPERATOR,
            toolPolicy: SARAH_TOOL_POLICY.TENANT_AND_PLATFORM,
            companyId: COMPANY,
            role: "superadmin",
            isSuperAdmin: true,
            isPlatformOperator: true,
            missionControlReadOnly: true,
            canUseTool: (tool) => {
                if (tool.platformOnly) return true;
                if (MC_TENANT_READ_TOOLS.has(tool.name)) return true;
                return false;
            },
        };
        const names = getToolsForContext(mcCtx).map((t) => t.name);
        assert.ok(names.includes("listTasks"));
        assert.ok(!names.includes("createTask"));
    });

    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} passed\n`);
    process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
