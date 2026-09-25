#!/usr/bin/env node
/**
 * Step 3 — one controlled production WhatsApp inbound test.
 * POSTs a signed webhook for: "What SUVs do you have?"
 *
 * Usage:
 *   npx @railway/cli run node scripts/controlled-whatsapp-suv-test.js
 *   node scripts/controlled-whatsapp-suv-test.js --url https://ziricai-production.up.railway.app
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
const TEST_MESSAGE = "What SUVs do you have?";

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
        throw new Error("META_APP_SECRET not set — run via `npx @railway/cli run` or set locally");
    }

    const wamid = `wamid.controlled-suv-${Date.now()}`;
    const payload = {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "WABA_CONTROLLED_TEST",
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

    console.log("Controlled WhatsApp test");
    console.log("URL:", baseUrl);
    console.log("Message:", TEST_MESSAGE);
    console.log("wamid:", wamid);
    console.log("phone_number_id:", PHONE_NUMBER_ID);
    console.log("");

    const healthRes = await fetch(`${baseUrl}/api/health`);
    const health = await healthRes.json();
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

    console.log("\nWaiting 45s for worker to process...");
    await sleep(45000);

    console.log("\nInspect Railway logs for this wamid prefix:");
    console.log(`  ${wamid.slice(0, 32)}`);
    console.log("\nExpected sequence:");
    console.log("  Processing inbound → searchInventory → Outbound sent → Processed inbound message");
    console.log("  Job attempt: 1 (no retry)");
    console.log("\nControlled test webhook delivered.");
}

main().catch((err) => {
    console.error("\n✗", err.message);
    process.exit(1);
});
