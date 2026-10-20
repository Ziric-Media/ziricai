import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isCentralMotorsPilotMode } from "../storage/centralMotorsPilot.js";
import { validateProductionTenantScopeEnforcement } from "./productionSecurityInvariants.js";
import { shouldSkipRepositoryEnvFiles } from "./isolatedStartup.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENV_PATH = path.join(ROOT, ".env");
const LOCAL_STAGING_ENV_PATH = path.join(ROOT, ".env.local-staging");

let bootstrapped = false;

/** Pure plan used by startup and static tests; it never reads an environment file. */
export function getEnvironmentBootstrapPlan(env = process.env) {
    if (shouldSkipRepositoryEnvFiles(env)) {
        return { skipRepositoryFiles: true, loadLocalStaging: false };
    }
    const netlifyBuild = String(env.NETLIFY || "").toLowerCase() === "true";
    return {
        skipRepositoryFiles: false,
        // Never override production Netlify builds with developer .env.local-staging.
        loadLocalStaging: env.OPS_SMOKE_MEMORY_ISOLATED !== "1" && !netlifyBuild,
    };
}

/** Load .env once; quiet on Railway/production when no local .env file exists. */
export function bootstrapEnv() {
    if (bootstrapped) return;
    bootstrapped = true;
    const plan = getEnvironmentBootstrapPlan(process.env);
    if (plan.skipRepositoryFiles) {
        validateProductionTenantScopeEnforcement(process.env);
        return;
    }
    const hasEnvFile = fs.existsSync(ENV_PATH);
    dotenv.config({
        path: ENV_PATH,
        quiet: process.env.NODE_ENV === "production" || !hasEnvFile,
    });
    if (fs.existsSync(LOCAL_STAGING_ENV_PATH) && plan.loadLocalStaging) {
        dotenv.config({ path: LOCAL_STAGING_ENV_PATH, override: true });
    }

    validateProductionTenantScopeEnforcement(process.env);
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
