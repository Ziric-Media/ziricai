#!/usr/bin/env node
/** Read-only diag: POST human + AI tasks via local portal API (no secrets printed). */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { bootstrapEnv } from "../services/env/startupEnv.js";
import { resolveWebFirebaseFromProcessEnv } from "../js/firebase-config.js";

bootstrapEnv();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const credPath = process.env.OPS_SMOKE_CREDENTIALS || join(ROOT, "test-results", "ops-centre-staging-credentials.json");
const API = (process.env.OPS_SMOKE_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

const raw = JSON.parse(readFileSync(credPath, "utf8"));
const web = resolveWebFirebaseFromProcessEnv();
if (!web.apiKey) {
    console.error("DIAG_FAIL missing Firebase web apiKey (load .env.local-staging)");
    process.exit(1);
}

const signRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(web.apiKey)}`,
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: raw.email,
            password: raw.password,
            returnSecureToken: true,
        }),
    }
);
const signData = await signRes.json();
if (!signRes.ok) {
    console.log("DIAG_AUTH_FAIL", signData.error?.message || "sign-in failed");
    process.exit(1);
}

const token = signData.idToken;
const companyId = raw.companyId;
const enc = encodeURIComponent;

async function post(label, body) {
    const res = await fetch(`${API}/api/portal/tasks/${enc(companyId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text.slice(0, 400) };
    }
    console.log(`\n=== ${label} ===`);
    console.log("HTTP", res.status);
    console.log("code", data.code ?? "(none)");
    console.log("error", data.error ?? "(none)");
    console.log("taskId", data.task?.id ?? "(none)");
    if (data.task?.executionStatus) console.log("executionStatus", data.task.executionStatus);
    return { status: res.status, data };
}

const agentsRes = await fetch(`${API}/api/companies/${enc(companyId)}/ai-employees`, {
    headers: { Authorization: `Bearer ${token}` },
});
const agentsJson = agentsRes.ok ? await agentsRes.json() : {};
const agents = agentsJson.items || agentsJson.agents || [];
const agentId = agents[0]?.id;
console.log("companyId", companyId);
console.log("aiEmployeesListed", agents.length, agentId ? `first=${agentId}` : "none");

await post("human (portal shape)", {
    title: `Diag human ${Date.now()}`,
    description: "diag",
    assigneeType: "human",
    assigneeUid: raw.uid,
    priority: "medium",
    status: "open",
});

if (!agentId) {
    console.log("\n=== ai (skipped — no agents in tenant) ===");
} else {
    await post("ai (portal shape)", {
        title: `Diag AI ${Date.now()}`,
        description: "diag",
        assigneeType: "ai",
        aiEmployeeId: agentId,
        aiInstructions: "diag",
        priority: "medium",
        status: "open",
    });
}

console.log("\nDIAG_DONE");
