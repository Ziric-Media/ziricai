#!/usr/bin/env node
/**
 * Disposable tenant for Embedded Signup E2E — never central-motors-rtb / demo-central-motors.
 * Writes credentials to test-results/ (local file only; password not logged to stdout).
 *
 *   railway run node scripts/provision-embed-signup-e2e-test-tenant.mjs
 */
import crypto from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { provisionPortal4bDisposableActor } from "./provision-portal-4b-disposable-acceptance-actor.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const companyId =
    process.env.EMBED_SIGNUP_E2E_COMPANY ||
    `embed-signup-e2e-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
const password =
    process.env.EMBED_SIGNUP_E2E_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.PORTAL_4B_TEST_COMPANY = companyId;
process.env.PORTAL_4B_SMOKE_PASSWORD = password;

const actor = await provisionPortal4bDisposableActor({
    companyId,
    password,
    companyName: "Embedded Signup E2E Test",
});

const outDir = join(ROOT, "test-results");
mkdirSync(outDir, { recursive: true });
const credPath = join(outDir, "embed-signup-e2e-test-tenant.json");
writeFileSync(
    credPath,
    `${JSON.stringify(
        {
            companyId: actor.companyId,
            email: actor.email,
            uid: actor.uid,
            password,
            provisionedAt: new Date().toISOString(),
            doNotUseForProduction: "Central Motors / RTB untouched",
        },
        null,
        2
    )}\n`,
    "utf8"
);

console.log(
    JSON.stringify({
        ok: true,
        companyId: actor.companyId,
        email: actor.email,
        credentialsFile: credPath,
    })
);
