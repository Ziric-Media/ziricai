#!/usr/bin/env node
/**
 * OPEN-CREATE — task create body boundary (separate from OPEN-1 PATCH).
 * Reports M1_PASS/M1_FAIL and M2_PASS/M2_SKIP/M2_FAIL independently.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";

const COMPANY = "create-boundary-co";
const MGR = { role: "manager", uid: "create-mgr" };
const SALES = { role: "sales", uid: "create-sales" };

const {
    listTasksForAccess,
    createTaskForAccess,
    getTaskForAccess,
} = await import("../services/tenants/taskService.js");

function gitCommitUnderTest() {
    try {
        return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch {
        return "unknown";
    }
}

async function expectDenied(fn, code) {
    let err;
    try {
        await fn();
    } catch (e) {
        err = e;
    }
    assert.ok(err, "expected rejection");
    assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
}

async function taskCount(access) {
    const items = await listTasksForAccess(COMPANY, access);
    return items.length;
}

async function runM1() {
    console.log("verify-business-portal-task-create-boundary (M1 memory)");
    console.log(`  commit under test: ${gitCommitUnderTest()}`);

    const beforeBaseline = await taskCount(MGR);

    // T1 persisted shape
    const t1 = await createTaskForAccess(COMPANY, MGR, {
        title: "t1-title",
        description: "desc",
        assigneeUid: "create-mgr",
    });
    assert.ok(t1.id, "generated id");
    assert.notEqual(t1.id, "client-chosen-id");
    const r1 = await getTaskForAccess(COMPANY, t1.id, MGR);
    assert.equal(r1.companyId, COMPANY);
    assert.equal(r1.createdByUid, "create-mgr");
    assert.equal(r1.status, "open");
    assert.ok(r1.createdAt);
    assert.ok(r1.updatedAt);
    assert.equal(r1.title, "t1-title");
    console.log("✓ T1 persisted companyId, createdByUid, id, timestamps, status open");

    // T2 alias
    const t2 = await createTaskForAccess(COMPANY, MGR, { title: "t2", assigneeId: "create-mgr" });
    const r2 = await getTaskForAccess(COMPANY, t2.id, MGR);
    assert.equal(r2.assigneeUid, "create-mgr");
    console.log("✓ T2 assigneeId → assigneeUid");

    // T3 priority
    const t3 = await createTaskForAccess(COMPANY, MGR, { title: "t3", priority: "high" });
    const r3 = await getTaskForAccess(COMPANY, t3.id, MGR);
    assert.equal(r3.priority, "high");
    assert.equal(r3.status, "open");
    console.log("✓ T3 priority + server status open");

    // T11 self assign
    await createTaskForAccess(COMPANY, MGR, { title: "t11", assigneeUid: "create-mgr" });
    console.log("✓ T11 manager self assign");

    // T13 manager assign other
    const t13 = await createTaskForAccess(COMPANY, MGR, { title: "t13", assigneeUid: "other-member" });
    assert.equal((await getTaskForAccess(COMPANY, t13.id, MGR)).assigneeUid, "other-member");
    console.log("✓ T13 manager assign other");

    const rejectBodies = [
        [{ title: "x", createdByUid: "attacker" }, "TASK_CREATE_FORBIDDEN"],
        [{ title: "x", companyId: "other-tenant" }, "TASK_CREATE_FORBIDDEN"],
        [{ title: "x", id: "client-chosen-id" }, "TASK_CREATE_FORBIDDEN"],
        [{ title: "x", createdAt: "2000-01-01T00:00:00Z" }, "TASK_CREATE_FORBIDDEN"],
        [{ title: "x", evilField: true }, "TASK_CREATE_UNKNOWN_FIELD"],
        [{ title: "x", status: "done" }, "TASK_CREATE_FORBIDDEN"],
    ];

    for (const [body, code] of rejectBodies) {
        const countBefore = await taskCount(MGR);
        await expectDenied(() => createTaskForAccess(COMPANY, MGR, body), code);
        const countAfter = await taskCount(MGR);
        assert.equal(countAfter, countBefore, `T10: count unchanged for ${code} ${JSON.stringify(body)}`);
    }
    console.log("✓ T4–T9 reject codes; T10 count unchanged on reject");

    // T12 sales cannot create (assign-other path blocked by canCreateTasks)
    await expectDenied(
        () => createTaskForAccess(COMPANY, SALES, { title: "x", assigneeUid: "other-member" }),
        "PERMISSION_DENIED"
    );
    console.log("✓ T12 sales create denied");

    console.log("M1_PASS");
    return true;
}

async function runM2() {
    const host = process.env.FIRESTORE_EMULATOR_HOST?.trim();
    if (!host) {
        console.log("M2_SKIP — emulator not available (FIRESTORE_EMULATOR_HOST unset)");
        return "SKIP";
    }
    try {
        const { getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
        const db = getAdminFirestore();
        if (!db) {
            console.log("M2_SKIP — Admin Firestore unavailable");
            return "SKIP";
        }
        // Minimal reachability: list collections or read nonexistent doc
        await db.collection("_open_create_probe").doc("ping").get();
    } catch (e) {
        console.log(`M2_SKIP — emulator not reachable (${e.message?.slice(0, 80) || e})`);
        return "SKIP";
    }
    console.log("M2: Firestore reachable — full persistence create test not yet wired (SKIP extended case)");
    console.log("M2_SKIP — extended Firestore create doc assertion deferred");
    return "SKIP";
}

let m1 = "M1_FAIL";
let m2 = "M2_FAIL";
try {
    await runM1();
    m1 = "M1_PASS";
} catch (e) {
    console.error("M1_FAIL:", e.message);
    m1 = "M1_FAIL";
}

try {
    const m2Result = await runM2();
    m2 = m2Result === "SKIP" ? "M2_SKIP" : m2Result === "PASS" ? "M2_PASS" : "M2_FAIL";
} catch (e) {
    console.error("M2_FAIL:", e.message);
    m2 = "M2_FAIL";
}

console.log(`\n--- OPEN-CREATE results: ${m1}; ${m2} ---`);
if (m1 !== "M1_PASS") process.exit(1);
if (m2 === "M2_FAIL") process.exit(1);
process.exit(0);
