#!/usr/bin/env node
/**
 * PORTAL-3A — Controlled RTB behavioral validation (production).
 * Uses RTB smoke credentials + controlled test phone webhook simulation.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getMetaAppSecret } from "../services/integrations/metaWebhook.js";
import { PRODUCTION_WEB_CONFIG } from "../js/firebase-config.js";
import { conversationDocId } from "../services/storage/tenantStorage.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const API_BASE = (process.env.PORTAL_3A_API_BASE || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const COMPANY_ID = "central-motors-rtb";
const TEST_PHONE = process.env.CONTROLLED_TEST_PHONE || "27849000523";
const PHONE_NUMBER_ID = process.env.CONTROLLED_TEST_PHONE_NUMBER_ID || "1209265748933699";
const CANONICAL_ID = conversationDocId(TEST_PHONE);
const credPath = path.join(ROOT, ".portal-rtb-smoke-credentials.json");

const results = [];

function record(test, pass, detail = "") {
    results.push({ test, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} — ${test}${detail ? `: ${detail}` : ""}`);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function signBody(rawBody, secret) {
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
    return `sha256=${crypto.createHmac("sha256", secret).update(buf).digest("hex")}`;
}

function buildPayload(message, wamid, type = "text") {
    const messages =
        type === "text"
            ? [
                  {
                      from: TEST_PHONE,
                      id: wamid,
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      type: "text",
                      text: { body: message },
                  },
              ]
            : [
                  {
                      from: TEST_PHONE,
                      id: wamid,
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      type: "image",
                      image: { id: "media-test-3a", mime_type: "image/jpeg" },
                  },
              ];

    return {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "WABA_PORTAL_3A",
                changes: [
                    {
                        field: "messages",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "15551829611",
                                phone_number_id: PHONE_NUMBER_ID,
                            },
                            contacts: [{ profile: { name: "Portal 3A Test" }, wa_id: TEST_PHONE }],
                            messages,
                        },
                    },
                ],
            },
        ],
    };
}

async function postWebhook(secret, message, label, type = "text") {
    const wamid = `wamid.portal3a-${label}-${Date.now()}`;
    const rawBody = JSON.stringify(buildPayload(message, wamid, type));
    const res = await fetch(`${API_BASE}/webhook`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Hub-Signature-256": signBody(rawBody, secret),
        },
        body: rawBody,
    });
    const text = await res.text();
    if (res.status !== 200) throw new Error(`webhook ${label} ${res.status}: ${text}`);
    return { wamid, at: new Date().toISOString() };
}

async function firebaseToken(email, password) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${PRODUCTION_WEB_CONFIG.apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Firebase auth failed");
    return data.idToken;
}

async function api(token, method, pathSuffix, body) {
    const res = await fetch(`${API_BASE}${pathSuffix}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

function assistantCount(messages) {
    return (messages || []).filter((m) => m.role === "ai" || m.role === "assistant").length;
}

function lastAssistant(messages) {
    const list = (messages || []).filter((m) => m.role === "ai" || m.role === "assistant");
    return list[list.length - 1] || null;
}

async function main() {
    console.log("PORTAL-3A behavioral RTB validation");
    console.log("API:", API_BASE);
    console.log("Company:", COMPANY_ID);
    console.log("Phone:", TEST_PHONE);
    console.log("Canonical:", CANONICAL_ID);

    const health = await (await fetch(`${API_BASE}/api/health`)).json();
    record("Live API health", health.status === "ok", JSON.stringify(health));

    if (!fs.existsSync(credPath)) throw new Error("Missing .portal-rtb-smoke-credentials.json");
    const creds = JSON.parse(fs.readFileSync(credPath, "utf8").replace(/^\uFEFF/, ""));
    const token = await firebaseToken(creds.email, creds.password);
    record("RTB smoke auth", Boolean(token));

    const secret = getMetaAppSecret();
    if (!secret) throw new Error("META_APP_SECRET required — run via railway run");

    // Ensure AI mode baseline
    await api(
        token,
        "POST",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`,
        { enabled: false }
    );

    const baselineDetail = await api(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
    const baselineMessages = baselineDetail.data?.messages || [];
    const baselineAssistants = assistantCount(baselineMessages);

    // TEST 1 — baseline AI
    const t1 = await postWebhook(secret, "PORTAL-3A baseline ping", "t1-ai");
    console.log("Waiting 45s for worker (TEST 1)...");
    await sleep(45000);
    const afterT1 = await api(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
    const t1Assistants = assistantCount(afterT1.data?.messages);
    record(
        "TEST 1 — AI mode Sarah responds",
        t1Assistants > baselineAssistants,
        `assistants ${baselineAssistants} → ${t1Assistants}; wamid ${t1.wamid.slice(0, 28)}`
    );

    // TEST 2 — TAKE OVER
    const t2 = await api(
        token,
        "POST",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`,
        { enabled: true, humanAgent: "RTB Smoke" }
    );
    const t2Detail = await api(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
    const conv = t2Detail.data?.conversation || {};
    record(
        "TEST 2 — TAKE OVER canonical state",
        t2.status === 200 &&
            t2.data?.humanTakeover === true &&
            (conv.humanTakeover === true || t2Detail.data?.humanTakeover === true) &&
            (conv.mode === "human" || t2.data?.conversation?.mode === "human"),
        `conversationId=${t2.data?.conversationId || CANONICAL_ID}`
    );

    // TEST 3 — message while human controlled
    const beforeT3 = assistantCount((t2Detail.data?.messages || []));
    const t3 = await postWebhook(secret, "PORTAL-3A human-mode ping", "t3-human");
    console.log("Waiting 45s for worker (TEST 3)...");
    await sleep(45000);
    const afterT3 = await api(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
    const afterT3Assistants = assistantCount(afterT3.data?.messages);
    record(
        "TEST 3 — no Sarah outbound under takeover",
        afterT3Assistants === beforeT3,
        `assistants stayed ${beforeT3}; inbound wamid ${t3.wamid.slice(0, 28)}`
    );

    // TEST 4 — human reply
    const humanText = `PORTAL-3A human reply ${Date.now()}`;
    const t4 = await api(
        token,
        "POST",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/reply`,
        { text: humanText, channel: "whatsapp" }
    );
    await sleep(5000);
    const afterT4 = await api(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
    const hasHumanReply = (afterT4.data?.messages || []).some(
        (m) => (m.content || m.message || "").includes("PORTAL-3A human reply")
    );
    record("TEST 4 — human reply persisted", t4.status === 200 && hasHumanReply, humanText);

    // TEST 5 — RELEASE TO AI
    const t5 = await api(
        token,
        "POST",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`,
        { enabled: false }
    );
    const t5Detail = await api(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
    const released = t5Detail.data?.conversation || {};
    record(
        "TEST 5 — RELEASE TO AI",
        t5.status === 200 &&
            t5.data?.humanTakeover === false &&
            (released.mode === "ai" || !released.humanTakeover),
        `mode=${released.mode}`
    );

    // TEST 6 — AI resumes
    const beforeT6 = assistantCount(t5Detail.data?.messages || []);
    const t6 = await postWebhook(secret, "PORTAL-3A resume ping", "t6-resume");
    console.log("Waiting 45s for worker (TEST 6)...");
    await sleep(45000);
    const afterT6 = await api(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
    const afterT6Assistants = assistantCount(afterT6.data?.messages);
    record(
        "TEST 6 — Sarah resumes after release",
        afterT6Assistants > beforeT6,
        `assistants ${beforeT6} → ${afterT6Assistants}`
    );

    // TEST 7 — queued job race: enqueue then takeover before worker
    await api(
        token,
        "POST",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`,
        { enabled: false }
    );
    const beforeT7 = assistantCount((await api(token, "GET", `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`)).data?.messages);
    const t7 = await postWebhook(secret, "PORTAL-3A race ping", "t7-race");
    await api(
        token,
        "POST",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`,
        { enabled: true }
    );
    console.log("Waiting 45s for worker (TEST 7 race)...");
    await sleep(45000);
    const afterT7 = await api(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
    record(
        "TEST 7 — queued job suppressed after takeover",
        assistantCount(afterT7.data?.messages) === beforeT7,
        `assistants ${beforeT7} unchanged; wamid ${t7.wamid.slice(0, 28)}`
    );

    // TEST 9 — non-text under takeover
    const t9 = await postWebhook(secret, "", "t9-nontext", "image");
    console.log("Waiting 30s for worker (TEST 9 non-text)...");
    await sleep(30000);
    const afterT9 = await api(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
    const nonTextReply = (afterT9.data?.messages || []).some((m) =>
        (m.content || m.message || "").includes("Please send a text message")
    );
    record(
        "TEST 9 — no NON_TEXT_REPLY under takeover",
        !nonTextReply,
        nonTextReply ? "fallback found in history" : "no fallback persisted"
    );

    // TEST 10 — auth matrix
    const unauth = await api(null, "POST", `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`, {
        enabled: true,
    });
    record("TEST 10a — unauthenticated takeover 401", unauth.status === 401, `status ${unauth.status}`);

    const wrongTenant = await api(token, "POST", `/api/companies/wrong-tenant-xyz/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`, {
        enabled: true,
    });
    record("TEST 10b — wrong tenant takeover 403", wrongTenant.status === 403, `status ${wrongTenant.status}`);

    // Cleanup — release to AI
    await api(
        token,
        "POST",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`,
        { enabled: false }
    );

    const failed = results.filter((r) => !r.pass);
    console.log("\n--- Summary ---");
    for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.test}`);
    if (failed.length) {
        console.error(`\n${failed.length} behavioral test(s) FAILED`);
        process.exit(1);
    }
    console.log("\nPORTAL-3A READY FOR CLOSURE (pending your review)");
}

main().catch((err) => {
    console.error("Behavioral test error:", err.message);
    process.exit(1);
});
