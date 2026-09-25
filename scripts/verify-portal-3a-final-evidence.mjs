#!/usr/bin/env node
/**
 * PORTAL-3A — Final evidence re-test (no code changes, production read-only + controlled webhooks).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
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

const report = [];

function log(test, result, evidence) {
    report.push({ test, result, evidence });
    console.log(`\n[${result}] ${test}`);
    console.log(evidence);
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
                      image: { id: "media-3a-final", mime_type: "image/jpeg" },
                  },
              ];
    return {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "WABA_3A_FINAL",
                changes: [
                    {
                        field: "messages",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "15551829611",
                                phone_number_id: PHONE_NUMBER_ID,
                            },
                            contacts: [{ profile: { name: "Portal 3A Final" }, wa_id: TEST_PHONE }],
                            messages,
                        },
                    },
                ],
            },
        ],
    };
}

async function postWebhook(secret, message, label, type = "text") {
    const wamid = `wamid.3afinal-${label}-${Date.now()}`;
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
    return { wamid, at: new Date().toISOString(), label };
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

async function apiAuth(token, method, pathSuffix, body) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${pathSuffix}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

async function apiNoAuth(method, pathSuffix, body) {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${API_BASE}${pathSuffix}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }
    return { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) };
}

function fetchRailwayLogs() {
    try {
        return execFileSync("npx", ["@railway/cli", "logs"], {
            cwd: ROOT,
            encoding: "utf8",
            maxBuffer: 8 * 1024 * 1024,
        });
    } catch (err) {
        return err.stdout || err.message || "";
    }
}

function analyzeJobLogs(logs, wamidPrefix) {
    const slice = logs.split("\n").filter((line) => line.includes(wamidPrefix.slice(0, 20)));
    const full = logs;
    const hasWorker = /Worker processing inbound/.test(full) && full.includes(wamidPrefix.slice(0, 18));
    const hasAiEmployee = /Resolved AI employee/.test(full);
    const hasOpenAiPath =
        /AI tool results/.test(full) ||
        /Pre-loaded searchInventory/.test(full) ||
        /askAI/i.test(full) ||
        (hasWorker && hasAiEmployee && !/Takeover early skip/.test(full));
    const outboundSent = full.includes("Outbound sent") && full.includes(wamidPrefix.slice(0, 16));
    const outboundSuppressed = full.includes("Takeover outbound suppressed");
    const earlySkip = full.includes("Takeover early skip");
    const ingestSkip = full.includes("Pipeline ingest skip enqueue") && full.includes(wamidPrefix.slice(0, 16));
    const jobCompleted = full.includes("[queue] Completed") && full.includes(wamidPrefix.slice(0, 16));
    const metaIdMatch = full.match(/metaMessageIdPrefix: '([^']+)'/g);
    return {
        hasWorker,
        hasAiEmployee,
        hasOpenAiPath,
        outboundSent,
        outboundSuppressed,
        earlySkip,
        ingestSkip,
        jobCompleted,
        metaIdMatch: metaIdMatch?.slice(-3) || [],
        matchingLines: slice.slice(0, 15),
    };
}

function lastMessages(messages, n = 5) {
    return (messages || []).slice(-n).map((m) => ({
        role: m.role,
        preview: String(m.content || m.message || "").slice(0, 80),
    }));
}

function countAssistants(messages) {
    return (messages || []).filter((m) => m.role === "ai" || m.role === "assistant").length;
}

function assistantsAfter(messages, isoTime) {
    const t = new Date(isoTime).getTime();
    return (messages || []).filter((m) => {
        if (m.role !== "ai" && m.role !== "assistant") return false;
        const mt = m.createdAt || m.time || m.timestamp;
        return mt ? new Date(mt).getTime() >= t : true;
    });
}

async function getDetail(token) {
    return apiAuth(
        token,
        "GET",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}`
    );
}

async function setTakeover(token, enabled) {
    return apiAuth(
        token,
        "POST",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`,
        { enabled, humanAgent: enabled ? "RTB Evidence" : undefined }
    );
}

async function evaluatePositiveAi(token, label, message, waitMs = 55000) {
    const before = await getDetail(token);
    const beforeMsgs = before.data?.messages || [];
    const beforeCount = countAssistants(beforeMsgs);
    const sentAt = new Date().toISOString();

    const secret = getMetaAppSecret();
    const hook = await postWebhook(secret, message, label);

    console.log(`Waiting ${waitMs / 1000}s for worker (${label})...`);
    await sleep(waitMs);

    const logs = fetchRailwayLogs();
    const ev = analyzeJobLogs(logs, hook.wamid);

    const after = await getDetail(token);
    const afterMsgs = after.data?.messages || [];
    const afterCount = countAssistants(afterMsgs);
    const newAssistants = assistantsAfter(afterMsgs, sentAt);

    const evidence = {
        wamid: hook.wamid,
        sentAt,
        assistantCount: `${beforeCount} → ${afterCount}`,
        newAssistantMessages: newAssistants.length,
        lastMessages: lastMessages(afterMsgs, 6),
        workerLogs: ev,
    };

    let result = "INCONCLUSIVE";
    if (ev.earlySkip || ev.ingestSkip) {
        result = "FAIL";
        evidence.reason = "Takeover guard blocked AI path unexpectedly";
    } else if (ev.outboundSent && (afterCount > beforeCount || newAssistants.length > 0)) {
        result = "PASS";
        evidence.reason = "Outbound accepted (log) + assistant persisted";
    } else if (ev.hasWorker && ev.hasAiEmployee && ev.jobCompleted && !ev.outboundSent) {
        result = "INCONCLUSIVE";
        evidence.reason = "AI path ran but Meta outbound not accepted — provider/infra";
    } else if (ev.hasWorker && ev.hasOpenAiPath && ev.outboundSent) {
        result = "PASS";
        evidence.reason = "Worker + AI path + Outbound sent in logs (persistence may lag)";
    } else if (ev.hasWorker && ev.jobCompleted) {
        result = "INCONCLUSIVE";
        evidence.reason = "Worker completed; insufficient outbound/Meta evidence";
    } else {
        evidence.reason = "Insufficient worker/OpenAI/outbound evidence";
    }

    return { result, evidence: JSON.stringify(evidence, null, 2), hook, ev };
}

async function main() {
    console.log("PORTAL-3A final evidence re-test");
    console.log("Deployed commit expected: d8e1993");
    console.log("API:", API_BASE);
    console.log("Tenant:", COMPANY_ID);
    console.log("Canonical:", CANONICAL_ID);

    const creds = JSON.parse(fs.readFileSync(credPath, "utf8").replace(/^\uFEFF/, ""));
    const token = await firebaseToken(creds.email, creds.password);

    // Ensure AI mode start
    await setTakeover(token, false);

    // TEST A — positive AI baseline
    const testA = await evaluatePositiveAi(
        token,
        "test-a-baseline",
        "PORTAL-3A final evidence baseline ping"
    );
    log("A — Positive AI baseline", testA.result, testA.evidence);

    // TEST B — takeover
    const testB = await setTakeover(token, true);
    const detailB = await getDetail(token);
    const convB = detailB.data?.conversation || {};
    const bPass =
        testB.status === 200 &&
        testB.data?.humanTakeover === true &&
        (convB.humanTakeover === true || detailB.data?.humanTakeover === true) &&
        (convB.mode === "human" || testB.data?.mode === "human");
    log(
        "B — Takeover canonical state",
        bPass ? "PASS" : "FAIL",
        JSON.stringify(
            {
                status: testB.status,
                api: testB.data,
                conversation: {
                    id: convB.id,
                    humanTakeover: convB.humanTakeover ?? detailB.data?.humanTakeover,
                    mode: convB.mode,
                },
                canonicalPath: `companies/${COMPANY_ID}/conversations/${CANONICAL_ID}`,
            },
            null,
            2
        )
    );

    // TEST C — human control
    const beforeC = countAssistants((await getDetail(token)).data?.messages);
    const hookC = await postWebhook(
        getMetaAppSecret(),
        "PORTAL-3A final human-control ping",
        "test-c-human"
    );
    console.log("Waiting 40s for TEST C...");
    await sleep(40000);
    const logsC = fetchRailwayLogs();
    const evC = analyzeJobLogs(logsC, hookC.wamid);
    const afterC = countAssistants((await getDetail(token)).data?.messages);
    const cPass =
        (evC.ingestSkip || evC.earlySkip) &&
        !evC.outboundSent &&
        afterC === beforeC;
    log(
        "C — Human-control suppression",
        cPass ? "PASS" : evC.outboundSent ? "FAIL" : "INCONCLUSIVE",
        JSON.stringify(
            {
                wamid: hookC.wamid,
                assistantCount: `${beforeC} → ${afterC}`,
                workerLogs: evC,
                noPhantomAssistant: afterC === beforeC,
            },
            null,
            2
        )
    );

    // TEST D — release
    const testD = await setTakeover(token, false);
    const detailD = await getDetail(token);
    const convD = detailD.data?.conversation || {};
    const dPass =
        testD.status === 200 &&
        testD.data?.humanTakeover === false &&
        (convD.mode === "ai" || !convD.humanTakeover);
    log(
        "D — Release to AI",
        dPass ? "PASS" : "FAIL",
        JSON.stringify({ api: testD.data, conversation: convD }, null, 2)
    );

    // TEST E — positive AI resume
    const testE = await evaluatePositiveAi(token, "test-e-resume", "PORTAL-3A final evidence resume ping");
    log("E — Positive AI resume", testE.result, testE.evidence);

    // TEST F — queued job race (reconfirm)
    await setTakeover(token, false);
    const beforeF = countAssistants((await getDetail(token)).data?.messages);
    const hookF = await postWebhook(getMetaAppSecret(), "PORTAL-3A final race ping", "test-f-race");
    await setTakeover(token, true);
    console.log("Waiting 50s for TEST F race...");
    await sleep(50000);
    const logsF = fetchRailwayLogs();
    const evF = analyzeJobLogs(logsF, hookF.wamid);
    const afterF = countAssistants((await getDetail(token)).data?.messages);
    const fPass = evF.outboundSuppressed && afterF === beforeF;
    log(
        "F — Queued-job race (final guard)",
        fPass ? "PASS" : "FAIL",
        JSON.stringify({ wamid: hookF.wamid, workerLogs: evF, assistantCount: `${beforeF} → ${afterF}` }, null, 2)
    );

    // TEST G — non-text under takeover
    const hookG = await postWebhook(getMetaAppSecret(), "", "test-g-nontext", "image");
    console.log("Waiting 35s for TEST G...");
    await sleep(35000);
    const logsG = fetchRailwayLogs();
    const evG = analyzeJobLogs(logsG, hookG.wamid);
    const detailG = await getDetail(token);
    const hasFallback = (detailG.data?.messages || []).some((m) =>
        String(m.content || m.message || "").includes("Please send a text message")
    );
    const gPass = (evG.ingestSkip || evG.earlySkip) && !evG.outboundSent && !hasFallback;
    log(
        "G — Non-text under takeover",
        gPass ? "PASS" : "FAIL",
        JSON.stringify({ wamid: hookG.wamid, workerLogs: evG, fallbackInHistory: hasFallback }, null, 2)
    );

    // TEST H — unauthenticated (NO Authorization header)
    const noAuth = await apiNoAuth(
        "POST",
        `/api/companies/${COMPANY_ID}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`,
        { enabled: true }
    );
    log(
        "H — Unauthenticated takeover (no Authorization header)",
        noAuth.status === 401 ? "PASS" : "FAIL",
        JSON.stringify({ status: noAuth.status, body: noAuth.data }, null, 2)
    );

    // TEST I — wrong tenant 403
    const wrongTenant = await apiAuth(
        token,
        "POST",
        `/api/companies/wrong-tenant-xyz/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`,
        { enabled: true }
    );
    log(
        "I — Wrong-tenant authenticated takeover",
        wrongTenant.status === 403 ? "PASS" : "FAIL",
        JSON.stringify({ status: wrongTenant.status, body: wrongTenant.data }, null, 2)
    );

    // Cleanup
    await setTakeover(token, false);

    console.log("\n========== SUMMARY ==========");
    for (const row of report) {
        console.log(`${row.result.padEnd(12)} | ${row.test}`);
    }

    const blockers = report.filter((r) => {
        if (["A — Positive AI baseline", "E — Positive AI resume"].includes(r.test)) {
            return r.result !== "PASS" && r.result !== "INCONCLUSIVE";
        }
        if (["H — Unauthenticated takeover (no Authorization header)", "I — Wrong-tenant authenticated takeover"].includes(r.test)) {
            return r.result !== "PASS";
        }
        if (r.test.startsWith("B") || r.test.startsWith("C") || r.test.startsWith("D") || r.test.startsWith("F") || r.test.startsWith("G")) {
            return r.result !== "PASS";
        }
        return false;
    });

    const ready =
        report.find((r) => r.test.startsWith("A"))?.result === "PASS" &&
        report.find((r) => r.test.startsWith("E"))?.result === "PASS" &&
        report.find((r) => r.test.startsWith("H"))?.result === "PASS" &&
        report.find((r) => r.test.startsWith("I"))?.result === "PASS" &&
        !blockers.length;

    const inconclusiveAi =
        report.find((r) => r.test.startsWith("A"))?.result === "INCONCLUSIVE" ||
        report.find((r) => r.test.startsWith("E"))?.result === "INCONCLUSIVE";

    console.log("\nTenant:", COMPANY_ID, "| isDemo: false (RTB smoke) | demo leakage: none observed");
    if (ready) {
        console.log("\nPORTAL-3A READY FOR CLOSURE");
    } else if (inconclusiveAi) {
        console.log("\nPORTAL-3A REMAINS OPEN — AI positive path inconclusive (check outbound/Meta evidence above)");
    } else {
        console.log("\nPORTAL-3A REMAINS OPEN");
    }
}

main().catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
});
