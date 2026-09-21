#!/usr/bin/env node
/**
 * CORPORATE-P0-3A/B — live cross-surface communication acceptance (disposable tenant + CM read-only).
 *
 * Uses tenant HTTP APIs (same routes as Portal + Mission Control after P0-3B).
 * Optional superadmin token: set CORPORATE_P0_3_SUPERADMIN_ID_TOKEN to mirror MC auth path.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_WEB_CONFIG } from "../js/firebase-config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.CORPORATE_P0_3_BASE_URL || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const ADMIN_BASE = (process.env.CORPORATE_P0_3_ADMIN_URL || "https://admin.ziricai.com").replace(/\/$/, "");
const CM_COMPANY = process.env.CORPORATE_P0_3_CM_COMPANY || "central-motors-rtb";
const TEST_PHONE = process.env.CORPORATE_P0_3_TEST_PHONE || "27820009999";
const CONVERSATION_ID = process.env.CORPORATE_P0_3_CONVERSATION_ID || `whatsapp::${TEST_PHONE}`;

const evidence = {
    timestamp: new Date().toISOString(),
    base: BASE,
    adminDeploy: process.env.CORPORATE_P0_3_ADMIN_DEPLOY || "6ab10cb0a66ab6f526ad164d",
    codeCommit: "18e45bd",
    steps: [],
};

function step(name, pass, detail = "") {
    evidence.steps.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` — ${detail}` : ""}`);
    if (!pass) evidence.ok = false;
}

async function jsonRequest(method, path, body, bearer) {
    const headers = { "Content-Type": "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined || body === null ? undefined : JSON.stringify(body),
    });
    let data = {};
    try {
        data = await res.json();
    } catch {
        /* empty */
    }
    return { status: res.status, data, code: data.code || null };
}

async function firebaseSignUp() {
    const apiKey = PRODUCTION_WEB_CONFIG.apiKey;
    const email = `p0-3ab-owner-${Date.now()}@ziricai-p0-3.invalid`;
    const password = `P0_3ab_${Date.now()}_x!`;
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
    );
    const payload = await res.json();
    if (!res.ok || !payload.idToken) {
        throw new Error(`Firebase signUp failed: ${payload.error?.message || res.status}`);
    }
    return { idToken: payload.idToken, localId: payload.localId, email };
}

function mcToken(ownerToken) {
    return process.env.CORPORATE_P0_3_SUPERADMIN_ID_TOKEN || ownerToken;
}

evidence.ok = true;
console.log(`\nCORPORATE-P0-3A/B live acceptance → ${BASE}\n`);

const adminJs = await fetch(`${ADMIN_BASE}/js/admin/services/conversations.js`).then((r) => r.text());
step(
    "0a Admin deploy exposes canonical MC client",
    adminJs.includes("postConversationReply") && !adminJs.includes("addDoc("),
    ADMIN_BASE
);

const adminModules = await fetch(`${ADMIN_BASE}/js/admin/modules/conversations.js`).then((r) => r.text());
step(
    "0b Admin blocks API-thread AI simulation",
    adminModules.includes("dataSource") && adminModules.includes("human takeover"),
    "dataSource gate present"
);

const user = await firebaseSignUp();
evidence.owner = { email: user.email, uid: user.localId };
step("1 Disposable Firebase owner", Boolean(user.idToken));

const start = await jsonRequest(
    "POST",
    "/api/onboarding/start",
    {
        companyName: `P0-3AB ${Date.now().toString(36)}`,
        ownerEmail: user.email,
        ownerName: "P0-3AB Owner",
        uid: user.localId,
    },
    user.idToken
);
const companyId = start.data?.companyId;
step("2 Onboarding tenant created", start.status === 201 && companyId, `company=${companyId}`);

const mc = mcToken(user.idToken);
const replyText = `P0-3AB human reply ${Date.now()}`;
const reply = await jsonRequest(
    "POST",
    `/api/companies/${encodeURIComponent(companyId)}/conversations/${encodeURIComponent(CONVERSATION_ID)}/reply`,
    { text: replyText, senderName: "MC Acceptance Agent" },
    mc
);
step("3 MC-path human reply (tenant API)", reply.status === 200 && reply.data?.success !== false, `status=${reply.status}`);

const detailMc = await jsonRequest(
    "GET",
    `/api/companies/${encodeURIComponent(companyId)}/conversations/${encodeURIComponent(CONVERSATION_ID)}`,
    null,
    mc
);
const messagesMc = detailMc.data?.messages || [];
const foundMc = messagesMc.some((m) => (m.message || m.content || "").includes("P0-3AB human reply"));
step("4 MC-path refresh sees reply", detailMc.status === 200 && foundMc, `messages=${messagesMc.length}`);

const detailPortal = await jsonRequest(
    "GET",
    `/api/companies/${encodeURIComponent(companyId)}/conversations/${encodeURIComponent(CONVERSATION_ID)}`,
    null,
    user.idToken
);
const messagesPortal = detailPortal.data?.messages || [];
const foundPortal = messagesPortal.some((m) => (m.message || m.content || "").includes("P0-3AB human reply"));
step("5 Portal-path same conversation + reply", detailPortal.status === 200 && foundPortal, `messages=${messagesPortal.length}`);

const takeover = await jsonRequest(
    "POST",
    `/api/companies/${encodeURIComponent(companyId)}/conversations/${encodeURIComponent(CONVERSATION_ID)}/takeover`,
    { enabled: true, humanAgent: "MC Acceptance Agent" },
    mc
);
step("6 Takeover (canonical API)", takeover.status === 200, `humanTakeover=${takeover.data?.humanTakeover}`);

const detailAfterTakeover = await jsonRequest(
    "GET",
    `/api/companies/${encodeURIComponent(companyId)}/conversations/${encodeURIComponent(CONVERSATION_ID)}`,
    null,
    user.idToken
);
step(
    "7 Portal sees takeover state",
    Boolean(detailAfterTakeover.data?.humanTakeover || detailAfterTakeover.data?.conversation?.mode === "human"),
    `mode=${detailAfterTakeover.data?.conversation?.mode}`
);

const read = await jsonRequest(
    "POST",
    `/api/companies/${encodeURIComponent(companyId)}/conversations/${encodeURIComponent(CONVERSATION_ID)}/read`,
    {},
    mc
);
step("8 Mark read (canonical API)", read.status === 200, `unread=${read.data?.unread}`);

const hasSuperadmin = Boolean(process.env.CORPORATE_P0_3_SUPERADMIN_ID_TOKEN);
if (hasSuperadmin) {
    const cmList = await jsonRequest(
        "GET",
        `/api/companies/${encodeURIComponent(CM_COMPANY)}/conversations`,
        null,
        mc
    );
    step(
        "9 CM read-only list conversations (superadmin)",
        cmList.status === 200,
        `status=${cmList.status} items=${(cmList.data?.items || []).length}`
    );
} else {
    const cmListDenied = await jsonRequest(
        "GET",
        `/api/companies/${encodeURIComponent(CM_COMPANY)}/conversations`,
        null,
        user.idToken
    );
    step(
        "9 CM tenant isolation (owner cannot list CM)",
        cmListDenied.status === 403,
        `status=${cmListDenied.status} — set CORPORATE_P0_3_SUPERADMIN_ID_TOKEN for CM list smoke`
    );
}
const cmMutate = await jsonRequest(
    "POST",
    `/api/companies/${encodeURIComponent(CM_COMPANY)}/conversations/whatsapp::00000000000/reply`,
    { text: "must-not-send" },
    user.idToken
);
step(
    "10 CM mutation denied for disposable owner",
    cmMutate.status === 403,
    `status=${cmMutate.status}`
);

const outPath = join(ROOT, "p0-3ab-live-evidence.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(`\nEvidence: ${outPath}`);
console.log(evidence.ok ? "\nCORPORATE-P0-3A/B LIVE ACCEPTANCE PASS\n" : "\nCORPORATE-P0-3A/B LIVE ACCEPTANCE FAIL\n");
process.exit(evidence.ok ? 0 : 1);
