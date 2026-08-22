#!/usr/bin/env node
/**
 * Verify Meta WhatsApp webhook signature + GET challenge flow.
 *
 * Usage:
 *   node scripts/verify-webhook.js
 *   node scripts/verify-webhook.js --url http://localhost:3000
 */
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
    validateMetaWebhookSignature,
    verifyMetaWebhookToken,
    getVerifyToken,
    getMetaAppSecret,
} from "../services/integrations/metaWebhook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const baseUrl = process.argv.includes("--url")
    ? process.argv[process.argv.indexOf("--url") + 1]
    : null;

function signBody(rawBody, secret) {
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
    return "sha256=" + crypto.createHmac("sha256", secret).update(buf).digest("hex");
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function testUnitSignature() {
    const secret = getMetaAppSecret() || "test_secret_for_unit";
    const payload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: { metadata: { phone_number_id: "1209265748933699" } } }] }],
    });
    const rawBody = Buffer.from(payload, "utf8");
    const signature = signBody(rawBody, secret);

    const req = {
        get(name) {
            if (name.toLowerCase() === "x-hub-signature-256") return signature;
            return undefined;
        },
        rawBody,
    };

    const prev = process.env.META_APP_SECRET;
    process.env.META_APP_SECRET = secret;

    const valid = validateMetaWebhookSignature(req);
    assert(valid.valid, `Expected valid signature, got: ${valid.reason}`);

    req.get = () => undefined;
    const missing = validateMetaWebhookSignature(req);
    assert(!missing.valid, "Expected failure when header missing");
    assert(missing.reason?.includes("Missing"), `Unexpected reason: ${missing.reason}`);

    req.get = () => signBody(Buffer.from('{"tampered":true}'), secret);
    const tampered = validateMetaWebhookSignature({ ...req, rawBody });
    assert(!tampered.valid, "Expected failure for tampered body");

    if (prev === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = prev;

    console.log("✓ Unit signature validation");
}

async function testUnitVerifyToken() {
    const token = getVerifyToken() || "ziricai_verify_2026";
    const prev = process.env.VERIFY_TOKEN;
    process.env.VERIFY_TOKEN = `  ${token}  `;

    assert(verifyMetaWebhookToken(token), "Trimmed VERIFY_TOKEN should match");
    assert(!verifyMetaWebhookToken("wrong"), "Wrong token should not match");

    if (prev === undefined) delete process.env.VERIFY_TOKEN;
    else process.env.VERIFY_TOKEN = prev;

    console.log("✓ Unit verify token (trim)");
}

async function testHttp(base) {
    const verifyToken = getVerifyToken();
    if (!verifyToken) {
        console.log("⚠ Skipping HTTP GET verify — VERIFY_TOKEN not set");
        return;
    }

    const challenge = "test123";
    const verifyUrl = `${base}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${challenge}`;
    const verifyRes = await fetch(verifyUrl);
    const verifyBody = await verifyRes.text();
    assert(verifyRes.status === 200, `GET verify expected 200, got ${verifyRes.status}: ${verifyBody}`);
    assert(verifyBody === challenge, `Expected challenge "${challenge}", got "${verifyBody}"`);
    console.log("✓ HTTP GET /webhook verify returns challenge");

    const secret = getMetaAppSecret();
    if (!secret) {
        console.log("⚠ Skipping HTTP POST signature — META_APP_SECRET not set");
        return;
    }

    const payload = {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "WABA_ID",
                changes: [
                    {
                        field: "messages",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "15551829611",
                                phone_number_id: "1209265748933699",
                            },
                            contacts: [{ profile: { name: "Test User" }, wa_id: "27849000523" }],
                            messages: [
                                {
                                    from: "27849000523",
                                    id: "wamid.verify-test",
                                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                                    type: "text",
                                    text: { body: "verify-webhook test" },
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };
    const rawBody = JSON.stringify(payload);
    const signature = signBody(rawBody, secret);

    const postRes = await fetch(`${base}/webhook`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Hub-Signature-256": signature,
        },
        body: rawBody,
    });
    assert(postRes.status === 200, `POST with valid signature expected 200, got ${postRes.status}: ${await postRes.text()}`);
    console.log("✓ HTTP POST /webhook with valid signature accepted");

    const badRes = await fetch(`${base}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawBody,
    });
    assert(badRes.status === 401, `POST without signature expected 401, got ${badRes.status}`);
    console.log("✓ HTTP POST /webhook without signature rejected (401)");
}

async function main() {
    console.log("Meta WhatsApp webhook verification\n");
    await testUnitSignature();
    await testUnitVerifyToken();

    if (baseUrl) {
        console.log(`\nHTTP tests against ${baseUrl}`);
        await testHttp(baseUrl.replace(/\/$/, ""));
    } else {
        console.log("\nTip: run with --url http://localhost:3000 after starting the server for HTTP tests");
    }

    console.log("\nAll checks passed.");
}

main().catch((err) => {
    console.error("\n✗", err.message);
    process.exit(1);
});
