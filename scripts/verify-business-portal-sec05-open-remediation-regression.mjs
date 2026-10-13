#!/usr/bin/env node
/**
 * Gate A OPEN-1 / OPEN-2 regression — MC session overwrite + task PATCH allowlist (local, no deploy).
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";

import assert from "node:assert/strict";
import {
    mcScopeKey,
    getOrCreateMcSarahSession,
    loadMcSarahSession,
    appendMcSarahMessage,
} from "../services/sarah/mcSessionStore.js";
import { MC_SCOPE } from "../services/sarah/mcToolPolicy.js";
import { sanitizeTaskUpdatePatch } from "../services/auth/taskPermissionPolicy.js";
import {
    createTaskForAccess,
    updateTaskForAccess,
    getTaskForAccess,
} from "../services/tenants/taskService.js";

async function expectDenied(fn, code) {
    try {
        await fn();
        assert.fail("Expected denial");
    } catch (err) {
        if (code) assert.equal(err.code, code, err.message);
        return err;
    }
}

async function testMcSessionNoOverwriteOnForeignId() {
    const a = await getOrCreateMcSarahSession({
        operatorUid: "open2-operator-a",
        scopeMode: MC_SCOPE.PLATFORM,
        scopedCompanyId: null,
    });
    await appendMcSarahMessage(a, "user", "operator-a-secret-marker");

    await expectDenied(
        () =>
            getOrCreateMcSarahSession({
                sessionId: a.id,
                operatorUid: "open2-operator-b",
                scopeMode: MC_SCOPE.PLATFORM,
                scopedCompanyId: null,
            }),
        "SARAH_SESSION_FORBIDDEN"
    );

    const reload = await loadMcSarahSession({
        sessionId: a.id,
        operatorUid: "open2-operator-a",
        scopeKey: mcScopeKey(null),
    });
    assert.ok(reload, "operator A session still loadable");
    assert.equal(reload.operatorUid, "open2-operator-a");
    assert.equal(reload.messages.length, 1);
    assert.match(reload.messages[0].content, /operator-a-secret-marker/);
}

async function testTaskPatchAllowlistThroughService() {
    const companyId = "open1-company";
    const access = { role: "manager", uid: "open1-mgr" };
    const created = await createTaskForAccess(companyId, access, {
        title: "baseline",
        assigneeUid: "open1-mgr",
    });
    assert.ok(created?.id, "task created");

    const updated = await updateTaskForAccess(companyId, created.id, access, { title: "allowed-title" });
    assert.equal(updated.title, "allowed-title");

    await expectDenied(
        () => updateTaskForAccess(companyId, created.id, access, { createdByUid: "attacker" }),
        "TASK_PATCH_FORBIDDEN"
    );
    await expectDenied(
        () => updateTaskForAccess(companyId, created.id, access, { companyId: "other-tenant" }),
        "TASK_PATCH_FORBIDDEN"
    );
    await expectDenied(
        () => updateTaskForAccess(companyId, created.id, access, { evilField: true }),
        "TASK_PATCH_UNKNOWN_FIELD"
    );

    const after = await getTaskForAccess(companyId, created.id, access);
    assert.equal(after.title, "allowed-title");
    assert.equal(after.createdByUid, "open1-mgr");
}

function testSanitizeAssigneeIdAlias() {
    const out = sanitizeTaskUpdatePatch({ assigneeId: "u2", title: "t" });
    assert.equal(out.assigneeUid, "u2");
    assert.equal(out.assigneeId, undefined);
    assert.equal(out.title, "t");
}

console.log("verify-business-portal-sec05-open-remediation-regression\n");

await testMcSessionNoOverwriteOnForeignId();
console.log("✓ OPEN-2: foreign sessionId cannot overwrite MC session (memory + load check)");

await testTaskPatchAllowlistThroughService();
console.log("✓ OPEN-1: updateTaskForAccess rejects protected/unknown PATCH fields");

testSanitizeAssigneeIdAlias();
console.log("✓ OPEN-1: assigneeId normalized to assigneeUid in sanitize");

async function runFirestoreOpen2IfConfigured() {
    if (!process.env.FIRESTORE_EMULATOR_HOST?.trim()) {
        console.log(
            "\n⊘ OPEN-2 Firestore boundary: SKIPPED (FIRESTORE_EMULATOR_HOST not set — memory tests above do NOT prove Firestore merge safety)"
        );
        console.log("  Run: firebase emulators:start --only firestore");
        console.log('  Then: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/verify-mc-session-open2-firestore-emulator.mjs');
        return;
    }
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const script = join(root, "scripts/verify-mc-session-open2-firestore-emulator.mjs");
    const r = spawnSync(process.execPath, [script], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env },
    });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status !== 0) {
        throw new Error(`Firestore OPEN-2 regression failed or unavailable (exit ${r.status})`);
    }
}

await runFirestoreOpen2IfConfigured();

console.log("\nOPEN remediation regression passed (memory); see Firestore line above for OPEN-2 persistence boundary.");
