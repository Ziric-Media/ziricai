#!/usr/bin/env node
/**
 * Turn 3 — gauge interest: "Tell me more about the first one"
 * Requires prior SUV recommendations in the same test conversation.
 *
 * Usage:
 *   npx @railway/cli run node scripts/controlled-whatsapp-gauge-interest-test.js
 */
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getMetaAppSecret } from "../services/integrations/metaWebhook.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const baseUrl = (
    process.argv.includes("--url")
        ? process.argv[process.argv.indexOf("--url") + 1]
        : process.env.CONTROLLED_TEST_WEBHOOK_URL || "https://ziricai-production.up.railway.app"
).replace(/\/$/, "");

const TEST_PHONE = process.env.CONTROLLED_TEST_PHONE || "27849000523";
const PHONE_NUMBER_ID = process.env.CONTROLLED_TEST_PHONE_NUMBER_ID || "1209265748933699";
const TEST_MESSAGE = "Tell me more about the first one";

function signBody(rawBody, secret) {
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
    return "sha256=" + crypto.createHmac("sha256", secret).update(buf).digest("hex");
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const secret = getMetaAppSecret();
    if (!secret) {
        throw new Error("META_APP_SECRET not set — run via `npx @railway/cli run`");
    }

    const wamid = `wamid.gauge-interest-${Date.now()}`;
    const payload = {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "WABA_GAUGE_INTEREST_TEST",
                changes: [
                    {
                        field: "messages",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "15551829611",
                                phone_number_id: PHONE_NUMBER_ID,
                            },
                            contacts: [{ profile: { name: "Controlled Test" }, wa_id: TEST_PHONE }],
                            messages: [
                                {
                                    from: TEST_PHONE,
                                    id: wamid,
                                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                                    type: "text",
                                    text: { body: TEST_MESSAGE },
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

    console.log("Gauge interest turn 3 test");
    console.log("URL:", baseUrl);
    console.log("Phone:", TEST_PHONE);
    console.log("Message:", TEST_MESSAGE);
    console.log("wamid:", wamid);

    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    console.log("Health:", {
        status: health.status,
        storage: health.storage,
        firestoreAdmin: health.firestoreAdmin,
    });

    const postRes = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Hub-Signature-256": signature,
        },
        body: rawBody,
    });
    const postText = await postRes.text();
    if (postRes.status !== 200) {
        throw new Error(`Webhook POST failed: ${postRes.status} ${postText}`);
    }
    console.log("✓ Webhook accepted (200)");

    console.log("\nWaiting 50s for worker to process...");
    await sleep(50000);

    console.log("\nInspect Railway logs for wamid prefix:", wamid.slice(0, 36));
    console.log("\nTurn 3 expectations:");
    console.log("  isNewConversation: false");
    console.log("  Vehicle reference resolved (first recommended SUV)");
    console.log("  Funnel: GAUGE_INTEREST / VEHICLE_INTEREST");
    console.log("  attempt: 1, status: completed");
    console.log("  No customerName / Firestore errors");
}

main().catch((err) => {
    console.error("\n✗", err.message);
    process.exit(1);
});
