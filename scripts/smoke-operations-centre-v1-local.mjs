#!/usr/bin/env node
/**
 * Operations Centre v1 — local smoke checklist (service layer + optional --live HTTP).
 *
 * Memory phase: dedicated tenant ops-centre-smoke-local (no Firebase).
 * Live phase (--live): API at OPS_SMOKE_API_BASE (default http://127.0.0.1:3000)
 *   + credentials from test-results/client-0-2-embed-signup-e2e-credentials.json
 *
 * Firestore persistence (live): when server uses STORAGE_BACKEND=firestore, re-GET task after create.
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SMOKE_SCRIPT = fileURLToPath(import.meta.url);
const MEMORY_ONLY = process.argv.includes("--memory-only");
import { bootstrapEnv } from "../services/env/startupEnv.js";
import { resolveWebFirebaseFromProcessEnv } from "../js/firebase-config.js";
import { checkPermission } from "../services/auth/permissionsService.js";

bootstrapEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
const API_BASE = (process.env.OPS_SMOKE_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const STAGING_CREDENTIALS_FILE = join(ROOT, "test-results", "ops-centre-staging-credentials.json");
const CREDENTIALS_FILE =
    process.env.OPS_SMOKE_CREDENTIALS ||
    (existsSync(STAGING_CREDENTIALS_FILE)
        ? STAGING_CREDENTIALS_FILE
        : join(ROOT, "test-results", "client-0-2-embed-signup-e2e-credentials.json"));
const MEMORY_COMPANY_PREFIX = "ops-centre-smoke-local";

/** @type {{ id: string, category: string, name: string, status: 'PASS'|'FAIL'|'SKIP', detail: string }[]} */
const checklist = [];

function record(id, category, name, status, detail = "") {
    checklist.push({ id, category, name, status, detail });
    const mark = status === "PASS" ? "✓" : status === "SKIP" ? "○" : "✗";
    console.log(`${mark} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectDenied(fn, code) {
    try {
        await fn();
        throw new Error("expected rejection");
    } catch (e) {
        if (code && e.code !== code) {
            throw new Error(`expected ${code}, got ${e.code}: ${e.message}`);
        }
        return e;
    }
}

function runCheckPermission(permission, tenant) {
    const mw = checkPermission(permission);
    let statusCode;
    let payload;
    let nextCalled = false;
    const req = { tenant };
    const res = {
        status(code) {
            statusCode = code;
            return res;
        },
        json(body) {
            payload = body;
        },
    };
    mw(req, res, () => {
        nextCalled = true;
    });
    return { statusCode, payload, nextCalled };
}

async function apiFetch(method, path, { token, body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text.slice(0, 300) };
    }
    return { status: res.status, data };
}

async function firebaseIdToken(email, password) {
    const web = resolveWebFirebaseFromProcessEnv();
    if (!web.apiKey) {
        throw new Error(
            "FIREBASE_API_KEY missing or invalid — use .env.local-staging (see docs/deployment/LOCAL-STAGING-OPS-SMOKE.md)"
        );
    }
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(web.apiKey)}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Firebase sign-in failed");
    return data.idToken;
}

function loadCredentials() {
    if (!existsSync(CREDENTIALS_FILE)) {
        throw new Error(`Missing credentials: ${CREDENTIALS_FILE}`);
    }
    const raw = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8"));
    const email = raw.email || raw.ownerEmail;
    const password = raw.password || raw.ownerPassword;
    const companyId = raw.companyId;
    if (!email || !password || !companyId) {
        throw new Error("Credentials need email, password, companyId");
    }
    return { email, password, companyId, label: raw.label || companyId };
}

async function runMemoryPhase() {
    const companyId = `${MEMORY_COMPANY_PREFIX}-${Date.now().toString(36)}`;
    const {
        listTasksForAccess,
        createTaskForAccess,
        getTaskForAccess,
        updateTaskForAccess,
    } = await import("../services/tenants/taskService.js");

    const owner = { role: "owner", uid: "ops-owner" };
    const manager = { role: "manager", uid: "ops-mgr" };
    const viewer = { role: "viewer", uid: "ops-viewer" };
    const sales = { role: "sales", uid: "ops-sales" };

    try {
        const ownerList = await listTasksForAccess(companyId, owner);
        assert.ok(Array.isArray(ownerList));
        record("access-owner-list", "Access", "Owner can open Operations and list tasks", "PASS", "service layer");
    } catch (e) {
        record("access-owner-list", "Access", "Owner can open Operations and list tasks", "FAIL", e.message);
    }

    let mgrTaskId;
    try {
        const t = await createTaskForAccess(companyId, manager, {
            title: "Manager smoke task",
            assigneeUid: "ops-mgr",
        });
        mgrTaskId = t.id;
        assert.ok(t.id);
        record("wf-manager-create", "Task workflow", "Manager can create a task", "PASS", "service layer");
    } catch (e) {
        record("wf-manager-create", "Task workflow", "Manager can create a task", "FAIL", e.message);
    }

    try {
        const other = await createTaskForAccess(companyId, manager, {
            title: "Assigned to sales",
            assigneeUid: "ops-sales",
        });
        await updateTaskForAccess(companyId, other.id, manager, { priority: "high" });
        await updateTaskForAccess(companyId, other.id, { role: "sales", uid: "ops-sales" }, {
            notes: "sales own update",
        });
        record(
            "wf-assign-update",
            "Task workflow",
            "Authorized user can assign and update a task",
            "PASS",
            "manager assign + sales own PATCH"
        );
    } catch (e) {
        record("wf-assign-update", "Task workflow", "Authorized user can assign and update a task", "FAIL", e.message);
    }

    try {
        if (!mgrTaskId) throw new Error("no manager task");
        await updateTaskForAccess(companyId, mgrTaskId, manager, { status: "done" });
        const done = await getTaskForAccess(companyId, mgrTaskId, manager);
        assert.equal(done.status, "done");
        record("wf-complete", "Task workflow", "Permitted user can complete a task", "PASS", "service layer");
    } catch (e) {
        record("wf-complete", "Task workflow", "Permitted user can complete a task", "FAIL", e.message);
    }

    try {
        await createTaskForAccess(companyId, manager, {
            title: "Viewer only",
            assigneeUid: "ops-viewer",
        });
        await createTaskForAccess(companyId, manager, {
            title: "Not for viewer",
            assigneeUid: "ops-mgr",
        });
        const viewerList = await listTasksForAccess(companyId, viewer);
        assert.ok(viewerList.every((t) => (t.assigneeUid || t.assigneeId) === "ops-viewer"));
        assert.ok(viewerList.some((t) => t.title === "Viewer only"));
        assert.ok(!viewerList.some((t) => t.title === "Not for viewer"));
        await expectDenied(
            () => getTaskForAccess(companyId, mgrTaskId, viewer),
            "TASK_FORBIDDEN"
        );
        record(
            "access-viewer-filter",
            "Access",
            "Viewer sees only tasks allowed by server policy",
            "PASS",
            "list + direct GET guard"
        );
    } catch (e) {
        record("access-viewer-filter", "Access", "Viewer sees only tasks allowed by server policy", "FAIL", e.message);
    }

    try {
        const unauth = runCheckPermission("canViewTasks", { uid: null, role: null, isSuperAdmin: false });
        assert.equal(unauth.nextCalled, false);
        assert.equal(unauth.statusCode, 401);
        await expectDenied(
            () => createTaskForAccess(companyId, sales, { title: "nope" }),
            "PERMISSION_DENIED"
        );
        await expectDenied(
            () => createTaskForAccess(companyId, manager, { title: "x", companyId: "evil" }),
            "TASK_CREATE_FORBIDDEN"
        );
        record(
            "security-api-policy",
            "Security",
            "Direct API requests cannot bypass permissions",
            "PASS",
            "middleware 401 + service denials"
        );
    } catch (e) {
        record(
            "security-api-policy",
            "Security",
            "Direct API requests cannot bypass permissions",
            "FAIL",
            e.message
        );
    }

    record(
        "persistence-memory",
        "Persistence",
        "Tasks persist after reload when using Firestore",
        "SKIP",
        "memory phase — use --live with STORAGE_BACKEND=firestore for M2"
    );
}

async function runLivePhase() {
    const health = await apiFetch("GET", "/api/health");
    if (health.status === 503) {
        throw new Error("API still starting — wait for /api/health 200");
    }
    assert.ok(health.status === 200, `health ${health.status}`);

    const creds = loadCredentials();
    let token;
    try {
        token = await firebaseIdToken(creds.email, creds.password);
        record("live-firebase-sign-in", "Access", "Firebase sign-in", "PASS", creds.label || creds.companyId);
    } catch (e) {
        record("live-firebase-sign-in", "Access", "Firebase sign-in", "FAIL", e.message);
        throw e;
    }
    const enc = (id) => encodeURIComponent(id);

    const unauthTasks = await apiFetch("GET", `/api/portal/tasks/${enc(creds.companyId)}`);
    assert.equal(unauthTasks.status, 401);
    const salesBody = { title: "live sales denied" };
    const unauthCreate = await apiFetch("POST", `/api/portal/tasks/${enc(creds.companyId)}`, { body: salesBody });
    assert.equal(unauthCreate.status, 401);

    const list = await apiFetch("GET", `/api/portal/tasks/${enc(creds.companyId)}`, { token });
    assert.equal(list.status, 200, JSON.stringify(list.data));
    record(
        "access-owner-list",
        "Access",
        "Owner can open Operations and list tasks",
        "PASS",
        `HTTP GET portal/tasks → ${list.status}`
    );

    const create = await apiFetch("POST", `/api/portal/tasks/${enc(creds.companyId)}`, {
        token,
        body: { title: `Ops smoke ${Date.now()}`, priority: "medium" },
    });
    assert.equal(create.status, 201, JSON.stringify(create.data));
    const taskId = create.data?.task?.id;
    assert.ok(taskId);
    record(
        "wf-manager-create",
        "Task workflow",
        "Manager can create a task",
        "PASS",
        `owner/manager HTTP POST → ${create.status}`
    );

    const patch = await apiFetch("PATCH", `/api/portal/tasks/${enc(creds.companyId)}/${enc(taskId)}`, {
        token,
        body: { description: "live update", assigneeUid: creds.uid || undefined },
    });
    assert.equal(patch.status, 200, JSON.stringify(patch.data));

    const complete = await apiFetch("PATCH", `/api/portal/tasks/${enc(creds.companyId)}/${enc(taskId)}`, {
        token,
        body: { status: "done" },
    });
    assert.equal(complete.status, 200, JSON.stringify(complete.data));
    record("wf-assign-update", "Task workflow", "Authorized user can assign and update a task", "PASS", "HTTP PATCH");
    record("wf-complete", "Task workflow", "Permitted user can complete a task", "PASS", "HTTP PATCH status=done");

    const badCreate = await apiFetch("POST", `/api/portal/tasks/${enc(creds.companyId)}`, {
        token,
        body: { title: "bad", status: "done" },
    });
    assert.equal(badCreate.data?.code, "TASK_CREATE_INVALID");
    record(
        "security-api-policy",
        "Security",
        "Direct API requests cannot bypass permissions",
        "PASS",
        "unauth 401 + OPEN-CREATE reject"
    );

    const reload = await apiFetch("GET", `/api/portal/tasks/${enc(creds.companyId)}/${enc(taskId)}`, { token });
    assert.equal(reload.status, 200);
    assert.equal(reload.data?.task?.status, "done");
    const storage = (process.env.OPS_SMOKE_SERVER_STORAGE || process.env.STORAGE_BACKEND || "unknown").toLowerCase();
    if (storage === "firestore") {
        record(
            "persistence-firestore",
            "Persistence",
            "Tasks persist after reload when using Firestore",
            "PASS",
            `GET task ${taskId} status done`
        );
    } else {
        record(
            "persistence-firestore",
            "Persistence",
            "Tasks persist after reload when using Firestore",
            "SKIP",
            `server storage=${storage} (set STORAGE_BACKEND=firestore for M2)`
        );
    }

    record(
        "access-viewer-filter",
        "Access",
        "Viewer sees only tasks allowed by server policy",
        "SKIP",
        "live run uses owner token — covered in memory phase"
    );

    const regression = [
        ["GET", `/api/portal/team/${enc(creds.companyId)}`],
        ["GET", `/api/portal/hub/${enc(creds.companyId)}`],
        ["GET", `/api/companies/${enc(creds.companyId)}/crm/customers?limit=5`],
        ["GET", `/api/companies/${enc(creds.companyId)}/team`],
    ];
    for (const [method, path] of regression) {
        const r = await apiFetch(method, path, { token });
        assert.equal(r.status, 200, `${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`);
    }
    const unauthIntegrations = await apiFetch(
        "POST",
        `/api/companies/${enc(creds.companyId)}/integrations/whatsapp/embedded-signup`,
        { body: {} }
    );
    assert.ok(unauthIntegrations.status === 401 || unauthIntegrations.status === 403);
    record(
        "regression-portal",
        "Regression",
        "Team, CRM and other existing portal flows still work",
        "PASS",
        "team/hub/crm/team + integration route auth"
    );
}

function printSummary() {
    const passed = checklist.filter((c) => c.status === "PASS").length;
    const failed = checklist.filter((c) => c.status === "FAIL").length;
    const skipped = checklist.filter((c) => c.status === "SKIP").length;
    console.log("\n--- Operations Centre v1 smoke checklist ---");
    for (const c of checklist) {
        console.log(`${c.status.padEnd(4)} | ${c.category} | ${c.name}`);
    }
    console.log(`\nTotals: ${passed} PASS, ${failed} FAIL, ${skipped} SKIP (${checklist.length} rows)`);
    console.log("\nCopy test results (markdown):");
    console.log("| Check | Result | Notes |");
    console.log("|-------|--------|-------|");
    const seen = new Set();
    for (const c of checklist) {
        const key = c.name;
        if (seen.has(key)) continue;
        seen.add(key);
        const notes = checklist
            .filter((x) => x.name === key)
            .map((x) => x.detail)
            .filter(Boolean)
            .join("; ");
        console.log(`| ${c.name} | ${c.status} | ${notes || "—"} |`);
    }
    if (failed > 0) process.exit(1);
}

console.log("smoke-operations-centre-v1-local\n");

if (!MEMORY_ONLY && !process.env.OPS_SMOKE_MEMORY_ISOLATED) {
    const childArgs = [SMOKE_SCRIPT, "--memory-only"];
    const child = spawnSync(process.execPath, childArgs, {
        env: { ...process.env, STORAGE_BACKEND: "memory", OPS_SMOKE_MEMORY_ISOLATED: "1" },
        stdio: "inherit",
    });
    if (child.status !== 0) {
        process.exit(child.status ?? 1);
    }
    if (!LIVE) {
        console.log("\n(memory phase OK — run with --live for HTTP + Firestore persistence)\n");
        process.exit(0);
    }
} else {
    try {
        await runMemoryPhase();
    } catch (e) {
        console.error("Memory phase fatal:", e.message);
        process.exit(1);
    }
    printSummary();
    process.exit(checklist.some((c) => c.status === "FAIL") ? 1 : 0);
}

if (LIVE) {
    console.log("\n--live HTTP (tenant from credentials file)\n");
    try {
        await runLivePhase();
    } catch (e) {
        record("live-fatal", "Live", "HTTP smoke", "FAIL", e.message);
        console.error("Live phase error:", e.message);
    }
}

printSummary();
