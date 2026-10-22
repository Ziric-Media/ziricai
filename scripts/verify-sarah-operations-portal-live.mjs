#!/usr/bin/env node
/**
 * Portal Sarah + Operations — live HTTP against local dev (staging auth + Firestore).
 * Does not commit or deploy. Requires dev:app on OPS_SMOKE_API_BASE.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapEnv } from "../services/env/startupEnv.js";
import { resolveWebFirebaseFromProcessEnv } from "../js/firebase-config.js";

bootstrapEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = (process.env.OPS_SMOKE_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const CREDENTIALS_FILE = join(ROOT, "test-results", "ops-centre-staging-credentials.json");

async function firebaseIdToken(email, password) {
    const web = resolveWebFirebaseFromProcessEnv();
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

async function sarahChat(token, companyId, message, sessionId) {
    const res = await fetch(`${API_BASE}/api/sarah/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            message,
            companyId,
            surface: "portal",
            sessionId,
        }),
    });
    const data = await res.json();
    return { status: res.status, data };
}

async function listTasksApi(token, companyId) {
    const res = await fetch(`${API_BASE}/api/portal/tasks/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return { status: res.status, data };
}

function toolNamesFromActions(actions) {
    return (actions || []).map((a) => a.tool || a.name).filter(Boolean);
}

async function main() {
    if (!existsSync(CREDENTIALS_FILE)) {
        console.error("Missing credentials file");
        process.exit(1);
    }
    const cred = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8"));
    const token = await firebaseIdToken(cred.email, cred.password);
    const companyId = cred.companyId;

    console.log("\nSarah Operations portal live checks\n");

    const listRes = await sarahChat(token, companyId, "What open tasks do we have?");
    console.log("list chat HTTP", listRes.status);
    console.log("mode", listRes.data.mode);
    console.log("tools", toolNamesFromActions(listRes.data.actions));
    console.log("reply excerpt", String(listRes.data.reply || "").slice(0, 280));

    const runTag = process.env.SARAH_OPS_TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
    const createMsg = `Create a task: Sarah portal automation ${runTag} follow up with supplier by Friday`;
    const createRes = await sarahChat(token, companyId, createMsg, listRes.data.sessionId);
    console.log("\ncreate chat HTTP", createRes.status);
    console.log("tools", toolNamesFromActions(createRes.data.actions));
    const createAction = (createRes.data.actions || []).find((a) => a.tool === "createTask");
    const createdId = createAction?.data?.task?.id;
    const createdDue = createAction?.data?.task?.dueAt;
    console.log("created task id", createdId || "(none)");
    console.log("created dueAt", createdDue ?? "(none)");
    console.log("reply excerpt", String(createRes.data.reply || "").slice(0, 280));

    const apiList = await listTasksApi(token, companyId);
    const titles = (apiList.data.items || []).map((t) => t.title);
    const found = titles.some((t) => String(t).includes(runTag));
    console.log("\nportal tasks GET", apiList.status, "count", titles.length, "found new", found);

    const ok =
        listRes.status === 200 &&
        toolNamesFromActions(listRes.data.actions).includes("listTasks") &&
        createRes.status === 200 &&
        createAction?.success &&
        createdId &&
        found;

    console.log(ok ? "\nSARAH_OPS_PORTAL_LIVE_PASS" : "\nSARAH_OPS_PORTAL_LIVE_FAIL");
    process.exit(ok ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
