import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isCentralMotorsPilotMode } from "../storage/centralMotorsPilot.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENV_PATH = path.join(ROOT, ".env");

let bootstrapped = false;

/** Load .env once; quiet on Railway/production when no local .env file exists. */
export function bootstrapEnv() {
    if (bootstrapped) return;
    bootstrapped = true;
    const hasEnvFile = fs.existsSync(ENV_PATH);
    dotenv.config({
        path: ENV_PATH,
        quiet: process.env.NODE_ENV === "production" || !hasEnvFile,
    });
}

function envSet(name) {
    return Boolean(process.env[name]);
}

function verifyTokenSet() {
    return (
        envSet("VERIFY_TOKEN") ||
        envSet("WHATSAPP_VERIFY_TOKEN") ||
        envSet("WEBHOOK_VERIFY_TOKEN")
    );
}

function metaAppSecretSet() {
    return envSet("META_APP_SECRET") || envSet("APP_SECRET");
}

function phoneNumberIdSuffix() {
    const id = process.env.PHONE_NUMBER_ID;
    return id ? `***${String(id).slice(-4)}` : null;
}

/** Log critical env presence at startup without exposing secret values. */
export function logRailwayEnvDiagnostics() {
    const diagnostics = {
        verifyTokenSet: verifyTokenSet(),
        metaAppSecretSet: metaAppSecretSet(),
        whatsappTokenSet: envSet("WHATSAPP_TOKEN"),
        phoneNumberIdSuffix: phoneNumberIdSuffix(),
        defaultCompanyId: process.env.DEFAULT_COMPANY_ID || null,
        centralMotorsPilot: isCentralMotorsPilotMode(),
        openaiKeySet: envSet("OPENAI_API_KEY"),
        storageBackend: process.env.STORAGE_BACKEND || "(default)",
        nodeEnv: process.env.NODE_ENV || "development",
    };

    console.error("[startup] Railway env diagnostics:", JSON.stringify(diagnostics));

    if (!diagnostics.defaultCompanyId) {
        console.error(
            "[startup] DEFAULT_COMPANY_ID unset — inbound WhatsApp resolves companyId=null (replies still work; tenant CRM/events limited)"
        );
    }
}
