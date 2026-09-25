#!/usr/bin/env node
/**
 * Controlled two-turn WhatsApp test: Hi → What SUVs do you have?
 * Verifies Step 5 (no re-intro on turn 2) + Step 4 (vehicle outbound plan).
 *
 * Usage:
 *   npx @railway/cli run node scripts/controlled-whatsapp-continuity-test.js
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

function signBody(rawBody, secret) {
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
    return "sha256=" + crypto.createHmac("sha256", secret).update(buf).digest("hex");
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPayload(message, wamid) {
    return {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "WABA_CONTINUITY_TEST",
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
                                    text: { body: message },
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };
}

async function postWebhook(secret, message, label) {
    const wamid = `wamid.continuity-${label}-${Date.now()}`;
    const rawBody = JSON.stringify(buildPayload(message, wamid));
    const signature = signBody(rawBody, secret);

    console.log(`\n--- Turn: ${label} ---`);
    console.log("Message:", message);
    console.log("wamid:", wamid);

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
        throw new Error(`${label} webhook failed: ${postRes.status} ${postText}`);
    }
    console.log("✓ Webhook accepted (200)");
    return wamid;
}

async function main() {
    const secret = getMetaAppSecret();
    if (!secret) {
        throw new Error("META_APP_SECRET not set — run via `npx @railway/cli run`");
    }

    console.log("Controlled continuity + SUV test");
    console.log("URL:", baseUrl);
    console.log("Phone:", TEST_PHONE);

    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    console.log("Health:", {
        status: health.status,
        storage: health.storage,
        firestoreAdmin: health.firestoreAdmin,
    });

    const wamid1 = await postWebhook(secret, "Hi", "greeting");
    console.log("Waiting 50s for turn 1...");
    await sleep(50000);

    const wamid2 = await postWebhook(secret, "What SUVs do you have?", "suv");
    console.log("Waiting 50s for turn 2...");
    await sleep(50000);

    console.log("\nInspect Railway logs:");
    console.log("  Turn 1 wamid:", wamid1.slice(0, 36));
    console.log("  Turn 2 wamid:", wamid2.slice(0, 36));
    console.log("\nTurn 2 expectations:");
    console.log("  isNewConversation: false");
    console.log("  responseSource: ai_vehicle_media (if searchInventory ran)");
    console.log("  attempt: 1, status: completed");
    console.log("  No customerName / Firestore errors");
}

main().catch((err) => {
    console.error("\n✗", err.message);
    process.exit(1);
});
