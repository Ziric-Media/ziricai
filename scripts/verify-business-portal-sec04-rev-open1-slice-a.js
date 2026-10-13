#!/usr/bin/env node
/**
 * Slice A — OPEN-1 task PATCH allowlist + REV-01 assertCanUpdateTask / updateTaskForAccess.
 * Does not prove SEC-02 fail-closed middleware (REV-03) — see verify-business-portal-sec04-rev-followups.js (Slice B).
 */
import assert from "node:assert/strict";
import {
    assertCanUpdateTask,
    sanitizeTaskUpdatePatch,
} from "../services/auth/taskPermissionPolicy.js";
import { updateTaskForAccess, createTaskForAccess, getTaskForAccess } from "../services/tenants/taskService.js";

async function expectDenied(fn, code) {
    try {
        await fn();
        assert.fail("Expected denial");
    } catch (err) {
        if (code) assert.equal(err.code, code, err.message);
        return err;
    }
}

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";

console.log("verify-business-portal-sec04-rev-open1-slice-a (Slice A evidence only)\n");

await expectDenied(() => sanitizeTaskUpdatePatch({ createdByUid: "x" }), "TASK_PATCH_FORBIDDEN");
await expectDenied(() => sanitizeTaskUpdatePatch({ notAField: 1 }), "TASK_PATCH_UNKNOWN_FIELD");
assert.deepEqual(sanitizeTaskUpdatePatch({ title: "ok" }), { title: "ok" });
console.log("✓ OPEN-1: sanitizeTaskUpdatePatch allowlist");

const taskA = { id: "t1", assigneeUid: "user-a" };
const taskB = { id: "t2", assigneeUid: "user-b" };

assertCanUpdateTask("manager", taskB, "mgr-1", { title: "x" });
assertCanUpdateTask("sales", taskA, "user-a", { status: "done" });
await expectDenied(() => assertCanUpdateTask("sales", taskB, "user-a", { title: "nope" }), "PERMISSION_DENIED");
await expectDenied(() => assertCanUpdateTask("viewer", taskB, "viewer-1", { title: "nope" }), "TASK_FORBIDDEN");
assertCanUpdateTask("viewer", { assigneeUid: "viewer-1" }, "viewer-1", { status: "done" });
await expectDenied(() => assertCanUpdateTask("hr", taskB, "hr-1", { title: "x" }), "PERMISSION_DENIED");
assertCanUpdateTask("hr", { assigneeUid: "hr-1" }, "hr-1", { title: "own" });
await expectDenied(
    () => assertCanUpdateTask("sales", taskA, "user-a", { assigneeUid: "user-b" }),
    "PERMISSION_DENIED"
);
assertCanUpdateTask("manager", taskA, "mgr-1", { assigneeUid: "user-b" });
console.log("✓ REV-01: assertCanUpdateTask enforces own/any/assign/viewer/hr paths");

const revCompany = "sec04-rev-task-co";
const mgrAccess = { role: "manager", uid: "rev-mgr" };
const revTask = await createTaskForAccess(revCompany, mgrAccess, { title: "rev", assigneeUid: "rev-mgr" });
await updateTaskForAccess(revCompany, revTask.id, mgrAccess, { description: "via-service" });
const revLoaded = await getTaskForAccess(revCompany, revTask.id, mgrAccess);
assert.equal(revLoaded.description, "via-service");
await expectDenied(
    () => updateTaskForAccess(revCompany, revTask.id, mgrAccess, { id: "evil" }),
    "TASK_PATCH_FORBIDDEN"
);
console.log("✓ OPEN-1: updateTaskForAccess persistence path rejects protected fields");

console.log("\nSlice A OPEN-1 / REV-01 checks passed (service-layer; not HTTP or REV-03 middleware).");
